#!/usr/bin/env node
/**
 * SNMP Connection Test Script
 * Verifikasi koneksi SNMP ke Mikrotik dan test traffic monitoring
 */

const snmpMonitor = require('./config/snmp-monitor');
const { getSetting } = require('./config/settingsManager');

async function testSNMP() {
  console.log('🔍 Testing SNMP Connection...\n');
  
  // Baca konfigurasi dari settings.json
  const host = getSetting('snmp_host', '');
  const community = getSetting('snmp_community', 'public');
  const version = getSetting('snmp_version', '2c');
  const port = getSetting('snmp_port', '161');
  const interfaceName = getSetting('snmp_interface', 'ether1');
  
  console.log('📋 Configuration:');
  console.log(`   Host: ${host}`);
  console.log(`   Port: ${port}`);
  console.log(`   Community: ${community}`);
  console.log(`   Version: ${version}`);
  console.log(`   Interface: ${interfaceName}`);
  console.log('');
  
  if (!host) {
    console.error('❌ SNMP host tidak dikonfigurasi!');
    console.log('\n💡 Silakan konfigurasi SNMP di settings.json:');
    console.log('   - snmp_host: IP Mikrotik (contoh: 192.168.88.1)');
    console.log('   - snmp_community: SNMP community string (default: public)');
    console.log('   - snmp_interface: Nama interface (contoh: ether1, ether1-ISP)');
    process.exit(1);
  }
  
  try {
    // Test 1: Get Device Info
    console.log('📡 Test 1: Getting device info...');
    const deviceInfo = await snmpMonitor.getDeviceInfo({ host, community, version, port });
    console.log('✅ Device Info:');
    console.log(`   System Name: ${deviceInfo.sysName}`);
    console.log(`   Description: ${deviceInfo.sysDescr}`);
    console.log(`   Uptime: ${formatUptime(deviceInfo.sysUpTimeSeconds)}`);
    console.log('');
    
    // Test 2: List Interfaces
    console.log('📋 Test 2: Listing interfaces...');
    const interfaces = await snmpMonitor.listInterfaces({ host, community, version, port });
    console.log(`✅ Found ${interfaces.length} interfaces:`);
    interfaces.forEach(iface => {
      const status = iface.running ? '🟢' : '🔴';
      const disabled = iface.disabled ? '[DISABLED]' : '';
      console.log(`   ${status} ${iface.index}: ${iface.name} ${disabled}`);
      if (iface.descr && iface.descr !== iface.name) {
        console.log(`      Description: ${iface.descr}`);
      }
    });
    console.log('');
    
    // Test 3: Get Interface Traffic
    console.log(`📊 Test 3: Getting traffic for interface "${interfaceName}"...`);
    const traffic = await snmpMonitor.getInterfaceTraffic({ 
      host, 
      community, 
      version, 
      port, 
      interfaceName 
    });
    console.log('✅ Traffic Data:');
    console.log(`   RX (Download): ${formatBandwidth(traffic.in_bps)}`);
    console.log(`   TX (Upload): ${formatBandwidth(traffic.out_bps)}`);
    console.log(`   Timestamp: ${traffic.timestamp}`);
    console.log('');
    
    // Test 4: Get CPU Load (optional)
    console.log('💻 Test 4: Getting CPU load...');
    try {
      const cpuLoad = await snmpMonitor.getCpuLoad({ host, community, version, port });
      if (cpuLoad !== null) {
        console.log(`✅ CPU Load: ${cpuLoad}%`);
      } else {
        console.log('⚠️  CPU load not available (not supported by device)');
      }
    } catch (e) {
      console.log('⚠️  Could not get CPU load:', e.message);
    }
    console.log('');
    
    // Test 5: Continuous monitoring (3 seconds)
    console.log('📈 Test 5: Continuous monitoring (3 readings)...');
    for (let i = 1; i <= 3; i++) {
      const traffic = await snmpMonitor.getInterfaceTraffic({ 
        host, 
        community, 
        version, 
        port, 
        interfaceName 
      });
      console.log(`   Reading ${i}: RX=${formatBandwidth(traffic.in_bps)}, TX=${formatBandwidth(traffic.out_bps)}`);
      if (i < 3) {
        await sleep(1000);
      }
    }
    console.log('');
    
    console.log('✅ All SNMP tests passed!');
    console.log('\n💡 Troubleshooting tips if you see errors:');
    console.log('   1. Pastikan SNMP enabled di Mikrotik: /snmp set enabled=yes');
    console.log('   2. Cek SNMP community: /snmp community print');
    console.log('   3. Cek firewall tidak memblok UDP port 161');
    console.log('   4. Pastikan IP host benar dan dapat di-ping');
    console.log('   5. Untuk interface name, gunakan nama exact dari "Test 2" di atas');
    
  } catch (error) {
    console.error('❌ SNMP Test Failed:');
    console.error(`   Error: ${error.message}`);
    console.log('\n🔧 Possible solutions:');
    
    if (error.message.includes('SNMP interface not found')) {
      console.log('   - Interface name salah. Cek nama interface yang tersedia di "Test 2"');
      console.log('   - Gunakan nama exact, case-sensitive (contoh: "ether1", "ether1-ISP")');
    } else if (error.message.includes('RequestTimedOutError') || error.message.includes('timeout')) {
      console.log('   - SNMP service mungkin tidak aktif di Mikrotik');
      console.log('   - Periksa: /snmp print (pastikan enabled=yes)');
      console.log('   - Cek firewall rules di Mikrotik');
      console.log('   - Pastikan IP host benar: ' + host);
    } else if (error.message.includes('not configured')) {
      console.log('   - Lengkapi konfigurasi SNMP di settings.json');
      console.log('   - Minimal: snmp_host, snmp_community, snmp_interface');
    } else {
      console.log('   - Periksa koneksi network ke Mikrotik');
      console.log('   - Pastikan SNMP community string benar');
      console.log('   - Coba ping ke host: ' + host);
    }
    
    process.exit(1);
  }
}

function formatUptime(seconds) {
  if (!seconds) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function formatBandwidth(bps) {
  if (!bps || bps === 0) return '0 bps';
  
  const gbps = bps / 1000000000;
  const mbps = bps / 1000000;
  const kbps = bps / 1000;
  
  if (gbps >= 1) return `${gbps.toFixed(2)} Gbps`;
  if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
  if (kbps >= 1) return `${kbps.toFixed(2)} Kbps`;
  return `${bps.toFixed(0)} bps`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run test
testSNMP().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
