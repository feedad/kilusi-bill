# Fix: Active Sessions Not Showing in Dashboard

## Problem
Dashboard `/admin/pelanggan-online` shows "No active sessions" despite MikroTik having an active PPPoE connection.

## Root Cause Analysis

### What We Found:
1. **Database Status**: `SELECT COUNT(*) FROM radacct WHERE acctstoptime IS NULL` returns **0** (no active sessions)
2. **FreeRADIUS Detail Files**: Show accounting packets ARE being received from MikroTik:
   - Session ID: `81100005`
   - Username: `apptest`
   - IP: `10.10.10.254`
   - Interim-Update packets received every 5 minutes (last at 11:26:15)
3. **Problem**: Accounting packets are written to detail files but **NOT to PostgreSQL database**

### Why This Happened:
- PPPoE session `81100005` started at **10:46:15** (Accounting-Start received)
- FreeRADIUS was restarted at **10:36:40** (before the session started)
- However, there may have been **earlier restarts** or configuration issues that caused the Start packet to fail
- The session continues sending Interim-Update packets, but FreeRADIUS can't update a session that was never inserted

## Solution

### Quick Fix (Force Fresh Session):
**Disconnect and reconnect the PPPoE session on MikroTik** to trigger a new Accounting-Start packet:

1. **Option A - Via MikroTik RouterOS:**
   ```
   /ppp active print
   /ppp active remove [find name="apptest"]
   ```
   Then reconnect from client side

2. **Option B - Via RADIUS Disconnect (if working):**
   ```bash
   curl -X POST http://localhost:3000/admin/pelanggan-online/disconnect \
     -H 'Content-Type: application/json' \
     -d '{
       "username": "apptest",
       "sessionId": "81100005",
       "nasIp": "172.22.10.156",
       "framedIp": "10.10.10.254",
       "callingStationId": "C4:69:F0:66:DB:FD",
       "nasPortId": "vlan201"
     }'
   ```

3. **Option C - Client-side reconnect:**
   - Ask user to disconnect and reconnect their PPPoE connection
   - Or wait for session timeout and auto-reconnect

### Verification Steps:

1. **After reconnection, check detail file for new Start packet:**
   ```bash
   docker exec kilusi-freeradius tail -100 /var/log/freeradius/radacct/172.22.10.156/detail-$(date +%Y%m%d) | grep "Acct-Status-Type = Start" -A 15
   ```

2. **Check database for new session:**
   ```bash
   cd /home/kilusi-bill && node -e "(async()=>{
     const db=require('./config/database');
     const open=await db.getOne('SELECT COUNT(*)::int AS cnt FROM radacct WHERE acctstoptime IS NULL');
     console.log('Active sessions:', open.cnt);
     if(open.cnt > 0) {
       const sess=await db.getAll('SELECT username,acctsessionid,framedipaddress::text ip,acctstarttime FROM radacct WHERE acctstoptime IS NULL');
       console.log(sess);
     }
     process.exit(0);
   })()"
   ```

3. **Refresh dashboard:**
   - Open http://localhost:3000/admin/pelanggan-online
   - Should see active session appear within 5 seconds (auto-refresh)

## Technical Details

### Current FreeRADIUS Configuration:
- **SQL Module**: ✅ Configured correctly
- **Accounting Section**: ✅ Includes `sql` module
- **Queries**: ✅ Fixed with `NULLIF('%{Framed-IP-Address}', '')::inet`
- **Database**: ✅ Connected to `kilusi_bill@172.22.10.28:5432`
- **NAS Client**: ✅ 172.22.10.156 defined with secret

### Why Sessions Won't Show Until Reconnect:
- FreeRADIUS accounting uses **Acct-Unique-Session-Id** as primary key
- Interim-Update packets try to UPDATE a row that doesn't exist
- Without an initial INSERT from Accounting-Start, the UPDATE fails silently
- Detail files capture everything, but database only reflects successful SQL operations

### Dashboard Changes Made:
- ✅ Removed "Live" mode (MikroTik API)
- ✅ Dashboard now uses **DB-only** source
- ✅ Auto-refresh every 5 seconds
- ✅ Queries fixed for PostgreSQL inet types

## Expected Behavior After Fix

1. **Immediate**:
   - PPPoE reconnects
   - Accounting-Start packet → FreeRADIUS
   - INSERT into radacct table
   - Session appears in dashboard within 5 seconds

2. **Ongoing**:
   - Interim-Update every 5 minutes → UPDATE session time and octets
   - Dashboard shows live session time, download/upload
   - Disconnect → Accounting-Stop → acctstoptime set → session disappears from dashboard

## Monitoring

```bash
# Watch for new sessions in database
watch -n 2 'cd /home/kilusi-bill && node -e "(async()=>{const db=require(\"./config/database\");const r=await db.getOne(\"SELECT COUNT(*)::int AS cnt FROM radacct WHERE acctstoptime IS NULL\");console.log(\"Active:\",r.cnt);process.exit(0)})()"'

# Watch FreeRADIUS logs
docker exec kilusi-freeradius tail -f /var/log/freeradius/radius.log

# Watch detail files
docker exec kilusi-freeradius tail -f /var/log/freeradius/radacct/172.22.10.156/detail-$(date +%Y%m%d)
```

## Status
- [x] Dashboard UI updated to DB-only
- [x] FreeRADIUS queries fixed for inet types
- [x] FreeRADIUS restarted with corrected config
- [ ] **TODO: Reconnect PPPoE session to create fresh Accounting-Start**

---
**Last Updated**: 2025-11-05 11:35 WIB
**Status**: Awaiting PPPoE reconnection
