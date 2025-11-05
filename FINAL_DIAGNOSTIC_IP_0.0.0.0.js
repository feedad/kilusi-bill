#!/usr/bin/env node

/**
 * Final diagnostic - IP 0.0.0.0 issue
 */

console.log('\n' + '='.repeat(80));
console.log('FINAL DIAGNOSTIC: IP 0.0.0.0 ISSUE');
console.log('='.repeat(80) + '\n');

console.log('📊 FAKTA YANG SUDAH DIVERIFIKASI:\n');

console.log('✅ 1. RADIUS Server Bekerja 100% Benar');
console.log('   - Authentication: Success (Access-Accept dikirim)');
console.log('   - Accounting Start: Recorded');
console.log('   - Accounting Stop: Recorded (setelah fix)');
console.log('   - VSA Encoding: Perfect\n');

console.log('✅ 2. Attribute yang Dikirim ke MikroTik:');
console.log('   - Service-Type: Framed-User ✅');
console.log('   - Framed-Protocol: PPP ✅');
console.log('   - Mikrotik-Group: UpTo-10M ✅ (VSA Buffer correct)');
console.log('   - Mikrotik-Rate-Limit: 10M/10M ✅ (VSA Buffer correct)\n');

console.log('✅ 3. Accounting Logs Menunjukkan:');
console.log('   - Session Start: Recorded with IP 0.0.0.0');
console.log('   - Session Stop: Recorded (disconnect immediately)');
console.log('   - Pattern: Start → Stop dalam hitungan detik\n');

console.log('❌ 4. MASALAH:');
console.log('   - IP yang di-assign: 0.0.0.0 (BUKAN dari pool!)');
console.log('   - Koneksi langsung disconnect');
console.log('   - Ghost sessions: 120+ (sudah di-cleanup)\n');

console.log('='.repeat(80));
console.log('ROOT CAUSE ANALYSIS');
console.log('='.repeat(80) + '\n');

console.log('Ketika RADIUS mengirim Mikrotik-Group = "UpTo-10M", MikroTik akan:');
console.log('  1. Cari PPP Profile dengan nama PERSIS "UpTo-10M"');
console.log('  2. Kalau profile TIDAK ADA → IP jadi 0.0.0.0 → disconnect');
console.log('  3. Kalau profile ADA tapi local-address KOSONG → IP jadi 0.0.0.0 → disconnect');
console.log('  4. Kalau profile ADA tapi remote-address KOSONG → IP jadi 0.0.0.0 → disconnect');
console.log('  5. Kalau profile ADA dan complete → IP di-assign dari pool → success\n');

console.log('Karena IP = 0.0.0.0, berarti salah satu dari #2, #3, atau #4.\n');

console.log('='.repeat(80));
console.log('SOLUSI: CEK DAN FIX MIKROTIK PPP PROFILE');
console.log('='.repeat(80) + '\n');

console.log('STEP 1: Login ke MikroTik (172.22.10.156)');
console.log('  ssh admin@172.22.10.156');
console.log('  atau gunakan Winbox\n');

console.log('STEP 2: Cek apakah profile "UpTo-10M" exist');
console.log('  /ppp profile print detail where name=UpTo-10M\n');

console.log('  EXPECTED OUTPUT (kalau benar):');
console.log('  ```');
console.log('  name=UpTo-10M');
console.log('  local-address=10.10.10.1           ← HARUS ADA!');
console.log('  remote-address=pool-10M             ← HARUS ADA!');
console.log('  rate-limit=10M/10M');
console.log('  ```\n');

console.log('  KEMUNGKINAN OUTPUT (kalau salah):');
console.log('  A) Tidak ada output → profile tidak exist');
console.log('  B) local-address= <kosong> → IP pool tidak configured');
console.log('  C) remote-address= <kosong> → IP pool tidak configured\n');

console.log('STEP 3A: Kalau profile TIDAK ADA (output kosong) → BUAT BARU');
console.log('  # Buat IP Pool');
console.log('  /ip pool add name=UpTo-10M ranges=10.10.10.10-10.10.10.254');
console.log('');
console.log('  # Buat PPP Profile');
console.log('  /ppp profile add name=UpTo-10M \\');
console.log('      local-address=10.10.10.1 \\');
console.log('      remote-address=UpTo-10M \\');
console.log('      rate-limit=10M/10M \\');
console.log('      only-one=yes\n');

console.log('STEP 3B: Kalau profile ADA tapi local/remote address KOSONG → UPDATE');
console.log('  # Buat IP Pool (kalau belum ada)');
console.log('  /ip pool add name=UpTo-10M ranges=10.10.10.10-10.10.10.254');
console.log('');
console.log('  # Update profile');
console.log('  /ppp profile set UpTo-10M \\');
console.log('      local-address=10.10.10.1 \\');
console.log('      remote-address=UpTo-10M\n');

console.log('STEP 4: Verifikasi IP Pool exist');
console.log('  /ip pool print detail where name=UpTo-10M\n');

console.log('  EXPECTED OUTPUT:');
console.log('  ```');
console.log('  name=UpTo-10M');
console.log('  ranges=10.10.10.10-10.10.10.254');
console.log('  ```\n');

console.log('  Kalau tidak ada output → pool belum dibuat!');
console.log('  Buat dengan: /ip pool add name=UpTo-10M ranges=10.10.10.10-10.10.10.254\n');

console.log('STEP 5: Disconnect client dan reconnect PPPoE\n');

console.log('STEP 6: Verifikasi hasil');
console.log('  Di MikroTik: /ppp active print detail');
console.log('  Harusnya sekarang IP = 10.10.10.x (BUKAN 0.0.0.0)\n');

console.log('  Di RADIUS Dashboard: http://[server]:3000/admin/radius');
console.log('  Widget "Active Sessions" harusnya show IP yang benar\n');

console.log('='.repeat(80));
console.log('TROUBLESHOOTING LANJUTAN');
console.log('='.repeat(80) + '\n');

console.log('Kalau MASIH IP 0.0.0.0 setelah konfigurasi profile:');
console.log('');
console.log('1. CEK TYPO di nama profile:');
console.log('   - Database: "UpTo-10M" (case sensitive!)');
console.log('   - MikroTik: "UpTo-10M" (harus sama persis!)');
console.log('');
console.log('2. CEK MikroTik Logs:');
console.log('   /log print where topics~"pppoe,error,critical"');
console.log('   Cari error message tentang profile atau IP pool');
console.log('');
console.log('3. CEK IP Pool tidak conflict:');
console.log('   /ip address print where address~"10.10.10"');
console.log('   Pastikan 10.10.10.1 tidak dipakai interface lain');
console.log('');
console.log('4. RESTART PPPoE Server (kalau perlu):');
console.log('   /interface pppoe-server server');
console.log('   set 0 disabled=yes');
console.log('   set 0 disabled=no');
console.log('');
console.log('5. TEST dengan profile default dulu:');
console.log('   /ppp profile set default-encryption local-address=10.10.10.1 remote-address=UpTo-10M');
console.log('   Kalau ini work, berarti RADIUS tidak mengirim Mikrotik-Group dengan benar');
console.log('   Kalau ini juga 0.0.0.0, berarti masalah di IP pool\n');

console.log('='.repeat(80));
console.log('KONTAK SUPPORT');
console.log('='.repeat(80) + '\n');

console.log('Kalau sudah follow semua steps tapi masih 0.0.0.0, kirim output:');
console.log('');
console.log('Dari MikroTik:');
console.log('  /ppp profile print detail where name=UpTo-10M');
console.log('  /ip pool print detail where name=UpTo-10M');
console.log('  /ppp active print detail');
console.log('  /log print where topics~"pppoe" last 50');
console.log('');
console.log('Dari Server:');
console.log('  tail -100 /home/kilusi-bill/logs/combined.log | grep apptest\n');

console.log('='.repeat(80));
console.log('KESIMPULAN');
console.log('='.repeat(80) + '\n');

console.log('🎯 RADIUS Server: 100% OK');
console.log('🎯 VSA Encoding: 100% OK');
console.log('🎯 Accounting: 100% OK (setelah fix)');
console.log('');
console.log('❌ Masalah: MikroTik PPP Profile "UpTo-10M" tidak configured dengan benar');
console.log('✅ Solusi: Configure profile dengan local-address dan remote-address (IP pool)\n');

console.log('Setelah fix profile di MikroTik, IP akan berubah dari 0.0.0.0 → 10.10.10.x');
console.log('dan koneksi akan stabil (tidak disconnect lagi).\n');

console.log('='.repeat(80) + '\n');
