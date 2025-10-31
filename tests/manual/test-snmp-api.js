#!/usr/bin/env node

/**
 * test-snmp-api.js
 * Test SNMP API endpoints
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

async function loginAsAdmin() {
  console.log('🔐 Logging in as admin...');
  try {
    const response = await axios.post(`${BASE_URL}/admin/login`, {
      username: 'admin',
      password: 'admin'
    }, {
      maxRedirects: 0,
      validateStatus: (status) => status < 400
    });
    
    // Get cookies
    const cookies = response.headers['set-cookie'];
    if (!cookies) {
      throw new Error('No cookies received from login');
    }
    
    // Extract session cookie
    const sessionCookie = cookies[0].split(';')[0];
    console.log('✅ Logged in successfully\n');
    return sessionCookie;
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    process.exit(1);
  }
}

async function testEndpoint(name, url, cookie) {
  console.log(`\n🧪 Testing ${name}...`);
  console.log(`   URL: ${url}`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'Cookie': cookie
      },
      timeout: 5000
    });
    
    console.log(`   ✅ Status: ${response.status}`);
    console.log(`   📦 Response:`, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error(`   ❌ Failed:`, error.response?.data || error.message);
    return null;
  }
}

async function main() {
  console.log('🧪 Testing SNMP API Endpoints\n');
  console.log('═'.repeat(60));
  
  // Login first
  const cookie = await loginAsAdmin();
  
  // Test 1: Device Info
  console.log('\n📊 Test 1: Device Info');
  console.log('─'.repeat(60));
  const deviceInfo = await testEndpoint(
    'Device Info',
    `${BASE_URL}/admin/snmp/device-info`,
    cookie
  );
  
  // Test 2: List Interfaces
  console.log('\n📊 Test 2: List Interfaces');
  console.log('─'.repeat(60));
  const interfaces = await testEndpoint(
    'Interfaces List',
    `${BASE_URL}/admin/snmp/interfaces`,
    cookie
  );
  
  // Test 3: Traffic (using interface from settings)
  console.log('\n📊 Test 3: Traffic Monitoring');
  console.log('─'.repeat(60));
  const traffic = await testEndpoint(
    'Traffic Data',
    `${BASE_URL}/admin/snmp/traffic?interface=sfp-sfpplus1`,
    cookie
  );
  
  // Test 4: Dashboard Traffic Endpoint
  console.log('\n📊 Test 4: Dashboard Traffic (API)');
  console.log('─'.repeat(60));
  const dashTraffic = await testEndpoint(
    'Dashboard Traffic',
    `${BASE_URL}/api/dashboard/traffic?interface=sfp-sfpplus1`,
    cookie
  );
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📋 SUMMARY');
  console.log('═'.repeat(60));
  
  const tests = [
    { name: 'Device Info', result: deviceInfo?.success },
    { name: 'List Interfaces', result: interfaces?.success },
    { name: 'Traffic Monitoring', result: traffic?.success },
    { name: 'Dashboard Traffic', result: dashTraffic !== null }
  ];
  
  tests.forEach(test => {
    const icon = test.result ? '✅' : '❌';
    const status = test.result ? 'PASS' : 'FAIL';
    console.log(`   ${icon} ${test.name.padEnd(25)} ${status}`);
  });
  
  const passed = tests.filter(t => t.result).length;
  const total = tests.length;
  
  console.log('\n' + '═'.repeat(60));
  console.log(`   Result: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed! SNMP API is working correctly.');
    console.log('\n📝 Next steps:');
    console.log('   1. Open browser: http://localhost:3001/admin/snmp');
    console.log('   2. Check dashboard: http://localhost:3001/admin/dashboard');
    console.log('   3. Verify traffic graphs are displaying data');
  } else {
    console.log('\n⚠️  Some tests failed. Check the errors above.');
  }
  
  console.log('');
}

main().catch(error => {
  console.error('\n❌ Unexpected error:', error.message);
  process.exit(1);
});
