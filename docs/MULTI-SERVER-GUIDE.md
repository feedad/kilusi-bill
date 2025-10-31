# 🌐 Multi-NAS dan Multi-Mikrotik PPPoE Server

Fitur untuk mengelola **multiple NAS devices** (RADIUS servers) dan **multiple Mikrotik PPPoE servers** dalam satu sistem billing.

## 📋 Fitur Utama

### 1. **Multi-NAS Server Support**
- Kelola multiple NAS devices untuk RADIUS authentication
- Setiap customer bisa menggunakan NAS server yang berbeda
- Support untuk Mikrotik, Cisco, dan NAS lainnya
- Auto-sync RADIUS users ke NAS server yang dipilih

### 2. **Multi-Mikrotik PPPoE Server Support**
- Kelola multiple Mikrotik RouterOS sebagai PPPoE server
- Distribute load dengan assign customer ke server berbeda
- Setiap customer terhubung ke Mikrotik server yang dipilih
- PPPoE secret otomatis dibuat di server yang sesuai

### 3. **Customer Assignment**
- Admin bisa pilih NAS server untuk setiap customer
- Admin bisa pilih Mikrotik PPPoE server untuk setiap customer
- Default server (ID=1) untuk backward compatibility
- Flexible server management untuk scaling

## 🗄️ Database Schema

### Tabel: `nas_servers`
```sql
CREATE TABLE nas_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,              -- Nama NAS (contoh: "NAS Blok A")
    type TEXT NOT NULL DEFAULT 'mikrotik',  -- Tipe: mikrotik/cisco/other
    host TEXT NOT NULL,                     -- IP Address NAS
    secret TEXT NOT NULL,                   -- RADIUS Secret
    description TEXT,                       -- Deskripsi
    is_active INTEGER DEFAULT 1,            -- Status aktif/nonaktif
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Tabel: `mikrotik_servers`
```sql
CREATE TABLE mikrotik_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,              -- Nama server (contoh: "Mikrotik Tower A")
    host TEXT NOT NULL,                     -- IP Address Mikrotik
    port INTEGER DEFAULT 8728,              -- API Port
    username TEXT NOT NULL,                 -- Username admin Mikrotik
    password TEXT NOT NULL,                 -- Password admin
    description TEXT,                       -- Deskripsi
    is_pppoe_server INTEGER DEFAULT 1,      -- Apakah server PPPoE?
    is_active INTEGER DEFAULT 1,            -- Status aktif/nonaktif
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Update Tabel: `customers`
```sql
ALTER TABLE customers ADD COLUMN nas_server_id INTEGER DEFAULT 1;
ALTER TABLE customers ADD COLUMN mikrotik_server_id INTEGER DEFAULT 1;
```

## 🚀 Cara Penggunaan

### 1. Akses Menu Management

**NAS Server Management:**
- Navigate: `Admin Panel` → `System & Settings` → `NAS Servers`
- URL: `http://localhost:3001/admin/nas`

**Mikrotik Server Management:**
- Navigate: `Admin Panel` → `System & Settings` → `Mikrotik Servers`
- URL: `http://localhost:3001/admin/mikrotik-servers`

### 2. Tambah NAS Server

```
1. Klik tombol "Add NAS Server"
2. Isi form:
   - Name: Nama NAS (contoh: "NAS Blok A")
   - Type: Pilih Mikrotik/Cisco/Other
   - Host/IP: IP Address NAS (contoh: 192.168.1.1)
   - RADIUS Secret: Secret untuk autentikasi (contoh: testing123)
   - Description: Keterangan (opsional)
3. Klik "Add NAS"
```

### 3. Tambah Mikrotik PPPoE Server

```
1. Klik tombol "Add Mikrotik Server"
2. Isi form:
   - Name: Nama server (contoh: "Mikrotik Tower A")
   - Host/IP: IP Address Mikrotik
   - Port: API port (default: 8728)
   - Username: Username admin Mikrotik
   - Password: Password admin
   - Description: Keterangan (opsional)
   - ✓ This is a PPPoE Server (centang jika untuk PPPoE)
3. Klik "Add Server"
```

### 4. Assign Server ke Customer

```
1. Buka "Customer Management"
2. Klik tombol Edit pada customer
3. Di form edit:
   - Pilih "NAS Server (RADIUS)" untuk RADIUS authentication
   - Pilih "Mikrotik PPPoE Server" untuk PPPoE connection
4. Klik "Simpan Perubahan"
```

## ⚙️ Konfigurasi RADIUS

### Server NAS Configuration

Untuk setiap NAS device, tambahkan konfigurasi RADIUS client di Mikrotik:

```routeros
/radius
add address=<RADIUS_SERVER_IP> secret=<SECRET> service=ppp

/ppp aaa
set use-radius=yes
```

**Contoh:**
```routeros
# NAS Blok A (192.168.1.1)
/radius
add address=192.168.100.10 secret=testing123 service=ppp

/ppp aaa
set use-radius=yes
```

### RADIUS Server Configuration

Di `config/radius-server.js`, sistem akan membaca NAS servers dari database:

```javascript
// Auto-load NAS clients from database
const nasServers = db.prepare('SELECT * FROM nas_servers WHERE is_active = 1').all();
nasServers.forEach(nas => {
    radius.addClient(nas.host, nas.secret);
});
```

## 🔧 Technical Implementation

### 1. RADIUS Sync Logic

File: `config/radius-sync.js`

```javascript
// Get customer's NAS server
const nasServer = db.prepare('SELECT * FROM nas_servers WHERE id = ?')
    .get(customer.nas_server_id);

// Sync to specific NAS
if (nasServer) {
    syncToNAS(customer, nasServer);
}
```

### 2. PPPoE Secret Creation

File: `config/mikrotik.js`

```javascript
// Get customer's Mikrotik server
const mikrotikServer = db.prepare('SELECT * FROM mikrotik_servers WHERE id = ?')
    .get(customer.mikrotik_server_id);

// Connect to specific Mikrotik
const api = new RouterOSAPI({
    host: mikrotikServer.host,
    port: mikrotikServer.port,
    user: mikrotikServer.username,
    password: mikrotikServer.password
});

// Create PPPoE secret
await api.write('/ppp/secret/add', [
    `=name=${customer.pppoe_username}`,
    `=password=${customer.pppoe_password}`,
    `=service=pppoe`
]);
```

## 📊 Use Cases

### Use Case 1: Geographic Distribution
```
Skenario: ISP punya 3 area berbeda (Utara, Selatan, Timur)

Setup:
- NAS Server 1: Area Utara (192.168.1.1)
- NAS Server 2: Area Selatan (192.168.2.1)
- NAS Server 3: Area Timur (192.168.3.1)

- Mikrotik PPPoE 1: Tower Utara
- Mikrotik PPPoE 2: Tower Selatan  
- Mikrotik PPPoE 3: Tower Timur

Benefit:
✅ Setiap area punya dedicated server
✅ Mengurangi latency
✅ Isolasi traffic antar area
```

### Use Case 2: Load Balancing
```
Skenario: ISP punya 1000+ customer, perlu distribusi load

Setup:
- Mikrotik PPPoE 1: Customer 1-500
- Mikrotik PPPoE 2: Customer 501-1000
- NAS 1: RADIUS untuk semua customer

Benefit:
✅ Load terdistribusi merata
✅ Mengurangi beban CPU per Mikrotik
✅ Scaling horizontal
```

### Use Case 3: Service Tiers
```
Skenario: ISP punya paket Basic dan Premium

Setup:
- NAS Basic: Server RADIUS untuk paket murah
- NAS Premium: Server RADIUS untuk paket mahal (dedicated)
- Mikrotik 1: PPPoE untuk paket Basic
- Mikrotik 2: PPPoE untuk paket Premium (bandwidth lebih besar)

Benefit:
✅ QoS terpisah per tier
✅ Resource allocation lebih optimal
✅ Premium customer dapat service terbaik
```

## 🔐 Security Notes

### 1. RADIUS Secret Management
- Gunakan secret yang kuat dan berbeda untuk setiap NAS
- Jangan gunakan secret yang sama dengan password Mikrotik
- Rotate secret secara berkala

### 2. Mikrotik API Access
- Buat user khusus untuk API dengan privilege minimal
- Gunakan password yang kuat
- Batasi akses API hanya dari IP server billing

### 3. Database Security
- Mikrotik password tersimpan plain text di database
- Pastikan database file (billing.db) hanya readable oleh aplikasi
- Backup database secara terenkripsi

## 🛠️ Maintenance

### Check NAS Server Status
```bash
# Via web interface
http://localhost:3001/admin/nas

# Via database
sqlite3 billing.db "SELECT * FROM nas_servers WHERE is_active = 1"
```

### Check Mikrotik Server Status
```bash
# Via web interface
http://localhost:3001/admin/mikrotik-servers

# Via database
sqlite3 billing.db "SELECT * FROM mikrotik_servers WHERE is_active = 1"
```

### Check Customer Server Assignment
```bash
sqlite3 billing.db "SELECT name, phone, nas_server_id, mikrotik_server_id FROM customers LIMIT 10"
```

## 🐛 Troubleshooting

### Issue: Customer tidak bisa koneksi PPPoE
**Diagnosis:**
```bash
# 1. Check Mikrotik server yang dipilih
sqlite3 billing.db "SELECT c.name, c.pppoe_username, m.name, m.host 
FROM customers c 
JOIN mikrotik_servers m ON c.mikrotik_server_id = m.id 
WHERE c.phone = '08123456789'"

# 2. Pastikan server aktif
# 3. Test koneksi ke Mikrotik API
# 4. Cek PPPoE secret sudah dibuat di Mikrotik yang benar
```

### Issue: RADIUS authentication gagal
**Diagnosis:**
```bash
# 1. Check NAS server yang dipilih
sqlite3 billing.db "SELECT c.name, c.pppoe_username, n.name, n.host 
FROM customers c 
JOIN nas_servers n ON c.nas_server_id = n.id 
WHERE c.phone = '08123456789'"

# 2. Pastikan NAS server aktif
# 3. Cek RADIUS log di server billing
# 4. Verify secret match dengan NAS device
```

### Issue: Server tidak muncul di dropdown
**Solution:**
```bash
# Pastikan server active
sqlite3 billing.db "UPDATE nas_servers SET is_active = 1 WHERE id = 1"
sqlite3 billing.db "UPDATE mikrotik_servers SET is_active = 1 WHERE id = 1"
```

## 📈 Performance Tips

1. **Optimize Database Queries**
   - Index pada nas_server_id dan mikrotik_server_id
   - Cache server list di memory

2. **Connection Pooling**
   - Gunakan connection pool untuk Mikrotik API
   - Reuse connections untuk multiple operations

3. **Monitoring**
   - Monitor CPU usage per Mikrotik server
   - Track customer distribution per server
   - Alert jika server overload

## 🔄 Migration Guide

### Dari Single Server ke Multi Server

```bash
# 1. Run migration
node migrations/add-multi-nas-mikrotik.js

# 2. Restart aplikasi
npm run dev

# 3. Verify default servers created
# All existing customers akan gunakan server ID 1 (default)

# 4. Tambah server baru sesuai kebutuhan
# 5. Assign customer ke server yang sesuai
```

## 📝 API Documentation

### Get NAS Servers
```
GET /admin/nas
Response: EJS render with nasServers array
```

### Add NAS Server
```
POST /admin/nas/add
Body: { name, type, host, secret, description }
```

### Edit NAS Server
```
POST /admin/nas/:id/edit
Body: { name, type, host, secret, description, is_active }
```

### Delete NAS Server
```
POST /admin/nas/:id/delete
Note: Tidak bisa delete jika masih ada customer yang menggunakan
```

### Toggle NAS Status
```
POST /admin/nas/:id/toggle
Response: { success: true }
```

_Same endpoints untuk Mikrotik servers di `/admin/mikrotik-servers`_

## 🎯 Roadmap

- [ ] Auto-detect overloaded servers
- [ ] Auto-balance customer distribution
- [ ] Health check untuk setiap server
- [ ] Failover support (backup server)
- [ ] Bulk customer migration antar server
- [ ] Server performance dashboard
- [ ] API key authentication untuk Mikrotik (lebih aman dari password)

## 📞 Support

Jika ada pertanyaan atau issues:
- Check GitHub repository: https://github.com/feedad/kilusi-bill
- Create issue di GitHub untuk bug reports
- Pull requests welcome!

---

**Version:** 1.0.0  
**Last Updated:** October 25, 2025  
**Author:** Kilusi-Bill Development Team
