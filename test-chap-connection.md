# Test CHAP Connection - Step by Step

## Password Konfirmasi
✅ Password apptest sudah match antara radcheck dan billing: **1234567**

## Langkah Testing (Tanpa Workaround)

### 1. Pastikan App Running
```bash
cd /home/kilusi-bill
npm run dev
# atau jika sudah running, restart:
# pkill -f "node.*app.js" && npm run dev
```

### 2. Di PPPoE Client (MikroTik atau Perangkat Lain)
Pastikan:
- Username: `apptest`
- Password: `1234567` (case-sensitive, tidak ada spasi)
- Authentication: izinkan PAP dan CHAP (pap,chap atau chap saja)

Contoh di MikroTik client:
```
/interface pppoe-client
add interface=ether1 name=test-pppoe user=apptest password=1234567 \
    add-default-route=no use-peer-dns=no disabled=no
```

### 3. Monitor Log Server RADIUS
Saat koneksi dimulai, perhatikan log server untuk:

**Yang diharapkan muncul:**
```
📨 Access-Request from 172.22.10.156: apptest
🔍 Received attributes: ...
CHAP verify: id=X, chal_len=16, resp=<hex>, exp=<hex>
✅ CHAP authentication successful: apptest
✅ Access-Accept for apptest with attributes:
   Service-Type: Framed-User
   Framed-Protocol: PPP
   Mikrotik-Group: UpTo-10M
```

**Jika gagal, akan muncul:**
```
❌ CHAP authentication failed for user: apptest
❌ Access-Reject ...
```
Dan kita bisa bandingkan `resp=` vs `exp=` di log CHAP verify.

### 4. Cek di MikroTik
```
/ppp active print detail
# Lihat IP address - harus BUKAN 0.0.0.0
# Harus dari range 10.10.10.10-254 (pool UpTo-10M)

/log print where topics~"ppp|radius"
# Cari "authenticated" atau "CHAP Success"
```

### 5. Cek Dashboard
- Buka http://localhost:3000/admin/pelanggan-online
- Harus ada session apptest dengan IP yang valid (bukan 0.0.0.0)
- Session time mulai count up

## Troubleshooting

### Jika CHAP gagal tapi password sudah benar
1. Cek di log server: bandingkan `resp=` dan `exp=` hex digest
2. Jika berbeda → kemungkinan:
   - CHAP-Challenge tidak sesuai (sudah ditangani fallback)
   - CHAP-ID berbeda (debug log menunjukkan)
   - Password encoding issue (seharusnya utf8)

### Jika masih 0.0.0.0
1. Cek Access-Accept terkirim dan berisi Mikrotik-Group
2. Verifikasi PPP profile "UpTo-10M" ada di MikroTik:
   ```
   /ppp profile print detail where name=UpTo-10M
   ```
3. Pastikan remote-address/pool configured

### Jika session tidak tercatat
1. Cek accounting start/stop di log
2. Verifikasi uniqueId consistency
3. Lihat tabel radacct untuk ghost sessions

## Next Steps Setelah Berhasil
- [ ] Verifikasi IP assignment stabil
- [ ] Confirm accounting Start/Stop records
- [ ] Test disconnect/reconnect (no ghost sessions)
- [ ] Monitor bandwidth usage updates
- [ ] Deploy to production users
