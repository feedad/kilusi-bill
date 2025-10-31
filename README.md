# 🌐 Kilusi Bill - ISP Management & Billing System

<div align="center">

**Comprehensive ISP Management Platform**  
*Billing · RADIUS · SNMP Monitoring · OLT Management · Customer Portal*

[![Node.js](https://img.shields.io/badge/Node.js-v14+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)]()
[![Status](https://img.shields.io/badge/Status-Production%20Ready-success.svg)]()

[Features](#-features) • [Installation](#-installation) • [Configuration](#-configuration) • [Documentation](#-documentation) • [Support](#-support)

</div>

---

## 📋 Deskripsi

**Kilusi Bill** adalah sistem manajemen ISP lengkap yang mengintegrasikan billing, monitoring jaringan, dan customer management dalam satu platform. Dirancang khusus untuk ISP (Internet Service Provider) dengan dukungan multi-server, RADIUS authentication, SNMP monitoring, dan OLT management.

### 🎯 Keunggulan Utama

- ✅ **Multi-NAS & Multi-Mikrotik Support** - Kelola multiple RADIUS NAS dan Mikrotik router
- ✅ **RADIUS Integration** - Autentikasi PPPoE terintegrasi dengan FreeRADIUS
- ✅ **SNMP Monitoring** - Real-time monitoring device via SNMP protocol
- ✅ **OLT Management** - Monitor PON ports, ONUs, signal strength, dan traffic
- ✅ **Billing System** - Invoicing, payments, packages management
- ✅ **Customer Portal** - Self-service portal untuk pelanggan
- ✅ **WhatsApp Integration** - Notifikasi dan bot commands via WhatsApp
- ✅ **GenieACS Support** - Manage ONT/ONU devices with TR-069
- ✅ **Network Mapping** - Visual network topology dengan lat/lng coordinates
- ✅ **Voucher System** - Hotspot voucher generation dan management

---

## 🚀 Features

### 👨‍💼 Admin Dashboard
- **Real-time Monitoring** - PPPoE sessions, SNMP devices, OLT statistics
- **Billing Management** - Customers, invoices, payments, packages
- **Network Tools** - Ping, traceroute, bandwidth test
- **Analytics & Reports** - Revenue charts, customer statistics
- **User Management** - Admin, technician, customer roles

### 🌐 Network Management
- **PPPoE Monitoring** - Active sessions, disconnect users, session history
- **SNMP Monitoring** - Device info, interfaces, traffic graphs
- **OLT Management** - PON ports, ONU list, signal levels, traffic
- **Mikrotik Integration** - Multiple Mikrotik router support
- **RADIUS Integration** - Multi-NAS RADIUS authentication

### 💰 Billing & Invoicing
- **Package Management** - Internet packages with speed profiles
- **Invoice Generation** - Automatic monthly billing
- **Payment Gateway** - Multiple payment method support
- **Payment Tracking** - Transaction history and reconciliation
- **Overdue Detection** - Auto-detect and highlight overdue invoices

### 👥 Customer Portal
- **Dashboard** - Service status, usage statistics
- **Billing** - View invoices, payment history
- **Device Control** - Change WiFi SSID/password, restart device
- **Trouble Ticket** - Submit and track support tickets
- **Profile Management** - Update contact information

### 📱 WhatsApp Integration
- **Notifications** - Invoice reminders, payment confirmations
- **Bot Commands** - Check balance, view invoices, submit tickets
- **Broadcast** - Mass notifications to customers

---

## 🛠️ Tech Stack

### Backend
- **Node.js** v14+ with Express.js
- **SQLite3** - Local database
- **MySQL** - RADIUS database (optional)
- **Session Management** - express-session
- **Authentication** - Custom middleware

### Frontend
- **EJS Templates** - Server-side rendering
- **Bootstrap 5** - Responsive UI framework
- **Chart.js / Recharts** - Data visualization
- **Leaflet** - Interactive maps

### Integrations
- **FreeRADIUS** - PPPoE authentication
- **GenieACS** - TR-069 device management
- **Baileys** - WhatsApp gateway
- **Net-SNMP** - SNMP protocol
- **Mikrotik API** - Router management (optional)

---

## 📦 Installation

### Prerequisites

```bash
# Node.js 14+
node --version

# npm or yarn
npm --version

# Database options:
# - SQLite3 (bundled with package) - Default untuk development
# - PostgreSQL 12+ (recommended for production)

# Optional:
# - MySQL (for RADIUS)
# - FreeRADIUS (for PPPoE authentication)
```

### Quick Start

#### Option A: SQLite (Development/Small Scale)

1. **Clone Repository**
```bash
git clone https://github.com/feedad/kilusi-bill.git
cd kilusi-bill
```

2. **Install Dependencies**
```bash
npm install
```

3. **Initialize Database**
```bash
npm run migrate:init
npm run migrate:multi
```

4. **Configure Settings**
```bash
cp settings.server.template.json settings.json
# Edit settings.json dengan konfigurasi Anda
```

5. **Start Application**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

#### Option B: PostgreSQL (Production/Large Scale)

1. **Install PostgreSQL**
```bash
# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib

# CentOS/RHEL
sudo yum install postgresql-server postgresql-contrib
```

2. **Create Database**
```bash
sudo -u postgres psql
CREATE DATABASE kilusi_bill;
CREATE USER kilusi_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE kilusi_bill TO kilusi_user;
\q
```

3. **Clone & Install**
```bash
git clone https://github.com/feedad/kilusi-bill.git
cd kilusi-bill
npm install
```

4. **Configure PostgreSQL Settings**
Edit `settings.json`:
```json
{
  "postgres_host": "localhost",
  "postgres_port": "5432",
  "postgres_database": "kilusi_bill",
  "postgres_user": "kilusi_user",
  "postgres_password": "your_password",
  "postgres_pool_max": "20"
}
```

Or use environment variables:
```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DATABASE=kilusi_bill
export POSTGRES_USER=kilusi_user
export POSTGRES_PASSWORD=your_password
```

5. **Initialize PostgreSQL Database**
```bash
npm run pg:init
```

6. **Migrate Data from SQLite (Optional)**
```bash
# If you have existing SQLite data
npm run pg:migrate
```

7. **Start Application**
```bash
npm start
```

8. **Access Application**
```
Admin Panel: http://localhost:3000/admin
Customer Portal: http://localhost:3000
Default Admin: admin / aw3s0me17
```

---

## ⚙️ Configuration

### settings.json

```json
{
  "monitor_mode": "snmp",
  "user_auth_mode": "radius",
  "server_port": 3000,
  
  "postgres_host": "localhost",
  "postgres_port": "5432",
  "postgres_database": "kilusi_bill",
  "postgres_user": "postgres",
  "postgres_password": "",
  "postgres_pool_max": "20",
  
  "snmp_monitoring_enabled": true,
  "snmp_community": "public",
  "snmp_version": "2c",
  
  "radius_enabled": true,
  "radius_host": "localhost",
  "radius_db_name": "radius",
  
  "mikrotik_api_enabled": false,
  
  "genieacs_enabled": true,
  "genieacs_url": "http://localhost:7557",
  
  "whatsapp_enabled": true,
  "session_secret": "your-secret-key"
}
```

### Database Migration

#### SQLite Commands
```bash
# Initialize SQLite database
npm run migrate:init

# Add multi-NAS and multi-Mikrotik support
npm run migrate:multi

# Run all SQLite migrations
npm run migrate:all

# Check database structure
npm run db:check
```

#### PostgreSQL Commands
```bash
# Initialize PostgreSQL schema
npm run pg:init

# Migrate existing SQLite data to PostgreSQL
npm run pg:migrate
```

### Switching from SQLite to PostgreSQL

1. **Backup your SQLite data**
```bash
cp billing.db billing.db.backup
```

2. **Install and configure PostgreSQL** (see Quick Start Option B)

3. **Initialize PostgreSQL schema**
```bash
npm run pg:init
```

4. **Migrate your data**
```bash
npm run pg:migrate
```

5. **Update your code** to use PostgreSQL billing module:
```javascript
// In routes or wherever billing is used
// const billing = require('./config/billing'); // Old SQLite version
const billing = require('./config/billing-postgres'); // New PostgreSQL version
```

6. **Restart application**
```bash
npm start
```

---

## 📖 Documentation

### API Endpoints

#### Admin Routes
- `GET /admin/dashboard` - Admin dashboard
- `GET /admin/billing/api/customers` - Customer list
- `GET /admin/billing/api/invoices` - Invoice list
- `GET /admin/billing/api/packages` - Package list
- `GET /admin/mikrotik/pppoe-active` - Active PPPoE sessions
- `GET /admin/radius/nas` - RADIUS NAS list
- `GET /admin/snmp/devices` - SNMP devices
- `GET /admin/olt/devices` - OLT devices

#### Customer Routes
- `GET /customer/dashboard` - Customer dashboard
- `GET /customer/billing/invoices` - Customer invoices
- `GET /customer/billing/payments` - Payment history
- `POST /customer/change-ssid` - Update WiFi SSID
- `POST /customer/restart-device` - Restart ONT/ONU

### Monitoring Modes

**SNMP Mode** (Recommended)
- Uses SNMP for device monitoring
- RADIUS for authentication
- No Mikrotik API required
- Better multi-router support

**Mikrotik API Mode**
- Direct Mikrotik API access
- Real-time PPPoE management
- Requires API credentials

### RADIUS Integration

Configure FreeRADIUS to use this system as NAS:

```bash
# raddb/clients.conf
client kilusi-nas {
    ipaddr = 192.168.1.1
    secret = testing123
    nastype = other
}
```

### OLT Configuration

Add OLT devices in settings.json:

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

---

## 🎯 Usage Guide

### Admin Dashboard

**Access:** `http://localhost:3000/admin`

**Features:**
- Real-time monitoring dashboard
- Customer & billing management
- Network device management
- Analytics & reports
- System configuration

### Customer Portal

**Access:** `http://localhost:3000`

**Features:**
- Login dengan phone/username PPPoE
- View invoices & payment history
- Device control (SSID, password, reboot)
- Trouble ticket submission
- Service information

### WhatsApp Bot (Optional)

Setup WhatsApp bot untuk customer service:

```bash
# Enable WhatsApp in settings.json
"whatsapp_enabled": true

# Start aplikasi dan scan QR code
npm start
```

**Bot Commands:**
- `status` - Check connection status
- `info` - Service information
- `invoice` - View latest invoice
- `ticket [message]` - Create support ticket

---

## 🔧 Troubleshooting

### Common Issues

**Database locked error:**
```bash
# Stop all running instances
pkill node

# Restart application
npm start
```

**RADIUS connection failed:**
```bash
# Check RADIUS server status
systemctl status freeradius

# Test RADIUS connection
radtest username password localhost 0 testing123
```

**SNMP timeout:**
```bash
# Test SNMP connectivity
snmpwalk -v2c -c public 192.168.1.1 system

# Check firewall rules
iptables -L | grep snmp
```

**GenieACS connection error:**
```bash
# Check GenieACS status
systemctl status genieacs-cwmp

# Verify GenieACS URL in settings.json
curl http://localhost:7557/devices
```

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

### Production Deployment with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start app.js --name kilusi-bill

# Auto-start on server reboot
pm2 startup
pm2 save

# Monitor logs
pm2 logs kilusi-bill

# Restart application
pm2 restart kilusi-bill
```

### Docker Deployment (Optional)

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "app.js"]
```

```bash
# Build image
docker build -t kilusi-bill .

# Run container
docker run -d -p 3000:3000 \
  -v $(pwd)/billing.db:/app/billing.db \
  -v $(pwd)/settings.json:/app/settings.json \
  --name kilusi-bill \
  kilusi-bill
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 📊 Performance Tips

1. **Database optimization**
```bash
# Regular vacuum
sqlite3 billing.db "VACUUM;"

# Analyze query performance
sqlite3 billing.db ".explain SELECT * FROM customers"
```

2. **Enable caching**
```json
{
  "cache_enabled": true,
  "cache_ttl": 300
}
```

3. **Monitor memory usage**
```bash
pm2 monit
```

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 📝 License

This project is licensed under the ISC License.

---

## 🎉 Acknowledgments

- FreeRADIUS Team
- GenieACS Project
- Mikrotik Community
- Node.js Community
- All Contributors

---



**Jangan lupa untuk mengkonfigurasi file `settings.json` terlebih dahulu sebelum menjalankan aplikasi!**

# Kilusi - Admin Portal WhatsApp Gateway

Aplikasi Admin Portal untuk manajemen layanan internet dengan integrasi WhatsApp Gateway, GenieACS, dan MikroTik.

## Fitur Utama

- Manajemen pelanggan dengan GenieACS
- Monitoring PPPoE dan Hotspot MikroTik
- Notifikasi WhatsApp otomatis
- Portal pelanggan self-service
- Manajemen gangguan (trouble ticket)

## Persyaratan

- Docker dan Docker Compose
- Node.js 16+ (hanya untuk pengembangan)
- Akun Docker Hub (untuk publish image)

## Instalasi dengan Docker

### 1. Pull Image dari Docker Hub

```bash
docker pull kilusi/kilusi-bill:1.0
```

### 2. Jalankan dengan Docker Compose

1. Buat direktori untuk data:
   ```bash
   mkdir -p kilusi-bill/data
   cd kilusi-bill
   ```

2. Buat file `docker-compose.yml`:
   ```yaml
   version: '3.8'
   
   services:
     kilusi-bill:
       image: kilusi/kilusi-bill:1.1
       container_name: kilusi-bill-app
       restart: unless-stopped
       ports:
         - "3001:3001"
       volumes:
         - ./data/img:/usr/src/app/public/img
         - ./data/settings.json:/usr/src/app/settings.json
       environment:
         - NODE_ENV=production
   ```

3. Buat direktori dan file konfigurasi:
   ```bash
   mkdir -p data/img
   touch data/settings.json
   chmod -R 777 data  # Pastikan container bisa menulis
   ```

4. Jalankan aplikasi:
   ```bash
   docker-compose up -d
   ```

5. Buka browser ke `http://localhost:3001`

## Build Image Sendiri

1. Clone repositori:
   ```bash
   git clone https://github.com/Kilusi/kilusi-bill.git
   cd kilusi-bill
   ```

2. Build image:
   ```bash
   docker build -t kilusi/kilusi-bill:latest .
   ```

3. Push ke Docker Hub:
   ```bash
   docker login
   docker push username/kilusi-bill:latest
   ```

## Variabel Lingkungan

- `NODE_ENV`: Environment (production/development)
- `PORT`: Port yang digunakan (default: 4000)
- `WHATSAPP_SESSION_PATH`: Lokasi penyimpanan session WhatsApp
- `GENIEACS_URL`: URL GenieACS
- `MIKROTIK_HOST`, `MIKROTIK_USER`, `MIKROTIK_PASS`: Kredensial MikroTik

## Lisensi

MIT
