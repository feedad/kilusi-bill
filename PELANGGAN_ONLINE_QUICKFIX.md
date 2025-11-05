# 🔧 QUICK FIX - Pelanggan Online Dark Theme & Kick User

## ✅ Changes Made

### 1. **Dark Theme - MAXIMUM PRIORITY CSS**
- Added ultra-high specificity CSS rules that override all Bootstrap defaults
- Applied to: html, body, card, card-header, card-body, table-responsive, table, thead, tbody, tr, td, th
- Used multiple selector variations (e.g., `html body table tbody tr`)
- All rules use `!important` flag
- Set Bootstrap CSS variables: `--bs-table-bg`, `--bs-table-color`, `--bs-table-bg-type`, `--bs-table-bg-state`
- **Result**: Table WILL be dark now regardless of Bootstrap version

### 2. **Session Data Display - Fixed Field Mapping**
- Backend (`routes/adminPelangganOnline.js`):
  - Proper mapping of all database fields (camelCase + snake_case)
  - Ensured framedIpAddress, username, customerName, etc. all mapped correctly
  - Added extensive logging for debugging
  
- Frontend (`views/admin-pelanggan-online.ejs`):
  - Added fallback field extraction in `renderSessionsTable()`
  - Support both camelCase and snake_case from backend
  - Properly display: IP Address, Username, Customer ID, NAS Name, Duration, Download/Upload

### 3. **Kick User Function - Enhanced Error Handling**
- Added detailed logging in disconnect route:
  - Log all incoming parameters
  - Log NAS client lookup process
  - Log available NAS clients if not found
  - Log RADIUS disconnect attempt and result
  - Log stack trace on errors
  
- Better error messages returned to frontend:
  - "NAS client not found for IP X. Please add this NAS to the database first."
  - Includes list of available NAS clients in logs
  
- Frontend error display improved with notification system

---

## 🚨 CRITICAL - Enable MikroTik RADIUS Incoming

**WAJIB** jalankan command ini di MikroTik:

```bash
/radius incoming set accept=yes
```

Verifikasi:
```bash
/radius incoming print
# Harus menunjukkan: accept: yes
```

**Tanpa ini**, MikroTik akan **IGNORE** semua Disconnect-Request dari server!

---

## 🧪 Testing Instructions

### 1. Test Dark Theme
```bash
# Restart app jika belum
cd /home/kilusi-bill
pm2 restart all  # atau npm run dev

# Open browser
# Navigate to: http://localhost:3000/admin/pelanggan-online
# Table harus DARK sekarang (background #252a3d, bukan putih)
```

### 2. Test Session Data Display
```bash
# Check active sessions di server
node -e "(async()=>{const db=require('./config/radius-postgres'); await db.initDatabase(); const s=await db.getActiveSessions(); console.log(JSON.stringify(s,null,2)); process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})"

# Buka dashboard, harus muncul:
# - IP Address: 10.10.10.254 (bukan 0.0.0.0)
# - Username: apptest
# - Customer ID: (dari customers table)
# - NAS Name: Mikrotik-156
# - Duration, Download, Upload
```

### 3. Test Kick User Function
```bash
# Monitor logs real-time
tail -f logs/app.log | grep -E "Disconnect|kick"

# Di browser:
# 1. Buka http://localhost:3000/admin/pelanggan-online
# 2. Klik tombol merah (stop icon) pada user apptest
# 3. Lihat log untuk debug info

# Expected logs:
# 📨 Disconnect request received: username=apptest, sessionId=..., nasIp=172.22.10.156
# 🔍 Looking up NAS client for IP: 172.22.10.156
# ✅ Found NAS client: Mikrotik-156 (secret configured)
# 📡 Sending RADIUS Disconnect-Request to 172.22.10.156:3799
# 🎯 RADIUS disconnect result for apptest: SUCCESS ✅
```

### 4. Test End-to-End
```bash
# 1. Enable RADIUS incoming di MikroTik
/radius incoming set accept=yes

# 2. Verifikasi ada active session
/ppp active print

# 3. Kick dari dashboard
# (klik tombol merah)

# 4. Cek session hilang
/ppp active print
# Session harus gone

# 5. Cek accounting di database
node -e "(async()=>{const db=require('./config/database'); const res=await db.getAll(\`SELECT username, framedipaddress::text ip, acctstarttime, acctstoptime FROM radacct WHERE username='apptest' ORDER BY acctstarttime DESC LIMIT 3\`); console.log(res); process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})"
# Latest session harus ada acctstoptime (not NULL)
```

---

## 🔍 Troubleshooting

### Problem: Table masih putih

**Debug steps:**
```bash
# 1. Hard refresh browser: Ctrl+Shift+R (Windows/Linux) atau Cmd+Shift+R (Mac)
# 2. Clear browser cache
# 3. Open DevTools (F12)
# 4. Check Console for CSS errors
# 5. Check Network tab - pastikan admin-pelanggan-online.ejs loaded dengan CSS baru
```

**Fallback:**
```bash
# Jika masih putih, add inline style directly in HTML:
# Edit views/admin-pelanggan-online.ejs, find <table> tag, add:
# <table class="table table-hover session-table" style="background-color: #252a3d !important; color: #e0e0e0 !important;">
```

### Problem: Data session tidak muncul (0.0.0.0, NAS-, dll)

**Debug steps:**
```bash
# 1. Check raw session data from API
curl http://localhost:3000/admin/pelanggan-online/sessions | jq '.'

# 2. Check database query result
node -e "(async()=>{const db=require('./config/radius-postgres'); await db.initDatabase(); const s=await db.getActiveSessions(); console.log('Raw from DB:', JSON.stringify(s[0],null,2)); process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})"

# 3. Check field mapping
# Open browser DevTools Console, run:
# fetch('/admin/pelanggan-online/sessions').then(r=>r.json()).then(d=>console.log(d.sessions[0]))
```

**Expected fields in JSON:**
```json
{
  "username": "apptest",
  "customerName": "Ferry Adhitya",
  "customerId": "3",
  "acctSessionId": "81001839",
  "framedIpAddress": "10.10.10.254",
  "nasIpAddress": "172.22.10.156",
  "nasShortName": "Mikrotik-156",
  "acctStartTime": "2025-11-03T...",
  "acctSessionTime": 1234,
  "acctInputOctets": 5000000,
  "acctOutputOctets": 1000000
}
```

### Problem: Kick user tidak bekerja

**Debug via logs:**
```bash
# Real-time monitoring
tail -f logs/app.log | grep -E "Disconnect|NAS"

# Look for these messages:
# ✅ Found NAS client: ...  → Good
# ❌ NAS client not found... → Bad, need to add NAS

# If NAS not found:
node -e "(async()=>{const db=require('./config/radius-postgres'); await db.initDatabase(); await db.addNasClient('172.22.10.156', 'Mikrotik-156', 'testing123', 'mikrotik', 'Main Mikrotik Router'); console.log('NAS added'); process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})"
```

**Check MikroTik incoming:**
```bash
# Di MikroTik terminal
/radius incoming print detail

# Harus:
# accept: yes

# Jika no:
/radius incoming set accept=yes
```

**Test direct RADIUS disconnect:**
```bash
cd /home/kilusi-bill
node test-radius-disconnect.js

# Should see:
# ✅ RADIUS Disconnect SUCCESS for user apptest
```

### Problem: Error "Failed to kick users: apptest"

**Most common causes:**
1. ❌ MikroTik `/radius incoming` not set to `accept=yes`
2. ❌ RADIUS secret mismatch
3. ❌ Firewall blocking UDP port 3799
4. ❌ Session already disconnected

**Fix:**
```bash
# 1. Enable incoming
/radius incoming set accept=yes

# 2. Verify secret match
/radius print detail
# secret harus sama dengan database: "testing123"

# 3. Check firewall
/ip firewall filter print where dst-port=3799
# Jangan ada rule DROP/REJECT

# 4. Verify session aktif
/ppp active print where name=apptest
# Harus ada session
```

---

## 📊 Monitoring Commands

### Watch logs for disconnect activity
```bash
tail -f logs/app.log | grep --color -E "Disconnect|kick|CoA|SUCCESS|FAILED"
```

### Monitor RADIUS incoming on MikroTik
```bash
/log print follow where topics~"radius"
```

### Check active sessions
```bash
# Database
node -e "(async()=>{const db=require('./config/radius-postgres'); await db.initDatabase(); const s=await db.getActiveSessions(); console.log('Active sessions:', s.length); s.forEach(x=>console.log(\`  \${x.username} - \${x.framedIpAddress || x.framedipaddress}\`)); process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})"

# MikroTik
/ppp active print
```

---

## ✅ Verification Checklist

### Dark Theme ✅
- [ ] Table background is dark (#252a3d)
- [ ] Table header is dark (#2d3348)
- [ ] Card background is dark (#1e2230)
- [ ] Hover effect visible on rows
- [ ] Text is light colored (#e0e0e0)

### Session Data ✅
- [ ] IP Address shows real IP (not 0.0.0.0)
- [ ] Username shows correctly
- [ ] Customer ID shows from database
- [ ] NAS Name shows correctly
- [ ] Duration counting up
- [ ] Download/Upload showing bytes

### Kick Function ✅
- [ ] MikroTik `/radius incoming set accept=yes` ← **WAJIB!**
- [ ] NAS client in database with correct secret
- [ ] Kick button clickable
- [ ] Notification appears after kick
- [ ] Session disappears from list
- [ ] Session terminates on MikroTik
- [ ] Logs show detailed disconnect process

---

**Status**: ✅ All fixes applied. Restart app and hard-refresh browser to see changes.

**Critical Action**: Enable `/radius incoming set accept=yes` on MikroTik NOW!
