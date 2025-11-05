# Troubleshooting: IP 0.0.0.0 dan Koneksi Disconnect Berulang

## Status Saat Ini

✅ **RADIUS Server**: Berfungsi dengan baik
✅ **Autentikasi**: Berhasil (Access-Accept dikirim)
✅ **Mikrotik-Group**: Dikirim dengan benar (`UpTo-10M`)
✅ **Service-Type & Framed-Protocol**: Dikirim
❌ **IP Assignment**: Gagal (0.0.0.0)
❌ **Session**: Disconnect berulang kali

## Log Evidence

```
2025-11-03 14:27:03 info: ✅ Access-Accept (workaround) for apptest with attributes:
2025-11-03 14:27:03 info:    Mikrotik-Group: UpTo-10M
2025-11-03 14:27:04 info: ✅ Accounting start recorded for apptest
2025-11-03 14:27:04 info: ✅ Accounting stop recorded for apptest
```

Pattern: Start → Stop (langsung disconnect setelah connect)

## Root Cause Analysis

RADIUS server sudah mengirim semua attribute yang benar:
- `Service-Type = Framed-User` ✅
- `Framed-Protocol = PPP` ✅  
- `Mikrotik-Group = UpTo-10M` ✅

**Masalahnya ada di MikroTik PPP Profile configuration!**

## Yang Harus Dicek di MikroTik

### 1. Apakah PPP Profile "UpTo-10M" ada?

Buka MikroTik:
```
/ppp profile print detail
```

Cari profile dengan nama `UpTo-10M`. Kalau tidak ada, profile harus dibuat dulu!

### 2. Apakah Profile punya Local Address dan Remote Address?

Profile yang benar harus punya:

```
/ppp profile
add name=UpTo-10M \
    local-address=10.10.10.1 \
    remote-address=pool-10M \
    rate-limit=10M/10M
```

**Penting:**
- `local-address`: IP untuk router (gateway), contoh: `10.10.10.1`
- `remote-address`: IP pool untuk client, contoh: `pool-10M` atau range `10.10.10.10-10.10.10.254`

### 3. Apakah IP Pool sudah dibuat?

Kalau pakai pool name (contoh: `pool-10M`), pastikan pool-nya ada:

```
/ip pool
add name=pool-10M ranges=10.10.10.10-10.10.10.254
```

## Solusi Step-by-Step

### Step 1: Cek Profile di MikroTik

```
/ppp profile print detail where name=UpTo-10M
```

Kalau output kosong → profile belum ada, lanjut ke Step 2.
Kalau ada tapi `local-address` dan `remote-address` kosong → lanjut ke Step 3.

### Step 2: Buat PPP Profile (kalau belum ada)

```
/ppp profile
add name=UpTo-10M \
    local-address=10.10.10.1 \
    remote-address=pool-10M \
    rate-limit=10M/10M \
    only-one=yes \
    use-encryption=default
```

### Step 3: Buat IP Pool (kalau belum ada)

```
/ip pool
add name=pool-10M ranges=10.10.10.10-10.10.10.254
```

### Step 4: Set Profile untuk Paket Lain (kalau ada)

Kalau ada paket lain (misalnya Bronze, Silver, Gold), setiap paket harus punya profile sendiri:

```
# Profile untuk paket lain
/ppp profile
add name=Bronze local-address=10.10.20.1 remote-address=pool-bronze rate-limit=5M/5M
add name=Silver local-address=10.10.30.1 remote-address=pool-silver rate-limit=20M/20M
add name=Gold local-address=10.10.40.1 remote-address=pool-gold rate-limit=50M/50M

# IP Pools
/ip pool
add name=pool-bronze ranges=10.10.20.10-10.10.20.254
add name=pool-silver ranges=10.10.30.10-10.10.30.254
add name=pool-gold ranges=10.10.40.10-10.10.40.254
```

### Step 5: Restart PPPoE Session

Setelah konfigurasi profile di MikroTik, disconnect dan reconnect client PPPoE.

## Verifikasi

### 1. Cek di MikroTik

```
/ppp active print detail
```

Harusnya sekarang ada `Remote Address` yang valid (bukan 0.0.0.0).

### 2. Cek di RADIUS Dashboard

Buka: `http://[server-ip]:3000/admin/radius`

Widget "Active Sessions" harusnya menampilkan IP yang benar.

## Catatan Penting

1. **Nama Profile Harus Sama Persis**: 
   - Di database: `packages.pppoe_profile = 'UpTo-10M'`
   - Di MikroTik: `/ppp profile name=UpTo-10M`
   - Case sensitive!

2. **Setiap Paket Butuh Profile Sendiri**:
   - Paket Bronze → profile Bronze
   - Paket Silver → profile Silver
   - dst...

3. **IP Range Tidak Boleh Overlap**:
   - pool-10M: 10.10.10.x
   - pool-bronze: 10.10.20.x
   - pool-silver: 10.10.30.x
   - dst...

4. **Local Address = Gateway**:
   - Ini IP yang akan jadi gateway untuk client
   - Biasanya 1 IP pertama di range (.1)

## Troubleshooting Lanjutan

### Kalau masih disconnect setelah set profile:

1. **Cek MikroTik Logs**:
   ```
   /log print where topics~"pppoe"
   ```

2. **Cek RADIUS Secret**:
   - Di MikroTik: `/radius print`
   - Di billing app database: `nas_servers` table
   - Secret harus sama!

3. **Cek Firewall**:
   - Port 1812 (auth) harus terbuka
   - Port 1813 (accounting) harus terbuka

4. **Test dengan User Lain**:
   - Buat user baru untuk test
   - Pastikan ada di database customers
   - Set pppoe_profile yang benar

## Kesimpulan

RADIUS sudah bekerja dengan baik dan mengirim `Mikrotik-Group = UpTo-10M`.

**Masalah**: PPP Profile di MikroTik belum dikonfigurasi dengan benar (tidak ada IP pool).

**Solusi**: Konfigurasi PPP Profile di MikroTik dengan local-address dan remote-address yang valid.
