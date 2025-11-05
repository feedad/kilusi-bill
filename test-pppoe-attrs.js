#!/usr/bin/env node

/**
 * Test script to verify PPPoE attributes being sent to MikroTik
 */

const radiusServer = require('./config/radius-server');
const billing = require('./config/billing');
const radiusDb = require('./config/radius-postgres');

async function testPPPoEAttributes() {
  console.log('\n=== Testing PPPoE Attributes for apptest ===\n');
  
  // 1. Check customer data
  const customer = await billing.getCustomerByPPPoE('apptest');
  console.log('1. Customer data:');
  console.log(`   Name: ${customer.name}`);
  console.log(`   PPPoE Profile: ${customer.pppoe_profile}`);
  console.log(`   Package ID: ${customer.package_id}`);
  console.log(`   Package Name: ${customer.package_name}`);
  
  // 2. Check package data
  if (customer.package_id) {
    const pkg = await billing.getPackageById(customer.package_id);
    console.log('\n2. Package data:');
    console.log(`   Name: ${pkg.name}`);
    console.log(`   PPPoE Profile: ${pkg.pppoe_profile}`);
    console.log(`   Group: ${pkg.group}`);
    console.log(`   Rate Limit: ${pkg.rate_limit}`);
  }
  
  // 3. Check radreply attributes
  const replyAttrs = await radiusDb.getUserReplyAttributes('apptest');
  console.log('\n3. RADIUS reply attributes (radreply):');
  replyAttrs.forEach(attr => {
    console.log(`   ${attr.attribute} ${attr.op} ${attr.value}`);
  });
  
  // 4. Check radgroupreply attributes
  const groups = await radiusDb.getUserGroups('apptest');
  console.log('\n4. RADIUS groups (radusergroup):');
  for (const group of groups) {
    console.log(`   Group: ${group.groupname} (priority ${group.priority})`);
    const groupAttrs = await radiusDb.getGroupReplyAttributes(group.groupname);
    groupAttrs.forEach(attr => {
      console.log(`      ${attr.attribute} ${attr.op} ${attr.value}`);
    });
  }
  
  console.log('\n=== What should be sent in Access-Accept ===');
  console.log('Required attributes:');
  console.log('  - Service-Type = Framed-User');
  console.log('  - Framed-Protocol = PPP');
  console.log('  - Mikrotik-Group = UpTo-10M  (tells MikroTik which PPP profile to use)');
  console.log('\nThe PPP profile "UpTo-10M" on MikroTik must have:');
  console.log('  - Local Address: e.g., 10.10.10.1');
  console.log('  - Remote Address: e.g., pool-10M or 10.10.10.10-10.10.10.254');
  console.log('\nIf IP is 0.0.0.0, check:');
  console.log('  1. PPP profile exists on MikroTik with name "UpTo-10M"');
  console.log('  2. Profile has valid Local Address and Remote Address/pool');
  console.log('  3. MikroTik receives Mikrotik-Group attribute in Access-Accept\n');
  
  process.exit(0);
}

testPPPoEAttributes().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
