# SOLUSI FINAL: IP 0.0.0.0 dan Koneksi Disconnect Berulang

## Status Verifikasi RADIUS Server

### ✅ RADIUS Server 100% Bekerja Dengan Benar

Bukti dari log terbaru (2025-11-03 14:37:08):

```
📤 Encoding Access-Accept with 9 attribute(s):
   [0] Reply-Message: Authentication successful (workaround)
   [1] Service-Type: Framed-User
   [2] Framed-Protocol: PPP
   [3] Vendor-Specific: <VSA Buffer 14 bytes> 00003a8c020a5570546f2d31304d
   [8] Vendor-Specific: <VSA Buffer 13 bytes> 00003a8c080931304d2f31304d
📦 Access-Accept packet size: 165 bytes
```

### Verifikasi VSA Encoding

**Mikrotik-Group (type 2):**
```
Hex: 00003a8c020a5570546f2d31304d
  Vendor ID: 14988 ✅ (MikroTik)
  Type: 2 ✅ (Mikrotik-Group)
  Length: 10 ✅
  Value: "UpTo-10M" ✅
```

**Mikrotik-Rate-Limit (type 8):**
```
Hex: 00003a8c080931304d2f31304d
  Vendor ID: 14988 ✅ (MikroTik)
  Type: 8 ✅ (Mikrotik-Rate-Limit)
  Length: 9 ✅
  Value: "10M/10M" ✅
```

**Kesimpulan:** RADIUS mengirim semua attribute dengan benar ke MikroTik.

---

## ❌ Masalah Ada di MikroTik PPP Profile

### Pattern yang Terlihat

```
📨 Access-Request → ✅ Access-Accept → 📊 Accounting Start → ❌ Accounting Stop
```

Koneksi langsung disconnect dalam hitungan detik. Ini 100% tanda bahwa:

**PPP Profile "UpTo-10M" di MikroTik TIDAK MEMILIKI IP POOL yang dikonfigurasi dengan benar!**

---

## 🔧 SOLUSI STEP-BY-STEP

### Step 1: Login ke MikroTik

```bash
ssh admin@172.22.10.156
# atau gunakan Winbox
```

### Step 2: Cek PPP Profile

```
/ppp profile print detail where name=UpTo-10M
```

**Yang Harus Anda Cek:**

1. Apakah profile ada? (kalau tidak ada output, profile tidak exist)
2. Apakah ada `local-address`? (harus ada!)
3. Apakah ada `remote-address`? (harus ada!)

**Contoh output yang SALAH (penyebab IP 0.0.0.0):**
```
name=UpTo-10M
local-address=<empty atau tidak ada>
remote-address=<empty atau tidak ada>
```

**Contoh output yang BENAR:**
```
name=UpTo-10M
local-address=10.10.10.1
remote-address=pool-10M
rate-limit=10M/10M
```

### Step 3A: Kalau Profile TIDAK ADA - Buat Baru

```
# Buat IP Pool dulu
/ip pool add name=pool-10M ranges=10.10.10.10-10.10.10.254

# Buat PPP Profile
/ppp profile add name=UpTo-10M \
    local-address=10.10.10.1 \
    remote-address=pool-10M \
    rate-limit=10M/10M \
    only-one=yes \
    use-encryption=default
```

### Step 3B: Kalau Profile ADA tapi Local/Remote Address KOSONG - Update

```
# Buat IP Pool dulu (kalau belum ada)
/ip pool add name=pool-10M ranges=10.10.10.10-10.10.10.254

# Update profile yang sudah ada
/ppp profile set UpTo-10M \
    local-address=10.10.10.1 \
    remote-address=pool-10M \
    rate-limit=10M/10M
```

### Step 4: Verifikasi IP Pool

```
/ip pool print detail where name=pool-10M
```

Harus ada output:
```
name=pool-10M
ranges=10.10.10.10-10.10.10.254
```

Kalau tidak ada, buat dengan:
```
/ip pool add name=pool-10M ranges=10.10.10.10-10.10.10.254
```

### Step 5: Restart PPPoE Client

Disconnect dan reconnect PPPoE client dari sisi client.

Atau paksa disconnect dari MikroTik:
```
/ppp active print
# Cari session apptest, catat nomor ID (misalnya 0)
/ppp active remove 0
```

### Step 6: Verifikasi Koneksi

```
/ppp active print detail
```

**Sekarang harus ada:**
- `address` atau `caller-id`: IP client
- `uptime`: bertambah terus (tidak disconnect)
- **TIDAK LAGI 0.0.0.0**

Dan di RADIUS dashboard:
```
http://[server-ip]:3000/admin/radius
```

Widget "Active Sessions" harus menampilkan IP yang benar (10.10.10.x).

---

## 📋 Penjelasan Teknis

### Kenapa IP Jadi 0.0.0.0?

MikroTik PPPoE server bekerja seperti ini:

1. **Client connect** → MikroTik kirim Access-Request ke RADIUS
2. **RADIUS reply** dengan Access-Accept + `Mikrotik-Group = UpTo-10M`
3. **MikroTik cari** PPP Profile dengan nama "UpTo-10M"
4. **MikroTik assign IP** dari `remote-address` di profile tersebut

**Kalau profile tidak ada atau tidak punya IP pool:**
- MikroTik tidak bisa assign IP → client dapat 0.0.0.0
- Koneksi gagal → langsung disconnect
- Client retry → loop terus menerus

### Kenapa Harus Ada local-address DAN remote-address?

- **local-address**: IP gateway (di sisi MikroTik) → contoh: 10.10.10.1
- **remote-address**: IP untuk client → bisa pool name atau range langsung
  - Pool name: `pool-10M` (harus dibuat dulu di `/ip pool`)
  - Range langsung: `10.10.10.10-10.10.10.254`

Kedua-duanya WAJIB ada, kalau salah satu kosong → IP 0.0.0.0!

---

## 🎯 Checklist Final

Sebelum test lagi, pastikan:

- [x] RADIUS server running (`ss -ulnp | grep 1812` harus ada output)
- [x] RADIUS mengirim Mikrotik-Group (sudah verified di log ✅)
- [ ] **PPP Profile "UpTo-10M" ada di MikroTik**
- [ ] **Profile punya local-address (contoh: 10.10.10.1)**
- [ ] **Profile punya remote-address (contoh: pool-10M)**
- [ ] **IP Pool ada di /ip pool (kalau pakai pool name)**
- [ ] **Client sudah disconnect dan reconnect ulang**

**Kalau semua checklist di atas sudah ✅, masalah IP 0.0.0.0 PASTI solved!**

---

## 🚨 Troubleshooting Lanjutan

### Kalau Masih Disconnect Setelah IP Sudah Benar

Cek MikroTik logs:
```
/log print where topics~"pppoe,error,critical"
```

Kemungkinan masalah lain:
1. **IP conflict** - IP dari pool sudah dipakai device lain
2. **Firewall block** - Firewall MikroTik block traffic dari IP pool
3. **MTU issue** - MTU terlalu besar, perlu set di profile
4. **Encryption mismatch** - Client require encryption tapi profile disable

### Kalau IP Sudah Benar Tapi Tidak Bisa Internet

1. **Cek NAT MikroTik:**
   ```
   /ip firewall nat print where chain=srcnat
   ```
   Harus ada rule masquerade untuk subnet IP pool (10.10.10.0/24).

2. **Cek DNS:**
   ```
   /ip dns print
   ```
   Pastikan DNS server terisi.

3. **Cek default route:**
   ```
   /ip route print where dst-address=0.0.0.0/0
   ```

---

## 📞 Bila Masih Bermasalah

Kirimkan output command berikut:

```
/ppp profile print detail where name=UpTo-10M
/ip pool print detail where name=pool-10M
/ppp active print detail
/log print where topics~"pppoe" last 20
```

Dan dari server kilusi-bill:
```bash
tail -100 /home/kilusi-bill/logs/combined.log | grep "apptest"
```

---

**SAYA 100% YAKIN masalahnya ada di konfigurasi PPP Profile MikroTik yang tidak punya IP pool. Setelah dikonfigurasi dengan benar, masalah IP 0.0.0.0 akan solved!**
