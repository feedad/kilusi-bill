# Kilusi-Bill dengan RADIUS Server

## Fitur Tambahan RADIUS Server

Aplikasi ini telah ditingkatkan dengan fitur RADIUS Server built-in untuk autentikasi pelanggan tanpa perlu Mikrotik API.

### Fitur RADIUS Server:

1. **RADIUS Authentication Server** (Port 1812)
   - Autentikasi pelanggan menggunakan username/password
   - Support untuk berbagai NAS (Network Access Server)
   - Integrasi langsung dengan database pelanggan

2. **RADIUS Accounting Server** (Port 1813)
   - Tracking session pelanggan
   - Monitoring bandwidth usage
   - Logging start/stop connections

3. **Database SQLite untuk RADIUS**
   - Tabel radcheck - untuk autentikasi
   - Tabel radreply - untuk attribut balasan (speed limit, IP, dll)
   - Tabel radacct - untuk accounting/tracking session
   - Tabel radgroupcheck & radgroupreply - untuk group policies
   - Tabel radusergroup - untuk mapping user ke group

4. **Sinkronisasi Otomatis**
   - Auto-sync customer data ke RADIUS database
   - Sync on startup
   - Periodic sync (configurable interval)
   - Manual sync via admin interface

5. **Management Interface**
   - Web-based RADIUS management
   - Real-time monitoring
   - Active sessions viewer
   - Statistics dashboard

## Instalasi

### 1. Install Dependencies

```bash
npm install
npm install sqlite3 radius --save
```

### 2. Konfigurasi RADIUS di settings.json

Tambahkan konfigurasi berikut ke `settings.json`:

```json
{
  "radius_server_enabled": "true",
  "radius_auth_port": "1812",
  "radius_acct_port": "1813",
  "radius_auto_sync_on_startup": "true",
  "radius_sync_interval_minutes": "60",
  "radius_nas_clients": [
    {
      "ip": "192.168.1.1",
      "secret": "your_radius_secret",
      "name": "Main Router"
    },
    {
      "ip": "192.168.1.2",
      "secret": "your_radius_secret",
      "name": "Secondary Router"
    }
  ]
}
```

### 3. Konfigurasi Firewall

Pastikan port RADIUS terbuka:

**Windows Firewall:**
```powershell
New-NetFirewallRule -DisplayName "RADIUS Auth" -Direction Inbound -Protocol UDP -LocalPort 1812 -Action Allow
New-NetFirewallRule -DisplayName "RADIUS Acct" -Direction Inbound -Protocol UDP -LocalPort 1813 -Action Allow
```

**Linux iptables:**
```bash
sudo iptables -A INPUT -p udp --dport 1812 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 1813 -j ACCEPT
```

### 4. Jalankan Aplikasi

```bash
npm start
```

atau dengan PM2:

```bash
pm2 start app.js --name kilusi-bill
```

## Konfigurasi NAS (Network Access Server)

### Mikrotik RouterOS

```
/radius
add address=<IP_SERVER> secret=your_radius_secret service=ppp

/ppp aaa
set use-radius=yes
```

### Cisco

```
aaa new-model
aaa authentication ppp default group radius
radius-server host <IP_SERVER> auth-port 1812 acct-port 1813 key your_radius_secret
```

### Ubiquiti EdgeRouter

```
set system login radius-server <IP_SERVER> secret your_radius_secret
set system login radius-server <IP_SERVER> port 1812
```

## Penggunaan

### 1. Akses Admin Interface

Buka browser dan akses:
```
http://localhost:3001/admin/radius
```

### 2. Fitur yang Tersedia:

- **Server Status**: Monitoring status RADIUS server (running/stopped)
- **Statistics**: Total requests, accepted, rejected, active sessions
- **Sync Status**: Status sinkronisasi customer ke RADIUS
- **Active Sessions**: Daftar user yang sedang terkoneksi
- **Server Control**: Start, Stop, Restart server
- **Manual Sync**: Sinkronisasi manual customer ke RADIUS

### 3. API Endpoints

#### Get Server Status
```
GET /admin/radius/status
```

#### Start RADIUS Server
```
POST /admin/radius/start
```

#### Stop RADIUS Server
```
POST /admin/radius/stop
```

#### Restart RADIUS Server
```
POST /admin/radius/restart
```

#### Sync All Customers
```
POST /admin/radius/sync
```

#### Get All RADIUS Users
```
GET /admin/radius/users
```

#### Get Active Sessions
```
GET /admin/radius/sessions
```

#### Delete User from RADIUS
```
DELETE /admin/radius/user/:username
```

#### Sync Single Customer
```
POST /admin/radius/user/:username/sync
```

## Struktur Customer Data

Untuk customer dapat menggunakan RADIUS, pastikan data customer memiliki:

```json
{
  "username": "customer001",
  "password": "secretpass",
  "package_speed": "10 Mbps",
  "static_ip": "192.168.100.10",
  "session_timeout": 3600,
  "isolir_status": "active"
}
```

### Field Penting:

- `username`: Username untuk autentikasi
- `password`: Password untuk autentikasi
- `package_speed`: Kecepatan paket (10 Mbps, 20 Mbps, dll)
- `static_ip`: (Optional) Static IP address
- `session_timeout`: (Optional) Session timeout dalam detik
- `isolir_status`: Status isolir (jika "isolated", user tidak akan di-sync ke RADIUS)

## RADIUS Attributes

### Reply Attributes yang Didukung:

1. **Mikrotik-Rate-Limit**
   - Format: `upload/download` (dalam bps)
   - Contoh: `10000000/10000000` (10 Mbps)

2. **Framed-IP-Address**
   - Static IP address untuk user
   - Contoh: `192.168.100.10`

3. **Session-Timeout**
   - Maximum session duration (detik)
   - Contoh: `3600` (1 jam)

## Troubleshooting

### RADIUS Server Tidak Start

1. Cek apakah port 1812 dan 1813 sudah digunakan:
   ```bash
   netstat -an | findstr :1812
   netstat -an | findstr :1813
   ```

2. Cek log aplikasi:
   ```bash
   pm2 logs kilusi-bill
   ```

3. Pastikan SQLite database dapat dibuat di folder `logs/`

### Customer Tidak Bisa Login

1. Cek apakah customer sudah di-sync ke RADIUS:
   ```
   GET /admin/radius/users
   ```

2. Cek status isolir customer (jangan "isolated")

3. Cek NAS client configuration (IP dan secret harus match)

4. Cek log RADIUS di aplikasi

### Session Tidak Tercatat

1. Pastikan accounting server berjalan (port 1813)
2. Cek konfigurasi accounting di NAS
3. Verify NAS mengirim Accounting-Request packets

## Security Notes

1. **Ganti RADIUS Secret**: Selalu gunakan secret yang kuat dan unik
2. **Firewall Rules**: Batasi akses RADIUS hanya dari NAS yang authorized
3. **Password Encryption**: Pertimbangkan menggunakan encrypted password di database
4. **Regular Backup**: Backup database RADIUS secara berkala

## File Structure

```
kilusi-bill/
├── config/
│   ├── radius-database.js      # RADIUS database management
│   ├── radius-server.js        # RADIUS server implementation
│   └── radius-sync.js          # Customer sync functions
├── routes/
│   └── adminRadius.js          # RADIUS admin routes
├── views/
│   └── admin-radius.html       # RADIUS management interface
├── logs/
│   └── radius.db               # RADIUS SQLite database
└── README-RADIUS.md            # This file
```

## Dukungan

Untuk bantuan atau pertanyaan, hubungi administrator sistem.

## Changelog

### Version 1.0.0 (2025-10-24)
- Initial release dengan RADIUS server
- Support untuk authentication dan accounting
- Web-based management interface
- Auto-sync customer data
- SQLite database integration
