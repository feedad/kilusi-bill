#!/usr/bin/env node
/**
 * Quick check: apptest user password in radcheck
 */

const radiusDb = require('./config/radius-postgres');
const billing = require('./config/billing');

async function checkApptest() {
  console.log('\n=== Checking apptest RADIUS credentials ===\n');
  
  // 1. Check radcheck
  const user = await radiusDb.getRadiusUser('apptest');
  if (user) {
    console.log('✅ apptest found in radcheck:');
    console.log(`   Username: ${user.username}`);
    console.log(`   Attribute: ${user.attribute}`);
    console.log(`   Password: ${user.value}`);
  } else {
    console.log('❌ apptest NOT found in radcheck (Cleartext-Password)');
  }
  
  // 2. Check billing customer
  const customer = await billing.getCustomerByPPPoE('apptest');
  if (customer) {
    console.log('\n✅ apptest found in billing customers:');
    console.log(`   Name: ${customer.name}`);
    console.log(`   PPPoE Username: ${customer.pppoe_username}`);
    console.log(`   PPPoE Password: ${customer.pppoe_password || '(not set)'}`);
    console.log(`   Package: ${customer.package_name || '(none)'}`);
    console.log(`   PPPoE Profile: ${customer.pppoe_profile || '(not set)'}`);
  } else {
    console.log('\n❌ apptest NOT found in billing customers');
  }
  
  console.log('\n=== Recommendation ===');
  if (!user || !customer) {
    console.log('Create or sync apptest user first.');
  } else if (user.value !== customer.pppoe_password) {
    console.log(`⚠️  PASSWORD MISMATCH!`);
    console.log(`   radcheck: "${user.value}"`);
    console.log(`   billing:  "${customer.pppoe_password}"`);
    console.log('   → Update billing customer password or resync to radcheck.');
  } else {
    console.log(`✅ Passwords match: "${user.value}"`);
    console.log('   → Use this exact password in your PPPoE client.');
    console.log('   → Ensure no typos, case-sensitive.');
  }
  console.log('');
  
  process.exit(0);
}

checkApptest().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
