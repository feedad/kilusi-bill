# Status Akhir: Active Sessions Tidak Muncul

## Masalah Utama

**TIDAK ADA** active sessions di database meskipun:
- ✅ FreeRADIUS menerima accounting packets (terlihat di detail files)
- ✅ FreeRADIUS mengirim Accounting-Response
- ✅ SQL module loaded dan connected ke database "kilusi_bill"
- ✅ Manual INSERT ke radacct table berhasil (permissions OK)
- ❌ **SQL accounting queries TIDAK dieksekusi**

## Root Cause

Kemungkinan besar: **SQL module tidak terpanggil di accounting section** meskipun sudah dikonfigurasi di `sites-enabled/default`.

## Diagnosis yang Sudah Dilakukan

### 1. Database & Permissions ✅
```bash
# Manual INSERT berhasil
INSERT INTO radacct (...) VALUES (...) RETURNING radacctid
# Result: radacctid=165 (SUCCESS)
```

### 2. FreeRADIUS Config ✅
```bash
# sites-enabled/default
accounting {
    detail   # ✅ Berfungsi (packets masuk ke detail files)
    sql      # ❌ Sepertinya tidak dieksekusi
}
```

### 3. SQL Module ✅
```
rlm_sql (sql): Driver rlm_sql_postgresql loaded and linked
rlm_sql (sql): Attempting to connect to database "kilusi_bill"
```

### 4. Queries.conf Fixes ✅
- Fixed NAS-IP-Address casting: `NULLIF('%{NAS-IP-Address}', '')::inet`
- Fixed Framed-IP-Address casting: `NULLIF('%{Framed-IP-Address}', '')::inet`
- Disabled logfile (permission errors)
- Applied to ALL queries (Start, Interim, Stop, fallbacks)

### 5. Test Results ❌
```bash
# radclient test
Sent Accounting-Request → Received Accounting-Response ✅

# Database check
SELECT * FROM radacct WHERE username='testuser' → [] ❌

# Detail file check
grep "testuser" detail-20251105 → FOUND ✅
```

**Kesimpulan**: `detail` module menulis, tapi `sql` module TIDAK.

## Kemungkinan Penyebab

### 1. Bind Mount Path Conflict
```
Bind Mount: /home/kilusi-bill/freeradius-docker/mods-config 
         → /etc/freeradius/3.0/mods-config

FreeRADIUS reads: /etc/freeradius/mods-config (?)
               OR /etc/freeradius/3.0/mods-config (?)
```

### 2. SQL Module Disabled atau Fail Silently
Meskipun module loaded, mungkin ada condition yang menyebabkan queries tidak dijalankan.

### 3. Queries.conf Syntax Error (Tidak Terdeteksi)
`freeradius -CX` tidak menunjukkan error, tapi mungkin ada masalah runtime.

## Solusi yang Direkomendasikan

### Opsi 1: Debug Mode (Recommended)
Stop container dan run FreeRADIUS dalam debug mode untuk melihat SQL query execution:

```bash
docker stop kilusi-freeradius

# Run in debug foreground mode
docker run --rm -it --network host \
  -v /home/kilusi-bill/freeradius-docker/config:/etc/freeradius/3.0 \
  -v /home/kilusi-bill/freeradius-docker/mods-config:/etc/freeradius/3.0/mods-config \
  kilusi-freeradius:3.2.3 \
  freeradius -X

# In another terminal, send test packet
echo "User-Name = 'debugtest', Acct-Status-Type = Start, ..." | radclient 127.0.0.1:1813 acct testing123

# Look for output like:
# rlm_sql (sql): Executing query: INSERT INTO radacct ...
```

### Opsi 2: Bypass Node-Radius History
Kemungkinan ada residual config dari node-radius. **Buat database baru** dari scratch:

```bash
# Backup current
pg_dump -h 172.22.10.28 -U kilusi_user kilusi_bill > /tmp/backup.sql

# Drop & recreate radacct
psql -h 172.22.10.28 -U kilusi_user -d kilusi_bill -c "DROP TABLE IF EXISTS radacct CASCADE"
psql -h 172.22.10.28 -U kilusi_user -d kilusi_bill -c "CREATE TABLE radacct (...)"

# Reinit app schema
cd /home/kilusi-bill && node -e "require('./config/radius-postgres').initializeRadiusTables()"
```

### Opsi 3: Gunakan FreeRADIUS Default Queries
Copy queries.conf default dari FreeRADIUS package:

```bash
# Backup current
cp /home/kilusi-bill/freeradius-docker/mods-config/sql/main/postgresql/queries.conf \
   /home/kilusi-bill/freeradius-docker/mods-config/sql/main/postgresql/queries.conf.custom

# Use default (in container)
docker exec kilusi-freeradius cp /usr/share/freeradius/mods-config/sql/main/postgresql/queries.conf \
   /etc/freeradius/3.0/mods-config/sql/main/postgresql/queries.conf

docker restart kilusi-freeradius
```

**CATATAN**: Default queries mungkin memerlukan kolom `acctupdatetime` yang tidak ada di schema app.

### Opsi 4: **Reconnect PPPoE SEKARANG** (Quick Win)
Jika accounting sebenarnya berfungsi tapi hanya untuk **session baru**:

```
1. Disconnect PPPoE user "apptest" dari MikroTik atau client
2. Reconnect
3. Check database: SELECT * FROM radacct WHERE acctstoptime IS NULL
```

Jika session muncul → masalah solved (hanya perlu fresh session).
Jika TIDAK muncul → lanjut ke Opsi 1 (Debug Mode).

## Status File yang Sudah Diperbaiki

✅ `/home/kilusi-bill/freeradius-docker/mods-config/sql/main/postgresql/queries.conf`
- NAS-IP-Address cast: DONE
- Framed-IP-Address cast: DONE  
- Logfile disabled: DONE
- Semua fallback INSERT fixed: DONE

✅ `/home/kilusi-bill/views/admin-pelanggan-online.ejs`
- Live mode removed: DONE
- DB-only enforced: DONE

✅ `/home/kilusi-bill/routes/adminPelangganOnline.js`
- /sessions-live removed: DONE

## Next Step yang Harus Dilakukan

### PRIORITAS 1: Test dengan User Reconnect
```bash
# Disconnect user "apptest" dari MikroTik
/ppp active remove [find name="apptest"]

# Tunggu user reconnect (atau reconnect manual dari client)
# Lalu cek database
cd /home/kilusi-bill && node -e "(async()=>{
  const db=require('./config/database');
  const open=await db.getAll('SELECT username,acctsessionid,framedipaddress::text ip FROM radacct WHERE acctstoptime IS NULL');
  console.log('Open sessions:', open);
  process.exit(0);
})()"
```

### PRIORITAS 2: Jika masih kosong, run Debug Mode
```bash
docker stop kilusi-freeradius
docker run --rm -it --network host \
  -v /home/kilusi-bill/freeradius-docker/config:/etc/freeradius/3.0 \
  -v /home/kilusi-bill/freeradius-docker/mods-config:/etc/freeradius/3.0/mods-config \
  kilusi-freeradius:3.2.3 freeradius -X
```

Lalu reconnect PPPoE dan lihat output SQL query di console.

## Kesimpulan

**Masalah BUKAN karena node-radius**, tapi karena:
1. SQL accounting queries tidak dieksekusi (meskipun module loaded)
2. Atau ada syntax error yang tidak terdeteksi oleh config test
3. Atau path config yang dibaca berbeda dengan yang kita edit

**Solusi tercepat**: Reconnect PPPoE untuk session baru, atau run debug mode untuk melihat SQL execution.

---
**Status**: BLOCKED - Perlu user reconnect PPPoE atau debug mode
**Last Updated**: 2025-11-05 12:10 WIB
