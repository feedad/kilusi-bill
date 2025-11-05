#!/usr/bin/env node

/**
 * Script untuk cek MikroTik PPP Profile
 * Requirement: npm install routeros-client
 */

const { getSetting } = require('./config/settingsManager');
const { logger } = require('./config/logger');

async function checkMikrotikProfile() {
  console.log('\n========================================');
  console.log('MIKROTIK PPP PROFILE CHECKER');
  console.log('========================================\n');
  
  // Check if MikroTik connection is available
  const mode = getSetting('app_mode');
  if (mode === 'radius') {
    console.log('❌ App sedang dalam RADIUS mode.');
    console.log('   MikroTik RouterOS API tidak tersedia.\n');
    console.log('📋 MANUAL CHECK REQUIRED:');
    console.log('   Silakan login ke MikroTik dan jalankan command ini:\n');
    console.log('   /ppp profile print detail where name=UpTo-10M\n');
    console.log('   Pastikan output menampilkan:');
    console.log('   - name: UpTo-10M');
    console.log('   - local-address: (harus ada, contoh: 10.10.10.1)');
    console.log('   - remote-address: (harus ada, contoh: pool-10M atau 10.10.10.10-10.10.10.254)');
    console.log('   - rate-limit: (opsional, contoh: 10M/10M)\n');
    console.log('   Kalau local-address atau remote-address KOSONG,');
    console.log('   itulah penyebab IP 0.0.0.0!\n');
    console.log('📝 FIX:');
    console.log('   /ppp profile set UpTo-10M local-address=10.10.10.1 remote-address=pool-10M\n');
    console.log('   Atau kalau profile belum ada, buat dengan:');
    console.log('   /ppp profile add name=UpTo-10M local-address=10.10.10.1 remote-address=pool-10M rate-limit=10M/10M\n');
    console.log('   Dan pastikan IP pool ada:');
    console.log('   /ip pool add name=pool-10M ranges=10.10.10.10-10.10.10.254\n');
    console.log('========================================\n');
    return;
  }
  
  // If in RouterOS mode, try to connect
  try {
    const RouterOSClient = require('routeros-client').RouterOSClient;
    const host = getSetting('mikrotik_host');
    const username = getSetting('mikrotik_username');
    const password = getSetting('mikrotik_password');
    
    if (!host || !username || !password) {
      console.log('❌ MikroTik credentials tidak lengkap di settings.json\n');
      return;
    }
    
    console.log(`🔌 Connecting to MikroTik ${host}...`);
    const client = new RouterOSClient({
      host: host,
      user: username,
      password: password,
      timeout: 10
    });
    
    await client.connect();
    console.log('✅ Connected to MikroTik\n');
    
    // Check PPP Profile
    console.log('📋 Checking PPP Profile "UpTo-10M"...\n');
    const profiles = await client.menu('/ppp profile').getAll();
    const profile = profiles.find(p => p.name === 'UpTo-10M');
    
    if (!profile) {
      console.log('❌ PPP Profile "UpTo-10M" TIDAK DITEMUKAN!');
      console.log('   Ini penyebab IP 0.0.0.0 dan disconnect!\n');
      console.log('📝 FIX: Buat profile dengan command:');
      console.log('   /ppp profile add name=UpTo-10M local-address=10.10.10.1 remote-address=pool-10M rate-limit=10M/10M\n');
    } else {
      console.log('✅ PPP Profile "UpTo-10M" ditemukan:');
      console.log(`   Name: ${profile.name}`);
      console.log(`   Local Address: ${profile['local-address'] || '❌ NOT SET (MASALAH!)'}`);
      console.log(`   Remote Address: ${profile['remote-address'] || '❌ NOT SET (MASALAH!)'}`);
      console.log(`   Rate Limit: ${profile['rate-limit'] || 'none'}`);
      console.log(`   Only One: ${profile['only-one'] || 'default'}\n`);
      
      if (!profile['local-address'] || !profile['remote-address']) {
        console.log('❌ MASALAH DITEMUKAN:');
        console.log('   Profile ada tapi local-address atau remote-address KOSONG!');
        console.log('   Ini penyebab IP 0.0.0.0!\n');
        console.log('📝 FIX:');
        console.log('   /ppp profile set UpTo-10M local-address=10.10.10.1 remote-address=pool-10M\n');
      } else {
        console.log('✅ Profile configuration looks good!\n');
        console.log('🔍 Checking IP Pool...');
        
        // Check if remote-address is a pool
        const remoteAddr = profile['remote-address'];
        if (!remoteAddr.includes('.')) {
          // It's a pool name
          const pools = await client.menu('/ip pool').getAll();
          const pool = pools.find(p => p.name === remoteAddr);
          
          if (!pool) {
            console.log(`❌ IP Pool "${remoteAddr}" TIDAK DITEMUKAN!`);
            console.log('   Profile mengacu ke pool yang tidak ada!\n');
            console.log('📝 FIX:');
            console.log(`   /ip pool add name=${remoteAddr} ranges=10.10.10.10-10.10.10.254\n`);
          } else {
            console.log(`✅ IP Pool "${remoteAddr}" ditemukan:`);
            console.log(`   Ranges: ${pool.ranges}\n`);
            console.log('🎉 Semua konfigurasi sudah benar!');
            console.log('   Kalau masih IP 0.0.0.0, coba:');
            console.log('   1. Restart PPPoE Server: /interface pppoe-server server disable numbers=0; /interface pppoe-server server enable numbers=0');
            console.log('   2. Disconnect & reconnect client PPPoE');
            console.log('   3. Cek /log print where topics~"pppoe" untuk error message\n');
          }
        } else {
          console.log('✅ Remote address is direct IP range (not a pool)\n');
        }
      }
    }
    
    await client.close();
    console.log('========================================\n');
    
  } catch (err) {
    console.log(`❌ Error: ${err.message}\n`);
    if (err.code === 'MODULE_NOT_FOUND') {
      console.log('📦 routeros-client belum terinstall.');
      console.log('   Install dengan: npm install routeros-client\n');
      console.log('   Atau lakukan manual check di MikroTik (lihat output di atas)\n');
    }
  }
}

checkMikrotikProfile().catch(console.error);
