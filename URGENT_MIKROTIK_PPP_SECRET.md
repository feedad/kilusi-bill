# URGENT: MikroTik PPPoE Configuration Issue

## Problem Identified

MikroTik **TIDAK MENGIRIM PASSWORD** ke RADIUS server!

```
Available attributes: Service-Type, Framed-Protocol, NAS-Port, NAS-Port-Type, User-Name, Calling-Station-Id, Called-Station-Id, NAS-Port-Id, Acct-Session-Id, Vendor-Specific, NAS-Identifier, NAS-IP-Address, Message-Authenticator
```

**TIDAK ADA:** User-Password, CHAP-Password, atau MS-CHAP-Challenge

Ini berarti MikroTik menggunakan **PPP Secret local** bukan RADIUS authentication.

---

## Root Cause

MikroTik PPPoE Server memiliki 2 mode authentication:

### Mode 1: Local PPP Secret (CURRENT - WRONG!)
```
/ppp secret
print
```
Kalau ada user "apptest" di sini, MikroTik authenticate menggunakan local database dan hanya menggunakan RADIUS untuk **accounting** saja (bukan authentication).

### Mode 2: RADIUS Authentication (CORRECT - NEEDED!)
PPP Secret tidak ada di local, MikroTik forward authentication request ke RADIUS dengan password.

---

## Solution

### STEP 1: Check PPP Secret di MikroTik

```bash
/ppp secret print
```

**Kalau ada user "apptest" di list**, itu masalahnya!

Output contoh (WRONG):
```
0  name="apptest" password="xxxxx" service=pppoe profile=UpTo-10M
```

### STEP 2A: Remove Local PPP Secret (Recommended)

```bash
# Hapus local secret agar MikroTik menggunakan RADIUS
/ppp secret remove [find name=apptest]
```

Setelah dihapus, MikroTik akan:
1. Terima PPPoE dial-in dengan username "apptest"
2. **Forward ke RADIUS** untuk authentication (dengan password)
3. RADIUS validate username + password
4. Return Access-Accept dengan Mikrotik-Group
5. Assign IP dari profile "UpTo-10M"

### STEP 2B: Alternative - Configure RADIUS as Primary

Kalau mau keep local secret sebagai backup:

```bash
/ppp aaa
set use-radius=yes
```

Tapi ini masih bisa conflict. **Lebih baik hapus local secret**.

---

## Verify Configuration

### Check RADIUS Settings

```bash
/radius print detail
```

Should show:
```
service=ppp
address=<RADIUS-SERVER-IP>:1812,1813
secret=testing123
```

### Check AAA Settings

```bash
/ppp aaa print
```

Should show:
```
use-radius=yes
accounting=yes
interim-update=5m
```

### Check PPPoE Server

```bash
/interface pppoe-server server print detail
```

Should show:
```
default-profile=UpTo-10M  (or any default)
authentication=pap,chap,mschap1,mschap2
```

**IMPORTANT:** Authentication methods MUST include at least `pap` or `chap`!

---

## Expected Flow After Fix

1. Client dial PPPoE dengan username "apptest" + password "1234567"
2. MikroTik kirim Access-Request ke RADIUS **dengan User-Password**
3. RADIUS validate (username = apptest, password = 1234567)
4. RADIUS reply Access-Accept dengan:
   - Mikrotik-Group = UpTo-10M
   - Service-Type = Framed-User
   - Framed-Protocol = PPP
5. MikroTik apply profile "UpTo-10M"
6. Assign IP dari pool 10.10.10.10-254
7. Connection stable!

---

## Testing Commands

After removing local secret, test dari client:

```bash
# Di Linux client
pppoeconf
# atau
sudo pon dsl-provider user apptest password 1234567
```

Monitor RADIUS logs:
```bash
tail -f /home/kilusi-bill/logs/combined.log | grep apptest
```

Seharusnya akan muncul:
```
✅ Authentication successful: apptest
✅ Access-Accept for apptest with attributes:
   Service-Type: Framed-User
   Framed-Protocol: PPP
   Mikrotik-Group: UpTo-10M
```

---

## Summary

### Current Issue
- MikroTik punya PPP Secret local untuk "apptest"
- MikroTik tidak forward password ke RADIUS
- RADIUS tidak bisa validate password
- Connection gagal/disconnect

### Fix
1. **Remove PPP Secret local:** `/ppp secret remove [find name=apptest]`
2. **Enable RADIUS AAA:** `/ppp aaa set use-radius=yes`
3. **Test PPPoE connection** dari client
4. **Verify IP bukan 0.0.0.0**

Setelah fix ini, semua akan bekerja dengan sempurna! 🚀
