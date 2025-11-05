# 🌐 Kilusi Bill - ISP Management & Billing System

<div align="center">

**Comprehensive ISP Management Platform v2.0**  
*Billing · RADIUS · SNMP Monitoring · OLT Management · Customer Portal · WhatsApp Integration*

[![Node.js](https://img.shields.io/badge/Node.js-v14+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-12+-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)]()
[![Status](https://img.shields.io/badge/Status-Production%20Ready-success.svg)]()
[![Version](https://img.shields.io/badge/Version-2.0.0-orange.svg)]()

[Features](#-features) • [Installation](#-installation) • [Configuration](#-configuration) • [Changelog](#-changelog) • [Documentation](#-documentation) • [Support](#-support)

</div>

---

## 📋 Deskripsi

**Kilusi Bill v2.0** adalah sistem manajemen ISP lengkap yang mengintegrasikan billing, monitoring jaringan, dan customer management dalam satu platform yang powerful. Dirancang khusus untuk ISP (Internet Service Provider) dengan dukungan multi-server, RADIUS authentication, SNMP monitoring, OLT management, dan integrasi WhatsApp untuk notifikasi otomatis.

### 🆕 What's New in v2.0 (2025)
- ✅ **PostgreSQL Migration** - Fully migrated from SQLite untuk performa optimal
- ✅ **Multi-NAS Support** - Kelola multiple RADIUS NAS clients
- ✅ **Pelanggan Online Menu** - Real-time PPPoE session monitoring dengan RADIUS CoA
- ✅ **Enhanced Billing** - Auto-invoice generation & smart isolir system
- ✅ **WhatsApp Bot** - Automated notifications & customer service bot
- ✅ **OLT Management** - Complete OLT/PON monitoring solution

### 🎯 Keunggulan Utama

- ✅ **PostgreSQL Backend** - High-performance database untuk scalability
- ✅ **Multi-NAS & Multi-Mikrotik** - Kelola multiple RADIUS NAS dan Mikrotik router
- ✅ **RADIUS Server Built-in** - Autentikasi PPPoE dengan auto-sync customers
- ✅ **SNMP Monitoring** - Real-time monitoring device via SNMP protocol
- ✅ **OLT Management** - Monitor PON ports, ONUs, signal strength, dan traffic
- ✅ **Smart Billing System** - Auto-invoice, auto-isolir, payment tracking
- ✅ **Customer Self-Service** - Portal untuk pelanggan dengan device control
- ✅ **WhatsApp Bot** - Automated notifications & customer service commands
- ✅ **GenieACS Integration** - TR-069 device management untuk ONT/ONU
- ✅ **Pelanggan Online** - Real-time PPPoE monitoring dengan RADIUS CoA
- ✅ **Network Tools** - Ping, traceroute, bandwidth test, diagnostics
- ✅ **Mobile Responsive** - Optimized untuk desktop & mobile devices

---

## 🚀 Features

### 👨‍💼 Admin Dashboard
- **Real-time Monitoring** - PPPoE sessions, SNMP devices, OLT statistics
- **Pelanggan Online** - Monitor active sessions dengan RADIUS CoA kick functionality
- **Billing Management** - Customers, invoices, payments, packages
- **Multi-NAS Management** - Configure & monitor multiple RADIUS NAS clients
- **OLT Management** - PON monitoring, ONU status, signal strength
- **Network Tools** - Ping, traceroute, bandwidth test, diagnostics
- **Analytics & Reports** - Revenue charts, customer statistics, export data
- **User Management** - Admin, technician, customer roles dengan RBAC

### 🌐 Network Management
- **PPPoE Monitoring** - Active sessions dengan auto-refresh
- **RADIUS CoA** - Kick single/multiple users dengan proper disconnect
- **SNMP Monitoring** - Device info, interfaces, traffic graphs
- **OLT Management** - PON ports, ONU list, signal levels, traffic per ONU
- **Mikrotik Integration** - Multiple Mikrotik router support (optional)
- **Multi-NAS Support** - Centralized NAS client management
- **GenieACS Integration** - TR-069 device provisioning & management

### 💰 Billing & Invoicing
- **Smart Package Management** - Internet packages dengan RADIUS speed profiles
- **Auto-Invoice Generation** - Automatic monthly billing (tanggal 1 setiap bulan)
- **Auto-Isolir System** - Smart suspension untuk overdue customers
- **Payment Gateway** - Multiple payment method support
- **Payment Tracking** - Transaction history and reconciliation
- **Reminder System** - WhatsApp notifications untuk due date & overdue
- **Grace Period** - Configurable grace days sebelum isolir

### 👥 Customer Portal
- **Self-Service Dashboard** - Service status, package info, usage statistics
- **Invoice & Billing** - View invoices, payment history, pending bills
- **Device Control** - Change WiFi SSID/password, restart ONT/ONU remotely
- **Trouble Ticket** - Submit and track support tickets dengan status updates
- **Profile Management** - Update contact information
- **Mobile Friendly** - Responsive design untuk akses mobile

### 📱 WhatsApp Integration
- **Automated Notifications** - Invoice reminders, payment confirmations, service alerts
- **Customer Service Bot** - Commands untuk cek tagihan, info paket, submit ticket
- **Admin Bot** - WhatsApp commands untuk admin operations
- **Broadcast Messaging** - Mass notifications to customers
- **Trouble Ticket via WA** - Create & track tickets from WhatsApp
- **Payment Confirmation** - Auto-notify saat payment received

---

## 🛠️ Tech Stack

### Backend
- **Node.js** v14+ with Express.js
- **PostgreSQL** 12+ - Production database (migrated from SQLite)
- **MySQL** - RADIUS database (optional untuk external RADIUS)
- **Session Management** - express-session dengan secure cookies
- **Authentication** - Custom middleware dengan role-based access control (RBAC)
- **Scheduler** - node-cron untuk automated tasks

### Frontend
- **EJS Templates** - Server-side rendering dengan layouts
- **Bootstrap 5** - Responsive UI framework dengan dark theme
- **Chart.js** - Data visualization untuk analytics
- **DataTables** - Advanced table features dengan search & pagination
- **Leaflet** - Interactive maps untuk network topology
- **AJAX** - Real-time updates tanpa page reload

### Integrations
- **FreeRADIUS** - PPPoE authentication & accounting (optional)
- **Built-in RADIUS** - Node.js RADIUS server implementation
- **GenieACS** - TR-069 device management (CPE provisioning)
- **Baileys** - WhatsApp Web API untuk notifications & bot
- **Net-SNMP** - SNMP v2c/v3 protocol untuk monitoring
- **Mikrotik RouterOS API** - Router management (optional via SNMP)

---

## 📦 Installation

### Prerequisites

```bash
# Node.js 14+
node --version  # Should be v14 or higher

# npm or yarn
npm --version

# PostgreSQL 12+ (REQUIRED for production)
psql --version  # Should be 12 or higher

# Optional (highly recommended):
# - FreeRADIUS (for external RADIUS server)
# - GenieACS (for TR-069 device management)
# - Mikrotik RouterOS (for PPPoE & network management)
```

### Quick Start - PostgreSQL Production Setup

#### 1. **Install PostgreSQL**

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**CentOS/RHEL:**
```bash
sudo yum install postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### 2. **Create Database & User**

```bash
# Login ke PostgreSQL
sudo -u postgres psql

# Buat database dan user
CREATE DATABASE kilusi_bill;
CREATE USER kilusi_user WITH PASSWORD 'your_strong_password';
GRANT ALL PRIVILEGES ON DATABASE kilusi_bill TO kilusi_user;

# Set proper permissions
\c kilusi_bill
GRANT ALL ON SCHEMA public TO kilusi_user;

# Exit
\q
```

#### 3. **Clone Repository**

```bash
git clone https://github.com/feedad/kilusi-bill.git
cd kilusi-bill
```

#### 4. **Install Dependencies**

```bash
npm install
```

#### 5. **Configure Settings**

```bash
# Copy template settings
cp settings.server.template.json settings.json

# Edit settings.json dengan editor favorit
nano settings.json  # atau vim, code, dll
```

**Minimal configuration required:**
```json
{
  "postgres_host": "localhost",
  "postgres_port": "5432",
  "postgres_database": "kilusi_bill",
  "postgres_user": "kilusi_user",
  "postgres_password": "your_strong_password",
  "postgres_pool_max": "20",
  
  "admin_username": "admin",
  "admin_password": "change_this_password",
  
  "server_port": "3000",
  "server_host": "localhost"
}
```

#### 6. **Initialize Database**

```bash
# Initialize PostgreSQL schema
npm run pg:init

# Verify database
npm run db:check
```

#### 7. **Start Application**

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start

# Or with PM2 (recommended for production)
pm2 start app.js --name kilusi-bill
```

#### 8. **Access Application**

```
Admin Panel: http://localhost:3000/admin
Customer Portal: http://localhost:3000/customer
Mobile Dashboard: http://localhost:3000/mobile

Default Admin Login:
Username: admin
Password: change_this_password (as configured in settings.json)
```

### Optional: Migrate from SQLite to PostgreSQL

If you have existing SQLite data:

```bash
# 1. Backup SQLite database
cp billing.db billing.db.backup

# 2. Initialize PostgreSQL
npm run pg:init

# 3. Migrate data
npm run pg:migrate

# 4. Verify migration
npm run db:check

# 5. Restart application
npm start
```

---

## ⚙️ Configuration

### settings.json - Core Configuration

```json
{
  "app_mode": "radius",
  "monitor_mode": "snmp",
  "user_auth_mode": "radius",
  
  "server_port": "3000",
  "server_host": "localhost",
  
  "admin_username": "admin",
  "admin_password": "your_secure_password",
  
  "postgres_host": "localhost",
  "postgres_port": "5432",
  "postgres_database": "kilusi_bill",
  "postgres_user": "kilusi_user",
  "postgres_password": "your_db_password",
  "postgres_pool_max": "20",
  
  "radius_server_enabled": "true",
  "radius_auth_port": "1812",
  "radius_acct_port": "1813",
  "radius_auto_sync_on_startup": "true",
  "radius_sync_interval_minutes": "60",
  
  "snmp_monitoring_enabled": "true",
  "snmp_community": "public",
  "snmp_version": "2c",
  
  "mikrotik_api_enabled": "false",
  
  "genieacs_enabled": "true",
  "genieacs_url": "http://localhost:7557",
  "genieacs_username": "admin",
  "genieacs_password": "admin",
  
  "whatsapp_enabled": "true",
  "whatsapp_keep_alive": "true",
  
  "billing_auto_isolir": "true",
  "billing_isolir_grace_days": "3",
  "billing_monthly_invoice_enable": "true",
  "billing_due_date": "1"
}
```

### Database Migration Commands

#### PostgreSQL Commands (Primary)
```bash
# Initialize PostgreSQL schema
npm run pg:init

# Migrate from SQLite to PostgreSQL
npm run pg:migrate

# Check database structure
npm run db:check
```

#### Legacy SQLite Commands (Deprecated)
```bash
# Only use if you need to work with old SQLite database
npm run migrate:init
npm run migrate:multi
npm run migrate:all
```

**Note**: Application now exclusively uses PostgreSQL for production. SQLite support is deprecated.

### Environment Variables (Optional)

You can also use environment variables to override settings.json:

```bash
# Database
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DATABASE=kilusi_bill
export POSTGRES_USER=kilusi_user
export POSTGRES_PASSWORD=your_password

# Server
export PORT=3000
export HOST=localhost
export NODE_ENV=production

# Session
export SESSION_SECRET=your-random-secret-key

# RADIUS
export RADIUS_HOST=localhost
export RADIUS_USER=radius_user
export RADIUS_PASSWORD=radius_password

# GenieACS
export GENIEACS_URL=http://localhost:7557
export GENIEACS_USERNAME=admin
export GENIEACS_PASSWORD=admin
```

### RADIUS NAS Configuration

Configure RADIUS NAS clients in settings.json:

```json
{
  "radius_nas_clients": [
    {
      "ip": "192.168.1.1",
      "secret": "testing123",
      "name": "Mikrotik Main Router",
      "description": "Main PPPoE Server"
    },
    {
      "ip": "192.168.2.1",
      "secret": "testing456",
      "name": "Mikrotik Backup",
      "description": "Backup PPPoE Server"
    }
  ]
}
```

Or manage via Admin UI:
- Navigate to: `Admin > RADIUS > NAS Management`
- Add/Edit/Delete NAS clients
- Test connection & sync

### OLT Device Configuration

Add OLT devices for monitoring:

```json
{
  "olt_devices": [
    {
      "name": "OLT-Main",
      "host": "192.168.1.10",
      "vendor": "huawei",
      "community": "public",
      "snmp_version": "2c",
      "latitude": "-6.200000",
      "longitude": "106.816666",
      "description": "Main OLT - Head Office"
    },
    {
      "name": "OLT-Branch",
      "host": "192.168.2.10",
      "vendor": "zte",
      "community": "public",
      "snmp_version": "2c",
      "latitude": "-6.210000",
      "longitude": "106.820000"
    }
  ]
}
```

### WhatsApp Configuration

Enable WhatsApp notifications:

```json
{
  "whatsapp_enabled": "true",
  "whatsapp_keep_alive": "true",
  "whatsapp_restart_on_error": "true",
  "admins": ["6281234567890"],
  "technician_numbers": ["6281234567891", "6281234567892"],
  "wa_send_delay_ms": "3000"
}
```

**Setup Steps:**
1. Enable WhatsApp in settings.json
2. Start application: `npm start`
3. Scan QR code yang muncul di console
4. Wait for "WhatsApp connected" message
5. Test dengan send message dari customer

### Billing & Isolir Configuration

Configure automatic billing & suspension:

```json
{
  "billing_monthly_invoice_enable": "true",
  "billing_monthly_invoice_time": "08:00",
  "billing_due_date": "1",
  "billing_grace_period": "3",
  
  "billing_auto_isolir": "true",
  "billing_isolir_profile": "ISOLIR",
  "billing_isolir_grace_days": "3",
  "billing_isolir_check_interval": "24",
  
  "billing_reminder_enable": "true",
  "billing_reminder_time": "09:00",
  "billing_reminder_days": "3"
}
```

**How it works:**
1. **Invoice Generation**: Automatic pada tanggal 1 setiap bulan jam 08:00
2. **Due Date Reminder**: Daily check jam 09:00, kirim reminder 3 hari sebelum jatuh tempo
3. **Auto-Isolir**: Daily check jam 10:00, isolir customer yang lewat grace period (3 hari)
4. **Auto-Restore**: Daily check jam 11:00, restore service jika sudah bayar

---

## 📖 Documentation

### 📚 Complete Documentation

- **[CHANGELOG-2025.md](CHANGELOG-2025.md)** - Detailed changelog of all features & changes
- **[RANGKUMAN-PEKERJAAN-01-NOV-2024.md](RANGKUMAN-PEKERJAAN-01-NOV-2024.md)** - November 2025 work summary
- **[RANGKUMAN-KERJA-31-OKT-2024.md](RANGKUMAN-KERJA-31-OKT-2024.md)** - October 2025 work summary
- **[docs/README-RADIUS.md](docs/README-RADIUS.md)** - RADIUS integration guide
- **[docs/OLT-MONITORING.md](docs/OLT-MONITORING.md)** - OLT monitoring documentation
- **[docs/MIGRATION-ROUTEROS-V2.md](docs/MIGRATION-ROUTEROS-V2.md)** - Migration to RouterOS guide

### API Endpoints

#### Admin Routes
- `GET /admin/dashboard` - Admin dashboard dengan real-time stats
- `GET /admin/customers` - Customer management (list, add, edit, delete)
- `GET /admin/packages` - Package management
- `GET /admin/invoices` - Invoice management
- `GET /admin/payments` - Payment tracking
- `GET /admin/pelanggan-online` - **[NEW]** Real-time PPPoE sessions
- `POST /admin/pelanggan-online/api/disconnect` - **[NEW]** Kick user via RADIUS CoA
- `POST /admin/pelanggan-online/api/bulk-disconnect` - **[NEW]** Kick multiple users
- `GET /admin/radius/nas` - **[NEW]** RADIUS NAS management
- `GET /admin/mikrotik-servers` - **[NEW]** Multiple Mikrotik management
- `GET /admin/olt/devices` - OLT device management
- `GET /admin/snmp/devices` - SNMP device monitoring
- `GET /admin/analytics` - Analytics & reports
- `GET /admin/trouble` - Trouble ticket management

#### Customer Routes
- `GET /customer/dashboard` - Customer dashboard
- `GET /customer/billing/invoices` - View invoices
- `GET /customer/billing/payments` - Payment history
- `POST /customer/change-ssid` - Update WiFi SSID (via GenieACS)
- `POST /customer/change-password` - Update WiFi password (via GenieACS)
- `POST /customer/restart-device` - Restart ONT/ONU (via GenieACS)
- `POST /customer/trouble/submit` - Submit trouble ticket

#### API Endpoints (External Access)
- `GET /api/external/customers` - Customer list (requires API key)
- `GET /api/external/customer/:phone` - Customer details (requires API key)
- `GET /api/external/packages` - Package list (requires API key)
- `POST /api/external/invoice/create` - Create invoice (requires API key)

**API Key Configuration:**
```json
{
  "api_key": "your-secret-api-key-here"
}
```

**API Usage Example:**
```bash
curl -H "X-API-Key: your-secret-api-key-here" \
  http://localhost:3000/api/external/customers
```

### Monitoring Modes

#### 1. SNMP Mode (Recommended - Default)
```json
{
  "monitor_mode": "snmp",
  "snmp_monitoring_enabled": "true",
  "snmp_community": "public",
  "snmp_version": "2c"
}
```

**Advantages:**
- No Mikrotik API dependency
- Better multi-router support
- RADIUS for authentication
- Lower CPU usage on routers
- Industry standard protocol

#### 2. Mikrotik API Mode (Optional)
```json
{
  "monitor_mode": "mikrotik",
  "mikrotik_api_enabled": "true",
  "mikrotik_host": "192.168.1.1",
  "mikrotik_user": "admin",
  "mikrotik_password": "password"
}
```

**Advantages:**
- Direct RouterOS API access
- Real-time PPPoE management
- Native Mikrotik integration

**Note:** SNMP mode is recommended for production deployments.

### RADIUS Integration

#### Built-in RADIUS Server

Application includes a built-in RADIUS server:

```json
{
  "radius_server_enabled": "true",
  "radius_auth_port": "1812",
  "radius_acct_port": "1813",
  "radius_auto_sync_on_startup": "true",
  "radius_sync_interval_minutes": "60"
}
```

**Features:**
- Automatic customer sync to RADIUS
- Package-based speed profiles
- Session accounting
- Multi-NAS support
- Auto-sync on customer/package changes

#### External FreeRADIUS (Optional)

To use external FreeRADIUS, configure in settings.json:

```json
{
  "radius_server_enabled": "false",
  "radius_host": "192.168.1.100",
  "radius_user": "raduser",
  "radius_password": "radpass",
  "radius_database": "radius"
}
```

**FreeRADIUS clients.conf:**
```conf
client kilusi-nas {
    ipaddr = 192.168.1.1
    secret = testing123
    nastype = mikrotik
}
```

### OLT Configuration

Add OLT devices in Admin UI or settings.json:

**Via Admin UI:**
1. Login to Admin Panel
2. Navigate to `Network > OLT Management`
3. Click "Add OLT Device"
4. Fill in details (Name, IP, Vendor, SNMP Community)
5. Save & Test Connection

**Via settings.json:**
```json
{
  "olt_devices": [
    {
      "name": "OLT-Main",
      "host": "192.168.1.10",
      "vendor": "huawei",
      "community": "public",
      "snmp_version": "2c",
      "latitude": "-6.200000",
      "longitude": "106.816666"
    }
  ]
}
```

**Supported OLT Vendors:**
- Huawei (SmartAX MA5600T, MA5800, etc.)
- ZTE (C300, C320, etc.)
- Fiberhome (AN5516, AN5506, etc.)
- Generic SNMP devices

### GenieACS Integration

#### Setup GenieACS

1. **Install GenieACS:**
```bash
# Install Node.js 14+
curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash -
sudo apt install nodejs

# Install GenieACS
sudo npm install -g genieacs

# Create directory
sudo mkdir -p /opt/genieacs/ext

# Start services
sudo systemctl start genieacs-cwmp
sudo systemctl start genieacs-nbi
sudo systemctl start genieacs-fs
sudo systemctl start genieacs-ui

# Enable auto-start
sudo systemctl enable genieacs-cwmp
sudo systemctl enable genieacs-nbi
sudo systemctl enable genieacs-fs
sudo systemctl enable genieacs-ui
```

2. **Configure in settings.json:**
```json
{
  "genieacs_enabled": "true",
  "genieacs_url": "http://localhost:7557",
  "genieacs_username": "admin",
  "genieacs_password": "admin"
}
```

3. **Configure ONT/ONU:**
- Set ACS URL di ONT: `http://your-server-ip:7547`
- ONT akan auto-register di GenieACS
- Tag devices dengan customer phone number

**GenieACS Features:**
- Device auto-provisioning
- Remote WiFi configuration
- Firmware management
- Device reboot/factory reset
- Performance monitoring

---

## 🎯 Usage Guide

### Admin Dashboard Access

**URL:** `http://localhost:3000/admin`

**Default Login:**
- Username: `admin` (configurable in settings.json)
- Password: As set in `admin_password` field

**Main Features:**
1. **Dashboard** - Real-time monitoring & statistics
2. **Pelanggan Online** - Active PPPoE sessions dengan kick functionality
3. **Customers** - Full customer management (CRUD operations)
4. **Packages** - Internet package management dengan speed profiles
5. **Invoices** - Invoice generation & management
6. **Payments** - Payment tracking & reconciliation
7. **RADIUS** - NAS management & session monitoring
8. **OLT** - OLT device & PON monitoring
9. **SNMP** - SNMP device monitoring
10. **Analytics** - Reports & data visualization
11. **Trouble Tickets** - Support ticket management
12. **Settings** - System configuration

### Customer Portal Access

**URL:** `http://localhost:3000/customer`

**Login Methods:**
1. **Phone Number** - Customer phone number
2. **PPPoE Username** - Username untuk PPPoE login

**Customer Features:**
- View service status & package info
- Check invoices & payment history
- Change WiFi SSID & password
- Restart ONT/ONU device
- Submit trouble tickets
- View service history

### Mobile Dashboard

**Admin Mobile:** `http://localhost:3000/mobile`
**Customer Mobile:** `http://localhost:3000/mobile-customer`

Fully responsive interface optimized untuk smartphone & tablet access.

### WhatsApp Bot Commands

**Customer Commands:**
- `status` - Check WhatsApp connection status
- `info` - Service information & package details
- `invoice` - View latest invoice
- `bayar` - Payment instructions
- `tagihan` - Check outstanding bills
- `ticket [message]` - Create support ticket

**Admin Commands:**
- `cek [phone]` - Check customer status
- `isolir [phone]` - Suspend customer service
- `aktif [phone]` - Activate customer service
- `invoice [phone]` - Generate invoice for customer

**Setup WhatsApp Bot:**
1. Enable WhatsApp in settings.json: `"whatsapp_enabled": "true"`
2. Start application: `npm start`
3. Scan QR code yang muncul di terminal
4. Wait for "WhatsApp connected successfully" message
5. Send test message dari customer phone

### Pelanggan Online - Kick User Functionality

**Access:** `Admin > User Management > Pelanggan Online`

**Features:**
1. **View Active Sessions** - Real-time PPPoE connections
2. **Search & Filter** - By username, IP, customer name
3. **Kick Single User** - Click "Kick" button on specific session
4. **Bulk Kick** - Select multiple users & kick all at once
5. **Auto-Refresh** - Data updates setiap 30 detik

**How RADIUS CoA Works:**
- Uses RADIUS Change-of-Authorization (RFC 5176)
- Sends Disconnect-Request to NAS (port 3799)
- NAS responds dengan CoA-ACK (success) atau CoA-NAK (failed)
- Session terminated immediately on NAS
- Customer needs to re-authenticate untuk reconnect

**Troubleshooting Kick Function:**
- Ensure NAS supports RADIUS CoA (Mikrotik RouterOS v6+)
- Verify NAS client configured properly in RADIUS
- Check firewall allows UDP port 3799
- Verify NAS secret matches configuration

### OLT Monitoring

**Access:** `Admin > Network > OLT Management`

**Features:**
1. **PON Port Status** - View all PON ports & status
2. **ONU List** - All ONUs registered on OLT
3. **Signal Strength** - RX/TX power untuk each ONU
4. **Traffic Statistics** - Real-time traffic per ONU
5. **Geographic Map** - Visual network topology

**Monitoring Data:**
- ONU online/offline status
- Signal strength (dBm)
- Distance from OLT (meters)
- Traffic usage (upload/download)
- Last seen timestamp

### Automated Tasks & Schedulers

Application runs several automated tasks:

1. **Monthly Invoice Generation**
   - Runs: 1st of every month at 08:00
   - Action: Generate invoices untuk semua active customers
   - Notification: WhatsApp reminder sent

2. **Due Date Reminder**
   - Runs: Daily at 09:00
   - Action: Send reminder 3 days before due date
   - Notification: WhatsApp message

3. **Auto-Isolir Service**
   - Runs: Daily at 10:00
   - Action: Suspend overdue customers (after grace period)
   - Notification: WhatsApp suspension notice

4. **Auto-Restore Service**
   - Runs: Daily at 11:00
   - Action: Restore service untuk paid customers
   - Notification: WhatsApp activation notice

5. **Voucher Cleanup**
   - Runs: Every 6 hours
   - Action: Delete expired vouchers

6. **Backup System**
   - Runs: Every 24 hours
   - Action: Database backup
   - Retention: Keep last 30 backups

**View Scheduler Status:**
- Navigate to: `Admin > System > Scheduler Status`
- See last run time & next scheduled run
- Manually trigger tasks if needed

### Troubleshooting Common Issues

#### 1. Cannot Login to Admin Panel

**Solution:**
```bash
# Check admin credentials in settings.json
cat settings.json | grep admin_username
cat settings.json | grep admin_password

# Reset admin password if needed
nano settings.json  # Edit admin_password field
npm start  # Restart application
```

#### 2. Pelanggan Online Shows No Data

**Check:**
1. RADIUS accounting enabled on NAS
2. Accounting packets reaching RADIUS server (port 1813)
3. Database `radacct` table has records:
```bash
psql -U kilusi_user -d kilusi_bill
SELECT COUNT(*) FROM radacct WHERE acctstoptime IS NULL;
```

#### 3. Kick User Not Working

**Check:**
1. NAS supports RADIUS CoA (Mikrotik: `/radius incoming set accept=yes`)
2. Firewall allows UDP port 3799
3. NAS secret matches configuration
4. Test manually:
```bash
echo "Disconnect-Request" | radclient -x 192.168.1.1:3799 disconnect testing123
```

#### 4. WhatsApp Not Connecting

**Solution:**
```bash
# Remove old session
rm -rf whatsapp-session/*

# Restart application
npm start

# Scan new QR code
```

#### 5. Database Connection Error

**Solution:**
```bash
# Check PostgreSQL service
sudo systemctl status postgresql

# Test connection
psql -h localhost -U kilusi_user -d kilusi_bill

# Check credentials in settings.json
cat settings.json | grep postgres_
```

#### 6. GenieACS Devices Not Showing

**Check:**
1. GenieACS services running:
```bash
sudo systemctl status genieacs-cwmp
sudo systemctl status genieacs-nbi
```

2. ONT configured with correct ACS URL
3. Firewall allows port 7547 (TR-069)
4. GenieACS URL in settings.json correct

#### 7. SNMP Monitoring Not Working

**Solution:**
```bash
# Test SNMP manually
snmpwalk -v2c -c public 192.168.1.1 system

# Enable SNMP on router (Mikrotik):
/snmp set enabled=yes
/snmp community add name=public addresses=0.0.0.0/0

# Check firewall allows UDP port 161
```

---

## 🔧 Troubleshooting

### Common Issues & Solutions

#### Database Issues

**1. "ECONNREFUSED" PostgreSQL Connection Error**
```bash
# Check PostgreSQL service
sudo systemctl status postgresql
sudo systemctl start postgresql

# Verify credentials
psql -h localhost -U kilusi_user -d kilusi_bill

# Check pg_hba.conf allows connections
sudo nano /etc/postgresql/12/main/pg_hba.conf
# Add: host kilusi_bill kilusi_user 127.0.0.1/32 md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

**2. "relation does not exist" Error**
```bash
# Reinitialize database schema
npm run pg:init

# Check if tables exist
psql -U kilusi_user -d kilusi_bill -c "\dt"
```

#### RADIUS Issues

**1. RADIUS Server Not Starting**
```bash
# Check if port already in use
sudo netstat -tulpn | grep 1812
sudo netstat -tulpn | grep 1813

# Kill conflicting process or change port in settings.json
sudo kill -9 <PID>

# Restart application
npm start
```

**2. Authentication Failed**
```bash
# Test RADIUS authentication
radtest testuser testpass localhost 0 testing123

# Check NAS client configuration
# Admin > RADIUS > NAS Management

# Verify radcheck table
psql -U kilusi_user -d kilusi_bill
SELECT * FROM radcheck WHERE username = 'testuser';
```

**3. Kick User (CoA) Not Working**
```bash
# Enable RADIUS incoming on Mikrotik
/radius incoming set accept=yes

# Check firewall
sudo ufw allow 3799/udp

# Test manually
echo "Disconnect-Request" | radclient 192.168.1.1:3799 disconnect testing123

# Check logs
tail -f logs/app-*.log | grep CoA
```

#### SNMP Issues

**1. SNMP Timeout**
```bash
# Test SNMP connectivity
snmpwalk -v2c -c public 192.168.1.1 system

# Enable SNMP on device (Mikrotik example)
/snmp set enabled=yes
/snmp community add name=public addresses=0.0.0.0/0

# Check firewall
sudo ufw allow 161/udp
```

**2. No Data from OLT**
```bash
# Verify OLT configuration
curl http://localhost:3000/admin/olt/api/devices

# Test SNMP to OLT
snmpwalk -v2c -c public 192.168.1.10 .1.3.6.1

# Check OLT vendor MIBs loaded
# Different vendors use different OIDs
```

#### GenieACS Issues

**1. GenieACS Connection Failed**
```bash
# Check GenieACS services
sudo systemctl status genieacs-cwmp
sudo systemctl status genieacs-nbi

# Start services if stopped
sudo systemctl start genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui

# Test GenieACS API
curl http://localhost:7557/devices

# Check settings.json
cat settings.json | grep genieacs_
```

**2. Devices Not Registering**
```bash
# Check ONT ACS configuration
# ACS URL should be: http://your-server-ip:7547

# Check firewall
sudo ufw allow 7547/tcp

# Check GenieACS logs
sudo journalctl -u genieacs-cwmp -f
```

#### WhatsApp Issues

**1. QR Code Not Appearing**
```bash
# Clear old session
rm -rf whatsapp-session/*

# Restart app
npm start

# If still not working, check qrcode-terminal package
npm install qrcode-terminal --save
```

**2. WhatsApp Disconnecting Frequently**
```bash
# Enable keep-alive in settings.json
"whatsapp_keep_alive": "true"
"whatsapp_restart_on_error": "true"

# Check phone connection
# Ensure phone has stable internet & battery saver OFF
```

**3. Messages Not Sending**
```bash
# Check delay configuration
"wa_send_delay_ms": "3000"  # Increase if rate-limited

# Check logs
tail -f logs/app-*.log | grep WhatsApp

# Verify sock instance
# Navigate to Admin > WhatsApp Settings > Connection Status
```

#### Performance Issues

**1. Slow Database Queries**
```bash
# Enable query logging
psql -U kilusi_user -d kilusi_bill
ALTER DATABASE kilusi_bill SET log_statement = 'all';

# Check slow queries
tail -f /var/log/postgresql/postgresql-12-main.log

# Add indexes if needed
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_radacct_username ON radacct(username);
```

**2. High Memory Usage**
```bash
# Monitor with PM2
pm2 monit

# Reduce PostgreSQL pool
# In settings.json: "postgres_pool_max": "10"

# Clear node cache
rm -rf node_modules/.cache

# Restart with production mode
NODE_ENV=production npm start
```

**3. Application Crashes**
```bash
# Check error logs
tail -100 logs/error-*.log

# Run with PM2 for auto-restart
pm2 start app.js --name kilusi-bill --max-memory-restart 500M

# Check for unhandled promises
node --trace-warnings app.js
```

#### Network Issues

**1. Cannot Access from Other Devices**
```bash
# Check if server listening on all interfaces
# In settings.json: "server_host": "0.0.0.0"

# Check firewall
sudo ufw allow 3000/tcp

# Test from other device
curl http://your-server-ip:3000/health
```

**2. Slow Page Load**
```bash
# Enable caching
"cache_enabled": "true"
"cache_ttl": "300"

# Use CDN for static assets
# Check public/ folder served correctly

# Enable gzip compression (already in Express)
```

### Debug Mode

Enable detailed logging:

```json
{
  "log_level": "debug",
  "log_sql_queries": "true"
}
```

Or via environment:
```bash
LOG_LEVEL=debug npm start
```

### Getting Help

If problem persists:

1. **Check Logs:**
   ```bash
   # Application logs
   tail -100 logs/app-*.log
   tail -100 logs/error-*.log
   
   # PostgreSQL logs
   sudo tail -100 /var/log/postgresql/postgresql-12-main.log
   
   # System logs
   sudo journalctl -u kilusi-bill -n 100
   ```

2. **Check GitHub Issues:**
   - Visit: https://github.com/feedad/kilusi-bill/issues
   - Search for similar problems
   - Create new issue dengan detail log

3. **Contact Support:**
   - WhatsApp: 081947215703
   - Email: support@kilusi.id
   - Include: error logs, configuration (hide passwords), steps to reproduce

---

## 📁 Project Structure

```
kilusi-bill/
├── app.js                 # Main application entry
├── package.json          # Dependencies
├── settings.json         # Configuration file
├── billing.db           # SQLite database
│
├── config/              # Configuration modules
│   ├── logger.js
│   ├── database.js
│   ├── radius.js
│   └── settingsManager.js
│
├── routes/              # Express routes
│   ├── adminAuth.js
│   ├── adminDashboard.js
│   ├── adminBilling.js
│   ├── adminRadius.js
│   ├── adminSnmp.js
│   ├── adminOLT.js
│   ├── customerPortal.js
│   └── ...
│
├── views/               # EJS templates
│   ├── adminDashboard.ejs
│   ├── admin-billing.ejs
│   ├── customer/
│   └── ...
│
├── public/              # Static assets
│   ├── css/
│   ├── js/
│   └── images/
│
├── migrations/          # Database migrations
│   ├── init-database.js
│   └── add-multi-nas-mikrotik.js
│
└── docs/               # Documentation
    ├── API.md
    ├── DEPLOYMENT.md
    └── ...
```

---

## 🔒 Security

### Best Practices

1. **Change default credentials**
```json
{
  "admin_username": "your-admin",
  "admin_password": "strong-password-here"
}
```

2. **Use HTTPS in production**
```bash
# Install SSL certificate
npm install --save express-sslify

# Force HTTPS redirect
```

3. **Secure session secret**
```json
{
  "session_secret": "generate-random-strong-secret"
}
```

4. **Database backup**
```bash
# Create automated backup
cp billing.db "billing.db.backup-$(date +%Y%m%d)"
```

5. **Rate limiting** - Already configured via `express-rate-limit`

6. **Helmet security headers** - Already implemented

---

## 🚀 Deployment

### Production Deployment with PM2 (Recommended)

PM2 is a production process manager for Node.js applications with built-in load balancer.

```bash
# Install PM2 globally
npm install -g pm2

# Start application with PM2
pm2 start app.js --name kilusi-bill

# View logs
pm2 logs kilusi-bill

# Monitor resources
pm2 monit

# Enable auto-restart on crashes
pm2 startup
pm2 save

# Restart application
pm2 restart kilusi-bill

# Stop application
pm2 stop kilusi-bill

# View process list
pm2 list
```

**PM2 Ecosystem File (ecosystem.config.js):**
```javascript
module.exports = {
  apps: [{
    name: 'kilusi-bill',
    script: 'app.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
```

Start with ecosystem file:
```bash
pm2 start ecosystem.config.js
```

### Docker Deployment

**Dockerfile:**
```dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "app.js"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  kilusi-bill:
    build: .
    container_name: kilusi-bill-app
    restart: unless-stopped
    ports:
      - "3000:3000"
      - "1812:1812/udp"  # RADIUS Auth
      - "1813:1813/udp"  # RADIUS Acct
    volumes:
      - ./settings.json:/app/settings.json
      - ./logs:/app/logs
      - ./data:/app/data
      - ./whatsapp-session:/app/whatsapp-session
    environment:
      - NODE_ENV=production
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_DATABASE=kilusi_bill
      - POSTGRES_USER=kilusi_user
      - POSTGRES_PASSWORD=your_password
    depends_on:
      - postgres
    networks:
      - kilusi-network

  postgres:
    image: postgres:12-alpine
    container_name: kilusi-postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=kilusi_bill
      - POSTGRES_USER=kilusi_user
      - POSTGRES_PASSWORD=your_password
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - kilusi-network

volumes:
  postgres-data:

networks:
  kilusi-network:
    driver: bridge
```

**Build and Run:**
```bash
# Build image
docker-compose build

# Start containers
docker-compose up -d

# View logs
docker-compose logs -f kilusi-bill

# Stop containers
docker-compose down

# Restart specific service
docker-compose restart kilusi-bill
```

### Nginx Reverse Proxy

**Install Nginx:**
```bash
sudo apt update
sudo apt install nginx
```

**Nginx Configuration (/etc/nginx/sites-available/kilusi-bill):**
```nginx
# HTTP Server - Redirect to HTTPS
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect all HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS Server
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/kilusi-bill-access.log;
    error_log /var/log/nginx/kilusi-bill-error.log;

    # Client max body size (for file uploads)
    client_max_body_size 10M;

    # Proxy to Node.js application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffering
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off;
    }

    # Static files caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

**Enable Site:**
```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/kilusi-bill /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

**SSL Certificate with Let's Encrypt:**
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal (already setup by certbot)
sudo systemctl status certbot.timer
```

### Systemd Service (Alternative to PM2)

**Create service file (/etc/systemd/system/kilusi-bill.service):**
```ini
[Unit]
Description=Kilusi Bill ISP Management System
Documentation=https://github.com/feedad/kilusi-bill
After=network.target postgresql.service

[Service]
Type=simple
User=kilusi
WorkingDirectory=/opt/kilusi-bill
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/node app.js
Restart=on-failure
RestartSec=10
StandardOutput=append:/var/log/kilusi-bill/app.log
StandardError=append:/var/log/kilusi-bill/error.log

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/kilusi-bill/logs /opt/kilusi-bill/data

[Install]
WantedBy=multi-user.target
```

**Setup & Start:**
```bash
# Create log directory
sudo mkdir -p /var/log/kilusi-bill
sudo chown kilusi:kilusi /var/log/kilusi-bill

# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable kilusi-bill

# Start service
sudo systemctl start kilusi-bill

# Check status
sudo systemctl status kilusi-bill

# View logs
sudo journalctl -u kilusi-bill -f
```

### Security Best Practices

1. **Firewall Configuration (UFW):**
```bash
# Enable firewall
sudo ufw enable

# Allow SSH
sudo ufw allow ssh

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow RADIUS (only from trusted IPs)
sudo ufw allow from 192.168.1.0/24 to any port 1812 proto udp
sudo ufw allow from 192.168.1.0/24 to any port 1813 proto udp

# Check status
sudo ufw status verbose
```

2. **Change Default Credentials:**
```json
{
  "admin_username": "your-unique-admin-name",
  "admin_password": "strong-secure-password-here"
}
```

3. **Secure Session Secret:**
```json
{
  "session_secret": "generate-long-random-string-here"
}
```

Generate random secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

4. **Database Security:**
```bash
# Use strong PostgreSQL password
# Restrict PostgreSQL access in pg_hba.conf
sudo nano /etc/postgresql/12/main/pg_hba.conf

# Only allow local connections
local   kilusi_bill   kilusi_user   md5
host    kilusi_bill   kilusi_user   127.0.0.1/32   md5
```

5. **Regular Backups:**
```bash
# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * /opt/kilusi-bill/scripts/backup.sh

# Weekly offsite backup
0 3 * * 0 /opt/kilusi-bill/scripts/offsite-backup.sh
```

### Performance Optimization

1. **Enable PostgreSQL Query Caching:**
```sql
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET work_mem = '16MB';
SELECT pg_reload_conf();
```

2. **Node.js Process Clustering:**
```javascript
// Use PM2 cluster mode
pm2 start app.js -i max  # Use all CPU cores
```

3. **Enable Nginx Caching:**
```nginx
# Add to nginx config
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=kilusi_cache:10m max_size=1g inactive=60m;

location / {
    proxy_cache kilusi_cache;
    proxy_cache_valid 200 302 10m;
    proxy_cache_valid 404 1m;
    # ... other proxy settings
}
```

### Monitoring & Logging

1. **PM2 Monitoring:**
```bash
# Real-time monitoring
pm2 monit

# Process metrics
pm2 show kilusi-bill

# Memory/CPU usage
pm2 status
```

2. **Application Logs:**
```bash
# Application logs
tail -f logs/app-*.log
tail -f logs/error-*.log

# PM2 logs
pm2 logs kilusi-bill --lines 100

# System logs
sudo journalctl -u kilusi-bill -f
```

3. **Database Monitoring:**
```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity WHERE datname = 'kilusi_bill';

-- Slow queries
SELECT query, mean_exec_time 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC LIMIT 10;
```

### Maintenance

**Regular Tasks:**
```bash
# Weekly: Update dependencies
npm outdated
npm update

# Monthly: Vacuum database
psql -U kilusi_user -d kilusi_bill -c "VACUUM ANALYZE;"

# Daily: Check logs for errors
grep -i error logs/error-*.log | tail -50

# Weekly: Review backup status
ls -lh data/backups/
```

---

## 📊 Performance Tips

### Database Optimization

1. **Regular Vacuum & Analyze:**
```bash
# Run weekly
psql -U kilusi_user -d kilusi_bill -c "VACUUM ANALYZE;"

# Auto-vacuum configuration
ALTER SYSTEM SET autovacuum = on;
ALTER SYSTEM SET autovacuum_naptime = '1min';
```

2. **Add Indexes for Frequent Queries:**
```sql
-- Customer lookups
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_username ON customers(username);

-- RADIUS queries
CREATE INDEX IF NOT EXISTS idx_radacct_username ON radacct(username);
CREATE INDEX IF NOT EXISTS idx_radacct_acctstoptime ON radacct(acctstoptime);
CREATE INDEX IF NOT EXISTS idx_radcheck_username ON radcheck(username);

-- Invoice queries
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
```

3. **Optimize PostgreSQL Configuration:**
```bash
# Edit postgresql.conf
sudo nano /etc/postgresql/12/main/postgresql.conf

# Recommended settings for 4GB RAM server:
shared_buffers = 1GB
effective_cache_size = 3GB
maintenance_work_mem = 256MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 16MB
min_wal_size = 1GB
max_wal_size = 4GB
max_worker_processes = 4
max_parallel_workers_per_gather = 2
max_parallel_workers = 4
```

### Application Performance

1. **Enable Caching:**
```json
{
  "cache_enabled": "true",
  "cache_ttl": "300",
  "settings_cache_enabled": "true"
}
```

2. **Connection Pooling:**
```json
{
  "postgres_pool_max": "20",
  "postgres_idle_timeout": "30000",
  "postgres_connection_timeout": "5000"
}
```

3. **Monitor Query Performance:**
```bash
# Enable slow query logging
tail -f logs/app-*.log | grep "slow query"

# Check database slow queries
psql -U kilusi_user -d kilusi_bill
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

### Network Optimization

1. **SNMP Query Optimization:**
```json
{
  "snmp_timeout": "5000",
  "snmp_retries": "2",
  "snmp_cache_ttl": "60"
}
```

2. **Reduce RADIUS Packet Size:**
```json
{
  "radius_max_packet_size": "4096",
  "radius_timeout": "3000"
}
```

3. **WhatsApp Message Batching:**
```json
{
  "wa_send_delay_ms": "3000",
  "wa_batch_size": "10"
}
```

### Monitoring Performance

```bash
# PM2 monitoring
pm2 monit

# Resource usage
pm2 show kilusi-bill

# Database connections
psql -U kilusi_user -d kilusi_bill -c "SELECT count(*) FROM pg_stat_activity;"

# Memory usage
free -h

# Disk usage
df -h

# Network connections
netstat -an | grep :3000
```

---

## 📄 License

This project is licensed under the **ISC License**.

```
Copyright (c) 2024-2025 Kilusi Digital Network

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

---

## 🤝 Contributing

Contributions are welcome! We appreciate your help in making Kilusi Bill better.

### How to Contribute

1. **Fork the Repository**
```bash
# Click Fork button on GitHub
# Clone your fork
git clone https://github.com/YOUR-USERNAME/kilusi-bill.git
cd kilusi-bill
```

2. **Create Feature Branch**
```bash
git checkout -b feature/AmazingFeature
```

3. **Make Changes**
- Write clean, documented code
- Follow existing code style
- Test your changes thoroughly

4. **Commit Changes**
```bash
git add .
git commit -m 'Add some AmazingFeature'
```

5. **Push to Branch**
```bash
git push origin feature/AmazingFeature
```

6. **Open Pull Request**
- Go to GitHub repository
- Click "New Pull Request"
- Describe your changes
- Submit for review

### Development Guidelines

- **Code Style**: Follow existing conventions
- **Comments**: Document complex logic
- **Testing**: Test all new features
- **Documentation**: Update README.md if needed
- **Commits**: Write clear commit messages

### Reporting Issues

Found a bug? Please report it:

1. Check existing issues first
2. Create new issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Error logs (hide sensitive data)
   - Your environment (OS, Node version, etc.)

---

## 🎉 Acknowledgments

Special thanks to all contributors and the open-source community:

### Core Dependencies
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **Node.js** - Runtime environment

### Integration Partners
- **FreeRADIUS** - RADIUS authentication
- **GenieACS** - TR-069 device management
- **Baileys** - WhatsApp Web API
- **Net-SNMP** - SNMP protocol implementation

### Contributors
- Kilusi Digital Network Team
- All GitHub contributors
- Community testers & bug reporters

### Inspiration
- ISP community feedback
- Network management best practices
- Modern web development standards

---

## 📞 Support & Contact

### 🆘 Getting Help

**Documentation:**
- [README.md](README.md) - Main documentation
- [CHANGELOG-2025.md](CHANGELOG-2025.md) - Detailed changelog
- [docs/](docs/) - Technical documentation

**Community:**
- GitHub Issues: https://github.com/feedad/kilusi-bill/issues
- GitHub Discussions: https://github.com/feedad/kilusi-bill/discussions

**Direct Support:**
- **WhatsApp**: 081947215703
- **Email**: support@kilusi.id
- **Website**: https://kilusi.id

### 📧 Contact Information

**Developer**: Kilusi Digital Network  
**Location**: Indonesia  
**Business Hours**: Monday - Friday, 09:00 - 17:00 WIB

### 🐛 Report Security Issues

For security vulnerabilities, please email directly to:
- **Email**: security@kilusi.id
- **PGP Key**: Available on request

Do not post security issues publicly.

---

## 🗺️ Roadmap

### Q1 2025 (Completed ✅)
- ✅ PostgreSQL migration
- ✅ Multi-NAS support
- ✅ Pelanggan Online menu
- ✅ Enhanced billing system
- ✅ RADIUS CoA implementation

### Q2 2025 (In Progress 🔄)
- 🔄 API v2 with OpenAPI documentation
- 🔄 Mobile app (React Native)
- 🔄 Advanced analytics & reports
- 🔄 Payment gateway integration (Midtrans, Xendit)
- 🔄 Multi-language support

### Q3 2025 (Planned 📋)
- 📋 Kubernetes deployment
- 📋 GraphQL API
- 📋 Real-time notifications (WebSocket)
- 📋 AI-powered customer support
- 📋 Advanced network topology mapping

### Q4 2025 (Planned 📋)
- 📋 Microservices architecture
- 📋 Multi-tenancy support
- 📋 Advanced security features
- 📋 Performance optimization phase 2
- 📋 Complete API ecosystem

---

## 📚 Additional Resources

### Documentation Files
- [CHANGELOG-2025.md](CHANGELOG-2025.md) - Detailed changelog
- [RANGKUMAN-PEKERJAAN-01-NOV-2024.md](RANGKUMAN-PEKERJAAN-01-NOV-2024.md) - November work summary
- [RANGKUMAN-KERJA-31-OKT-2024.md](RANGKUMAN-KERJA-31-OKT-2024.md) - October work summary
- [docs/README-RADIUS.md](docs/README-RADIUS.md) - RADIUS documentation
- [docs/OLT-MONITORING.md](docs/OLT-MONITORING.md) - OLT monitoring guide

### Quick Links
- **GitHub Repository**: https://github.com/feedad/kilusi-bill
- **Issues Tracker**: https://github.com/feedad/kilusi-bill/issues
- **Pull Requests**: https://github.com/feedad/kilusi-bill/pulls
- **Releases**: https://github.com/feedad/kilusi-bill/releases

### Related Projects
- **GenieACS**: https://genieacs.com/
- **FreeRADIUS**: https://freeradius.org/
- **PostgreSQL**: https://www.postgresql.org/
- **Node.js**: https://nodejs.org/

---

<div align="center">

**Made with ❤️ by Kilusi Digital Network**

**Jangan lupa untuk mengkonfigurasi file `settings.json` terlebih dahulu sebelum menjalankan aplikasi!**

[![GitHub stars](https://img.shields.io/github/stars/feedad/kilusi-bill?style=social)](https://github.com/feedad/kilusi-bill/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/feedad/kilusi-bill?style=social)](https://github.com/feedad/kilusi-bill/network/members)
[![GitHub issues](https://img.shields.io/github/issues/feedad/kilusi-bill)](https://github.com/feedad/kilusi-bill/issues)

**Version 2.0.0** • **Last Updated**: November 5, 2025

</div>
