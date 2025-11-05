#!/usr/bin/env node
/**
 * Test RADIUS Disconnect-Request functionality
 * This script tests sending RADIUS Disconnect-Request to a NAS
 */

const radiusDisconnect = require('./config/radius-disconnect');

async function testDisconnect() {
  console.log('\n=== Testing RADIUS Disconnect-Request ===\n');

  // Test parameters (adjust these to match your setup)
  const testParams = {
    username: 'apptest',
    nasIp: '172.22.10.156', // MikroTik NAS IP
    nasSecret: 'testing123', // RADIUS secret
    sessionId: '81001839', // Active session ID from radacct
    framedIp: '10.10.10.254' // Optional: Framed IP
  };

  console.log('Test Parameters:');
  console.log(`  Username: ${testParams.username}`);
  console.log(`  NAS IP: ${testParams.nasIp}`);
  console.log(`  Session ID: ${testParams.sessionId}`);
  console.log(`  Framed IP: ${testParams.framedIp}`);
  console.log('\nSending Disconnect-Request...\n');

  try {
    const result = await radiusDisconnect.disconnectUser(testParams);

    console.log('\n=== Result ===');
    console.log(`Success: ${result.success ? '✅ YES' : '❌ NO'}`);
    console.log(`Message: ${result.message}`);
    console.log(`Timestamp: ${result.timestamp}`);

    if (result.success) {
      console.log('\n✅ Disconnect-Request sent successfully!');
      console.log('The user should be disconnected from PPPoE.');
      console.log('\nVerify:');
      console.log('  1. Check MikroTik: /ppp active print');
      console.log('  2. Check dashboard for session removal');
      console.log('  3. Check radacct for acctstoptime update');
    } else {
      console.log('\n⚠️  Disconnect-Request failed or was rejected.');
      console.log('\nPossible reasons:');
      console.log('  1. NAS doesn\'t support RFC 3576 (Disconnect-Request)');
      console.log('  2. Wrong RADIUS secret');
      console.log('  3. Session not found or already disconnected');
      console.log('  4. Port 3799 blocked by firewall');
      console.log('  5. NAS not configured to listen on CoA port');
      console.log('\nEnable on MikroTik:');
      console.log('  /radius incoming set accept=yes');
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

// Check if session ID provided via command line
if (process.argv.length > 2) {
  console.log('\n📝 Custom parameters detected...');
  // Allow override: node test-radius-disconnect.js <sessionId> [nasIp] [username]
  const sessionId = process.argv[2];
  const nasIp = process.argv[3] || '172.22.10.156';
  const username = process.argv[4] || 'apptest';

  testDisconnect({
    username,
    nasIp,
    nasSecret: 'testing123',
    sessionId
  });
} else {
  testDisconnect();
}
