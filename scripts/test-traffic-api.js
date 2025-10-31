/**
 * Test script untuk API traffic SNMP
 * Memanggil endpoint beberapa kali untuk melihat apakah rate calculation berfungsi
 */

const http = require('http');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchTraffic() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/dashboard/traffic?interface=ether1',
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.end();
  });
}

async function main() {
  console.log('🧪 Testing SNMP traffic API endpoint...\n');
  
  for (let i = 1; i <= 5; i++) {
    try {
      console.log(`📊 Request #${i}:`);
      const result = await fetchTraffic();
      
      if (result.success) {
        const rxMbps = (result.rx / 1000000).toFixed(2);
        const txMbps = (result.tx / 1000000).toFixed(2);
        console.log(`   ✅ Success`);
        console.log(`   📥 RX: ${rxMbps} Mbps (${result.rx} bps)`);
        console.log(`   📤 TX: ${txMbps} Mbps (${result.tx} bps)`);
        console.log(`   🔌 Interface: ${result.interface}`);
      } else {
        console.log(`   ❌ Failed: ${result.message}`);
      }
      
      console.log('');
      
      if (i < 5) {
        console.log('⏳ Waiting 3 seconds...\n');
        await delay(3000);
      }
    } catch (e) {
      console.error(`   ❌ Error: ${e.message}\n`);
    }
  }
  
  console.log('✅ Test completed!');
}

main().catch(console.error);
