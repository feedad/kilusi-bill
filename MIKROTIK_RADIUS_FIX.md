# 🔧 SOLUSI: MikroTik Tidak Mengirim Password ke RADIUS

## 🔍 Root Cause
Access-Request dari MikroTik **tidak berisi password attributes** (User-Password, CHAP-Password, MS-CHAP-Password).

**Bukti dari log:**
```
Available attributes: Service-Type, Framed-Protocol, NAS-Port, User-Name, 
Calling-Station-Id, ..., NAS-IP-Address
❌ Missing: User-Password, CHAP-Password, CHAP-Challenge, MS-CHAP-*
```

Ini berarti MikroTik melakukan autentikasi PPPoE **secara lokal** (bukan via RADIUS), lalu hanya mengirim **authorization request** ke RADIUS untuk mendapatkan attributes saja.

## ✅ SOLUSI: Hapus PPP Secret Lokal

MikroTik akan **prioritaskan PPP secret lokal** di atas RADIUS. Jika user `apptest` ada di `/ppp secret`, maka:
1. MikroTik authenticate secara lokal (tanpa RADIUS)
2. Lalu kirim Access-Request ke RADIUS **tanpa password** hanya untuk mendapat reply attributes
3. RADIUS server kita reject karena tidak ada password

### Langkah 1: Hapus Semua PPP Secret untuk User apptest

**Di MikroTik:**
```
/ppp secret print where name=apptest
# Jika muncul entry, hapus:
/ppp secret remove [find name=apptest]

# Verifikasi sudah tidak ada:
/ppp secret print where name=apptest
# Harus kosong (0 results)
```

### Langkah 2: Pastikan AAA Menggunakan RADIUS

```
/ppp aaa print
# Harus:
# use-radius: yes
# accounting: yes

# Jika belum:
/ppp aaa set use-radius=yes accounting=yes
```

### Langkah 3: Verifikasi RADIUS Client Config

```
/radius print detail
# Pastikan:
# - service berisi "ppp"
# - address = IP RADIUS server (172.22.10.28 atau yang sesuai)
# - secret = "testing123" (atau sesuai settings.json)
# - authentication-port = 1812
# - accounting-port = 1813
```

### Langkah 4: Cek PPPoE Server Authentication

```
/interface pppoe-server server print
# authentication: harus include minimal salah satu dari pap,chap,mschap1,mschap2
# Jika kosong atau hanya mschap2:

/interface pppoe-server server set [find] authentication=pap,chap,mschap1,mschap2
```

### Langkah 5: Test Ulang

1. **Disconnect semua session lama:**
```
/ppp active print
/ppp active remove [find name=apptest]
```

2. **Reconnect client PPPoE** dengan:
   - Username: `apptest`
   - Password: `1234567`

3. **Monitor log MikroTik:**
```
/log print where topics~"ppp|radius"
```

Yang harus terlihat:
```
sent Access-Request ... for user apptest
received Access-Accept ... 
ppp,info user apptest authenticated
```

## 🎯 Ekspektasi Setelah Fix

### Di Log RADIUS Server:
```
📨 Access-Request from 172.22.10.156: apptest
🔍 CHAP verify: id=X, chal_len=16, resp=..., exp=...
✅ CHAP authentication successful: apptest
✅ Access-Accept for apptest with attributes:
   Mikrotik-Group: UpTo-10M
```

### Di MikroTik:
```
/ppp active print detail
# IP address harus dari pool: 10.10.10.10-254
# Bukan 0.0.0.0
```

### Di Dashboard:
- http://localhost:3000/admin/pelanggan-online
- Session apptest dengan IP valid dan session time counting

## 🚨 Troubleshooting

### Jika masih tidak ada password attributes:

**1. Cek apakah ada default PPP profile dengan local authentication:**
```
/ppp profile print detail
# Cari "use-encryption", "only-one", dan pastikan tidak ada local-address yang force auth lokal
```

**2. Cek RADIUS service includes ppp:**
```
/radius print
# service harus: login,ppp,... (minimal ada ppp)
# Jika tidak ada ppp:
/radius set [find] service=ppp,wireless,hotspot,login
```

**3. Test dengan PAP dulu (lebih sederhana untuk debug):**
```
/interface pppoe-server server set [find] authentication=pap

# Client juga set PAP only
# Test sekali
# Jika berhasil → RADIUS OK, bisa lanjut ke CHAP
# Jika tetap tidak ada password → masalah config MikroTik fundamental
```

**4. Factory test tanpa profile kompleks:**
```
# Buat PPP profile minimal:
/ppp profile add name=radius-test local-address=10.10.10.1 remote-address=10.10.10.100

# Set sebagai default:
/interface pppoe-server server set [find] default-profile=radius-test

# Test
```

**5. Pastikan tidak ada firewall/mangling yang intercept:**
```
/ip firewall filter print where dst-port=1812
/ip firewall filter print where dst-port=1813
# Harus allow atau tidak ada rule yang DROP/REJECT
```

## 📋 Checklist Lengkap

- [ ] `/ppp secret` tidak ada entry `apptest` (atau user lain yang mau test)
- [ ] `/ppp aaa` use-radius=yes, accounting=yes
- [ ] `/radius` service berisi "ppp", secret benar, port 1812/1813
- [ ] `/interface pppoe-server server` authentication minimal pap atau chap
- [ ] `/ppp profile` untuk profile UpTo-10M ada local-address dan remote-address/pool
- [ ] Firewall tidak block UDP 1812/1813 ke RADIUS server
- [ ] Client PPPoE config username/password benar

## 🔄 Rekomendasi Order Eksekusi

```bash
# 1. Di MikroTik
/ppp secret remove [find name=apptest]
/ppp aaa set use-radius=yes accounting=yes
/radius print detail
/interface pppoe-server server set [find] authentication=pap,chap

# 2. Restart monitor RADIUS
# Terminal di server:
cd /home/kilusi-bill
node monitor-radius-auth.js

# 3. Test koneksi client
# (dengan username apptest, password 1234567)

# 4. Lihat log - harus ada User-Password atau CHAP-Password kali ini
```

---

**Kesimpulan:** MikroTik saat ini authenticate user secara **lokal** (kemungkinan besar ada PPP secret tersembunyi atau misconfigured AAA), sehingga RADIUS hanya menerima request untuk attributes, bukan authentication. Fix utama: **hapus semua local PPP secret dan paksa full RADIUS authentication**.
