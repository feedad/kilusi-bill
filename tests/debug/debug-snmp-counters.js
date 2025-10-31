#!/usr/bin/env node

/**
 * Debug SNMP Counters - Cek raw counter values
 * Untuk verify apakah counter berubah atau tidak
 */

const snmp = require('net-snmp');
const { getSetting } = require('./config/settingsManager');

const config = {
  host: getSetting('snmp_host', '192.168.88.2'),
  community: getSetting('snmp_community', 'public'),
  port: parseInt(getSetting('snmp_port', '161'))
};

// OIDs yang akan ditest
const OIDS = {
  ifHCInOctets: '1.3.6.1.2.1.31.1.1.1.6',    // 64-bit counter
  ifHCOutOctets: '1.3.6.1.2.1.31.1.1.1.10',  // 64-bit counter
  ifInOctets: '1.3.6.1.2.1.2.2.1.10',        // 32-bit counter (fallback)
  ifOutOctets: '1.3.6.1.2.1.2.2.1.16',       // 32-bit counter (fallback)
  ifName: '1.3.6.1.2.1.31.1.1.1.1'
};

console.log('🔍 SNMP Counter Debug Tool\n');
console.log('Configuration:');
console.log(`  Host: ${config.host}:${config.port}`);
console.log(`  Community: ${config.community}\n`);
console.log('═'.repeat(80));

const session = snmp.createSession(config.host, config.community, {
  port: config.port,
  version: snmp.Version2c,
  timeout: 5000
});

async function getInterfaceIndex(interfaceName) {
  return new Promise((resolve, reject) => {
    const results = [];
    session.subtree(OIDS.ifName, (varbinds) => {
      if (!Array.isArray(varbinds)) varbinds = [varbinds];
      varbinds.forEach(vb => {
        if (!snmp.isVarbindError(vb)) {
          const index = vb.oid.split('.').pop();
          const name = vb.value.toString();
          results.push({ index: parseInt(index), name });
        }
      });
    }, (err) => {
      if (err) return reject(err);
      const found = results.find(r => r.name === interfaceName);
      if (found) {
        resolve(found.index);
      } else {
        reject(new Error(`Interface ${interfaceName} not found. Available: ${results.map(r => r.name).join(', ')}`));
      }
    });
  });
}

async function getCounters(ifIndex) {
  return new Promise((resolve, reject) => {
    const oids = [
      `${OIDS.ifHCInOctets}.${ifIndex}`,
      `${OIDS.ifHCOutOctets}.${ifIndex}`,
      `${OIDS.ifInOctets}.${ifIndex}`,
      `${OIDS.ifOutOctets}.${ifIndex}`
    ];
    
    session.get(oids, (err, varbinds) => {
      if (err) return reject(err);
      
      const result = {
        ifHCInOctets: null,
        ifHCOutOctets: null,
        ifInOctets: null,
        ifOutOctets: null
      };
      
      varbinds.forEach(vb => {
        if (snmp.isVarbindError(vb)) {
          console.log(`  ⚠️  Error for OID ${vb.oid}: ${snmp.varbindError(vb)}`);
        } else {
          if (vb.oid.includes(OIDS.ifHCInOctets)) {
            result.ifHCInOctets = vb.value;
          } else if (vb.oid.includes(OIDS.ifHCOutOctets)) {
            result.ifHCOutOctets = vb.value;
          } else if (vb.oid.includes(OIDS.ifInOctets)) {
            result.ifInOctets = vb.value;
          } else if (vb.oid.includes(OIDS.ifOutOctets)) {
            result.ifOutOctets = vb.value;
          }
        }
      });
      
      resolve(result);
    });
  });
}

async function testInterface(interfaceName) {
  console.log(`\n📊 Testing Interface: ${interfaceName}`);
  console.log('─'.repeat(80));
  
  try {
    // Get interface index
    console.log('Step 1: Resolving interface index...');
    const ifIndex = await getInterfaceIndex(interfaceName);
    console.log(`  ✅ Interface index: ${ifIndex}\n`);
    
    // Get initial counters
    console.log('Step 2: Reading initial counters...');
    const counters1 = await getCounters(ifIndex);
    console.log('  Initial Counter Values:');
    console.log(`    ifHCInOctets (64-bit RX):  ${counters1.ifHCInOctets !== null ? counters1.ifHCInOctets.toString() : 'NOT AVAILABLE'}`);
    console.log(`    ifHCOutOctets (64-bit TX): ${counters1.ifHCOutOctets !== null ? counters1.ifHCOutOctets.toString() : 'NOT AVAILABLE'}`);
    console.log(`    ifInOctets (32-bit RX):    ${counters1.ifInOctets !== null ? counters1.ifInOctets.toString() : 'NOT AVAILABLE'}`);
    console.log(`    ifOutOctets (32-bit TX):   ${counters1.ifOutOctets !== null ? counters1.ifOutOctets.toString() : 'NOT AVAILABLE'}`);
    
    // Wait 5 seconds
    console.log('\n⏱️  Waiting 5 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Get second counters
    console.log('Step 3: Reading counters again (after 5 seconds)...');
    const counters2 = await getCounters(ifIndex);
    console.log('  Second Counter Values:');
    console.log(`    ifHCInOctets (64-bit RX):  ${counters2.ifHCInOctets !== null ? counters2.ifHCInOctets.toString() : 'NOT AVAILABLE'}`);
    console.log(`    ifHCOutOctets (64-bit TX): ${counters2.ifHCOutOctets !== null ? counters2.ifHCOutOctets.toString() : 'NOT AVAILABLE'}`);
    console.log(`    ifInOctets (32-bit RX):    ${counters2.ifInOctets !== null ? counters2.ifInOctets.toString() : 'NOT AVAILABLE'}`);
    console.log(`    ifOutOctets (32-bit TX):   ${counters2.ifOutOctets !== null ? counters2.ifOutOctets.toString() : 'NOT AVAILABLE'}`);
    
    // Calculate deltas
    console.log('\n📈 Analysis:');
    console.log('─'.repeat(80));
    
    const calcDelta = (val1, val2, name) => {
      if (val1 === null || val2 === null) {
        console.log(`  ❌ ${name}: NOT AVAILABLE - OID not supported by device`);
        return null;
      }
      
      const delta = Number(val2) - Number(val1);
      const bytesPerSec = delta / 5; // 5 seconds interval
      const bitsPerSec = bytesPerSec * 8;
      const mbps = bitsPerSec / 1000000;
      
      if (delta === 0) {
        console.log(`  ⚪ ${name}: NO CHANGE - Counter value: ${val2}`);
        console.log(`     📊 This means NO TRAFFIC passed through in 5 seconds`);
        return 0;
      } else if (delta < 0) {
        console.log(`  ⚠️  ${name}: COUNTER WRAPPED (${delta}) - Very high traffic or counter reset`);
        return null;
      } else {
        console.log(`  ✅ ${name}: CHANGED +${delta} bytes`);
        console.log(`     📊 Rate: ${mbps.toFixed(3)} Mbps (${bytesPerSec.toFixed(0)} bytes/sec)`);
        return mbps;
      }
    };
    
    console.log('\n64-bit Counters (ifHC - High Capacity):');
    const rxRate64 = calcDelta(counters1.ifHCInOctets, counters2.ifHCInOctets, 'RX (Download)');
    const txRate64 = calcDelta(counters1.ifHCOutOctets, counters2.ifHCOutOctets, 'TX (Upload)');
    
    console.log('\n32-bit Counters (if - Standard):');
    const rxRate32 = calcDelta(counters1.ifInOctets, counters2.ifInOctets, 'RX (Download)');
    const txRate32 = calcDelta(counters1.ifOutOctets, counters2.ifOutOctets, 'TX (Upload)');
    
    // Conclusion
    console.log('\n' + '═'.repeat(80));
    console.log('🎯 CONCLUSION:');
    console.log('─'.repeat(80));
    
    if (rxRate64 === 0 && txRate64 === 0 && rxRate32 === 0 && txRate32 === 0) {
      console.log('❌ NO TRAFFIC DETECTED on this interface');
      console.log('\nPossible reasons:');
      console.log('  1. Interface is genuinely idle (no packets passing through)');
      console.log('  2. Interface is UP but not routing/bridging traffic');
      console.log('  3. Traffic is on different interface');
      console.log('\nTo verify:');
      console.log(`  - Check Mikrotik: /interface print stats where name="${interfaceName}"`);
      console.log('  - Generate traffic: ping through this interface');
      console.log('  - Check routing table: traffic might use different interface');
    } else if (rxRate64 !== null || txRate64 !== null) {
      console.log('✅ TRAFFIC DETECTED using 64-bit counters (ifHC)');
      console.log(`   RX: ${rxRate64 !== null ? rxRate64.toFixed(3) : 'N/A'} Mbps`);
      console.log(`   TX: ${txRate64 !== null ? txRate64.toFixed(3) : 'N/A'} Mbps`);
      console.log('\n🎉 Your SNMP monitoring is working correctly!');
      console.log('   The dashboard should show this traffic.');
    } else if (rxRate32 !== null || txRate32 !== null) {
      console.log('✅ TRAFFIC DETECTED using 32-bit counters (if)');
      console.log(`   RX: ${rxRate32 !== null ? rxRate32.toFixed(3) : 'N/A'} Mbps`);
      console.log(`   TX: ${txRate32 !== null ? txRate32.toFixed(3) : 'N/A'} Mbps`);
      console.log('\n⚠️  Note: Device might not support 64-bit counters');
      console.log('   Consider using 32-bit counters for high-speed interfaces');
    }
    
    console.log('═'.repeat(80));
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  }
}

async function main() {
  const interfaces = ['sfp-sfpplus1', 'vlan10'];
  
  for (const iface of interfaces) {
    await testInterface(iface);
  }
  
  console.log('\n✅ Testing complete\n');
  session.close();
}

main().catch(error => {
  console.error('Fatal error:', error);
  session.close();
  process.exit(1);
});
