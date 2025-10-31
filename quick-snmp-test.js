#!/usr/bin/env node

/**
 * Quick SNMP API test - tanpa login, langsung test SNMP module
 */

const snmpMonitor = require('./config/snmp-monitor');
const { getSetting } = require('./config/settingsManager');

console.log('🧪 Quick SNMP Module Test\n');

const config = {
  host: getSetting('snmp_host', '192.168.88.2'),
  community: getSetting('snmp_community', 'public'),
  version: getSetting('snmp_version', '2c'),
  port: getSetting('snmp_port', '161')
};

console.log('📋 Configuration:');
console.log(`   Host: ${config.host}:${config.port}`);
console.log(`   Community: ${config.community}`);
console.log(`   Monitor Mode: ${getSetting('monitor_mode', 'mikrotik')}`);
console.log(`   Interface: ${getSetting('snmp_interface', 'ether1')}\n`);

async function test() {
  try {
    // Test 1: List interfaces
    console.log('📡 Test 1: List interfaces...');
    const interfaces = await snmpMonitor.listInterfaces(config);
    console.log(`✅ Found ${interfaces.length} interfaces:\n`);
    
    interfaces.forEach(iface => {
      const status = iface.running ? '🟢 UP' : '🔴 DOWN';
      const disabled = iface.disabled ? '⛔ DISABLED' : '';
      console.log(`   ${status} ${iface.index}: ${iface.name} ${disabled}`);
    });

    // Test 2: Get traffic for configured interface
    const ifaceName = getSetting('snmp_interface', 'ether1');
    console.log(`\n📊 Test 2: Get traffic for "${ifaceName}"...`);
    
    const traffic = await snmpMonitor.getInterfaceTraffic({
      ...config,
      interfaceName: ifaceName
    });
    
    console.log('✅ Traffic data:');
    console.log(`   RX: ${(traffic.in_bps / 1000000).toFixed(2)} Mbps`);
    console.log(`   TX: ${(traffic.out_bps / 1000000).toFixed(2)} Mbps`);
    console.log(`   Timestamp: ${traffic.timestamp}`);

    // Test 3: Device info
    console.log(`\n💻 Test 3: Device info...`);
    const info = await snmpMonitor.getDeviceInfo(config);
    console.log('✅ Device info:');
    console.log(`   Name: ${info.sysName}`);
    console.log(`   Description: ${info.sysDescr}`);
    if (info.sysUpTimeSeconds) {
      const days = Math.floor(info.sysUpTimeSeconds / 86400);
      const hours = Math.floor((info.sysUpTimeSeconds % 86400) / 3600);
      const mins = Math.floor((info.sysUpTimeSeconds % 3600) / 60);
      console.log(`   Uptime: ${days}d ${hours}h ${mins}m`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log('\nSNMP module is working correctly.');
    console.log('If dashboard still shows 0 bps, the issue is in:');
    console.log('  - Frontend JavaScript not calling API correctly');
    console.log('  - API route not returning data correctly');
    console.log('  - Browser cache issue');
    console.log('\nNext: Open browser console and check for errors.\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

test();
