const radiusDb = require('./config/radius-postgres');

async function analyzeRadiusFailure() {
  try {
    console.log('🔍 ANALISIS NAS CLIENTS');
    console.log('========================');

    const nasClients = await radiusDb.getAllNasClients();
    nasClients.forEach(nas => {
      console.log(`\n📋 NAS Client: ${nas.shortname}`);
      console.log(`   IP: ${nas.nasname}`);
      console.log(`   Secret: ${nas.secret}`);
      console.log(`   ID: ${nas.id}`);
    });

    // Test user apptest
    console.log('\n🔐 ANALISIS USER RADIUS');
    console.log('=========================');
    const user = await radiusDb.getRadiusUser('apptest');
    if (user) {
      console.log('✅ User ditemukan:');
      console.log(`   Username: ${user.username}`);
      console.log(`   Password: ${user.value}`);
      console.log(`   Attribute: ${user.attribute}`);
      console.log(`   Operation: ${user.op}`);
    } else {
      console.log('❌ User tidak ditemukan');
    }

    // Test connection dari 172.22.10.156
    console.log('\n🧪 TESTING CONNECTION FROM 172.22.10.156');
    console.log('========================================');

    const dgram = require('dgram');
    const radius = require('radius');
    const crypto = require('crypto');

    // Test dengan NAS client 172.22.10.156
    const testWithNAS = async (nasIp, nasSecret) => {
      return new Promise((resolve) => {
        const client = dgram.createSocket('udp4');
        const requestAuth = crypto.randomBytes(16);

        const requestPacket = radius.encode({
          code: 'Access-Request',
          identifier: 1,
          authenticator: requestAuth,
          secret: nasSecret,
          attributes: [
            ['User-Name', 'apptest'],
            ['User-Password', '1234567'],
            ['NAS-IP-Address', nasIp]
          ]
        });

        let responded = false;
        client.on('message', (msg, rinfo) => {
          if (responded) return;
          responded = true;

          const response = radius.decode({
            packet: msg,
            secret: nasSecret
          });

          console.log(`📨 Response from ${nasIp}:`);
          console.log(`   Code: ${response.code}`);
          console.log(`   Message: ${response.attributes['Reply-Message'] || 'No message'}`);

          resolve(response.code === 'Access-Accept');
          client.close();
        });

        setTimeout(() => {
          if (!responded) {
            console.log(`❌ Timeout dari ${nasIp}`);
            resolve(false);
            client.close();
          }
        }, 3000);

        client.send(requestPacket, 1812, nasIp);
      });
    };

    // Test dari localhost (seharusnya berhasil)
    console.log('\n📍 Testing from localhost (127.0.0.1):');
    const localResult = await testWithNAS('127.0.0.1', 'testing123');
    console.log(`   Result: ${localResult ? 'SUCCESS' : 'FAILED'}`);

    // Test dari 172.22.10.156 (seharusnya gagal)
    console.log('\n📍 Testing from NAS IP (172.22.10.156):');
    const nasResult = await testWithNAS('172.22.10.156', 'testing123');
    console.log(`   Result: ${nasResult ? 'SUCCESS' : 'FAILED'}`);

    // Kesimpulan
    console.log('\n🎯 KESIMPULAN:');
    console.log('==============');
    if (!nasResult && localResult) {
      console.log('❌ MASALAH: Autentikasi dari 172.22.10.156 GAGAL');
      console.log('✅ Autentikasi dari localhost BERHASIL');
      console.log('\n💡 Kemungkinan penyebab:');
      console.log('1. Network issue antara 172.22.10.156 dan RADIUS server');
      console.log('2. Firewall memblock request dari 172.22.10.156');
      console.log('3. RADIUS server hanya listen di localhost, bukan di semua interfaces');
      console.log('4. NAS client secret tidak cocok');
    } else if (nasResult && localResult) {
      console.log('✅ Semua test BERHASIL - tidak ada masalah');
    } else {
      console.log('❌ Semua test GAGAL - periksa RADIUS server');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }

  process.exit(0);
}

analyzeRadiusFailure();