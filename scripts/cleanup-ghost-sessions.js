#!/usr/bin/env node
/**
 * Close ghost radacct sessions with 0.0.0.0 or very old start time and no stop time
 */
const { query, getAll } = require('../config/database');
const { initializeRadiusTables } = require('../config/radius-postgres');

(async () => {
  try {
    await initializeRadiusTables();

    const ghosts = await getAll(`
      SELECT radacctid, username, acctsessionid, nasipaddress::text AS nasip, framedipaddress::text AS ip,
             acctstarttime
      FROM radacct
      WHERE acctstoptime IS NULL
        AND (framedipaddress IS NULL OR framedipaddress::text = '0.0.0.0')
      ORDER BY acctstarttime DESC
    `);

    if (!ghosts || ghosts.length === 0) {
      console.log('No ghost sessions found.');
      process.exit(0);
    }

    console.log(`Found ${ghosts.length} ghost sessions (IP 0.0.0.0). Closing...`);

    const res = await query(`
      UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = 'Admin-Reset', connectinfo_stop = 'cleanup-ghosts'
      WHERE acctstoptime IS NULL AND (framedipaddress IS NULL OR framedipaddress::text = '0.0.0.0')
    `);

    console.log(`Closed ${res.rowCount || 0} ghost sessions.`);
    process.exit(0);
  } catch (e) {
    console.error('Cleanup error:', e.message);
    process.exit(1);
  }
})();
