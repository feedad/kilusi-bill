#!/usr/bin/env node

/**
 * Cleanup ghost RADIUS sessions
 */

const { query } = require('./config/database');
const { logger } = require('./config/logger');

async function cleanupGhostSessions() {
  console.log('\n' + '='.repeat(70));
  console.log('RADIUS GHOST SESSIONS CLEANUP');
  console.log('='.repeat(70) + '\n');
  
  try {
    // Check current ghost sessions
    const countResult = await query(`
      SELECT COUNT(*) as total 
      FROM radacct 
      WHERE acctstoptime IS NULL
    `);
    
    const ghostCount = parseInt(countResult.rows[0].total);
    console.log(`📊 Found ${ghostCount} sessions without stop time\n`);
    
    if (ghostCount === 0) {
      console.log('✅ No ghost sessions to clean up.\n');
      return;
    }
    
    // Show breakdown
    const breakdown = await query(`
      SELECT 
        username,
        framedipaddress,
        COUNT(*) as session_count,
        MIN(acctstarttime) as oldest_session,
        MAX(acctstarttime) as newest_session
      FROM radacct 
      WHERE acctstoptime IS NULL
      GROUP BY username, framedipaddress
      ORDER BY session_count DESC
    `);
    
    console.log('📋 Ghost sessions breakdown:');
    console.log('┌─────────────────┬─────────────┬───────────┬─────────────────────┐');
    console.log('│ Username        │ IP          │ Count     │ Oldest Session      │');
    console.log('├─────────────────┼─────────────┼───────────┼─────────────────────┤');
    
    breakdown.rows.forEach(row => {
      const username = row.username.padEnd(15).substring(0, 15);
      const ip = (row.framedipaddress || 'N/A').padEnd(11).substring(0, 11);
      const count = String(row.session_count).padEnd(9);
      const oldest = new Date(row.oldest_session).toISOString().substring(0, 19).replace('T', ' ');
      
      console.log(`│ ${username} │ ${ip} │ ${count} │ ${oldest} │`);
    });
    
    console.log('└─────────────────┴─────────────┴───────────┴─────────────────────┘\n');
    
    // Ask for confirmation
    console.log('🧹 Cleanup options:\n');
    console.log('1. Close all ghost sessions (set stop time to now)');
    console.log('2. Delete all ghost sessions');
    console.log('3. Close sessions with IP 0.0.0.0 only');
    console.log('4. Cancel\n');
    
    // For automation, use option 3 (close 0.0.0.0 sessions)
    const option = process.argv[2] || '3';
    
    switch(option) {
      case '1':
        console.log('📝 Closing all ghost sessions...\n');
        const result1 = await query(`
          UPDATE radacct 
          SET 
            acctstoptime = NOW(),
            acctsessiontime = EXTRACT(EPOCH FROM (NOW() - acctstarttime))::BIGINT,
            acctterminatecause = 'Admin-Reset'
          WHERE acctstoptime IS NULL
        `);
        console.log(`✅ Closed ${result1.rowCount} sessions\n`);
        break;
        
      case '2':
        console.log('🗑️  Deleting all ghost sessions...\n');
        const result2 = await query(`
          DELETE FROM radacct WHERE acctstoptime IS NULL
        `);
        console.log(`✅ Deleted ${result2.rowCount} sessions\n`);
        break;
        
      case '3':
        console.log('📝 Closing sessions with IP 0.0.0.0...\n');
        const result3 = await query(`
          UPDATE radacct 
          SET 
            acctstoptime = NOW(),
            acctsessiontime = EXTRACT(EPOCH FROM (NOW() - acctstarttime))::BIGINT,
            acctterminatecause = 'NAS-Error'
          WHERE acctstoptime IS NULL AND framedipaddress = '0.0.0.0'
        `);
        console.log(`✅ Closed ${result3.rowCount} sessions with IP 0.0.0.0\n`);
        break;
        
      case '4':
        console.log('❌ Cancelled\n');
        break;
        
      default:
        console.log('❌ Invalid option\n');
    }
    
    // Show final count
    const finalCount = await query(`
      SELECT COUNT(*) as total 
      FROM radacct 
      WHERE acctstoptime IS NULL
    `);
    
    console.log(`📊 Remaining active sessions: ${finalCount.rows[0].total}\n`);
    console.log('='.repeat(70) + '\n');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  
  process.exit(0);
}

cleanupGhostSessions();
