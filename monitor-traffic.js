#!/usr/bin/env node

/**
 * Test SNMP traffic dengan continuous monitoring
 * Untuk verify apakah interface benar-benar ada traffic atau tidak
 */

const snmpMonitor = require('./config/snmp-monitor');
const { getSetting } = require('./config/settingsManager');

const config = {
  host: getSetting('snmp_host', '192.168.88.2'),
  community: getSetting('snmp_community', 'public'),
  version: getSetting('snmp_version', '2c'),
  port: getSetting('snmp_port', '161'),
  interfaceName: getSetting('snmp_interface', 'sfp-sfpplus1')
};

console.log('🔍 SNMP Traffic Continuous Monitor\n');
console.log('Configuration:');
console.log(`  Host: ${config.host}:${config.port}`);
console.log(`  Interface: ${config.interfaceName}`);
console.log(`  Reading interval: 2 seconds`);
console.log(`  Press Ctrl+C to stop\n`);
console.log('═'.repeat(80));

let readingCount = 0;
let lastRx = 0;
let lastTx = 0;

async function monitor() {
  try {
    readingCount++;
    const data = await snmpMonitor.getInterfaceTraffic(config);
    
    const rxMbps = (data.in_bps / 1000000).toFixed(3);
    const txMbps = (data.out_bps / 1000000).toFixed(3);
    const totalMbps = ((data.in_bps + data.out_bps) / 1000000).toFixed(3);
    
    // Calculate delta from previous reading
    const deltaRx = data.in_bps - lastRx;
    const deltaTx = data.out_bps - lastTx;
    
    // Update last values
    lastRx = data.in_bps;
    lastTx = data.out_bps;
    
    const timestamp = new Date().toLocaleTimeString();
    
    // Status indicator
    let status = '⚪';
    let statusText = 'Idle';
    const totalMbpsNum = parseFloat(totalMbps);
    
    if (totalMbpsNum > 100) {
      status = '🔴';
      statusText = 'Very High';
    } else if (totalMbpsNum > 50) {
      status = '🟠';
      statusText = 'High';
    } else if (totalMbpsNum > 10) {
      status = '🟡';
      statusText = 'Medium';
    } else if (totalMbpsNum > 0.1) {
      status = '🟢';
      statusText = 'Low';
    }
    
    console.log(`[${timestamp}] Reading #${readingCount} ${status} ${statusText}`);
    console.log(`  📥 RX: ${rxMbps.padStart(10)} Mbps ${deltaRx > 0 ? '(↑ changed)' : '(→ stable)'}`);
    console.log(`  📤 TX: ${txMbps.padStart(10)} Mbps ${deltaTx > 0 ? '(↑ changed)' : '(→ stable)'}`);
    console.log(`  📊 Total: ${totalMbps.padStart(10)} Mbps`);
    console.log('─'.repeat(80));
    
    // Show helpful message on first few readings
    if (readingCount === 1) {
      console.log('ℹ️  First reading: Rate calculation baseline established');
      console.log('   (Rate will be 0 on first reading - this is normal)');
      console.log('─'.repeat(80));
    } else if (readingCount === 2 && totalMbpsNum === 0) {
      console.log('⚠️  Second reading still 0 - Interface may have no active traffic');
      console.log('   Try:');
      console.log('   1. Generate traffic: ping 8.8.8.8 from Mikrotik');
      console.log('   2. Browse internet from connected device');
      console.log('   3. Try different interface (e.g., vlan10, ether7)');
      console.log('─'.repeat(80));
    } else if (readingCount === 5 && totalMbpsNum === 0) {
      console.log('💡 Still no traffic after 5 readings');
      console.log('   This interface might be:');
      console.log('   - Not actively routing traffic');
      console.log('   - Connected but idle');
      console.log('   - Try interface with actual client traffic (e.g., vlan interfaces)');
      console.log('─'.repeat(80));
    }
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
  }
}

// Run immediately then every 2 seconds
monitor();
const interval = setInterval(monitor, 2000);

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n🛑 Monitoring stopped');
  console.log(`\nSummary:`);
  console.log(`  Total readings: ${readingCount}`);
  console.log(`  Last RX: ${(lastRx / 1000000).toFixed(3)} Mbps`);
  console.log(`  Last TX: ${(lastTx / 1000000).toFixed(3)} Mbps`);
  console.log(`  Last Total: ${((lastRx + lastTx) / 1000000).toFixed(3)} Mbps\n`);
  clearInterval(interval);
  process.exit(0);
});
