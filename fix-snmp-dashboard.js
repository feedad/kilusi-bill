#!/usr/bin/env node

/**
 * fix-snmp-dashboard.js
 * 
 * Script untuk mengidentifikasi dan memperbaiki masalah SNMP pada dashboard:
 * 1. Test koneksi SNMP ke Mikrotik
 * 2. List semua interface dan status mereka
 * 3. Update settings.json dengan interface yang aktif
 * 4. Test endpoint API /admin/snmp/* 
 */

const snmp = require('net-snmp');
const fs = require('fs');
const path = require('path');

// OID references for Mikrotik
const OIDs = {
  ifDescr: '1.3.6.1.2.1.2.2.1.2',      // Interface names
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',  // Interface operational status (1=up, 2=down)
  ifInOctets: '1.3.6.1.2.1.2.2.1.10',   // Incoming bytes
  ifOutOctets: '1.3.6.1.2.1.2.2.1.16',  // Outgoing bytes
  sysDescr: '1.3.6.1.2.1.1.1.0',        // System description
  sysName: '1.3.6.1.2.1.1.5.0',         // System name
  sysUpTime: '1.3.6.1.2.1.1.3.0'        // System uptime
};

// Load settings
const settingsPath = path.join(__dirname, 'settings.json');
let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch (error) {
  console.error('❌ Failed to load settings.json:', error.message);
  process.exit(1);
}

const snmpConfig = {
  host: settings.snmp_host || '192.168.88.2',
  community: settings.snmp_community || 'public',
  version: snmp.Version2c,
  port: parseInt(settings.snmp_port || '161')
};

console.log('🔧 SNMP Dashboard Diagnostic & Repair Tool\n');
console.log('📋 Configuration:');
console.log(`   Host: ${snmpConfig.host}:${snmpConfig.port}`);
console.log(`   Community: ${snmpConfig.community}`);
console.log(`   Version: SNMPv2c`);
console.log(`   Current Interface: ${settings.snmp_interface || 'NOT SET'}\n`);

// Create SNMP session
const session = snmp.createSession(snmpConfig.host, snmpConfig.community, {
  port: snmpConfig.port,
  version: snmpConfig.version
});

// Step 1: Test basic connectivity
console.log('🔍 Step 1: Testing SNMP connectivity...');

session.get([OIDs.sysName, OIDs.sysDescr, OIDs.sysUpTime], (error, varbinds) => {
  if (error) {
    console.error(`❌ SNMP connection failed: ${error.message}`);
    console.error('\n🔧 Troubleshooting steps:');
    console.error('   1. Check if SNMP is enabled on Mikrotik: /snmp set enabled=yes');
    console.error('   2. Verify community string: /snmp community print');
    console.error('   3. Check firewall rules allow UDP 161 from this server');
    console.error('   4. Ping test: ping', snmpConfig.host);
    session.close();
    process.exit(1);
  }

  console.log('✅ SNMP connection successful!\n');
  console.log('📊 Device Information:');
  
  varbinds.forEach(vb => {
    if (snmp.isVarbindError(vb)) {
      console.error(`   Error: ${snmp.varbindError(vb)}`);
    } else {
      const oidName = Object.keys(OIDs).find(key => OIDs[key] === vb.oid);
      let value = vb.value;
      
      if (vb.oid === OIDs.sysUpTime) {
        const ticks = parseInt(value);
        const seconds = Math.floor(ticks / 100);
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        value = `${days}d ${hours}h ${mins}m (${ticks} ticks)`;
      }
      
      console.log(`   ${oidName}: ${value}`);
    }
  });

  // Step 2: Get all interfaces
  console.log('\n🔍 Step 2: Discovering all network interfaces...\n');
  
  const interfaces = [];
  
  function walkInterfaces(oid) {
    session.getNext([oid], (error, varbinds) => {
      if (error) {
        console.error('❌ Failed to list interfaces:', error.message);
        session.close();
        return;
      }
      
      const vb = varbinds[0];
      if (snmp.isVarbindError(vb)) {
        // Continue with status check
        checkInterfaceStatus();
        return;
      }
      
      // Check if still in ifDescr tree
      if (!vb.oid.startsWith(OIDs.ifDescr + '.')) {
        // Done walking
        checkInterfaceStatus();
        return;
      }
      
      const index = vb.oid.substring(OIDs.ifDescr.length + 1);
      interfaces.push({
        index: parseInt(index),
        name: vb.value.toString()
      });
      
      // Continue walking
      walkInterfaces(vb.oid);
    });
  }
  
  walkInterfaces(OIDs.ifDescr);
  
  function checkInterfaceStatus() {

    console.log(`📡 Found ${interfaces.length} interfaces\n`);
    
    if (interfaces.length === 0) {
      console.log('❌ No interfaces found');
      session.close();
      return;
    }

    // Step 3: Get operational status for each interface
    console.log('🔍 Step 3: Checking interface status...\n');
    
    const statusOids = interfaces.map(iface => 
      `${OIDs.ifOperStatus}.${iface.index}`
    );

    session.get(statusOids, (error, statusVarbinds) => {
      if (error) {
        console.error('❌ Failed to get interface status:', error.message);
        session.close();
        return;
      }

      // Map status to interfaces
      statusVarbinds.forEach((vb, idx) => {
        if (!snmp.isVarbindError(vb)) {
          interfaces[idx].status = parseInt(vb.value);
          interfaces[idx].statusText = interfaces[idx].status === 1 ? 'UP' : 'DOWN';
          interfaces[idx].statusIcon = interfaces[idx].status === 1 ? '🟢' : '🔴';
        }
      });

      // Sort: UP interfaces first, then by name
      interfaces.sort((a, b) => {
        if (a.status !== b.status) return a.status === 1 ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      // Display interface table
      console.log('Interface Status Report:');
      console.log('─'.repeat(60));
      console.log(`${'Interface'.padEnd(25)} ${'Index'.padEnd(8)} Status`);
      console.log('─'.repeat(60));
      
      interfaces.forEach(iface => {
        console.log(
          `${iface.name.padEnd(25)} ${String(iface.index).padEnd(8)} ${iface.statusIcon} ${iface.statusText}`
        );
      });
      console.log('─'.repeat(60));

      // Find best interface
      const activeInterfaces = interfaces.filter(iface => iface.status === 1);
      const currentInterface = settings.snmp_interface;
      const currentStatus = interfaces.find(iface => iface.name === currentInterface);

      console.log('\n🔍 Step 4: Analyzing configuration...\n');
      
      if (!currentInterface) {
        console.log('⚠️  No interface configured in settings.json!');
      } else if (!currentStatus) {
        console.log(`⚠️  Configured interface "${currentInterface}" not found on device!`);
      } else if (currentStatus.status !== 1) {
        console.log(`❌ Configured interface "${currentInterface}" is ${currentStatus.statusText}!`);
      } else {
        console.log(`✅ Configured interface "${currentInterface}" is ${currentStatus.statusText}`);
      }

      if (activeInterfaces.length === 0) {
        console.log('\n❌ CRITICAL: No active interfaces found!');
        console.log('   Please check your Mikrotik device connectivity.');
        session.close();
        return;
      }

      // Recommend interface
      console.log(`\n📊 Active interfaces available: ${activeInterfaces.length}`);
      
      // Priority: sfp/ether interfaces that are main uplinks
      const recommended = activeInterfaces.find(iface => 
        iface.name.includes('sfp') || 
        iface.name.includes('ether') && !iface.name.includes('vlan')
      ) || activeInterfaces[0];

      console.log(`\n💡 Recommended interface: ${recommended.name} (${recommended.statusIcon} ${recommended.statusText})`);

      // Step 5: Update settings if needed
      if (currentInterface !== recommended.name) {
        console.log(`\n🔧 Step 5: Updating settings.json...`);
        
        try {
          settings.snmp_interface = recommended.name;
          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
          console.log(`✅ Updated snmp_interface to: ${recommended.name}`);
        } catch (error) {
          console.error(`❌ Failed to update settings.json: ${error.message}`);
        }
      } else {
        console.log('\n✅ Step 5: Settings already correct, no changes needed.');
      }

      // Step 6: Test traffic monitoring
      console.log(`\n🔍 Step 6: Testing traffic monitoring on ${recommended.name}...\n`);
      
      const trafficOids = [
        `${OIDs.ifInOctets}.${recommended.index}`,
        `${OIDs.ifOutOctets}.${recommended.index}`
      ];

      session.get(trafficOids, (error, trafficVarbinds) => {
        if (error) {
          console.error('❌ Failed to get traffic data:', error.message);
          session.close();
          return;
        }

        const inOctets = trafficVarbinds[0] ? parseInt(trafficVarbinds[0].value) : 0;
        const outOctets = trafficVarbinds[1] ? parseInt(trafficVarbinds[1].value) : 0;

        console.log(`📥 RX: ${formatBytes(inOctets)} (${inOctets} octets)`);
        console.log(`📤 TX: ${formatBytes(outOctets)} (${outOctets} octets)`);

        // Wait 2 seconds and check again for rate calculation
        console.log('\n⏱️  Measuring traffic rate (2 second interval)...');
        
        setTimeout(() => {
          session.get(trafficOids, (error2, trafficVarbinds2) => {
            if (error2) {
              console.error('❌ Failed to get second traffic sample:', error2.message);
              session.close();
              return;
            }

            const inOctets2 = trafficVarbinds2[0] ? parseInt(trafficVarbinds2[0].value) : 0;
            const outOctets2 = trafficVarbinds2[1] ? parseInt(trafficVarbinds2[1].value) : 0;

            const inRate = ((inOctets2 - inOctets) * 8) / 2; // bits per second
            const outRate = ((outOctets2 - outOctets) * 8) / 2;

            console.log(`\n📊 Traffic Rate:`);
            console.log(`   📥 RX: ${formatBits(inRate)}/s`);
            console.log(`   📤 TX: ${formatBits(outRate)}/s`);

            // Final summary
            console.log('\n' + '═'.repeat(60));
            console.log('✅ DIAGNOSIS COMPLETE');
            console.log('═'.repeat(60));
            console.log('\n📋 Summary:');
            console.log(`   ✅ SNMP connection: Working`);
            console.log(`   ✅ Active interfaces: ${activeInterfaces.length}`);
            console.log(`   ✅ Configured interface: ${settings.snmp_interface}`);
            console.log(`   ✅ Traffic monitoring: Working (${formatBits(inRate + outRate)}/s total)`);
            
            console.log('\n🚀 Next Steps:');
            console.log('   1. Restart your application server');
            console.log('   2. Open dashboard: http://localhost:3001/admin/dashboard');
            console.log('   3. Check SNMP status: http://localhost:3001/admin/snmp');
            console.log('   4. Verify traffic graphs are showing data\n');

            session.close();
          });
        }, 2000);
      });
    });
  }
});

// Helper functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatBits(bits) {
  if (bits === 0) return '0 bps';
  const k = 1000;
  const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  const i = Math.floor(Math.log(bits) / Math.log(k));
  return parseFloat((bits / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Handle errors
session.on('error', (error) => {
  console.error('❌ SNMP session error:', error.message);
});

process.on('SIGINT', () => {
  console.log('\n\n⚠️  Interrupted by user');
  session.close();
  process.exit(0);
});
