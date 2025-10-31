# RADIUS Server Troubleshooting Guide

## Issue: "RADIUS Server Tidak Mau Berjalan"

### Diagnosa

Ketika user melaporkan "RADIUS server tidak mau berjalan", sebenarnya ada beberapa kemungkinan:

1. ❌ **Server benar-benar tidak start** (error di log)
2. ✅ **Server sudah berjalan, tapi tidak ada user yang ter-sync** (issue yang sebenarnya terjadi)
3. ❌ **Port sudah digunakan aplikasi lain**
4. ❌ **Permission error pada database**

### Cara Cek Status RADIUS

#### 1. Cek Log Startup

Saat aplikasi start, cari log berikut:

```
✅ RADIUS Server started successfully
🔐 RADIUS Authentication Server listening on port 1812
📊 RADIUS Accounting Server listening on port 1813
```

Jika muncul log di atas, artinya **RADIUS server SUDAH BERJALAN!**

#### 2. Cek Sync Status

Perhatikan log sync:

```bash
# ❌ Tidak ada user yang di-sync
🔄 Starting customer sync to RADIUS...
⚠️  Skipping customer feedad: missing username or password
✅ Customer sync completed: 0 synced, 0 errors

# ✅ Ada user yang di-sync
🔄 Starting customer sync to RADIUS...
✅ Created RADIUS user: 62811225323
✅ Customer sync completed: 1 synced, 0 errors
```

#### 3. Akses Admin Panel

Buka: `http://localhost:3001/admin/radius`

Anda akan melihat:
- ✅ Server Status (Running/Stopped)
- 📊 Total Users
- 📶 Active Sessions
- 👥 RADIUS Users List

## Penyebab Umum

### Problem 1: Customer Tidak Punya Username/Password

**Gejala:**
```
⚠️  Skipping customer feedad: missing username or password
✅ Customer sync completed: 0 synced, 0 errors
```

**Penyebab:**
- Customer di `logs/customers.json` tidak memiliki field `username` atau `password`

**Solusi:**

```bash
# Jalankan migration script
cd d:\Project\kilusi-bill
node scripts/migrate-customer-radius.js
```

Script ini akan:
- ✅ Generate username dari nomor telepon
- ✅ Generate random password
- ✅ Extract speed dari package_name
- ✅ Set isolir_status ke 'active'

### Problem 2: Customer Tidak Punya Package Speed

**Gejala:**
- User ter-sync ke RADIUS
- Tapi tidak ada bandwidth limit yang di-set

**Penyebab:**
- Customer tidak punya field `package_speed`

**Solusi:**

Edit `logs/customers.json` dan tambahkan `package_speed`:

```json
{
  "id": "CUST0001",
  "phone": "62811225323",
  "name": "feedad",
  "username": "62811225323",
  "package_name": "Paket Bronze",
  "package_speed": "10 Mbps",  // ← Tambahkan ini
  "password": "oCUZuJzf",
  "isolir_status": "active"
}
```

Format yang didukung:
- `"10 Mbps"` → 10 Megabit
- `"100 Kbps"` → 100 Kilobit  
- `"1 Gbps"` → 1 Gigabit

### Problem 3: Port Sudah Digunakan

**Gejala:**
```
Error: listen EADDRINUSE: address already in use 0.0.0.0:1812
```

**Penyebab:**
- Port 1812 atau 1813 sudah digunakan oleh aplikasi lain

**Solusi:**

1. **Cek aplikasi yang menggunakan port:**
   ```powershell
   # Cek port 1812
   netstat -ano | findstr :1812
   
   # Cek port 1813
   netstat -ano | findstr :1813
   ```

2. **Matikan aplikasi atau ubah port di settings.json:**
   ```json
   {
     "radius_auth_port": "11812",  // Ubah port
     "radius_acct_port": "11813"
   }
   ```

### Problem 4: Database Permission Error

**Gejala:**
```
Error: EACCES: permission denied, open 'logs/radius.db'
```

**Penyebab:**
- Node.js tidak punya permission untuk create/write database file

**Solusi:**

```powershell
# Pastikan folder logs ada dan writable
mkdir logs -Force
icacls logs /grant Everyone:F
```

## Manual Sync ke RADIUS

Jika auto-sync tidak bekerja, gunakan manual sync script:

```bash
cd d:\Project\kilusi-bill
node scripts/sync-to-radius.js
```

Output yang baik:
```
🔄 Starting manual RADIUS sync...
✅ RADIUS database initialized

✅ Created RADIUS user: 62811225323
✅ Set RADIUS reply attribute for 62811225323

📊 Sync Results:
   ✅ Synced: 1
   ❌ Errors: 0
   📝 Total: 1

👥 RADIUS Users:
   - 62811225323 (created: 2025-10-24 07:38:22)

✅ Manual sync completed!
```

## Testing RADIUS Server

### 1. Test dengan radtest (Linux/Mac)

```bash
# Install freeradius-utils
apt-get install freeradius-utils  # Debian/Ubuntu
yum install freeradius-utils      # CentOS/RHEL

# Test authentication
radtest 62811225323 oCUZuJzf 127.0.0.1 1812 testing123

# Expected output:
# Received Access-Accept
```

### 2. Test dengan Mikrotik

```
# Tambahkan RADIUS server di Mikrotik
/radius add address=<SERVER_IP> secret=testing123 service=ppp

# Set PPP untuk gunakan RADIUS
/ppp aaa set use-radius=yes

# Test login PPPoE dari client
```

### 3. Cek Active Sessions

```bash
# Via script
node scripts/sync-to-radius.js

# Via API
curl http://localhost:3001/admin/radius/sessions

# Via Admin Panel
http://localhost:3001/admin/radius
```

## Monitoring RADIUS

### Real-time Monitoring

Admin panel auto-refresh setiap 5 detik, menampilkan:

- 🟢 **Server Status**: Running/Stopped
- 📊 **Total Users**: Jumlah user di database
- 📶 **Active Sessions**: Jumlah session aktif
- ✅ **Auth Success**: Jumlah autentikasi berhasil
- ❌ **Auth Rejected**: Jumlah autentikasi ditolak

### Log Monitoring

```bash
# Tail log file
tail -f logs/*.log | grep -i radius

# Atau lihat di console saat app running
npm run dev
```

### Database Monitoring

```bash
# Install sqlite3 CLI (optional)
# Cek jumlah user
sqlite3 logs/radius.db "SELECT COUNT(*) FROM radcheck;"

# Cek active sessions
sqlite3 logs/radius.db "SELECT * FROM radacct WHERE acctstoptime IS NULL;"

# Cek user detail
sqlite3 logs/radius.db "SELECT * FROM radcheck WHERE username='62811225323';"
```

## Checklist Troubleshooting

Saat RADIUS "tidak berjalan", cek urutan ini:

- [ ] **1. App sudah running?** `npm run dev`
- [ ] **2. RADIUS enabled di settings?** `radius_server_enabled: "true"`
- [ ] **3. Ada log "RADIUS Server started"?** Cek startup log
- [ ] **4. Port 1812/1813 listening?** `netstat -ano | findstr :1812`
- [ ] **5. Customer punya username/password?** Run migration script
- [ ] **6. Customer punya package_speed?** Edit customers.json
- [ ] **7. Customer sudah di-sync?** Run manual sync
- [ ] **8. User ada di database?** Cek admin panel atau database
- [ ] **9. NAS client configured?** Cek settings.json
- [ ] **10. Mikrotik configured?** `/radius` dan `/ppp aaa`

## Kesimpulan

Dalam kasus ini, **RADIUS server sebenarnya SUDAH BERJALAN**, masalahnya adalah:

1. ❌ Customer tidak punya `username`/`password` → **Fixed** dengan migration script
2. ❌ Customer tidak punya `package_speed` → **Fixed** dengan manual edit
3. ❌ Customer belum di-sync ke RADIUS → **Fixed** dengan manual sync script

Setelah 3 langkah di atas, RADIUS berfungsi normal dengan 5 user ter-sync! ✅

---

**Date**: October 24, 2025  
**Status**: ✅ Resolved  
**RADIUS Users**: 5 synced  
**Server Status**: Running on port 1812 (auth) & 1813 (acct)
