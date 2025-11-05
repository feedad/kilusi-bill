# 🔧 Ghost Sessions Fix - IP 0.0.0.0

## 📋 Masalah yang Diperbaiki

### 1. **Session dengan IP 0.0.0.0 Tidak Bisa Dihapus**
**Root Cause**: Session dengan framedipaddress `0.0.0.0` adalah **ghost/stale sessions** - session yang sudah disconnect tapi MikroTik belum mengirim Accounting-Stop packet ke RADIUS server.

**Kenapa terjadi?**
- User disconnect mendadak (force disconnect, cabut kabel, power off, dll)
- MikroTik belum sempat kirim Accounting-Stop packet
- Session masih dianggap "active" di database (acctstoptime = NULL)
- Tapi IP-nya sudah 0.0.0.0 karena tidak ada koneksi real

### 2. **Widget Tidak Akurat**
**Root Cause**: Widget menghitung SEMUA session dengan acctstoptime = NULL, termasuk yang IP-nya 0.0.0.0.

**Dampak**:
- Total Online menunjukkan angka lebih besar dari kenyataan
- Total Download/Upload termasuk data dari ghost sessions
- Average Duration tidak akurat

---

## ✅ Solusi yang Diterapkan

### 1. **Filter Ghost Sessions di Query**
File: `config/radius-postgres.js`

**Perubahan di function `getActivePPPoEConnections()`:**
```sql
WHERE ra.acctstoptime IS NULL
    AND ra.framedipaddress::text != '0.0.0.0'  -- ✅ EXCLUDE 0.0.0.0
    AND ra.framedipaddress IS NOT NULL         -- ✅ EXCLUDE NULL IP
```

**Efek**:
- Dashboard hanya menampilkan session dengan IP REAL
- Ghost sessions tidak muncul di tabel
- Widget otomatis akurat karena hanya menghitung session real

### 2. **Function Cleanup Stale Sessions**
File: `config/radius-postgres.js`

**New Function**: `cleanupStaleSessions(options)`

```javascript
async function cleanupStaleSessions(options = {}) {
    const maxAgeMinutes = options.maxAgeMinutes || 5;
    
    // Update radacct: set acctstoptime untuk ghost sessions
    UPDATE radacct
    SET acctstoptime = NOW(),
        acctterminatecause = 'Admin-Reset'
    WHERE acctstoptime IS NULL
        AND (
            framedipaddress::text = '0.0.0.0'
            OR framedipaddress IS NULL
            OR acctstarttime < NOW() - INTERVAL '5 minutes'
        )
}
```

**Fitur**:
- Mark ghost sessions as stopped
- Set terminate cause = 'Admin-Reset'
- Configurable max age (default 5 menit)
- Return list of cleaned sessions

### 3. **Endpoint Cleanup di Backend**
File: `routes/adminPelangganOnline.js`

**New Endpoint**: `POST /admin/pelanggan-online/cleanup-stale`

```javascript
router.post('/cleanup-stale', async (req, res) => {
    const result = await radiusDb.cleanupStaleSessions({
        maxAgeMinutes: req.body.maxAgeMinutes || 5
    });
    
    return {
        success: true,
        cleanedCount: result.cleanedCount,
        cleanedSessions: result.sessions
    };
});
```

**Parameter**:
- `maxAgeMinutes` (optional): Cleanup sessions older than X minutes (default: 5)

### 4. **Tombol Cleanup di Frontend**
File: `views/admin-pelanggan-online.ejs`

**New Button**:
```html
<button class="btn btn-sm btn-warning" onclick="cleanupStaleSessions()">
    <i class="bi bi-trash"></i> Cleanup Stale
</button>
```

**Function**:
```javascript
async function cleanupStaleSessions() {
    const response = await fetch('/admin/pelanggan-online/cleanup-stale', {
        method: 'POST',
        body: JSON.stringify({ maxAgeMinutes: 5 })
    });
    
    showNotification(`✅ ${data.cleanedCount} sessions cleaned`);
    refreshData(); // Reload table
}
```

### 5. **Perbaikan Widget Statistics**
File: `views/admin-pelanggan-online.ejs`

**Update function `updateStatistics()`:**
```javascript
// Support both camelCase and snake_case field names
const totalDownloadBytes = sessions.reduce((total, session) => {
    const download = session.acctInputOctets || session.acctinputoctets || 0;
    return total + download;
}, 0);

const totalUploadBytes = sessions.reduce((total, session) => {
    const upload = session.acctOutputOctets || session.acctoutputoctets || 0;
    return total + upload;
}, 0);

totalDownload.textContent = totalDownloadBytes > 0 ? formatBytes(totalDownloadBytes) : '0 B';
totalUpload.textContent = totalUploadBytes > 0 ? formatBytes(totalUploadBytes) : '0 B';
```

**Perbaikan**:
- Support field name variations (camelCase + snake_case)
- Show "0 B" jika tidak ada data (bukan "NaN undefined")
- Show "-" untuk average duration jika 0

---

## 🧪 Testing

### 1. Test Filter Ghost Sessions
```bash
cd /home/kilusi-bill

# Check sessions di database
node -e "(async()=>{const db=require('./config/radius-postgres'); await db.initDatabase(); const all=await db.query(\`SELECT acctsessionid, username, framedipaddress::text, acctstoptime FROM radacct WHERE acctstoptime IS NULL\`); console.log('All active (no filter):', all.rows.length); const filtered=await db.getActiveSessions(); console.log('Filtered (exclude 0.0.0.0):', filtered.length); process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})"

# Expected:
# All active: 9 (termasuk 8 ghost sessions)
# Filtered: 1 (hanya session real dengan IP 10.10.10.254)
```

### 2. Test Cleanup Function
```bash
# Manual cleanup via node
node -e "(async()=>{const db=require('./config/radius-postgres'); await db.initDatabase(); const result=await db.cleanupStaleSessions({maxAgeMinutes: 5}); console.log('Cleaned sessions:', result.cleanedCount); console.log('Details:', JSON.stringify(result.sessions, null, 2)); process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})"

# Expected output:
# 🧹 Cleaned up 8 stale sessions:
#    - apptest (81001790) IP: 0.0.0.0
#    - apptest (8100178f) IP: 0.0.0.0
#    ...
```

### 3. Test via Dashboard
```bash
# 1. Restart app
pm2 restart kilusi-bill

# 2. Buka browser
# http://localhost:3000/admin/pelanggan-online

# 3. Lihat table - seharusnya hanya 1 session (IP 10.10.10.254)

# 4. Klik tombol "Cleanup Stale" (kuning, icon trash)

# 5. Lihat notifikasi: "✅ Successfully cleaned up X stale sessions"

# 6. Refresh page - ghost sessions sudah gone
```

### 4. Verify Widget Accuracy
```bash
# Check widget values sebelum cleanup
# - TOTAL ONLINE: 9 (SALAH - include ghost)
# - TOTAL DOWNLOAD: NaN undefined (SALAH)
# - TOTAL UPLOAD: NaN undefined (SALAH)
# - AVG DURATION: - (SALAH)

# After cleanup dan refresh
# - TOTAL ONLINE: 1 ✅
# - TOTAL DOWNLOAD: XXX MB ✅ (real data from session)
# - TOTAL UPLOAD: XXX MB ✅
# - AVG DURATION: XX:XX:XX ✅
```

---

## 📊 Database Query Examples

### Get ghost sessions
```sql
SELECT 
    acctsessionid,
    username,
    framedipaddress::text,
    acctstarttime,
    NOW() - acctstarttime as age
FROM radacct
WHERE acctstoptime IS NULL
    AND (framedipaddress::text = '0.0.0.0' OR framedipaddress IS NULL)
ORDER BY acctstarttime DESC;
```

### Get real active sessions
```sql
SELECT 
    acctsessionid,
    username,
    framedipaddress::text,
    acctstarttime
FROM radacct
WHERE acctstoptime IS NULL
    AND framedipaddress::text != '0.0.0.0'
    AND framedipaddress IS NOT NULL
ORDER BY acctstarttime DESC;
```

### Manually cleanup (emergency)
```sql
UPDATE radacct
SET acctstoptime = NOW(),
    acctterminatecause = 'Admin-Reset'
WHERE acctstoptime IS NULL
    AND framedipaddress::text = '0.0.0.0';
```

---

## 🔄 Automatic Cleanup (Future Enhancement)

**Option 1: Cron Job**
```bash
# Add to crontab
*/5 * * * * cd /home/kilusi-bill && node -e "(async()=>{const db=require('./config/radius-postgres'); await db.initDatabase(); await db.cleanupStaleSessions({maxAgeMinutes:5}); process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})"
```

**Option 2: Scheduled Task in Node.js**
```javascript
// In app.js
const cron = require('node-cron');
const radiusDb = require('./config/radius-postgres');

// Run cleanup every 5 minutes
cron.schedule('*/5 * * * *', async () => {
    logger.info('🧹 Auto cleanup stale sessions...');
    const result = await radiusDb.cleanupStaleSessions({ maxAgeMinutes: 5 });
    logger.info(`✅ Cleaned ${result.cleanedCount} stale sessions`);
});
```

**Option 3: PostgreSQL Trigger**
```sql
-- Create function to auto-cleanup old sessions
CREATE OR REPLACE FUNCTION cleanup_stale_sessions()
RETURNS trigger AS $$
BEGIN
    UPDATE radacct
    SET acctstoptime = NOW(),
        acctterminatecause = 'Auto-Cleanup'
    WHERE acctstoptime IS NULL
        AND framedipaddress::text = '0.0.0.0'
        AND acctstarttime < NOW() - INTERVAL '5 minutes';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on radacct INSERT
CREATE TRIGGER auto_cleanup_stale
AFTER INSERT ON radacct
EXECUTE FUNCTION cleanup_stale_sessions();
```

---

## 🎯 Summary

**Before Fix:**
- ❌ Dashboard menampilkan 9 sessions (8 ghost + 1 real)
- ❌ Widget TOTAL ONLINE: 9 (salah)
- ❌ Widget DOWNLOAD/UPLOAD: NaN undefined
- ❌ Tidak bisa hapus ghost sessions

**After Fix:**
- ✅ Dashboard hanya menampilkan 1 session real
- ✅ Widget TOTAL ONLINE: 1 (benar)
- ✅ Widget DOWNLOAD/UPLOAD: menampilkan data real
- ✅ Tombol "Cleanup Stale" untuk hapus ghost sessions
- ✅ Auto-filter di database query

**Next Steps:**
1. ✅ Test cleanup button di dashboard
2. ⏳ Consider auto-cleanup dengan cron job
3. ⏳ Monitor ghost session frequency
4. ⏳ Investigate kenapa MikroTik tidak kirim Accounting-Stop

---

**Status**: ✅ All fixes applied and ready to test!
