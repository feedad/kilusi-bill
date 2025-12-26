# Kilusi Bill - ISP Billing & Management System

<div align="center">

![Kilusi Bill](docs/images/logo.png)

**Modern ISP Billing System with FreeRADIUS Integration & Multi-NAS SNMP Monitoring**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-%3E%3D13-blue.svg)](https://www.postgresql.org/)
[![FreeRADIUS](https://img.shields.io/badge/freeradius-3.x-orange.svg)](https://freeradius.org/)

</div>

---

## 🌟 Fitur Utama

### 💼 Manajemen Pelanggan
- **Split Architecture** - Customer identity terpisah dari services untuk menghindari duplikasi data
- Kelola multiple services per customer
- Regional management dengan geographical organization
- Customer portal dengan token-based authentication
- Referral system dengan komisi otomatis

### 📊 Billing & Invoicing
- Multiple billing cycles (profile-based, fixed day, monthly)
- Automated invoice generation
- Multi-payment gateway integration (Tripay)
- Discount management (percentage & fixed amount)
- Tax calculation (PPh 23, PPN)
- Payment history & financial reports

### 🔐 FreeRADIUS Integration
- **Native `nas` table** - Compatible dengan FreeRADIUS standard
- Multi-NAS support out of the box
- PPPoE authentication (radcheck/radreply)
- Group-based policies (radgroupcheck/radgroupreply)
- Real-time accounting (radacct)
- Session tracking & connection monitoring

### 📡 Multi-NAS SNMP Monitoring
- **20+ monitoring metrics** per NAS
- CPU & Memory usage tracking
- Interface traffic statistics (real-time)
- Active connections monitoring
- System uptime & health status
- SNMPv2c & SNMPv3 support
- Automatic health checks (configurable interval)
- Batch monitoring untuk efisiensi
- Support MikroTik, Cisco, dan devices lainnya

### 🌐 Network Infrastructure
- ODP (Optical Distribution Point) management
- Cable routing & port management
- Signal quality monitoring
- Installation tracking
- Network topology visualization

### 📱 Notifikasi & Komunikasi
- WhatsApp Cloud API integration
- Broadcast messaging
- Automated payment reminders
- Installation notifications
- Service status alerts

### 📈 Dashboard & Reports
- Real-time monitoring dashboard
- Financial reports (revenue, expenses)
- Customer analytics
- Service statistics
- SNMP monitoring dashboard
- Network performance metrics

---

## 🚀 Quick Start

### Opsi 1: Automated Installation (Recommended)

```bash
# Clone repository
git clone https://github.com/your-username/kilusi-bill.git
cd kilusi-bill

# Make installer executable
chmod +x install.sh

# Run installer
./install.sh

# Select deployment mode:
# 1. Docker DB/RADIUS + Native Backend/Frontend
# 2. DB/RADIUS Only (for multi-server setup)
# 3. Docker DB/RADIUS/Backend + Native Frontend
# 4. All Native (full server installation)
# 5. All Docker (full containerized)

# Follow the interactive prompts
# Default credentials: admin / admin
```

### Opsi 2: Quick Docker (Development)

```bash
# Clone repository
git clone https://github.com/your-username/kilusi-bill.git
cd kilusi-bill

# Copy environment file
cp .env.docker.example .env

# Start all services
docker-compose up -d

# Access application
# Backend API: http://localhost:3001
# Login: admin / admin
```

---

## 📋 Deployment Scenarios

Kilusi Bill mendukung **5 skenario deployment** yang fleksibel:

| # | Deployment Mode | Database | FreeRADIUS | Backend | Frontend | Use Case |
|---|----------------|----------|------------|---------|----------|----------|
| **1** | Docker DB/RADIUS + Native | Docker | Docker | Native | Native | Hybrid production |
| **2** | DB/RADIUS Only (Multi-server) | Configurable | Configurable | - | - | Multi-server setup |
| **3** | Docker Backend Stack | Docker | Docker | Docker | Native | Containerized backend |
| **4** | All Native | Native | Native | Native | Native | Full control production |
| **5** | All Docker | Docker | Docker | Docker | Docker | Dev & quick deployment |

### Mode 2: Multi-Server Flexibility

Mode 2 memberikan fleksibilitas untuk setup multi-server dengan 3 sub-opsi:

- **Database Only** - Install PostgreSQL saja (untuk dedicated DB server)
- **FreeRADIUS Only** - Install FreeRADIUS saja (untuk dedicated RADIUS server)  
- **Both** - Install keduanya di satu server

Cocok untuk:
- Separate database server
- Dedicated RADIUS server
- High-availability setups
- Load balancing scenarios

---

## 🏗️ Arsitektur

### Database Schema (Split Architecture)

```
customers (Identity)
    ├── services (Subscriptions)
    │   ├── technical_details (PPPoE Auth)
    │   └── network_infrastructure (Physical Layer)
    └── invoices (Billing)

nas (Network Access Servers + SNMP)
    ├── radcheck (Auth)
    ├── radreply (Reply Attributes)
    └── radacct (Accounting)

packages (Service Plans)
regions (Geographical)
odps (Optical Distribution Points)
```

### Technology Stack

**Backend:**
- Node.js + Express.js
- PostgreSQL 13+
- FreeRADIUS 3.x
- SNMP monitoring (net-snmp)

**Frontend:**
- Next.js 14
- React 18
- TailwindCSS
- Shadcn/ui components

**Infrastructure:**
- Docker & Docker Compose
- Nginx (reverse proxy)
- PM2 (process manager)
- Systemd (native deployment)

---

## 📦 Installation Requirements

### Minimum Requirements:
- **OS**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 20GB
- **Node.js**: v18.0.0+
- **PostgreSQL**: v13+
- **Docker** (optional): v20.10+
- **Docker Compose** (optional): v2.0+

### Recommended for Production:
- **CPU**: 4+ cores
- **RAM**: 8GB+
- **Storage**: 50GB+ (SSD)
- **Backup**: Daily automated backups

---

## 🔧 Configuration

### Environment Variables

```bash
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=kilusi_bill
POSTGRES_USER=kilusi_user
POSTGRES_PASSWORD=your_secure_password

# FreeRADIUS
RADIUS_HOST=localhost
RADIUS_SECRET=your_radius_secret

# Backend
NODE_ENV=production
BACKEND_PORT=3001
SESSION_SECRET=your_session_secret

# SNMP Monitoring
SNMP_MONITOR_ENABLED=true
SNMP_MONITOR_INTERVAL=3  # minutes

# Optional Integrations
WHATSAPP_ACCESS_TOKEN=your_whatsapp_token
TRIPAY_API_KEY=your_tripay_key
```

Lihat [.env.docker.example](.env.docker.example) untuk konfigurasi lengkap.

---

## 📖 Documentation

- **[Installation Guide](README-SETUP.md)** - Petunjuk instalasi lengkap
- **[Changelog](CHANGELOG.md)** - Version history & upgrade guide
- **[License](LICENSE)** - MIT License
- **[Folder Structure](docs/README.md)** - Project organization

### Technical Documentation

- **[Master Schema](scripts/master-schema.sql)** - Complete database schema
- **[Migration Script](backend/migrations/001_rename_nas_servers_to_nas.sql)** - nas_servers → nas migration
- **[FreeRADIUS SQL Config](freeradius/config/mods-available/sql)** - RADIUS integration
- **[Environment Template](.env.docker.example)** - Configuration examples

---

## 🛠️ Development

### Setup Development Environment

```bash
# Clone repository
git clone https://github.com/your-username/kilusi-bill.git
cd kilusi-bill

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Setup database
cd ..
psql -U postgres -c "CREATE DATABASE kilusi_bill;"
psql -U postgres -d kilusi_bill -f scripts/master-schema.sql

# Configure environment
cp backend/.env.example backend/.env
nano backend/.env

# Start backend (development mode)
cd backend
npm run dev

# Start frontend (development mode)
cd ../frontend
npm run dev
```

### Run Tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

### Database Migration

```bash
# For existing installations with nas_servers table
psql -U kilusi_user -d kilusi_bill -f backend/migrations/001_rename_nas_servers_to_nas.sql
```

---

## 🤝 Contributing

Kontribusi sangat diterima! Silakan:

1. Fork repository
2. Buat feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push ke branch (`git push origin feature/AmazingFeature`)
5. Buat Pull Request

Lihat [CONTRIBUTING.md](CONTRIBUTING.md) untuk guidelines lengkap.

---

## 📝 Changelog

Lihat [CHANGELOG.md](CHANGELOG.md) untuk history perubahan.

### Current Version: 1.0.0 (2025-12-26)

**Initial Release:**
- ✅ Complete ISP billing & management system
- ✅ FreeRADIUS integration with `nas` table
- ✅ Multi-NAS SNMP monitoring (20+ metrics)
- ✅ Automated installation with 5 deployment scenarios
- ✅ Docker Compose support
- ✅ Split architecture database design
- ✅ Comprehensive documentation

---

## 🐛 Bug Reports & Feature Requests

Gunakan [GitHub Issues](https://github.com/your-username/kilusi-bill/issues) untuk:
- Melaporkan bugs
- Request fitur baru
- Diskusi teknis

---

## 📄 License

This project is licensed under the MIT License - lihat [LICENSE](LICENSE) file untuk detail.

---

## 👥 Authors

- **Kilusi Development Team**

---

## 🙏 Acknowledgments

- [FreeRADIUS](https://freeradius.org/) - RADIUS server
- [PostgreSQL](https://www.postgresql.org/) - Database
- [Next.js](https://nextjs.org/) - React framework
- [TailwindCSS](https://tailwindcss.com/) - CSS framework
- [Shadcn/ui](https://ui.shadcn.com/) - UI components

---

## 📞 Support

Untuk support dan pertanyaan:
- 📧 Email: support@kilusi-bill.local
- 💬 Discord: [Join our server](https://discord.gg/kilusi-bill)
- 📖 Documentation: [docs.kilusi-bill.local](https://docs.kilusi-bill.local)

---

<div align="center">

**Made with ❤️ by Kilusi Development Team**

[Website](https://kilusi-bill.local) • [Documentation](docs/) • [Demo](https://demo.kilusi-bill.local)

</div>