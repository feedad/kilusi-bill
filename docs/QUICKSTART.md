# 🚀 QUICK START - RADIUS SERVER

## Langkah Cepat (5 Menit)

### 1️⃣ Install Dependencies (1 menit)

```bash
cd d:\Project\kilusi-bill
npm install sqlite3 radius --save
```

### 2️⃣ Konfigurasi (1 menit)

Edit `settings.json`, pastikan ada:

```json
{
  "radius_server_enabled": "true",
  "radius_auth_port": "1812",
  "radius_acct_port": "1813",
  "radius_nas_clients": [
    {
      "ip": "192.168.8.1",
      "secret": "ganti_dengan_secret_kuat",
      "name": "Mikrotik Main"
    }
  ]
}
```

**⚠️ PENTING**: Ganti `secret` dengan string random yang kuat!

### 3️⃣ Migrate Customer (1 menit - Optional)

Jika sudah ada customer, jalankan:

```bash
node scripts/migrate-customer-radius.js
```

### 4️⃣ Start Aplikasi (1 menit)

```bash
npm start
```

atau

```bash
pm2 start app.js --name kilusi-bill
pm2 logs kilusi-bill
```

### 5️⃣ Verifikasi (1 menit)

Cek log, pastikan ada:
```
✅ Database RADIUS terhubung
🔐 RADIUS Authentication Server listening on port 1812
📊 RADIUS Accounting Server listening on port 1813
✅ RADIUS Server started successfully
```

Buka browser:
```
http://localhost:3001/admin/radius
```

---

## 🔧 Setup Mikrotik (2 Menit)

### Via Terminal:

```
/radius
add address=<IP_SERVER> secret=ganti_dengan_secret_kuat service=ppp

/ppp aaa
set use-radius=yes
```

### Via Winbox:

1. **RADIUS** → Add New
   - Address: IP server Kilusi-Bill
   - Secret: (sama dengan di settings.json)
   - Service: ppp

2. **PPP** → AAA
   - ✅ Use RADIUS: Yes

---

## ✅ Test Koneksi

### Create Test User:

Di management interface, klik **Sync Customers**.

Atau manual via API:
```bash
curl -X POST http://localhost:3001/admin/radius/sync
```

### Test PPPoE:

1. Buat koneksi PPPoE di client
2. Username: (sesuai customer)
3. Password: (sesuai customer)
4. Connect

### Verifikasi:

1. Buka: http://localhost:3001/admin/radius
2. Lihat **Active Sessions**
3. User harus muncul di list

---

## 📊 Status Dashboard

Akses: http://localhost:3001/admin/radius

Fitur:
- ✅ Server Status (Running/Stopped)
- 📊 Statistics (Total/Accepted/Rejected)
- 👥 Active Sessions
- 🔄 Sync Status
- 🎛️ Server Controls

---

## 🆘 Troubleshooting

### Server Tidak Start?

```bash
# Cek port sudah dipakai apa belum
netstat -an | findstr :1812
netstat -an | findstr :1813

# Jika ada yang pakai, stop aplikasi tersebut atau ganti port
```

### Customer Tidak Bisa Login?

1. Cek apakah customer sudah di-sync:
   - Buka http://localhost:3001/admin/radius
   - Lihat **Sync Status**
   - Klik **Sync Customers** jika belum

2. Cek username & password customer:
   ```bash
   # Lihat di logs/customers.json
   ```

3. Cek NAS client configuration:
   - IP harus match dengan setting di Mikrotik
   - Secret harus sama persis

### Session Tidak Tercatat?

1. Pastikan accounting port 1813 terbuka
2. Cek konfigurasi RADIUS di Mikrotik
3. Lihat log aplikasi

---

## 📁 File Locations

- **Database**: `logs/radius.db`
- **Customer Data**: `logs/customers.json`
- **Settings**: `settings.json`
- **Logs**: `pm2 logs kilusi-bill`

---

## 🔐 Security Tips

1. **Ganti RADIUS Secret**
   - Jangan pakai "testing123"
   - Min 16 karakter
   - Kombinasi huruf, angka, simbol

2. **Firewall Rules**
   ```powershell
   # Windows - Allow hanya dari Mikrotik
   New-NetFirewallRule -DisplayName "RADIUS" -Direction Inbound -Protocol UDP -LocalPort 1812,1813 -RemoteAddress 192.168.8.1 -Action Allow
   ```

3. **Backup Database**
   ```bash
   copy logs\radius.db backups\radius-backup-%date%.db
   ```

---

## 📞 Need Help?

1. **Documentation**:
   - `README-RADIUS.md` - Full documentation
   - `IMPLEMENTATION-GUIDE.md` - Detailed guide
   - `CHECKLIST.md` - Complete checklist

2. **Logs**:
   ```bash
   pm2 logs kilusi-bill --lines 100
   ```

3. **Status**:
   ```
   http://localhost:3001/admin/radius
   ```

---

## ✨ Features

- ✅ PPPoE Authentication
- ✅ Session Tracking
- ✅ Bandwidth Limiting
- ✅ Static IP Assignment
- ✅ Auto-Sync Customers
- ✅ Web Management
- ✅ Real-time Monitoring
- ✅ API Access

---

## 🎯 Next Steps

After basic setup:
1. Configure customer packages
2. Set bandwidth limits
3. Assign static IPs (if needed)
4. Monitor active sessions
5. Review accounting data

---

**Setup Time**: ~5-10 minutes
**Status**: ✅ READY TO USE
**Support**: Check documentation files

Selamat menggunakan RADIUS Server! 🚀
