const dgram = require('dgram');
const radius = require('radius');
const crypto = require('crypto');

async function testRadiusFromClient() {
  try {
    console.log('🔐 TESTING RADIUS FROM CLIENT PERSPECTIVE');
    console.log('==========================================');
    console.log('Client IP: 172.22.10.156');
    console.log('RADIUS Server: 127.0.0.1:1812');
    console.log('NAS Secret: testing123');
    console.log('User: apptest / 1234567');

    // Test 1: Simulasi request dari client (172.22.10.156)
    console.log('\n📡 Test 1: Simulasi request dari client 172.22.10.156');

    const client1 = new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const requestAuth = crypto.randomBytes(16);

      const requestPacket = radius.encode({
        code: 'Access-Request',
        identifier: 1,
        authenticator: requestAuth,
        secret: 'testing123',
        attributes: [
          ['User-Name', 'apptest'],
          ['User-Password', '1234567'],
          ['NAS-IP-Address', '172.22.10.156'],
          ['NAS-Port', '0'],
          ['Service-Type', 'Framed-User']
        ]
      });

      let responded = false;
      socket.on('message', (msg, rinfo) => {
        if (responded) return;
        responded = true;

        try {
          const response = radius.decode({
            packet: msg,
            secret: 'testing123'
          });

          console.log(`✅ Response received from ${rinfo.address}:${rinfo.port}`);
          console.log(`   Code: ${response.code}`);
          console.log(`   Attributes: ${JSON.stringify(response.attributes, null, 2)}`);

          resolve({ success: response.code === 'Access-Accept', response });
        } catch (error) {
          console.log(`❌ Error decoding response: ${error.message}`);
          resolve({ success: false, error: error.message });
        }
        socket.close();
      });

      socket.on('error', (err) => {
        console.log(`❌ Socket error: ${err.message}`);
        resolve({ success: false, error: err.message });
        socket.close();
      });

      setTimeout(() => {
        if (!responded) {
          console.log('❌ Request timeout - no response received');
          resolve({ success: false, error: 'timeout' });
          socket.close();
        }
      }, 5000);

      // Kirim request sebagai client dari 172.22.10.156
      socket.bind({ address: '172.22.10.156' }, () => {
        console.log(`📤 Client socket bound to 172.22.10.156`);
        socket.send(requestPacket, 0, requestPacket.length, 1812, '127.0.0.1', (err) => {
          if (err) {
            console.log(`❌ Send error: ${err.message}`);
            resolve({ success: false, error: err.message });
            socket.close();
          } else {
            console.log(`📤 Request sent to 127.0.0.1:1812`);
          }
        });
      });
    });

    // Test 2: Request dari localhost (sebagai control)
    console.log('\n📡 Test 2: Request dari localhost (control test)');

    const client2 = new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const requestAuth = crypto.randomBytes(16);

      const requestPacket = radius.encode({
        code: 'Access-Request',
        identifier: 2,
        authenticator: requestAuth,
        secret: 'testing123',
        attributes: [
          ['User-Name', 'apptest'],
          ['User-Password', '1234567'],
          ['NAS-IP-Address', '127.0.0.1'],
          ['Service-Type', 'Framed-User']
        ]
      });

      let responded = false;
      socket.on('message', (msg, rinfo) => {
        if (responded) return;
        responded = true;

        try {
          const response = radius.decode({
            packet: msg,
            secret: 'testing123'
          });

          console.log(`✅ Response received from ${rinfo.address}:${rinfo.port}`);
          console.log(`   Code: ${response.code}`);

          resolve({ success: response.code === 'Access-Accept', response });
        } catch (error) {
          console.log(`❌ Error decoding response: ${error.message}`);
          resolve({ success: false, error: error.message });
        }
        socket.close();
      });

      setTimeout(() => {
        if (!responded) {
          console.log('❌ Request timeout');
          resolve({ success: false, error: 'timeout' });
          socket.close();
        }
      }, 3000);

      socket.send(requestPacket, 0, requestPacket.length, 1812, '127.0.0.1', (err) => {
        if (err) {
          console.log(`❌ Send error: ${err.message}`);
          resolve({ success: false, error: err.message });
          socket.close();
        }
      });
    });

    // Jalankan kedua test
    const result1 = await client1;
    const result2 = await client2;

    console.log('\n🎯 HASIL TESTING');
    console.log('==================');
    console.log(`Test 1 (dari 172.22.10.156): ${result1.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (!result1.success) {
      console.log(`   Error: ${result1.error}`);
    }

    console.log(`Test 2 (dari localhost): ${result2.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (!result2.success) {
      console.log(`   Error: ${result2.error}`);
    }

    // Analisis hasil
    console.log('\n📊 ANALISIS');
    console.log('============');
    if (!result1.success && result2.success) {
      console.log('❌ MASALAH DITEMUKAN:');
      console.log('   - Request dari 172.22.10.156 GAGAL');
      console.log('   - Request dari localhost BERHASIL');
      console.log('\n💡 KEMUNGKINAN PENYEBAB:');
      console.log('1. Interface 172.22.10.156 tidak bisa mengirim ke localhost');
      console.log('2. Routing configuration issue');
      console.log('3. Client binding problem');
      console.log('4. Network interface configuration');
    } else if (result1.success && result2.success) {
      console.log('✅ SEMUA TEST BERHASIL - tidak ada masalah');
    } else {
      console.log('❌ KEDUA TEST GAGAL - periksa RADIUS server');
    }

  } catch (error) {
    console.error('❌ Test error:', error.message);
  }

  process.exit(0);
}

testRadiusFromClient();