/**
 * Quick vendor detection tool untuk OLT
 * Membantu identify vendor OLT berdasarkan sysDescr
 * 
 * Usage: node detect-olt-vendor.js <OLT_IP> [community]
 */

const snmp = require('net-snmp');

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('❌ Usage: node detect-olt-vendor.js <OLT_IP> [community]');
  console.log('   Example: node detect-olt-vendor.js 192.168.1.1 public');
  process.exit(1);
}

const host = args[0];
const community = args[1] || 'public';

console.log('🔍 OLT Vendor Detection Tool\n');
console.log(`Host: ${host}`);
console.log(`Community: ${community}\n`);
console.log('='.repeat(80) + '\n');

// OIDs to check
const CHECK_OIDS = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysObjectID: '1.3.6.1.2.1.1.2.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  sysLocation: '1.3.6.1.2.1.1.6.0'
};

// Vendor patterns
const VENDOR_PATTERNS = {
  'ZTE': {
    patterns: [/zte/i, /c300/i, /c320/i],
    enterpriseOID: '1.3.6.1.4.1.3902',
    testOID: '1.3.6.1.4.1.3902.1012.3.28.1.1.2',
    description: 'ZTE C300/C320 GPON OLT'
  },
  'Huawei': {
    patterns: [/huawei/i, /ma5608/i, /ma5680/i],
    enterpriseOID: '1.3.6.1.4.1.2011',
    testOID: '1.3.6.1.4.1.2011.6.128.1.1.2.43.1.3',
    description: 'Huawei MA5608T/MA5680T GPON OLT'
  },
  'C-Data': {
    patterns: [/c-data/i, /cdata/i, /fd1/i, /fd10/i],
    enterpriseOID: '1.3.6.1.4.1.34592',
    testOID: '1.3.6.1.4.1.34592.1.3.4.1.2.1.1.13',
    description: 'C-Data FD1000 Series GPON OLT'
  },
  'HIOSO': {
    patterns: [/hioso/i],
    enterpriseOID: '1.3.6.1.4.1.6688',
    testOID: '1.3.6.1.4.1.6688.1.1.1.4.2.1.1.8',
    description: 'HIOSO GPON OLT'
  },
  'HSGQ': {
    patterns: [/hsgq/i, /shengxi/i, /guangzhou/i],
    enterpriseOID: '1.3.6.1.4.1.5875',
    testOID: '1.3.6.1.4.1.5875.800.128.30.1.3.2.1.5',
    description: 'HSGQ (Guangzhou Shengxi) GPON/EPON OLT'
  },
  'Fiberhome': {
    patterns: [/fiberhome/i, /an5516/i, /an5506/i],
    enterpriseOID: '1.3.6.1.4.1.5875',
    testOID: null,
    description: 'Fiberhome GPON OLT'
  }
};

function createSession() {
  return snmp.createSession(host, community, {
    port: 161,
    retries: 1,
    timeout: 5000,
    version: snmp.Version2c
  });
}

async function snmpGet(session, oid) {
  return new Promise((resolve, reject) => {
    session.get([oid], (err, varbinds) => {
      if (err) return reject(err);
      if (varbinds.length === 0) return reject(new Error('No response'));
      const vb = varbinds[0];
      if (snmp.isVarbindError(vb)) return reject(new Error(snmp.varbindError(vb)));
      resolve(vb.value);
    });
  });
}

async function snmpWalk(session, oid) {
  return new Promise((resolve, reject) => {
    const results = [];
    session.subtree(oid, (varbinds) => {
      const arr = Array.isArray(varbinds) ? varbinds : [varbinds];
      arr.forEach(vb => {
        if (!snmp.isVarbindError(vb)) {
          results.push({ oid: vb.oid, value: vb.value });
        }
      });
    }, (err) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

async function detectVendor() {
  const session = createSession();
  
  try {
    // Get system information
    console.log('📊 Reading system information...\n');
    
    const sysDescr = await snmpGet(session, CHECK_OIDS.sysDescr);
    const sysObjectID = await snmpGet(session, CHECK_OIDS.sysObjectID);
    const sysName = await snmpGet(session, CHECK_OIDS.sysName).catch(() => 'N/A');
    const sysLocation = await snmpGet(session, CHECK_OIDS.sysLocation).catch(() => 'N/A');
    
    console.log('System Information:');
    console.log(`  Description: ${sysDescr}`);
    console.log(`  Object ID: ${sysObjectID}`);
    console.log(`  Name: ${sysName}`);
    console.log(`  Location: ${sysLocation}`);
    console.log();
    
    // Detect vendor
    console.log('🔎 Analyzing vendor patterns...\n');
    
    let detectedVendor = null;
    const sysDescrStr = String(sysDescr).toLowerCase();
    
    for (const [vendor, info] of Object.entries(VENDOR_PATTERNS)) {
      const matched = info.patterns.some(pattern => pattern.test(sysDescrStr));
      if (matched) {
        detectedVendor = { name: vendor, info };
        break;
      }
    }
    
    if (detectedVendor) {
      console.log(`✅ Vendor Detected: ${detectedVendor.name}`);
      console.log(`   ${detectedVendor.info.description}`);
      console.log(`   Enterprise OID: ${detectedVendor.info.enterpriseOID}`);
      console.log();
      
      // Test vendor-specific OID
      if (detectedVendor.info.testOID) {
        console.log('🧪 Testing vendor-specific OID...');
        console.log(`   OID: ${detectedVendor.info.testOID}`);
        
        try {
          const results = await snmpWalk(session, detectedVendor.info.testOID);
          if (results.length > 0) {
            console.log(`   ✅ Success! Found ${results.length} entries`);
            console.log('   ONU discovery will work for this vendor');
          } else {
            console.log('   ⚠️  OID exists but returned no data');
            console.log('   ONU discovery may not work (no ONUs or different OID)');
          }
        } catch (error) {
          console.log(`   ❌ Failed: ${error.message}`);
          console.log('   ONU discovery may not be supported');
        }
      }
      
      console.log();
      console.log('📝 Configuration for admin panel:');
      console.log(`   Vendor: ${detectedVendor.name.toLowerCase()}`);
      console.log(`   Host: ${host}`);
      console.log(`   Community: ${community}`);
      
    } else {
      console.log('⚠️  Vendor not automatically detected');
      console.log('   This might be a generic OLT or unsupported vendor');
      console.log('   Try using "generic" vendor option');
      console.log();
      console.log('   If you know the vendor, please check:');
      Object.entries(VENDOR_PATTERNS).forEach(([vendor, info]) => {
        console.log(`   - ${vendor}: ${info.description}`);
      });
    }
    
    session.close();
    
  } catch (error) {
    session.close();
    console.error('❌ Error:', error.message);
    console.log();
    console.log('Troubleshooting:');
    console.log('  1. Verify OLT IP address is correct');
    console.log('  2. Check SNMP community string');
    console.log('  3. Ensure SNMP is enabled on OLT');
    console.log('  4. Check firewall rules (UDP port 161)');
    console.log('  5. Try: snmpwalk -v2c -c public ' + host + ' system');
    process.exit(1);
  }
}

console.log('Starting detection...\n');

detectVendor().then(() => {
  console.log();
  console.log('='.repeat(80));
  console.log('✅ Detection complete!');
  console.log();
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
