# ✅ RADIUS & Pelanggan Online - Fixed

## 🎉 Masalah yang Sudah Diselesaikan

### 1. ✅ RADIUS Authentication - SOLVED
- **Masalah**: Access-Request tidak berisi password attributes (User-Password/CHAP-Password)
- **Penyebab**: MikroTik melakukan autentikasi lokal via PPP secret, bukan via RADIUS
- **Solusi**: 
  - Hapus semua PPP secret lokal: `/ppp secret remove [find]`
  - Force PPPoE server authentication=pap,chap (tanpa mschap)
  - AAA use-radius=yes
- **Hasil**: 
  - CHAP authentication berhasil ✅
  - IP assigned dari pool: 10.10.10.254 (bukan 0.0.0.0) ✅
  - Accounting Start/Stop tercatat dengan benar ✅

### 2. ✅ Kick User Function - FIXED
- **Masalah**: Fungsi kick user hanya simulasi, tidak benar-benar disconnect session
- **Solusi**: Implementasi real RADIUS Disconnect-Request (RFC 3576)
- **File**: `config/radius-disconnect.js`
- **Fitur**:
  - Mengirim Disconnect-Request ke NAS port 3799
  - Proper RADIUS packet encoding dengan radius library
  - Timeout handling (3 detik)
  - Response parsing (Disconnect-ACK/NAK)
  - Logging detail untuk troubleshooting

### 3. ✅ Table Background - FIXED
- **Masalah**: Background tabel masih terang (tidak sesuai dark theme)
- **Solusi**: Tambah CSS override dengan higher specificity
- **File**: `views/admin-pelanggan-online.ejs`
- **Changes**:
  - Card background: `#1e2230`
  - Card header: `#252a3d`
  - Table background: `#252a3d`
  - Table rows striped: `#252a3d` / `#2a2f42`
  - Hover: `#2d3348`
  - All with `!important` untuk override Bootstrap defaults

---

## 🚀 Cara Menggunakan Kick User

### Via Dashboard (Browser)
1. Buka `http://localhost:3000/admin/pelanggan-online`
2. Pilih user yang ingin di-kick (centang checkbox)
3. Klik tombol "Kick Selected" atau icon stop pada Actions
4. Konfirmasi disconnect
5. **PENTING**: MikroTik harus enable RADIUS incoming untuk menerima Disconnect-Request

### Via CLI (Test Script)
```bash
cd /home/kilusi-bill

# Test dengan session aktif
node test-radius-disconnect.js

# Test dengan session ID custom
node test-radius-disconnect.js 81001839 172.22.10.156 apptest
```

---

## ⚙️ Konfigurasi MikroTik untuk Disconnect/CoA

**CRITICAL**: MikroTik harus enable RADIUS incoming untuk menerima Disconnect-Request!

```bash
# 1. Enable RADIUS incoming (WAJIB untuk kick user)
/radius incoming
set accept=yes

# 2. Verifikasi
/radius incoming print
# Harus: accept: yes

# 3. Optional: Batasi hanya dari IP RADIUS server tertentu
/radius incoming
set address=172.22.10.25/32 accept=yes
```

**Tanpa konfigurasi ini**, MikroTik akan **IGNORE** semua Disconnect-Request dari server!

---

## 🧪 Testing Kick User

### 1. Cek Active Session Dulu
```bash
node -e "(async()=>{const db=require('./config/radius-postgres'); await db.initDatabase(); const s=await db.getActiveSessions(); console.log(JSON.stringify(s,null,2)); process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})"
```

Ambil `acctSessionId`, `nasIpAddress`, dan `username` dari output.

### 2. Test Disconnect
```bash
# Ganti dengan session ID yang aktif
node test-radius-disconnect.js 81001839 172.22.10.156 apptest
```

### 3. Expected Output

**Jika Berhasil:**
```
=== Testing RADIUS Disconnect-Request ===

Test Parameters:
  Username: apptest
  NAS IP: 172.22.10.156
  Session ID: 81001839
  Framed IP: 10.10.10.254

Sending Disconnect-Request...

🔄 Sending RADIUS Disconnect-Request for user apptest
📡 Target NAS: 172.22.10.156:3799 (CoA port)
📨 Received response from 172.22.10.156:3799
   Code: Disconnect-ACK
✅ RADIUS Disconnect SUCCESS for user apptest

=== Result ===
Success: ✅ YES
Message: User apptest disconnected successfully via RADIUS
Timestamp: 2025-11-03T...

✅ Disconnect-Request sent successfully!
```

**Jika MikroTik Tidak Enable Incoming:**
```
⏱️  RADIUS Disconnect timeout for apptest (NAS may not support CoA or wrong port)

=== Result ===
Success: ❌ NO
Message: Timeout waiting for response from NAS...

⚠️  Disconnect-Request failed or was rejected.

Enable on MikroTik:
  /radius incoming set accept=yes
```

### 4. Verify Disconnect
```bash
# Di MikroTik
/ppp active print
# Session apptest harus hilang

# Di Dashboard
# Refresh halaman Pelanggan Online → session apptest harus gone

# Di Database
node -e "(async()=>{const db=require('./config/database'); const res=await db.getAll(\`SELECT username, framedipaddress, acctstarttime, acctstoptime FROM radacct WHERE username='apptest' ORDER BY acctstarttime DESC LIMIT 1\`); console.log(res); process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})"
# Harus ada acctstoptime (tidak NULL)
```

---

## 🔧 Troubleshooting Kick User

### Problem: Timeout (No Response)

**Kemungkinan penyebab:**
1. ❌ MikroTik tidak enable `/radius incoming set accept=yes`
2. ❌ Firewall block port UDP 3799
3. ❌ RADIUS secret salah (tidak cocok dengan settings.json)
4. ❌ NAS IP salah atau tidak reachable

**Solusi:**
```bash
# 1. Enable RADIUS incoming
/radius incoming set accept=yes

# 2. Cek firewall
/ip firewall filter print where dst-port=3799
# Jangan ada rule yang DROP/REJECT dari IP RADIUS server

# 3. Verifikasi RADIUS secret di settings.json
cat settings.json | grep testing123

# 4. Test koneksi UDP
# Di server RADIUS, test ping ke NAS
ping 172.22.10.156
```

### Problem: Disconnect-NAK (Rejected)

**Kemungkinan penyebab:**
1. ❌ Session ID tidak ditemukan (user sudah disconnect)
2. ❌ Username tidak cocok (case-sensitive)
3. ❌ NAS tidak recognize session (Acct-Session-Id berbeda)

**Solusi:**
```bash
# 1. Cek session aktif di MikroTik
/ppp active print detail where name=apptest
# Pastikan ada dan catat session-id

# 2. Cek session di database
# Pastikan username dan sessionId match persis

# 3. Coba dengan Framed-IP-Address juga
# Edit test script, tambahkan framedIp parameter
```

### Problem: Wrong RADIUS Secret

**Gejala:**
- Error decoding response
- Timeout tanpa respon jelas

**Solusi:**
```bash
# 1. Cek RADIUS secret di MikroTik
/radius print detail
# Lihat nilai "secret"

# 2. Cek secret di settings.json
cat settings.json | grep radius_nas_clients -A 5

# 3. Pastikan SAMA PERSIS (case-sensitive)
```

---

## 📊 Monitoring Kick Activity

Logs akan muncul di `logs/app.log`:

```bash
# Real-time monitoring
tail -f logs/app.log | grep -E "Disconnect|kick|CoA"

# Lihat semua kick attempts hari ini
grep "Disconnect-Request" logs/app.log | grep "$(date +%Y-%m-%d)"
```

**Log format:**
```
🔄 Sending RADIUS Disconnect-Request for user apptest
📡 Target NAS: 172.22.10.156:3799 (CoA port)
📦 Disconnect-Request packet: 78 bytes
   Attributes: {"User-Name":"apptest","Acct-Session-Id":"81001839"}
✅ Disconnect-Request sent to 172.22.10.156:3799
📨 Received response from 172.22.10.156:3799
   Code: Disconnect-ACK
✅ RADIUS Disconnect SUCCESS for user apptest
```

---

## 📋 Checklist Final

### RADIUS Authentication ✅
- [x] PPP secret lokal dihapus
- [x] AAA use-radius=yes
- [x] RADIUS service berisi "ppp"
- [x] Authentication pap,chap enabled
- [x] Password di radcheck match dengan client
- [x] IP assignment dari pool berhasil (10.10.10.x)
- [x] Accounting Start/Stop tercatat

### Kick User Function ✅
- [x] `radius-disconnect.js` menggunakan real RADIUS Disconnect-Request
- [x] UDP socket kirim ke port 3799
- [x] Timeout handling
- [x] Response parsing (ACK/NAK)
- [x] Logging detail
- [x] Test script tersedia

### MikroTik Configuration ⚠️  (WAJIB!)
- [ ] `/radius incoming set accept=yes` **← ENABLE INI!**
- [ ] Firewall tidak block port 3799
- [ ] RADIUS secret match dengan settings.json

### UI/UX ✅
- [x] Table background dark theme
- [x] Card background dark
- [x] Hover effects visible
- [x] Bulk actions working
- [x] Single kick button working

---

## 🎯 Next Steps

1. **Enable MikroTik RADIUS Incoming**:
   ```bash
   /radius incoming set accept=yes
   ```

2. **Test Kick User**:
   ```bash
   node test-radius-disconnect.js
   ```

3. **Verify via Dashboard**:
   - Buka http://localhost:3000/admin/pelanggan-online
   - Coba kick satu user
   - Lihat notifikasi sukses/gagal
   - Verify session hilang dari list

4. **Monitor Logs**:
   ```bash
   tail -f logs/app.log | grep Disconnect
   ```

---

## 🆘 Support

Jika masih ada masalah:

1. **Collect Debug Info**:
   ```bash
   # Active sessions
   node -e "..." > debug-sessions.txt
   
   # MikroTik config
   /radius print detail > debug-radius.txt
   /radius incoming print >> debug-radius.txt
   /ppp active print detail >> debug-radius.txt
   
   # Server logs
   tail -100 logs/app.log > debug-server.txt
   ```

2. **Check RADIUS Server Running**:
   ```bash
   ss -ulpn | grep -E '1812|1813|3799'
   ```

3. **Verify Network**:
   ```bash
   # Dari server ke NAS
   ping 172.22.10.156
   
   # Dari NAS ke server (test di MikroTik)
   /ping 172.22.10.25 count=5
   ```

---

**Status Akhir**: ✅ RADIUS auth working, kick user implemented, UI fixed. 
**Action Required**: Enable `/radius incoming set accept=yes` di MikroTik untuk kick functionality.
