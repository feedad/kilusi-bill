#!/usr/bin/env node
// Validate that sessions API returns Calling-Station-Id (MAC) correctly
const radiusDb = require('../../config/radius-postgres');
const { initializePool, isConnected, close } = require('../../config/database');

(async () => {
  try {
    initializePool();
    const ok = await isConnected();
    if (!ok) {
      console.error('Database not reachable. Check settings.json Postgres config.');
      process.exit(2);
    }

    const sessions = await radiusDb.getActiveSessions();
    console.log(`Active sessions: ${sessions.length}`);

    // Print sample rows
    sessions.slice(0, 10).forEach((s, idx) => {
      const mac = s.callingStationId || s.callingstationid || null;
      console.log(
        `${idx + 1}. user=${s.username} ip=${s.framedIpAddress || s.framedipaddress} nas=${s.nasIpAddress || s.nasipaddress} mac=${mac}`
      );
    });

    await close();
    process.exit(0);
  } catch (err) {
    console.error('Validation error:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
