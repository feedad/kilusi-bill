# 🚀 Kilusi Bill - ISP Billing & Management System

Sistem billing dan management untuk ISP lengkap dengan RADIUS authentication, monitoring SNMP, dan WhatsApp notifications.

## 📋 Fitur Utama

### 🔐 Authentication & User Management
- **RADIUS Authentication** - Manajemen user hotspot/PPPoE
- **Multi-Device Support** - Support Mikrotik, OLT, dan perangkat RADIUS lainnya
- **Group Management** - Pengelompokan user dengan hak akses berbeda
- **Session Control** - Monitoring dan kontrol koneksi user

### 💰 Billing & Payments
- **Invoice System** - Tagihan otomatis dengan template customizable
- **Payment Tracking** - Tracking pembayaran cash, transfer, e-wallet
- **Auto-Isolir** - Penonaktifan otomatis untuk pelanggan telat bayar
- **Package Management** - Berbagai paket layanan dengan harga dan fitur berbeda
- **Grace Period** - Masa tenggang sebelum isolir

### 📊 Network Monitoring
- **SNMP Monitoring** - Monitor OLT, Mikrotik, dan perangkat jaringan
- **Real-time Dashboard** - Monitoring pelanggan online dan traffic
- **OLT Device Management** - Monitor signal power dan status ONU
- **Bandwidth Monitoring** - Tracking upload/download usage
- **Alert System** - Notifikasi untuk device down atau threshold terlampaui

### 📱 Notifications & Communication
- **WhatsApp Notifications** - Notifikasi otomatis ke pelanggan
- **Payment Reminders** - Pengingat pembayaran dan tagihan
- **System Alerts** - Notifikasi untuk admin dan technician
- **Multi-Channel Support** - WhatsApp, SMS (extensible)

### 🎯 Customer Management
- **Customer Database** - Data lengkap pelanggan dan kontak
- **Package Assignment** - Assign dan ubah paket pelanggan
- **Status Management** - Active, inactive, suspended, isolated
- **Address & Location** - Data alamat dan GPS coordinates
- **Communication History** - Riwayat komunikasi dengan pelanggan

### 🔧 System Features
- **Web Dashboard** - Interface admin yang user-friendly
- **API Integration** - RESTful API untuk integrasi external
- **Backup System** - Backup otomatis database dan konfigurasi
- **Multi-Admin Support** - Multiple admin dengan role-based access
- **Reporting** - Laporan penjualan, penggunaan, dan performance

## 🚀 Quick Start

### System Requirements
- **OS**: Ubuntu 20.04+ / Debian 10+
- **RAM**: Minimum 2GB, Recommended 4GB+
- **Storage**: Minimum 20GB, Recommended 50GB+
- **Network**: Static IP untuk RADIUS devices
- **Docker**: Docker & Docker Compose (auto-installed)
- **Node.js**: Version 18.x or later (for development)
- **PostgreSQL**: Version 14+ (for development)

### 🛠️ Development Setup

For local development without Docker:

```bash
# 1. Clone repository
git clone https://github.com/feedad/kilusi-bill.git
cd kilusi-bill

# 2. Install backend dependencies
cd backend
npm install

# 3. Setup environment variables
cp .env.example .env
# Edit .env with your database configuration

# 4. Install frontend dependencies
cd ../frontend
npm install

# 5. Start development servers
# Backend (terminal 1)
cd ../backend
npm run dev

# Frontend (terminal 2)
cd ../frontend
npm run dev

# Access application
# Frontend: http://localhost:3001
# Backend API: http://localhost:3000
# Default login: admin/aw3s0me17 (check settings.json)
```

### 🎯 Auto Install (Recommended)

Untuk server baru Ubuntu/Debian:

```bash
# 1. Clone repository
git clone https://github.com/feedad/kilusi-bill.git
cd kilusi-bill

# 2. Run auto installer
chmod +x install.sh
./install.sh

# 3. Follow prompts and reboot when completed
```

**Auto installer akan otomatis:**
- ✅ Install Node.js, Docker, PostgreSQL client
- ✅ Setup project directories dan permissions
- ✅ Install backend & frontend dependencies
- ✅ Konfigurasi Docker services (PostgreSQL + FreeRADIUS)
- ✅ Setup systemd services untuk auto-start
- ✅ Konfigurasi firewall dengan port yang diperlukan
- ✅ Setup SSL certificate (optional)
- ✅ Setup backup otomatis harian
- ✅ Create admin user default

### 🔧 Manual Install

Jika prefer install manual:

```bash
# 1. Install system dependencies
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential docker.io docker-compose-plugin

# 2. Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Clone dan setup project
git clone https://github.com/feedad/kilusi-bill.git
cd kilusi-bill

# 4. Copy konfigurasi production
cp config/production.env backend/.env
cp config/production.settings.json backend/settings.json
cp config/production.frontend.env frontend/.env.local
cp .env.docker.example .env

# 5. Install dependencies
cd backend && npm install --production
cd ../frontend && npm install && npm run build

# 6. Start Docker services
cd ..
./docker-start.sh start

# 7. Setup systemd services
sudo config/setup-services.sh
```

## ⚙️ Konfigurasi Awal

Setelah install selesai, edit file konfigurasi:

```bash
# Backend configuration
sudo nano /opt/kilusi-bill/backend/.env
sudo nano /opt/kilusi-bill/backend/settings.json

# Frontend configuration
sudo nano /opt/kilusi-bill/frontend/.env.local

# Docker configuration
sudo nano /opt/kilusi-bill/.env
```

**🔐 Konfigurasi WAJIB diubah:**
- **Database Password** - `POSTGRES_PASSWORD`
- **RADIUS Secret** - `RADIUS_PASSWORD`, radius client secrets
- **Admin Password** - `admin_password` di settings.json
- **API Secrets** - `API_SECRET`, `JWT_SECRET`, `SESSION_SECRET`
- **WhatsApp Numbers** - `admin_numbers`, `technician_numbers`
- **Payment Info** - `payment_accounts`
- **Company Info** - `COMPANY_NAME`, `footer_info`

**🔄 Restart services setelah konfigurasi:**
```bash
sudo systemctl restart kilusi-bill-docker
sudo systemctl restart kilusi-bill-backend
sudo systemctl restart kilusi-bill-frontend
```

## 🌐 Access Application

Setelah install dan konfigurasi:

### Production URLs
- **Frontend**: `http://YOUR_SERVER_IP:3001`
- **Backend API**: `http://YOUR_SERVER_IP:3000`
- **PgAdmin**: `http://YOUR_SERVER_IP:5050` (jika diaktifkan)
- **API Docs**: `http://YOUR_SERVER_IP:3000/api/v1/docs`

### Default Login
- **Username**: `admin`
- **Password**: `aw3s0me17` (ubah setelah install di settings.json)

## 🎯 Current Development Status

### ✅ Completed Features (as of November 2025)

#### Frontend (Next.js + TypeScript)
- **Customer Management System** with full CRUD operations
  - Customer creation with form validation
  - Customer listing with search and filtering
  - Customer detail modal with comprehensive information
  - Edit functionality with pre-populated forms
  - Delete functionality with confirmation dialogs
- **Interactive Map Integration** using react-leaflet
  - Draggable markers for location selection
  - Click-to-set location functionality
  - GPS location detection
  - Coordinate input fields with validation
  - Address geocoding integration
- **Real API Integration**
  - Regions dropdown populated from database (11 regions)
  - Packages dropdown with real service packages
  - Router/NAS dropdown with RADIUS integration
  - All dropdowns using native HTML selects (replaced problematic shadcn/ui components)

#### Backend (Node.js + Express + PostgreSQL)
- **Authentication System** with JWT tokens
- **API Endpoints** for customers, regions, packages, and NAS management
- **Database Integration** with proper field mapping
- **Error Handling** with comprehensive validation

### 🔧 Technical Improvements Made
- **Fixed Dropdown Data Loading**: Replaced shadcn/ui Select components with native HTML selects
- **Restored Map Functionality**: Fixed SSR issues with react-leaflet using dynamic imports
- **API Field Mapping**: Corrected field name mismatches between API and frontend
- **Error Handling**: Added safety checks for array operations
- **State Management**: Implemented proper create/edit mode handling

### 📊 Database Status
- **11 Regions** loaded with hierarchical administrative data
- **Service Packages** integrated with pricing and features
- **RADIUS/NAS Devices** with status monitoring
- **Customer Data** with coordinate mapping

### 🌐 Access Points
- **Development Frontend**: http://localhost:3001
- **Development Backend**: http://localhost:3000
- **API Documentation**: http://localhost:3000/api/v1/docs

## 🔧 Management Commands

### Service Management
```bash
# Check status semua services
systemctl status kilusi-bill-*

# Restart services
sudo systemctl restart kilusi-bill-docker
sudo systemctl restart kilusi-bill-backend
sudo systemctl restart kilusi-bill-frontend

# View logs
sudo journalctl -u kilusi-bill-docker -f
sudo journalctl -u kilusi-bill-backend -f
sudo journalctl -u kilusi-bill-frontend -f
```

### Docker Management
```bash
# Start/stop Docker services
/opt/kilusi-bill/docker-start.sh start
/opt/kilusi-bill/docker-start.sh stop
/opt/kilusi-bill/docker-start.sh restart

# Check status
/opt/kilusi-bill/docker-start.sh status

# Test RADIUS authentication
/opt/kilusi-bill/docker-start.sh test-radius

# Reset database (WARNING: menghapus semua data!)
/opt/kilusi-bill/docker-start.sh reset
```

### Backup & Restore
```bash
# Manual backup
/usr/local/bin/kilusi-bill-backup

# Restore database
docker exec -i kilusi-postgres psql -U kilusi_user kilusi_bill < backup.sql

# View backup files
ls -la /var/backups/kilusi-bill/
```

## 📊 Device Configuration

### RADIUS Clients Setup

Tambahkan device RADIUS (Mikrotik, OLT, dll) di:
1. **Backend settings.json** - Update `radius_nas_clients` array
2. **Docker freeradius/clients.conf** - Client configuration
3. **Device Configuration** - Setup RADIUS client di device

**Example Mikrotik Setup:**
```bash
# Di Mikrotik CLI
/radius add service=ppp address=YOUR_SERVER_IP secret=YOUR_SECRET timeout=300s
/radius incoming set accept=yes port=1813
```

### SNMP Monitoring Setup

Untuk monitor device dengan SNMP:
1. **Enable SNMP** di target device
2. **Update SNMP configuration** di settings.json
3. **Test SNMP connection** dengan script monitoring

**Example OLT Setup:**
```bash
# Update settings.json
snmp_host: "192.168.88.10"
snmp_community: "your_community"
snmp_interface: "gpon-olt"
```

## 🔐 Security Best Practices

### Production Security
1. **Ubah semua default passwords** dan secrets
2. **Generate strong random secrets** untuk JWT, session, API
3. **Enable firewall** dan hanya buka port yang diperlukan:
   - Port 3000 (Backend API)
   - Port 3001 (Frontend)
   - Port 1812/1813 (RADIUS UDP)
   - Port 5050 (PgAdmin, jika diperlukan)
4. **Use HTTPS** dengan SSL certificate
5. **Regular backups** dan monitoring
6. **Update system** secara berkala

### File Permissions
```bash
# Secure configuration files
sudo chmod 600 /opt/kilusi-bill/backend/.env
sudo chmod 600 /opt/kilusi-bill/backend/settings.json
sudo chmod 600 /opt/kilusi-bill/.env

# Secure logs
sudo chmod 755 /var/log/kilusi-bill
sudo chmod 644 /var/log/kilusi-bill/*
```

## 📋 Database Schema

### Main Database (`kilusi_bill`)
- `customers` - Data pelanggan dan kontak
- `packages` - Paket layanan dan harga
- `payments` - Riwayat pembayaran
- `invoices` - Tagihan pelanggan
- `network_devices` - Device jaringan (OLT, Mikrotik, dll)
- `olt_devices`, `onu_devices` - Spesifik OLT/ONU data
- `online_sessions` - Session pelanggan aktif
- `system_logs` - Log sistem dan audit trail

### RADIUS Database (`radius`)
- `radcheck`, `radreply` - User authentication attributes
- `radgroupcheck`, `radgroupreply` - Group attributes
- `radusergroup` - User to group mapping
- `radacct` - RADIUS accounting records
- `nas` - RADIUS client configuration
- `radpostauth` - Authentication attempt logs

## 🔍 Troubleshooting

### Common Issues

**Service tidak start:**
```bash
# Check logs
sudo journalctl -u kilusi-bill-docker -f

# Check Docker containers
docker ps
docker logs kilusi-postgres
docker logs kilusi-freeradius
```

**Database connection error:**
```bash
# Test connection
docker exec -it kilusi-postgres psql -U kilusi_user -d kilusi_bill

# Check service status
/opt/kilusi-bill/docker-start.sh status
```

**RADIUS authentication failed:**
```bash
# Test RADIUS
docker exec -it kilusi-freeradius radtest testuser test123 localhost 1812 testing123

# Check RADIUS logs
/opt/kilusi-bill/docker-start.sh logs freeradius
```

**Port conflicts:**
```bash
# Check used ports
sudo netstat -tulpn | grep -E ':(3000|3001|1812|1813|5432|5050)'

# Kill processes if needed
sudo fuser -k 3000/tcp
sudo fuser -k 3001/tcp
```

## 📝 API Documentation

Setelah backend berjalan, akses:
- **API Documentation**: `http://YOUR_SERVER_IP:3000/api/v1/docs`
- **Health Check**: `http://YOUR_SERVER_IP:3000/api/v1/health`

## 🔄 Updates & Maintenance

### Update Application
```bash
# Backup data
/usr/local/bin/kilusi-bill-backup

# Update code
cd /opt/kilusi-bill
git pull origin main

# Update dependencies
cd backend && npm install --production
cd ../frontend && npm install && npm run build

# Restart services
sudo systemctl restart kilusi-bill-backend
sudo systemctl restart kilusi-bill-frontend
```

### Maintenance Commands
```bash
# Clean Docker
docker system prune -f

# Clean old logs
sudo journalctl --vacuum-time=7d

# Update system packages
sudo apt update && sudo apt upgrade -y
```

## 🤝 Support

### Getting Help
1. **Check documentation** - Lihat konfigurasi di `config-examples/README.md`
2. **Check logs** - `/var/log/kilusi-bill/` dan `journalctl`
3. **Community support** - GitHub issues dan discussions
4. **Professional support** - Available for enterprise customers

### Documentation
- **Installation Guide** - This README
- **Configuration Guide** - `config-examples/README.md`
- **Docker Guide** - `docker/README.md`
- **API Reference** - Available at `/api/v1/docs`

---

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

---

**🎉 Selamat menggunakan Kilusi Bill!**