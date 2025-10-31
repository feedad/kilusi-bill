# NAS Clients Database Migration

## Overview
NAS clients sekarang disimpan di database SQLite (`logs/radius.db`) untuk manajemen yang lebih baik dan reliable.

## Database Schema

Tabel `nas`:
```sql
CREATE TABLE nas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nasname TEXT NOT NULL UNIQUE,     -- IP address of NAS
  shortname TEXT NOT NULL,           -- Display name
  type TEXT DEFAULT 'other',         -- Device type (mikrotik, cisco, etc)
  secret TEXT NOT NULL,              -- Shared secret
  server TEXT,                       -- Optional server field
  community TEXT,                    -- Optional SNMP community
  description TEXT,                  -- Description
  ports INTEGER,                     -- Optional ports
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

## Migration dari settings.json

Jika Anda memiliki NAS clients di `settings.json`, jalankan script migrasi:

```bash
node scripts/migrate-nas-to-database.js
```

Script akan:
1. Membaca `radius_nas_clients` dari settings.json
2. Membuat/update entries di database
3. Menampilkan hasil migrasi

Setelah migrasi berhasil, Anda bisa menghapus `radius_nas_clients` dari settings.json.

## Management via Web UI

### Melihat NAS Clients
1. Buka **Admin > RADIUS Server**
2. Scroll ke section **NAS Clients**

### Menambah NAS Client
1. Klik tombol **Add NAS**
2. Isi form:
   - **Name**: Nama display (contoh: "Mikrotik Main")
   - **IP Address**: IP address NAS device (contoh: "192.168.1.1")
   - **Secret**: Shared secret untuk RADIUS auth
   - **Type**: Tipe device (mikrotik, cisco, other, dll)
   - **Description**: Deskripsi opsional
3. Klik **Save**

### Edit NAS Client
1. Klik tombol **Edit** pada NAS yang ingin diubah
2. Ubah data yang diperlukan
3. Klik **Save**

### Hapus NAS Client
1. Klik tombol **Delete** pada NAS yang ingin dihapus
2. Konfirmasi penghapusan

> **Note**: Setiap perubahan (add/edit/delete) akan otomatis me-reload NAS clients di RADIUS server tanpa perlu restart.

## API Endpoints

### Get All NAS Clients
```
GET /admin/radius/nas-clients
Response: { success: true, nasClients: [...] }
```

### Add NAS Client
```
POST /admin/radius/nas-clients
Body: { nasname, shortname, secret, type, description }
Response: { success: true, message: "..." }
```

### Update NAS Client
```
PUT /admin/radius/nas-clients/:id
Body: { nasname, shortname, secret, type, description }
Response: { success: true, message: "..." }
```

### Delete NAS Client
```
DELETE /admin/radius/nas-clients/:id
Response: { success: true, message: "..." }
```

### Reload NAS Clients
```
POST /admin/radius/reload-nas
Response: { success: true, message: "..." }
```

## Troubleshooting

### NAS clients tidak muncul setelah migrasi
1. Restart RADIUS server dari UI atau restart aplikasi
2. Periksa log untuk error messages
3. Verifikasi database: `sqlite3 logs/radius.db "SELECT * FROM nas;"`

### RADIUS tidak accept connections dari NAS
1. Pastikan IP address NAS benar di database
2. Periksa secret key cocok antara NAS dan database
3. Reload NAS clients dari UI atau restart RADIUS server
4. Periksa firewall tidak memblokir port 1812/1813

### Database error saat add/edit/delete
1. Periksa permission file `logs/radius.db`
2. Pastikan tidak ada duplikasi IP address (nasname must be unique)
3. Periksa log aplikasi untuk detail error

## Benefits

✅ **Persistent Storage**: Data tersimpan di database, tidak hilang saat restart  
✅ **Easy Management**: CRUD via web UI tanpa edit file manual  
✅ **Hot Reload**: Perubahan langsung diterapkan tanpa restart server  
✅ **Better Validation**: Database constraint mencegah duplikasi  
✅ **Audit Trail**: Created/updated timestamps untuk tracking  
✅ **Scalable**: Support unlimited NAS clients dengan performa baik  

## Migration Checklist

- [ ] Backup settings.json
- [ ] Run migration script: `node scripts/migrate-nas-to-database.js`
- [ ] Verify NAS clients di web UI (Admin > RADIUS Server)
- [ ] Test RADIUS authentication dari NAS device
- [ ] (Optional) Remove `radius_nas_clients` dari settings.json
- [ ] Restart aplikasi untuk memastikan semua berjalan normal
