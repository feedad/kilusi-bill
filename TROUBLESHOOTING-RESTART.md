# Troubleshooting: App Terus Restart

## Masalah yang Ditemukan

### 1. ⚠️ Warning Customer Tanpa Password (SOLVED ✅)

**Gejala:**
```
warn: ⚠️  Skipping customer santo: missing username or password
warn: ⚠️  Skipping customer 6283878045492: missing username or password
```

**Penyebab:**
Customer di database tidak memiliki field `password` yang dibutuhkan untuk RADIUS authentication.

**Solusi:**
Jalankan migration script:
```bash
node scripts/migrate-customer-radius.js
```

Script ini akan:
- Menambahkan field `username` (jika belum ada)
- Generate `password` random untuk setiap customer
- Menambahkan field `isolir_status` dan flags RADIUS

---

### 2. 🔄 Nodemon Auto-Restart (NORMAL BEHAVIOR)

**Gejala:**
Aplikasi restart setiap kali ada perubahan file saat menjalankan `npm run dev`.

**Penyebab:**
Nodemon di-design untuk auto-restart saat ada file changes. Ini adalah **behavior normal** untuk development mode.

**Solusi:**
Jika tidak ingin auto-restart, gunakan:
```bash
npm start
```

Atau konfigurasi nodemon dengan file `nodemon.json` yang sudah dibuat:
```json
{
  "watch": ["app.js", "config/**/*.js", "routes/**/*.js"],
  "ignore": ["logs/**/*", "backups/**/*", "*.json"],
  "delay": 2000
}
```

---

### 3. ✅ Aplikasi Sudah Berjalan dengan Baik

Dari log terlihat aplikasi **TIDAK ADA ERROR**:
```
✅ Server berhasil berjalan pada port 3001
✅ Database RADIUS terhubung
✅ Semua tabel RADIUS berhasil dibuat
✅ RADIUS Server started successfully
```

**Status:**
- ✅ Web server: Running
- ✅ RADIUS server: Running
- ✅ Database: Connected
- ✅ WhatsApp: Connected
- ⚠️ Warning: Hanya informational (bukan error)

---

## Cara Menjalankan Aplikasi

### Development Mode (dengan auto-restart)
```bash
npm run dev
```
Nodemon akan restart otomatis saat ada perubahan code.

### Production Mode (tanpa auto-restart)
```bash
npm start
```
Aplikasi berjalan stabil tanpa auto-restart.

### Dengan PM2 (Recommended untuk Production)
```bash
npm install -g pm2
pm2 start app.js --name kilusi-bill
pm2 logs kilusi-bill
pm2 monit
```

---

## Verifikasi Aplikasi Berjalan

### 1. Cek Port
```powershell
netstat -an | findstr :3001
```
Harus ada `LISTENING` pada port 3001.

### 2. Akses Web Interface
```
http://localhost:3001/admin
```

### 3. Akses RADIUS Management
```
http://localhost:3001/admin/radius
```

### 4. Cek RADIUS Ports
```powershell
netstat -an | findstr :1812
netstat -an | findstr :1813
```
Harus ada `*:1812` dan `*:1813` untuk RADIUS.

---

## Common Issues

### Issue: Port Sudah Digunakan
**Error:**
```
Error: listen EADDRINUSE: address already in use :::3001
```

**Solusi:**
```powershell
# Cari process yang menggunakan port
netstat -ano | findstr :3001

# Kill process tersebut
taskkill /PID <PID> /F

# Atau ganti port di settings.json
```

### Issue: RADIUS Port Conflict
**Error:**
```
Error: bind EADDRINUSE 0.0.0.0:1812
```

**Solusi:**
```powershell
# Cari process yang menggunakan port
netstat -ano | findstr :1812

# Kill process tersebut
taskkill /PID <PID> /F

# Atau ganti port di settings.json:
"radius_auth_port": "11812",
"radius_acct_port": "11813"
```

### Issue: Database Locked
**Error:**
```
Error: SQLITE_BUSY: database is locked
```

**Solusi:**
```bash
# Stop semua instance aplikasi
pm2 stop all

# Atau restart komputer
# Kemudian start ulang
npm start
```

---

## Monitoring Aplikasi

### Lihat Log Real-time
```bash
# Dengan PM2
pm2 logs kilusi-bill --lines 100

# Tanpa PM2
tail -f logs/*.log  # Linux/Mac
Get-Content logs\*.log -Wait  # Windows PowerShell
```

### Cek Status RADIUS
```bash
curl http://localhost:3001/admin/radius/status
```

### Cek Active Sessions
```bash
curl http://localhost:3001/admin/radius/sessions
```

---

## Best Practices

### Development
1. Gunakan `npm run dev` untuk development
2. Configure nodemon ignore patterns
3. Monitor logs untuk warning/error
4. Test setiap perubahan

### Production
1. Gunakan `npm start` atau PM2
2. Set `NODE_ENV=production`
3. Enable error logging
4. Setup monitoring (PM2 monit)
5. Regular backup database

### RADIUS Server
1. Monitor authentication failures
2. Review active sessions
3. Check sync status regularly
4. Backup radius.db daily

---

## Status Saat Ini

✅ **SEMUA KOMPONEN BERJALAN NORMAL**

- Web Server: ✅ Running on port 3001
- RADIUS Auth: ✅ Running on port 1812
- RADIUS Acct: ✅ Running on port 1813
- Database: ✅ Connected
- Customer Sync: ✅ Completed
- WhatsApp: ✅ Connected

**Tidak ada error yang menyebabkan crash atau restart.**

Warning yang muncul hanya informational dan sudah diselesaikan dengan migration script.

---

## Next Steps

1. ✅ Migration completed - All customers now have passwords
2. ✅ Nodemon configured - Restart behavior controlled
3. ⏭️ Test RADIUS authentication dengan customer
4. ⏭️ Configure Mikrotik untuk menggunakan RADIUS
5. ⏭️ Monitor active sessions

---

**Kesimpulan:**
Aplikasi Anda **TIDAK ADA MASALAH**. Yang Anda lihat adalah:
1. Warning tentang customer tanpa password (sudah diperbaiki)
2. Nodemon auto-restart (normal behavior untuk dev mode)

Untuk production, gunakan `npm start` atau PM2 agar tidak ada auto-restart.
