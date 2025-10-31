# Kilusi-Bill RADIUS Server Implementation Guide

## 🎯 Overview

Aplikasi Kilusi-Bill telah ditingkatkan dengan fitur RADIUS Server built-in yang memungkinkan autentikasi pelanggan tanpa bergantung pada Mikrotik API. RADIUS Server terintegrasi langsung dengan database pelanggan existing dan berjalan otomatis saat aplikasi dimulai.

## 📋 Apa yang Sudah Dibuat

### 1. File-file Baru

#### Config Files (di folder `config/`)
- **`radius-database.js`** - Manajemen database SQLite untuk RADIUS
  - Fungsi: Create tables, CRUD operations, accounting
  - Tabel: radcheck, radreply, radacct, radgroupcheck, radgroupreply, radusergroup
  
- **`radius-server.js`** - Implementasi RADIUS Server
  - Fungsi: Authentication & Accounting server
  - Support: Access-Request, Accounting-Request
  - Port: 1812 (auth) dan 1813 (acct)
  
- **`radius-sync.js`** - Sinkronisasi customer ke RADIUS
  - Fungsi: Sync all/single customer, auto-sync, status monitoring
  - Features: Speed limit, static IP, session timeout

#### Routes (di folder `routes/`)
- **`adminRadius.js`** - REST API untuk manajemen RADIUS
  - Endpoints: status, start, stop, restart, sync, users, sessions

#### Views (di folder `views/`)
- **`admin-radius.html`** - Web interface untuk manajemen RADIUS
  - Features: Dashboard, monitoring, control, statistics

#### Scripts (di folder `scripts/`)
- **`migrate-customer-radius.js`** - Migration script untuk customer data
  - Fungsi: Menambahkan field username, password, radius flags

#### Documentation
- **`README-RADIUS.md`** - Dokumentasi lengkap fitur RADIUS
- **`INSTALL-RADIUS.md`** - Panduan instalasi
- **`IMPLEMENTATION-GUIDE.md`** - Panduan implementasi (file ini)

### 2. Modifikasi File Existing

#### `app.js`
- Import RADIUS modules
- Mount route `/admin/radius`
- Initialize RADIUS server on startup
- Auto-sync customer on startup
- Periodic sync (configurable)
- Graceful shutdown handler

#### `settings.json`
- Tambahan konfigurasi RADIUS:
  - `radius_server_enabled`
  - `radius_auth_port`
  - `radius_acct_port`
  - `radius_auto_sync_on_startup`
  - `radius_sync_interval_minutes`
  - `radius_nas_clients` (array)

## 🚀 Cara Menggunakan

### Step 1: Install Dependencies

```bash
cd d:\Project\kilusi-bill
npm install sqlite3 radius --save
```

### Step 2: Konfigurasi Settings

Edit `settings.json` dan pastikan ada konfigurasi RADIUS:

```json
{
  "radius_server_enabled": "true",
  "radius_auth_port": "1812",
  "radius_acct_port": "1813",
  "radius_auto_sync_on_startup": "true",
  "radius_sync_interval_minutes": "60",
  "radius_nas_clients": [
    {
      "ip": "192.168.8.1",
      "secret": "your_strong_secret_here",
      "name": "Mikrotik Main"
    }
  ]
}
```

**PENTING**: Ganti `secret` dengan string yang kuat dan random!

### Step 3: (Optional) Migrate Customer Data

Jika Anda sudah punya customer, jalankan migration:

```bash
node scripts/migrate-customer-radius.js
```

Script ini akan:
- Menambahkan field `username` ke setiap customer
- Generate `password` random untuk setiap customer
- Extract `package_speed` dari package name
- Set default `isolir_status` = 'active'

### Step 4: Jalankan Aplikasi

```bash
npm start
```

Atau dengan PM2:

```bash
pm2 start app.js --name kilusi-bill
pm2 logs kilusi-bill
```

### Step 5: Verifikasi RADIUS Server

Cek log aplikasi, pastikan ada:
```
✅ Database RADIUS terhubung
✅ Semua tabel RADIUS berhasil dibuat
🔐 RADIUS Authentication Server listening on port 1812
📊 RADIUS Accounting Server listening on port 1813
✅ RADIUS Server started successfully
🔄 Syncing customers to RADIUS...
✅ Customer sync completed: X synced, 0 errors
```

### Step 6: Akses Management Interface

Buka browser:
```
http://localhost:3001/admin/radius
```

Login dengan admin credentials dari settings.json.

## 🔧 Konfigurasi NAS (Network Access Server)

### Mikrotik RouterOS

1. Tambahkan RADIUS server:
```
/radius
add address=<IP_SERVER_KILUSI_BILL> secret=your_strong_secret_here service=ppp
```

2. Enable RADIUS untuk PPP:
```
/ppp aaa
set use-radius=yes
```

3. Test koneksi PPPoE:
```
/ppp secret print
# Hapus secret manual jika ada
/ppp secret remove [find name=testuser]

# User akan di-autentikasi via RADIUS
```

### Ubiquiti EdgeRouter

```
configure
set system login radius-server <IP_SERVER> secret your_strong_secret_here
set system login radius-server <IP_SERVER> port 1812
commit
save
```

## 📊 Fitur Dashboard

### Server Status
- Running/Stopped indicator
- Start/Stop/Restart controls
- NAS clients list

### Statistics
- Total requests
- Accepted requests
- Rejected requests
- Active sessions

### Sync Status
- Total customers
- Active customers
- RADIUS users
- Sync percentage
- Not synced list

### Active Sessions
- Username
- NAS IP
- Framed IP
- Start time
- Session duration
- Bandwidth usage (input/output)

## 🔌 API Usage

### Get Server Status
```javascript
fetch('/admin/radius/status')
  .then(res => res.json())
  .then(data => console.log(data));
```

### Start RADIUS Server
```javascript
fetch('/admin/radius/start', { method: 'POST' })
  .then(res => res.json())
  .then(data => console.log(data));
```

### Sync All Customers
```javascript
fetch('/admin/radius/sync', { method: 'POST' })
  .then(res => res.json())
  .then(data => {
    console.log(`Synced: ${data.result.synced}`);
    console.log(`Errors: ${data.result.errors}`);
  });
```

### Get Active Sessions
```javascript
fetch('/admin/radius/sessions')
  .then(res => res.json())
  .then(data => {
    console.log(`Active sessions: ${data.sessions.length}`);
    data.sessions.forEach(s => {
      console.log(`${s.username} - ${s.framedipaddress}`);
    });
  });
```

## 🗃️ Database Structure

### radcheck Table
Menyimpan username dan password untuk autentikasi:
```
username | attribute           | op | value
---------|--------------------|----|--------
customer1| Cleartext-Password | == | pass123
```

### radreply Table
Menyimpan attributes yang dikembalikan saat autentikasi sukses:
```
username  | attribute          | op | value
----------|-------------------|----|------------------
customer1 | Mikrotik-Rate-Limit| =  | 10000000/10000000
customer1 | Framed-IP-Address | =  | 192.168.100.10
```

### radacct Table
Menyimpan accounting data (session tracking):
```
username | nasipaddress | framedipaddress | acctstarttime | acctsessiontime | acctinputoctets | acctoutputoctets
---------|--------------|-----------------|---------------|-----------------|-----------------|------------------
customer1| 192.168.8.1  | 10.10.10.5      | 2025-10-24... | 3600           | 1048576        | 2097152
```

## 🔐 Security Best Practices

1. **RADIUS Secret**
   - Gunakan secret yang panjang dan random (min 16 karakter)
   - Berbeda untuk setiap NAS jika memungkinkan
   - Jangan gunakan secret default "testing123" di production!

2. **Firewall Rules**
   ```bash
   # Hanya allow NAS yang authorized
   New-NetFirewallRule -DisplayName "RADIUS Auth" -Direction Inbound -Protocol UDP -LocalPort 1812 -RemoteAddress 192.168.8.1 -Action Allow
   New-NetFirewallRule -DisplayName "RADIUS Acct" -Direction Inbound -Protocol UDP -LocalPort 1813 -RemoteAddress 192.168.8.1 -Action Allow
   ```

3. **Password Policy**
   - Enforce strong password untuk customer
   - Rotate password secara berkala
   - Hash password di database (future enhancement)

4. **Database Backup**
   ```bash
   # Backup RADIUS database
   copy logs\radius.db backups\radius.db.backup
   ```

5. **Monitoring**
   - Monitor rejected authentication attempts
   - Alert pada anomali (banyak login failure)
   - Review active sessions secara berkala

## 🐛 Troubleshooting

### Problem: RADIUS Server tidak start

**Solusi:**
1. Cek port availability:
   ```powershell
   netstat -an | findstr :1812
   netstat -an | findstr :1813
   ```
2. Stop aplikasi yang menggunakan port tersebut
3. Atau ubah port di settings.json

### Problem: Customer tidak bisa login

**Solusi:**
1. Cek apakah customer ada di RADIUS:
   ```
   GET /admin/radius/users
   ```
2. Cek password customer (case sensitive)
3. Cek NAS client configuration (IP & secret harus match)
4. Lihat log rejection di RADIUS server

### Problem: Session tidak tercatat

**Solusi:**
1. Pastikan accounting server running (port 1813)
2. Verifikasi NAS mengirim Accounting packets
3. Cek log accounting di aplikasi

### Problem: Speed limit tidak apply

**Solusi:**
1. Cek `package_speed` format di customer data (harus: "10 Mbps")
2. Verify `Mikrotik-Rate-Limit` attribute di radreply table
3. Test dengan manual radreply attribute

## 📈 Monitoring & Maintenance

### Daily Tasks
- Review rejected authentication attempts
- Check active sessions count
- Monitor bandwidth usage trends

### Weekly Tasks
- Backup RADIUS database
- Review and cleanup old accounting records
- Check sync status (ensure 100% sync)

### Monthly Tasks
- Rotate NAS secrets (optional)
- Review and update customer passwords
- Audit RADIUS logs for anomalies

### Database Cleanup
```sql
-- Delete old accounting records (older than 90 days)
DELETE FROM radacct WHERE acctstarttime < datetime('now', '-90 days');

-- Vacuum database to reclaim space
VACUUM;
```

## 🎓 Customer Data Format

Untuk customer bisa menggunakan RADIUS, data harus berisi:

```json
{
  "name": "John Doe",
  "phone": "628123456789",
  "username": "john_doe",
  "password": "securepass123",
  "package_name": "Paket 10 Mbps",
  "package_speed": "10 Mbps",
  "package_price": 150000,
  "static_ip": "192.168.100.10",
  "session_timeout": 3600,
  "isolir_status": "active",
  "enable_isolir": true,
  "radius_synced": true,
  "radius_synced_at": "2025-10-24T10:00:00.000Z"
}
```

## 🔄 Integration with Billing System

RADIUS Server terintegrasi dengan billing system:

1. **Auto Isolir**
   - Customer yang di-isolir otomatis dihapus dari RADIUS
   - Customer yang bayar otomatis di-sync kembali ke RADIUS

2. **Package Change**
   - Perubahan paket otomatis update speed limit di RADIUS
   - Perubahan IP statis otomatis update di RADIUS

3. **Customer Status**
   - Status aktif/non-aktif sinkron dengan RADIUS
   - Suspended customer tidak bisa login

## 📞 Support

Jika ada masalah atau pertanyaan:
1. Cek log aplikasi: `pm2 logs kilusi-bill`
2. Cek database: `logs/radius.db`
3. Review documentation: `README-RADIUS.md`

## 🎉 Summary

Implementasi RADIUS Server di Kilusi-Bill memberikan:
- ✅ Autentikasi PPPoE tanpa Mikrotik API
- ✅ Centralized user management
- ✅ Accounting & session tracking
- ✅ Speed limit enforcement
- ✅ Static IP assignment
- ✅ Web-based management
- ✅ Auto-sync dengan billing system
- ✅ Real-time monitoring

Selamat menggunakan fitur RADIUS Server! 🚀
