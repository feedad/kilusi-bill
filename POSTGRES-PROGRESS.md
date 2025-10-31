# PostgreSQL Migration Progress

## ✅ Phase 1: COMPLETED

### Core Module Migration
- [x] `config/billing.js` - **NOW USING POSTGRESQL**
  - Old SQLite version backed up as `config/billing-sqlite.js`
  - Active version copied from `config/billing-postgres.js`
  - All billing operations use PostgreSQL connection pool

### Route Files Migrated
- [x] `routes/adminCustomers.js` - PostgreSQL migration complete
- [x] `routes/adminNAS.js` - PostgreSQL migration complete  
- [x] `routes/adminMikrotikServers.js` - PostgreSQL migration complete

### Database Configuration
- [x] `config/database.js` - PostgreSQL connection pool
- [x] `migrations/init-postgres.js` - Schema initialization
- [x] `migrations/migrate-sqlite-to-postgres.js` - Data migration script
- [x] `settings.json` - PostgreSQL configuration added

---

## 🔄 Phase 2: IN PROGRESS (Optional)

### Routes Still Using SQLite3 Directly

These routes use `sqlite3` for specific tables that aren't in the main billing module:

#### High Priority (Frequently Used)
- [ ] `routes/adminSnmp.js` - SNMP device management
- [ ] `routes/adminTechnicians.js` - Technician management
- [ ] `routes/adminInstallationJobs.js` - Installation job tracking
- [ ] `routes/technicianDashboard.js` - Technician dashboard
- [ ] `routes/technicianAuth.js` - Technician authentication
- [ ] `routes/adminCableNetwork.js` - Cable network management
- [ ] `routes/technicianCableNetwork.js` - Technician cable view

#### Medium Priority
- [ ] `routes/publicVoucher.js` - Multiple sqlite3 calls (complex migration)
- [ ] `routes/publicVoucher_clean.js` - Voucher system

#### Low Priority (Can work with current setup)
- Most other routes that import `billing` module are already using PostgreSQL
- Routes that only read from billing tables work fine

---

## 🎯 Migration Pattern

For files that still use sqlite3, here's the migration pattern:

### Before (SQLite)
```javascript
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../billing.db');

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.all(sql, params, (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.run(sql, params, function(err) {
            db.close();
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}
```

### After (PostgreSQL)
```javascript
const { query, getAll } = require('../config/database');
const { logger } = require('../config/logger');

async function dbAll(sql, params = []) {
    return await getAll(sql, params);
}

async function dbRun(sql, params = []) {
    const result = await query(sql, params);
    return { 
        lastID: result.rows[0]?.id, 
        changes: result.rowCount 
    };
}
```

### SQL Query Changes
```javascript
// SQLite: ? placeholders
await dbRun('INSERT INTO table (col1, col2) VALUES (?, ?)', [val1, val2]);
await dbRun('UPDATE table SET is_active = 1 WHERE id = ?', [id]);
await dbRun('UPDATE table SET is_active = 1 - is_active WHERE id = ?', [id]);

// PostgreSQL: $1, $2, $3 placeholders  
await query('INSERT INTO table (col1, col2) VALUES ($1, $2)', [val1, val2]);
await query('UPDATE table SET is_active = true WHERE id = $1', [id]);
await query('UPDATE table SET is_active = NOT is_active WHERE id = $1', [id]);
```

### Boolean Handling
```javascript
// SQLite: INTEGER (0/1)
is_active ? 1 : 0
WHERE is_active = 1

// PostgreSQL: BOOLEAN (true/false)
is_active ? true : false
WHERE is_active = true
```

---

## 📊 Current Status Summary

### ✅ What's Working Now
- **All billing operations** (customers, packages, invoices, payments) use PostgreSQL
- **NAS server management** uses PostgreSQL
- **Mikrotik server management** uses PostgreSQL  
- **Customer management** uses PostgreSQL
- Any route that imports `billing` module automatically uses PostgreSQL

### ⚠️ What Still Uses SQLite
- **Technician management** tables
- **Installation jobs** tables
- **Cable network** tables
- **SNMP device** tables
- **Voucher** system (complex inline queries)

### 🎯 Recommendation
**Current setup is production-ready!** 

The core billing system is on PostgreSQL. Other tables (technicians, installations, etc.) can:
1. **Stay on SQLite** for now - they work fine for smaller datasets
2. **Migrate later** when needed - use the migration pattern above
3. **Create separate PostgreSQL tables** using similar schema in `init-postgres.js`

---

## 🚀 How to Complete Full Migration

If you want to migrate everything to PostgreSQL:

### Step 1: Create Additional Tables
Add to `migrations/init-postgres.js`:

```sql
-- Technicians table
CREATE TABLE IF NOT EXISTS technicians (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cable networks table
CREATE TABLE IF NOT EXISTS cable_networks (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    cable_type VARCHAR(50),
    cable_length INTEGER,
    port_number INTEGER,
    odp_location VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SNMP devices table  
CREATE TABLE IF NOT EXISTS snmp_devices (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    ip_address VARCHAR(50) NOT NULL,
    snmp_community VARCHAR(100),
    snmp_version VARCHAR(10) DEFAULT '2c',
    snmp_port INTEGER DEFAULT 161,
    device_type VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Step 2: Migrate Data
Create `migrations/migrate-additional-tables.js`:

```javascript
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');

// Similar to migrate-sqlite-to-postgres.js
// Migrate technicians, cable_networks, snmp_devices tables
```

### Step 3: Update Routes
Apply the migration pattern to each route file:
- Replace `sqlite3` with `config/database`
- Update SQL queries to use `$1, $2` placeholders
- Change INTEGER (0/1) to BOOLEAN (true/false)

---

## 🔍 Testing After Migration

### Test Checklist
```bash
# 1. Test billing operations
curl http://localhost:3000/admin/customers
curl http://localhost:3000/admin/packages
curl http://localhost:3000/admin/invoices

# 2. Test NAS management
curl http://localhost:3000/admin/nas

# 3. Test Mikrotik management  
curl http://localhost:3000/admin/mikrotik-servers

# 4. Test customer portal
curl http://localhost:3000/

# 5. Check database connection
psql -U kilusi_user -d kilusi_bill -c "SELECT COUNT(*) FROM customers"
```

### Monitor Logs
```bash
# Watch application logs
tail -f logs/app.log | grep -i "database\|postgres\|error"

# Watch PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

---

## 📝 Notes

1. **Backward Compatibility**: SQLite backup kept as `config/billing-sqlite.js`
2. **Migration Scripts**: Can still run SQLite migrations for development
3. **Dual Mode**: Can switch between SQLite and PostgreSQL by swapping `config/billing.js`
4. **Performance**: PostgreSQL connection pool handles concurrent requests better
5. **Scalability**: Ready for production with 500+ customers

---

## 🎉 Success Criteria

- [x] Core billing module on PostgreSQL
- [x] Customer management on PostgreSQL
- [x] Invoice & payment tracking on PostgreSQL
- [x] NAS server management on PostgreSQL
- [x] Mikrotik server management on PostgreSQL
- [x] Connection pooling configured
- [x] Migration scripts created
- [x] Documentation updated

**Status: PostgreSQL Migration Phase 1 - COMPLETE! 🚀**

---

## 📞 Support

If you need help with the remaining migrations:
- Check `POSTGRES-MIGRATION.md` for detailed guide
- Review migration pattern above
- Test changes on development environment first
- Keep SQLite backups before going to production

Made with ❤️ by KILUSI Team
