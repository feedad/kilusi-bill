#!/usr/bin/env node

/**
 * Test traffic di semua interface yang UP
 * Untuk find interface mana yang ada traffic nya
 */

const snmpMonitor = require('./config/snmp-monitor');
const { getSetting } = require('./config/settingsManager');

const config = {
  host: getSetting('snmp_host', '192.168.88.2'),
  community: getSetting('snmp_community', 'public'),
  version: getSetting('snmp_version', '2c'),
  port: getSetting('snmp_port', '161')
};

console.log('🔍 Testing Traffic on All UP Interfaces\n');
console.log('This will help identify which interface has active traffic\n');
console.log('═'.repeat(80));

async function testAllInterfaces() {
  try {
    // Get list of interfaces
    console.log('📡 Getting interface list...\n');
    const interfaces = await snmpMonitor.listInterfaces(config);
    
    // Filter only UP interfaces
    const upInterfaces = interfaces.filter(iface => iface.running);
    
    console.log(`Found ${upInterfaces.length} UP interfaces:\n`);
    upInterfaces.forEach(iface => {
      console.log(`  🟢 ${iface.name} (index: ${iface.index})`);
    });
    
    console.log('\n' + '═'.repeat(80));
    console.log('Testing traffic on each interface (2 readings per interface)...\n');
    
    const results = [];
    
    for (const iface of upInterfaces) {
      console.log(`\n📊 Testing: ${iface.name}`);
      console.log('─'.repeat(40));
      
      try {
        // First reading (baseline)
        await snmpMonitor.getInterfaceTraffic({
          ...config,
          interfaceName: iface.name
        });
        
        // Wait 2 seconds
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Second reading (actual rate)
        const traffic = await snmpMonitor.getInterfaceTraffic({
          ...config,
          interfaceName: iface.name
        });
        
        const rxMbps = (traffic.in_bps / 1000000).toFixed(3);
        const txMbps = (traffic.out_bps / 1000000).toFixed(3);
        const totalMbps = ((traffic.in_bps + traffic.out_bps) / 1000000).toFixed(3);
        
        const totalNum = parseFloat(totalMbps);
        let status = totalNum > 0.1 ? '✅ ACTIVE' : '⚪ IDLE';
        
        console.log(`  Status: ${status}`);
        console.log(`  📥 RX: ${rxMbps} Mbps`);
        console.log(`  📤 TX: ${txMbps} Mbps`);
        console.log(`  📊 Total: ${totalMbps} Mbps`);
        
        results.push({
          name: iface.name,
          index: iface.index,
          rx: parseFloat(rxMbps),
          tx: parseFloat(txMbps),
          total: totalNum,
          active: totalNum > 0.1
        });
        
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        results.push({
          name: iface.name,
          index: iface.index,
          error: error.message
        });
      }
    }
    
    // Summary
    console.log('\n' + '═'.repeat(80));
    console.log('📋 SUMMARY - Interfaces Sorted by Traffic\n');
    
    const activeResults = results.filter(r => r.active).sort((a, b) => b.total - a.total);
    const idleResults = results.filter(r => !r.active && !r.error);
    const errorResults = results.filter(r => r.error);
    
    if (activeResults.length > 0) {
      console.log('✅ ACTIVE INTERFACES (has traffic):');
      activeResults.forEach(r => {
        console.log(`   🔥 ${r.name.padEnd(20)} Total: ${r.total.toFixed(3)} Mbps (RX: ${r.rx.toFixed(3)}, TX: ${r.tx.toFixed(3)})`);
      });
      
      console.log('\n💡 RECOMMENDATION:');
      console.log(`   Use "${activeResults[0].name}" for dashboard monitoring`);
      console.log(`   Update settings.json: "snmp_interface": "${activeResults[0].name}"`);
    } else {
      console.log('⚠️  NO ACTIVE TRAFFIC FOUND on any interface');
      console.log('\n   Possible reasons:');
      console.log('   1. Network is idle (no clients active)');
      console.log('   2. Traffic not passing through monitored interfaces');
      console.log('   3. Try generating traffic: ping, browse, etc.');
    }
    
    if (idleResults.length > 0) {
      console.log('\n\n⚪ IDLE INTERFACES (no traffic):');
      idleResults.forEach(r => {
        console.log(`   ${r.name}`);
      });
    }
    
    if (errorResults.length > 0) {
      console.log('\n\n❌ INTERFACES WITH ERRORS:');
      errorResults.forEach(r => {
        console.log(`   ${r.name}: ${r.error}`);
      });
    }
    
    console.log('\n' + '═'.repeat(80));
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
  }
}

testAllInterfaces();
