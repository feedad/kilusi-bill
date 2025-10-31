# PostgreSQL Migration Guide

## 📘 Overview

Panduan lengkap untuk upgrade database Kilusi-Bill dari SQLite ke PostgreSQL untuk performa dan skalabilitas yang lebih baik.

## 🎯 Mengapa PostgreSQL?

### Keuntungan PostgreSQL vs SQLite

| Fitur | SQLite | PostgreSQL |
|-------|--------|------------|
| **Concurrent Access** | Limited | Excellent |
| **Database Size** | Max 281 TB | Unlimited |
| **Performance** | Good for < 100K rows | Excellent for millions |
| **Data Integrity** | Basic | Advanced (ACID) |
| **Replication** | ❌ No | ✅ Yes |
| **Backup** | File copy | pg_dump, WAL |
| **JSON Support** | Basic | Advanced (JSONB) |
| **Full-text Search** | Basic | Advanced |
| **Connection Pooling** | ❌ No | ✅ Yes |

### Kapan Harus Upgrade?

✅ **Upgrade ke PostgreSQL jika:**
- Memiliki > 500 pelanggan aktif
- Banyak concurrent users (> 50)
- Perlu replication/backup otomatis
- Perlu advanced queries dan reporting
- Database size > 2 GB
- Perlu high availability

⚠️ **Tetap SQLite jika:**
- < 200 pelanggan
- Single server deployment
- Tidak perlu concurrent access tinggi
- Ingin deployment yang simpel

---

## 🔧 Installation Guide

### 1. Install PostgreSQL

#### Ubuntu/Debian
```bash
# Add PostgreSQL repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -

# Update and install
sudo apt update
sudo apt install postgresql-14 postgresql-contrib-14

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### CentOS/RHEL 8
```bash
# Install repository
sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-8-x86_64/pgdg-redhat-repo-latest.noarch.rpm

# Disable default PostgreSQL
sudo dnf -qy module disable postgresql

# Install PostgreSQL 14
sudo dnf install -y postgresql14-server postgresql14-contrib

# Initialize and start
sudo /usr/pgsql-14/bin/postgresql-14-setup initdb
sudo systemctl enable --now postgresql-14
```

#### Windows
```powershell
# Download installer dari postgresql.org
# Atau install via chocolatey
choco install postgresql14

# Service akan auto-start
```

### 2. Configure PostgreSQL

#### Create Database & User

```bash
# Login sebagai postgres user
sudo -u postgres psql

# Di PostgreSQL shell
CREATE DATABASE kilusi_bill;
CREATE USER kilusi_user WITH PASSWORD 'your_secure_password_here';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE kilusi_bill TO kilusi_user;

# Untuk PostgreSQL 15+, juga perlu:
\c kilusi_bill
GRANT ALL ON SCHEMA public TO kilusi_user;

# Exit
\q
```

#### Configure Authentication

Edit `/etc/postgresql/14/main/pg_hba.conf`:

```conf
# Add this line for local connections
local   kilusi_bill     kilusi_user                     md5
host    kilusi_bill     kilusi_user     127.0.0.1/32    md5
host    kilusi_bill     kilusi_user     ::1/128         md5
```

Restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

#### Configure Performance (Optional)

Edit `/etc/postgresql/14/main/postgresql.conf`:

```conf
# Memory Configuration (adjust based on your RAM)
shared_buffers = 256MB              # 25% of RAM
effective_cache_size = 1GB          # 50-75% of RAM
work_mem = 16MB
maintenance_work_mem = 128MB

# Connection Settings
max_connections = 100

# Write-Ahead Logging
wal_buffers = 16MB
checkpoint_completion_target = 0.9

# Query Planning
random_page_cost = 1.1             # For SSD
effective_io_concurrency = 200     # For SSD
```

Restart:
```bash
sudo systemctl restart postgresql
```

---

## 📦 Install Node.js Dependencies

```bash
cd /path/to/kilusi-bill
npm install pg
```

Package `pg` (node-postgres) sudah ditambahkan ke dependencies.

---

## 🔄 Migration Process

### Step 1: Backup Existing Data

```bash
# Backup SQLite database
cp billing.db billing.db.backup-$(date +%Y%m%d)

# Backup settings
cp settings.json settings.json.backup
```

### Step 2: Configure PostgreSQL Settings

Edit `settings.json`:

```json
{
  "postgres_host": "localhost",
  "postgres_port": "5432",
  "postgres_database": "kilusi_bill",
  "postgres_user": "kilusi_user",
  "postgres_password": "your_secure_password_here",
  "postgres_pool_max": "20",
  "postgres_idle_timeout": "30000",
  "postgres_connection_timeout": "5000"
}
```

**Atau** gunakan environment variables (lebih secure):

```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DATABASE=kilusi_bill
export POSTGRES_USER=kilusi_user
export POSTGRES_PASSWORD=your_password
```

### Step 3: Initialize PostgreSQL Schema

```bash
npm run pg:init
```

Output yang diharapkan:
```
🔄 Initializing Kilusi-Bill PostgreSQL database schema...
📍 Connecting to: kilusi_bill@localhost:5432

📊 Creating packages table...
✅ packages table created

📊 Creating customers table...
✅ customers table created

📊 Creating invoices table...
✅ invoices table created

📊 Creating payments table...
✅ payments table created

📊 Creating nas_servers table...
✅ nas_servers table created

📊 Creating mikrotik_servers table...
✅ mikrotik_servers table created

📊 Creating trouble_reports table...
✅ trouble_reports table created

📊 Creating installations table...
✅ installations table created

📊 Creating system_logs table...
✅ system_logs table created

✅ Database initialization completed successfully!
🎉 Kilusi-Bill PostgreSQL database is now ready!
```

### Step 4: Migrate Existing Data

```bash
npm run pg:migrate
```

Output:
```
🔄 Starting data migration from SQLite to PostgreSQL...
📍 SQLite: D:\Project\Kilusi-Bill\billing.db
📍 PostgreSQL: kilusi_bill@localhost:5432

✅ Connected to PostgreSQL

📦 Migrating packages...
✅ Migrated 5 packages

👥 Migrating customers...
✅ Migrated 150 customers

📄 Migrating invoices...
✅ Migrated 450 invoices

💰 Migrating payments...
✅ Migrated 320 payments

✅ Migration completed successfully!

📊 Summary:
  - Packages: 5
  - Customers: 150
  - Invoices: 450
  - Payments: 320

🎉 All data has been migrated to PostgreSQL!
```

### Step 5: Verify Data

```bash
# Login ke PostgreSQL
sudo -u postgres psql kilusi_bill

# Check data
SELECT COUNT(*) FROM packages;
SELECT COUNT(*) FROM customers;
SELECT COUNT(*) FROM invoices;
SELECT COUNT(*) FROM payments;

# Sample customer data
SELECT * FROM customers LIMIT 5;

# Exit
\q
```

### Step 6: Update Application Code

File-file yang perlu diupdate untuk menggunakan PostgreSQL:

#### Option A: Rename billing module (Recommended)

```bash
# Backup old billing module
mv config/billing.js config/billing-sqlite.js

# Use PostgreSQL billing module
mv config/billing-postgres.js config/billing.js
```

#### Option B: Update imports manually

Di semua file route yang menggunakan billing, update import:

```javascript
// OLD (SQLite)
const billing = require('../config/billing');

// NEW (PostgreSQL)
const billing = require('../config/billing-postgres');
```

Files yang perlu diupdate:
- `routes/adminBilling.js`
- `routes/adminCustomers.js`
- `routes/customerPortal.js`
- Dan file lain yang import billing module

### Step 7: Test Application

```bash
# Start in development mode
npm run dev

# Check logs untuk errors
tail -f logs/app.log
```

Test checklist:
- [ ] Login admin berhasil
- [ ] Dashboard menampilkan statistics
- [ ] List customers tampil
- [ ] List packages tampil
- [ ] List invoices tampil
- [ ] Create customer baru
- [ ] Create invoice baru
- [ ] Update customer data
- [ ] Customer portal login

### Step 8: Deploy to Production

```bash
# Stop aplikasi
pm2 stop kilusi-bill

# Pull latest code
git pull

# Install dependencies
npm install

# Run migrations
npm run pg:init
npm run pg:migrate

# Restart aplikasi
pm2 restart kilusi-bill

# Monitor logs
pm2 logs kilusi-bill
```

---

## 🔍 Database Comparison

### Query Performance Test

```sql
-- Test di SQLite
EXPLAIN QUERY PLAN SELECT * FROM customers WHERE status = 'active';

-- Test di PostgreSQL
EXPLAIN ANALYZE SELECT * FROM customers WHERE status = 'active';
```

### Database Size

```bash
# SQLite
ls -lh billing.db

# PostgreSQL
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('kilusi_bill'));"
```

---

## 🛠️ Troubleshooting

### Connection Refused

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check listening ports
sudo netstat -nlp | grep 5432

# Check logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

### Authentication Failed

```bash
# Reset password
sudo -u postgres psql
ALTER USER kilusi_user WITH PASSWORD 'new_password';

# Check pg_hba.conf
sudo nano /etc/postgresql/14/main/pg_hba.conf
```

### Slow Queries

```sql
-- Enable query logging
ALTER DATABASE kilusi_bill SET log_statement = 'all';
ALTER DATABASE kilusi_bill SET log_duration = on;
ALTER DATABASE kilusi_bill SET log_min_duration_statement = 100;

-- Analyze slow queries
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
```

### High Memory Usage

```bash
# Check connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"

# Kill idle connections
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < NOW() - INTERVAL '1 hour';"
```

---

## 📊 Monitoring & Maintenance

### Regular Maintenance

```bash
# Vacuum database (cleanup)
sudo -u postgres psql kilusi_bill -c "VACUUM ANALYZE;"

# Reindex database
sudo -u postgres psql kilusi_bill -c "REINDEX DATABASE kilusi_bill;"

# Update statistics
sudo -u postgres psql kilusi_bill -c "ANALYZE;"
```

### Backup Strategy

```bash
# Daily backup script
#!/bin/bash
BACKUP_DIR="/backup/postgres"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
pg_dump -U kilusi_user -h localhost kilusi_bill | gzip > $BACKUP_DIR/kilusi_bill_$DATE.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "kilusi_bill_*.sql.gz" -mtime +30 -delete
```

Setup cron:
```bash
crontab -e

# Add this line for daily backup at 2 AM
0 2 * * * /path/to/backup-script.sh
```

### Monitoring Queries

```sql
-- Active queries
SELECT pid, usename, application_name, state, query 
FROM pg_stat_activity 
WHERE state != 'idle';

-- Database size
SELECT pg_size_pretty(pg_database_size('kilusi_bill'));

-- Table sizes
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## 🔒 Security Best Practices

1. **Use strong passwords**
```sql
ALTER USER kilusi_user WITH PASSWORD 'complex_password_with_numbers_123!';
```

2. **Restrict network access**
```conf
# pg_hba.conf - only allow from localhost
host    kilusi_bill     kilusi_user     127.0.0.1/32    md5
```

3. **Enable SSL (for remote connections)**
```conf
# postgresql.conf
ssl = on
ssl_cert_file = '/path/to/server.crt'
ssl_key_file = '/path/to/server.key'
```

4. **Regular updates**
```bash
sudo apt update
sudo apt upgrade postgresql-14
```

5. **Audit logging**
```conf
# postgresql.conf
log_connections = on
log_disconnections = on
log_statement = 'ddl'
```

---

## 📈 Performance Tuning

### Connection Pooling (Already implemented in config/database.js)

```javascript
const pool = new Pool({
    max: 20,                    // Maximum connections
    idleTimeoutMillis: 30000,   // Close idle connections after 30s
    connectionTimeoutMillis: 5000, // Connection timeout
});
```

### Indexes (Already created in init-postgres.js)

```sql
-- Auto-created indexes
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
```

### Query Optimization

```javascript
// BAD - Multiple queries
for (const customer of customers) {
    const invoices = await query('SELECT * FROM invoices WHERE customer_id = $1', [customer.id]);
}

// GOOD - Single JOIN query
const customersWithInvoices = await query(`
    SELECT c.*, 
           json_agg(i.*) as invoices
    FROM customers c
    LEFT JOIN invoices i ON c.id = i.customer_id
    GROUP BY c.id
`);
```

---

## 🔄 Rollback Plan

Jika terjadi masalah, rollback ke SQLite:

```bash
# 1. Stop aplikasi
pm2 stop kilusi-bill

# 2. Restore old billing module
mv config/billing-sqlite.js config/billing.js

# 3. Restore settings
cp settings.json.backup settings.json

# 4. Restart
pm2 start kilusi-bill

# 5. Verify
curl http://localhost:3000/admin
```

---

## ✅ Post-Migration Checklist

- [ ] PostgreSQL installed and running
- [ ] Database created with proper user/password
- [ ] Schema initialized successfully
- [ ] All data migrated from SQLite
- [ ] Data verification completed
- [ ] Application code updated
- [ ] Application tested locally
- [ ] Backup strategy implemented
- [ ] Monitoring setup
- [ ] Documentation updated
- [ ] Team trained on new system
- [ ] Deployed to production
- [ ] Old SQLite backup archived

---

## 📞 Support

Jika mengalami issues dengan migration:

1. Check logs: `tail -f logs/app.log`
2. Check PostgreSQL logs: `sudo tail -f /var/log/postgresql/postgresql-14-main.log`
3. Join Telegram group: [t.me/kilusinet](https://t.me/kilusinet)
4. Contact: wa.me/628194215703

---

**Made with ❤️ by KILUSI Team**
