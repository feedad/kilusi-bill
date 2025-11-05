#!/usr/bin/env node

/**
 * Generate MikroTik PPP Profile commands untuk semua packages
 */

const billing = require('./config/billing');
const { logger } = require('./config/logger');

async function generateMikrotikCommands() {
  console.log('\n' + '='.repeat(70));
  console.log('GENERATE MIKROTIK PPP PROFILE COMMANDS');
  console.log('='.repeat(70) + '\n');
  
  try {
    // Get all active packages
    const packages = await billing.getAllPackages();
    const activePackages = packages.filter(p => p.is_active);
    
    if (activePackages.length === 0) {
      console.log('❌ Tidak ada paket aktif di database.\n');
      return;
    }
    
    console.log(`📦 Ditemukan ${activePackages.length} paket aktif:\n`);
    
    // Generate IP pool base
    let poolBase = 10;
    const commands = [];
    
    // First, generate all IP pools
    commands.push('# ========================================');
    commands.push('# STEP 1: Buat IP Pools');
    commands.push('# ========================================');
    commands.push('');
    
    activePackages.forEach((pkg, idx) => {
      const poolName = pkg.pppoe_profile || `pool-${pkg.name.toLowerCase().replace(/\s/g, '-')}`;
      const subnet = 10 + idx;
      const poolRange = `10.10.${subnet}.10-10.10.${subnet}.254`;
      
      commands.push(`# Pool untuk ${pkg.name}`);
      commands.push(`/ip pool add name=${poolName} ranges=${poolRange}`);
      commands.push('');
    });
    
    // Then, generate PPP profiles
    commands.push('# ========================================');
    commands.push('# STEP 2: Buat PPP Profiles');
    commands.push('# ========================================');
    commands.push('');
    
    activePackages.forEach((pkg, idx) => {
      const profileName = pkg.pppoe_profile || pkg.name;
      const poolName = pkg.pppoe_profile || `pool-${pkg.name.toLowerCase().replace(/\s/g, '-')}`;
      const subnet = 10 + idx;
      const localAddr = `10.10.${subnet}.1`;
      const rateLimit = pkg.rate_limit || pkg.speed || '10M/10M';
      
      commands.push(`# Profile untuk ${pkg.name} (${pkg.speed})`);
      commands.push(`/ppp profile add name=${profileName} \\`);
      commands.push(`    local-address=${localAddr} \\`);
      commands.push(`    remote-address=${poolName} \\`);
      commands.push(`    rate-limit=${rateLimit} \\`);
      commands.push(`    only-one=yes \\`);
      commands.push(`    use-encryption=default`);
      commands.push('');
    });
    
    // Add verification commands
    commands.push('# ========================================');
    commands.push('# STEP 3: Verifikasi');
    commands.push('# ========================================');
    commands.push('');
    commands.push('/ip pool print detail');
    commands.push('/ppp profile print detail');
    commands.push('');
    
    // Display commands
    console.log('📋 Copy-paste commands berikut ke MikroTik Terminal:\n');
    console.log(commands.join('\n'));
    
    // Display package mapping
    console.log('\n' + '='.repeat(70));
    console.log('PACKAGE → PROFILE MAPPING');
    console.log('='.repeat(70) + '\n');
    
    console.log('┌─────────────────────────────┬─────────────────────┬──────────────┐');
    console.log('│ Package Name                │ PPPoE Profile       │ IP Range     │');
    console.log('├─────────────────────────────┼─────────────────────┼──────────────┤');
    
    activePackages.forEach((pkg, idx) => {
      const profileName = pkg.pppoe_profile || pkg.name;
      const subnet = 10 + idx;
      const ipRange = `10.10.${subnet}.x`;
      
      const pkgCol = pkg.name.padEnd(27);
      const profCol = profileName.padEnd(19);
      const ipCol = ipRange.padEnd(12);
      
      console.log(`│ ${pkgCol} │ ${profCol} │ ${ipCol} │`);
    });
    
    console.log('└─────────────────────────────┴─────────────────────┴──────────────┘');
    
    console.log('\n' + '='.repeat(70));
    console.log('CATATAN PENTING');
    console.log('='.repeat(70) + '\n');
    console.log('1. Nama PPPoE Profile HARUS SAMA PERSIS dengan yang di database');
    console.log('2. Setiap paket punya subnet berbeda (10.10.10.x, 10.10.11.x, dst)');
    console.log('3. local-address = gateway (.1)');
    console.log('4. remote-address = pool name');
    console.log('5. rate-limit dari database packages.rate_limit');
    console.log('\nSetelah execute commands di atas:');
    console.log('- Disconnect & reconnect semua PPPoE client');
    console.log('- IP 0.0.0.0 akan berubah jadi IP yang benar dari pool');
    console.log('- Koneksi tidak akan disconnect lagi');
    console.log('\n' + '='.repeat(70) + '\n');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  
  process.exit(0);
}

generateMikrotikCommands();
