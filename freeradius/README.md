# FreeRADIUS Installer for Kilusi Bill ISP System

Package instalasi lengkap FreeRADIUS dengan integrasi PostgreSQL untuk sistem billing ISP Kilusi Bill.

## 📋 Fitur

- ✅ **Dua Mode Instalasi**: Native (langsung di server) atau Docker (containerized)
- ✅ **Integrasi PostgreSQL**: Schema database lengkap untuk autentikasi dan akunting
- ✅ **Konfigurasi Lengkap**: File konfigurasi siap pakai untuk ISP
- ✅ **Mikrotik Ready**: Konfigurasi klien khusus untuk router Mikrotik
- ✅ **Support Bandwidth Control**: Pengaturan bandwidth dan limit kuota
- ✅ **Session Management**: Tracking sesi pengguna aktif
- ✅ **Post-Auth Logging**: Log semua attempt autentikasi
- ✅ **Auto-install Script**: Script instalasi otomatis dengan deteksi OS

## 🏗️ Arsitektur

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   NAS/Routers   │────▶│  FreeRADIUS  │────▶│   PostgreSQL    │
│  (Mikrotik,etc) │◀────│   Server     │◀────│    Database     │
└─────────────────┘     └──────────────┘     └─────────────────┘
                               │
                               ▼
                       ┌─────────────────┐
                       │  Kilusi Bill    │
                       │  Backend API    │
                       └─────────────────┘
```

## 📦 Komponen

### 1. Installer Script (`install-freeradius.sh`)
- Otomatis deteksi OS (Ubuntu/Debian)
- Instalasi dependencies
- Setup database PostgreSQL
- Konfigurasi firewall
- Testing otomatis

### 2. Database Schema (`config/radius-schema.sql`)
- Tabel radcheck, radreply, radgroupcheck, radgroupreply
- Tabel radacct untuk akunting
- Tabel radpostauth untuk logging
- Tabel nas untuk klien RADIUS
- Indexes untuk performa optimal

### 3. Konfigurasi FreeRADIUS
- `clients.conf`: Daftar klien RADIUS (Mikrotik, Cisco, dll)
- `default`: Virtual server configuration
- `sql`: Database connection dan queries
- `users`: Fallback user definitions

## 🚀 Cara Instalasi

### Prerequisites

**Untuk semua mode:**
- Ubuntu 20.04+ atau Debian 11+
- PostgreSQL 13+ (tersedia dan running)
- Akses sudo

**Untuk Docker mode:**
- Docker & Docker Compose

### Instalasi Quick & Easy

```bash
# Clone atau download package installer
cd /path/to/installer/freeradius

# Install dengan default settings (native mode)
sudo ./install-freeradius.sh

# Atau dengan Docker mode
sudo ./install-freeradius.sh -m docker

# Atau dengan custom settings
sudo ./install-freeradius.sh \
  -h 192.168.1.100 \  # PostgreSQL host
  -u radius_user \    # Database user
  -P MySecret123 \    # Database password
  -s MikrotikSecret \ # RADIUS secret
  -m docker           # Installation mode
```

### Opsi Instalasi

| Opsi | Deskripsi | Default |
|------|-----------|---------|
| `-m, --mode` | Mode instalasi: `native` atau `docker` | `native` |
| `-h, --host` | Host PostgreSQL | `localhost` |
| `-p, --port` | Port PostgreSQL | `5432` |
| `-d, --database` | Nama database | `radius` |
| `-u, --user` | User database | `radius` |
| `-P, --password` | Password database | `radius1234` |
| `-s, --secret` | RADIUS shared secret | `testing123` |
| `--auth-port` | Port autentikasi | `1812` |
| `--acct-port` | Port akunting | `1813` |
| `--admin-port` | Port admin | `18120` |

## 🔧 Konfigurasi Setelah Instalasi

### 1. Update Konfigurasi Klien (NAS)

**Untuk Mikrotik:**
```
/radius
add address=YOUR_RADIUS_SERVER service=ppp secret=YOUR_RADIUS_SECRET src-address=192.168.88.1
/ppp secret
add name=user1 password=pass1 service=pppoe profile=default
```

**Untuk RouterOS CLI:**
```bash
# Set RADIUS server
/radius add server=RADIUS_SERVER_IP secret=YOUR_SECRET service=ppp timeout=300ms

# Enable RADIUS for PPPoE
/interface pppoe-server server set authentication=radius,radius,accounting=yes radius=default
```

### 2. Setup di Kilusi Bill Backend

Update file `backend/config/radius-postgres.js`:

```javascript
module.exports = {
  host: 'localhost',
  port: 5432,
  database: 'radius',
  username: 'radius',
  password: 'radius1234'
};
```

### 3. Firewall Configuration

```bash
# Allow RADIUS ports
sudo ufw allow 1812/udp  # Authentication
sudo ufw allow 1813/udp  # Accounting
sudo ufw allow 18120/tcp # Admin
```

## 📊 Struktur Database

### Tabel Utama

1. **nas**: Konfigurasi NAS/Router
   ```sql
   SELECT * FROM nas WHERE nasname = '192.168.88.1';
   ```

2. **radcheck**: Atribut autentikasi user
   ```sql
   SELECT * FROM radcheck WHERE username = 'testuser';
   ```

3. **radreply**: Atribut reply untuk user
   ```sql
   SELECT * FROM radreply WHERE username = 'testuser';
   ```

4. **radgroupcheck**: Atribut check untuk grup
5. **radgroupreply**: Atribut reply untuk grup
6. **radusergroup**: Membership user ke grup
7. **radacct**: Record akunting sesi
8. **radpostauth**: Log autentikasi

### Query Examples

**Tambah user baru:**
```sql
-- Add user with password
INSERT INTO radcheck (username, attribute, op, value)
VALUES ('newuser', 'Cleartext-Password', ':=', 'userpass123');

-- Add user to active group
INSERT INTO radusergroup (username, groupname, priority)
VALUES ('newuser', 'active', 1);
```

**Cek user aktif:**
```sql
SELECT username, acctstarttime, framedipaddress
FROM radacct
WHERE acctstoptime IS NULL;
```

## 🧪 Testing

### Test Autentikasi

```bash
# Test dengan radclient
echo "User-Name = testuser, User-Password = test123" | radclient localhost:1812 auth testing123

# Expected response:
# Received response ID 153, code 2, length = 20
# Reply-Message = "Access granted"
```

### Test Akunting

```bash
# Kirim accounting packet
echo "Acct-Session-Id = 123456, Acct-Status-Type = Start, User-Name = testuser" | radclient localhost:1813 acct testing123
```

### Debug Mode

```bash
# Native mode
sudo freeradius -X

# Docker mode
docker exec -it kilusi-freeradius freeradius -XXX
```

## 🔍 Monitoring & Troubleshooting

### Log Locations

**Native Mode:**
- RADIUS logs: `/var/log/freeradius/`
- System logs: `journalctl -u freeradius-custom`
- SQL trace: `/var/log/freeradius/sqltrace.sql`

**Docker Mode:**
```bash
# View container logs
docker-compose logs -f freeradius

# Real-time logs
docker logs -f kilusi-freeradius
```

### Common Issues

1. **Database Connection Failed**
   ```bash
   # Check PostgreSQL
   sudo -u postgres psql -h localhost -p 5432 -U radius -d radius -c '\l'

   # Check FreeRADIUS logs for SQL errors
   tail -f /var/log/freeradius/radius.log | grep -i sql
   ```

2. **Authentication Failed**
   ```bash
   # Check user in database
   sudo -u postgres psql -d radius -c "SELECT * FROM radcheck WHERE username='testuser';"

   # Test with debug mode
   freeradius -X
   ```

3. **NAS Not Responding**
   ```bash
   # Check if NAS is in clients.conf
   grep -r "192.168.88.1" /etc/freeradius/3.0/

   # Check firewall
   sudo ufw status
   sudo netstat -ulnp | grep :1812
   ```

### Performance Monitoring

```sql
-- Active sessions view
SELECT * FROM active_sessions;

-- User auth history
SELECT * FROM user_auth_history WHERE username = 'testuser' LIMIT 10;

-- Database size
SELECT pg_size_pretty(pg_total_relation_size('radacct'));
```

## 📚 Integrasi dengan Fitur ISP

### Bandwidth Control

**Di Mikrotik RADIUS Attributes:**
```
Mikrotik-Rate-Limit = "1M/2M"  # 1Mbps upload, 2Mbps download
```

**Di FreeRADIUS radreply:**
```sql
INSERT INTO radreply (username, attribute, op, value)
VALUES ('premiumuser', 'Mikrotik-Rate-Limit', ':=', '10M/20M');
```

### Data Limit

```sql
-- 10GB data limit
INSERT INTO radreply (username, attribute, op, value)
VALUES ('limiteduser', 'Mikrotik-Total-Limit', ':=', '10737418240');
```

### Time-Based Access

```sql
-- Business hours only
INSERT INTO radcheck (username, attribute, op, value)
VALUES ('businessuser', 'Login-Time', ':=', 'Mon0900-1700,Tue0900-1700,Wed0900-1700,Thu0900-1700,Fri0900-1700');
```

## 🔄 Backup & Restore

### Backup Database

```bash
# Backup seluruh database
sudo -u postgres pg_dump radius > radius-backup-$(date +%Y%m%d).sql

# Backup hanya data tertentu
sudo -u postgres pg_dump -t radcheck -t radreply -t radacct radius > radius-users-backup.sql
```

### Restore Database

```bash
# Restore dari backup
sudo -u postgres psql radius < radius-backup-20241209.sql
```

## 🔐 Security Best Practices

1. **Gunakan Strong Secrets**
   ```bash
   # Generate random secret
   openssl rand -hex 16
   ```

2. **Limit Client Access**
   - Gunakan IP spesifik bukan subnet
   - Konfigurasi firewall rules
   - Disable default clients

3. **Database Security**
   - User dedicated dengan limited privileges
   - Enable SSL/TLS connections
   - Regular password rotation

4. **Monitoring**
   - Monitor failed authentication attempts
   - Set alerts untuk unusual activity
   - Regular log review

## 📝 Script Examples

### Bulk User Creation

```bash
#!/bin/bash
# create-users.sh

DB_NAME="radius"
DB_USER="radius"

while IFS=, read -r username password group; do
    psql -h localhost -U $DB_USER -d $DB_NAME -c "INSERT INTO radcheck (username, attribute, op, value) VALUES ('$username', 'Cleartext-Password', ':=', '$password');"
    psql -h localhost -U $DB_USER -d $DB_NAME -c "INSERT INTO radusergroup (username, groupname, priority) VALUES ('$username', '$group', 1);"
done < users.csv
```

### Daily Session Report

```bash
#!/bin/bash
# session-report.sh

psql -h localhost -U radius -d radius -c "
SELECT
    DATE(acctstarttime) as date,
    COUNT(*) as sessions,
    COUNT(DISTINCT username) as unique_users,
    SUM(acctsessiontime)/3600 as total_hours
FROM radacct
WHERE acctstarttime >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY DATE(acctstarttime)
ORDER BY date DESC;
"
```

## 🆘 Support

Jika mengalami masalah:

1. Check log files untuk error messages
2. Jalankan dalam debug mode (`freeradius -X`)
3. Test dengan `radclient`
4. Verify database connection
5. Check firewall rules

Untuk support tambahan:
- Documentation: `/usr/share/doc/freeradius/`
- Wiki: `https://wiki.freeradius.org/`
- Community: `https://freeradius.org/contact/`

## 📄 License

Package installer ini merupakan bagian dari Kilusi Bill ISP Management System dan dilisensikan sesuai dengan lisensi utama sistem.