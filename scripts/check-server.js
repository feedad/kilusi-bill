/**
 * Test startup script untuk memverifikasi server berjalan
 */

const http = require('http');

async function checkServer() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/',
      method: 'GET',
      timeout: 3000
    };

    const req = http.request(options, (res) => {
      resolve({ status: res.statusCode, message: 'Server is running' });
    });

    req.on('error', (e) => {
      reject({ error: e.message });
    });

    req.on('timeout', () => {
      req.destroy();
      reject({ error: 'Connection timeout' });
    });

    req.end();
  });
}

async function main() {
  console.log('🔍 Checking if server is running on port 3001...\n');
  
  try {
    const result = await checkServer();
    console.log(`✅ ${result.message}`);
    console.log(`📊 Status Code: ${result.status}`);
    console.log('\n🌐 Server URLs:');
    console.log('   - Dashboard: http://localhost:3001/admin/dashboard');
  console.log('   - SNMP Devices: http://localhost:3001/admin/snmp/devices');
    console.log('   - Settings: http://localhost:3001/admin/setting');
    process.exit(0);
  } catch (e) {
    console.error(`❌ Server is NOT running: ${e.error}`);
    console.log('\n💡 To start the server, run:');
    console.log('   cd d:\\Project\\Kilusi-Bill');
    console.log('   node app.js');
    process.exit(1);
  }
}

main();
