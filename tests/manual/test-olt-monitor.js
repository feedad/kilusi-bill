/**
 * Test script untuk OLT SNMP Monitoring
 * 
 * Usage: node test-olt-monitor.js <OLT_IP> [community]
 * Example: node test-olt-monitor.js 192.168.1.1 public
 */

const oltMonitor = require('./config/olt-snmp-monitor');

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('❌ Usage: node test-olt-monitor.js <OLT_IP> [community] [vendor]');
  console.log('   Example: node test-olt-monitor.js 192.168.1.1 public zte');
  console.log('');
  console.log('   Supported vendors:');
  console.log('     - zte (ZTE C300/C320)');
  console.log('     - huawei (Huawei MA5608T/MA5680T)');
  console.log('     - c-data (C-Data FD1000 series)');
  console.log('     - hioso (HIOSO GPON)');
  console.log('     - hsgq (HSGQ/Guangzhou Shengxi)');
  console.log('     - generic (basic SNMP only)');
  process.exit(1);
}

const config = {
  host: args[0],
  community: args[1] || 'public',
  version: '2c',
  port: 161,
  vendor: args[2] || 'generic'
};

console.log('🔍 OLT SNMP Monitoring Test\n');
console.log('Configuration:');
console.log(`  Host: ${config.host}:${config.port}`);
console.log(`  Community: ${config.community}`);
console.log(`  Version: ${config.version}`);
console.log(`  Vendor: ${config.vendor}`);
console.log('\n' + '='.repeat(80) + '\n');

async function testOLT() {
  try {
    // Test 1: Device Info
    console.log('📊 Test 1: Getting Device Information...');
    const deviceInfo = await oltMonitor.getOLTDeviceInfo(config);
    
    if (deviceInfo.success) {
      console.log('✅ Device Info Retrieved:');
      console.log(`  Device Name: ${deviceInfo.deviceName}`);
      console.log(`  Description: ${deviceInfo.description}`);
      console.log(`  Location: ${deviceInfo.location}`);
      console.log(`  Uptime: ${deviceInfo.uptime}`);
    } else {
      console.log('❌ Failed to get device info:', deviceInfo.message);
      return;
    }

    console.log('\n' + '-'.repeat(80) + '\n');

    // Test 2: PON Ports
    console.log('📊 Test 2: Getting PON Ports...');
    const ports = await oltMonitor.getPONPorts(config);
    
    if (ports.success) {
      console.log(`✅ Found ${ports.total} PON ports:\n`);
      
      ports.ports.forEach((port, idx) => {
        const statusIcon = port.status === 'up' ? '🟢' : '🔴';
        console.log(`  ${idx + 1}. ${statusIcon} ${port.name}`);
        console.log(`     Index: ${port.index} | Status: ${port.status.toUpperCase()}`);
      });

      if (ports.ports.length > 0) {
        console.log('\n' + '-'.repeat(80) + '\n');

        // Test 3: Port Traffic (first port)
        const firstPort = ports.ports[0];
        console.log(`📊 Test 3: Getting Traffic for Port "${firstPort.name}"...`);
        
        const traffic = await oltMonitor.getPONPortTraffic(config, firstPort.index);
        
        if (traffic.success) {
          const rxMB = (traffic.rxBytes / 1024 / 1024).toFixed(2);
          const txMB = (traffic.txBytes / 1024 / 1024).toFixed(2);
          console.log('✅ Traffic Statistics:');
          console.log(`  📥 RX: ${rxMB} MB (${traffic.rxBytes} bytes)`);
          console.log(`  📤 TX: ${txMB} MB (${traffic.txBytes} bytes)`);
        } else {
          console.log('❌ Failed to get traffic:', traffic.message || 'Unknown error');
        }

        if (config.vendor !== 'generic') {
          console.log('\n' + '-'.repeat(80) + '\n');

          // Test 4: ONUs on Port (vendor-specific)
          console.log(`📊 Test 4: Getting ONUs on Port "${firstPort.name}"...`);
          console.log(`   (Vendor: ${config.vendor})`);
          
          const onus = await oltMonitor.getONUsOnPort(config, firstPort.index);
          
          if (onus.success) {
            if (onus.total > 0) {
              console.log(`✅ Found ${onus.total} ONUs:\n`);
              onus.onus.forEach((onu, idx) => {
                const statusIcon = onu.status === 'online' ? '🟢' : '🔴';
                console.log(`  ${idx + 1}. ${statusIcon} ONU ID: ${onu.id} | Status: ${onu.status.toUpperCase()}`);
              });
            } else {
              console.log('ℹ️  No ONUs found on this port');
            }
          } else {
            console.log('⚠️  ONU discovery not available:', onus.message || 'Vendor-specific feature');
          }
        }
      }
    } else {
      console.log('❌ Failed to get PON ports:', ports.message);
      return;
    }

    console.log('\n' + '='.repeat(80) + '\n');

    // Test 5: Complete Statistics
    console.log('📊 Test 5: Getting Complete Statistics...');
    const stats = await oltMonitor.getOLTStatistics(config);
    
    if (stats.success) {
      console.log('✅ Complete Statistics Retrieved:\n');
      console.log('📈 Summary:');
      console.log(`  Total PON Ports: ${stats.totalPorts}`);
      console.log(`  Active Ports: ${stats.activePorts}`);
      console.log(`  Inactive Ports: ${stats.totalPorts - stats.activePorts}`);
      console.log(`  Uptime: ${stats.device.uptime}`);
      
      const upPorts = stats.ports.filter(p => p.status === 'up');
      if (upPorts.length > 0) {
        console.log('\n📊 Active Ports Traffic:');
        upPorts.forEach(port => {
          const rxMB = (port.rxBytes / 1024 / 1024).toFixed(2);
          const txMB = (port.txBytes / 1024 / 1024).toFixed(2);
          console.log(`  • ${port.name}: RX ${rxMB}MB / TX ${txMB}MB`);
        });
      }
    } else {
      console.log('❌ Failed to get statistics:', stats.message);
    }

    console.log('\n' + '='.repeat(80) + '\n');
    console.log('✅ All tests completed successfully!\n');
    console.log('💡 Tips:');
    console.log('   - Add this OLT to /admin/olt for monitoring');
    console.log('   - Set latitude/longitude to see on network map');
    console.log('   - Check vendor-specific ONU features for your OLT model');

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run tests
testOLT().then(() => {
  console.log('\n✅ Test completed\n');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
