# 🌐 Kilusi Bill - ISP Billing & Management System

<div align="center">

![Kilusi Bill Logo](https://via.placeholder.com/600x200/1e40af/ffffff?text=Kilusi+Bill+ISP+Management)

**Comprehensive ISP Billing and Network Management Solution**

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-%3E%3D13-blue.svg)](https://www.postgresql.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14+-black.svg)](https://nextjs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

[Features](#-features) • [Installation](#-installation) • [Documentation](#-documentation) • [Demo](#-demo) • [Contributing](#-contributing)

</div>

## 📖 Overview

**Kilusi Bill** is a comprehensive ISP (Internet Service Provider) billing and management system built with modern web technologies. It provides complete solutions for customer management, billing automation, network monitoring, and customer support.

### 🎯 Perfect For:
- 📡 **Internet Service Providers** (Fiber, Wireless, Cable)
- 🏢 **Network Operators** of any size
- 💼 **Managed Service Providers**
- 🏘️ **Community Networks** and WISPs

## ✨ Fitur Utama

### 🏢 Manajemen Pelanggan & Layanan
- **Customer Management**: Manajemen data pelanggan dengan lokasi geografis
- **Package Management**: Pengelolaan paket layanan internet dengan harga flexible
- **Billing System**: Sistem penagihan otomatis dengan invoice bulanan
- **Payment Tracking**: Pencatatan pembayaran dengan berbagai metode
- **Customer Status**: Manajemen status pelanggan (aktif, suspend, isolir)

### 🌐 Integrasi Jaringan
- **RADIUS Authentication**: Integarsi FreeRADIUS untuk autentikasi pengguna
- **ODP Management**: Manajemen Optical Distribution Point untuk jaringan fiber
- **Customer Mapping**: Pemetaan lokasi pelanggan dengan koordinat GPS
- **Device Association**: Kaitkan pelanggan dengan perangkat jaringan

### 👥 Portal Pelanggan
- **Customer Portal**: Dashboard pelanggan untuk melihat tagihan
- **OTP Authentication**: Login aman dengan One-Time Password via WhatsApp
- **Invoice Viewing**: Lihat dan download invoice pelanggan
- **Support System**: Sistem tiket support untuk pelanggan
- **Mobile Friendly**: Interface responsif untuk mobile devices

### 📊 Sistem Penagihan & Diskon
- **Automated Invoicing**: Generate invoice otomatis setiap bulan
- **Installation Fees**: Biaya instalasi dengan konfigurasi flexible
- **Referral System**: Sistem referal pelanggan dengan diskon
- **Discount Management**: Manajemen diskon untuk pembayaran bulk
- **WhatsApp Notifications**: Notifikasi otomatis via WhatsApp

## 🛠️ Technology Stack

### Backend
- **Framework**: Node.js + Express.js
- **Database**: PostgreSQL with RADIUS integration
- **Authentication**: JWT with session management
- **Real-time**: Socket.io for WebSocket connections
- **Device Integration**: Mikrotik API, GenieACS TR-069, SNMP

### Frontend
- **Framework**: Next.js 14 with App Router
- **UI**: Tailwind CSS + Radix UI components
- **State Management**: Zustand with persistence
- **Maps**: React-Leaflet for geographic features
- **Forms**: React Hook Form with Zod validation

### Infrastructure
- **Authentication**: FreeRADIUS for network access
- **Database**: PostgreSQL + FreeRADIUS database
- **Containerization**: Docker support for services
- **Monitoring**: System logs and performance tracking

## 🚀 Installation

### Prerequisites
- **Node.js** 16.0 or higher
- **PostgreSQL** 13.0 or higher
- **Git** for version control
- **FreeRADIUS** (optional, for network authentication)

### 🎯 Option 1: Quick Setup with Docker (Recommended)
```bash
# Clone the repository
git clone https://github.com/feedad/kilusi-bill.git
cd kilusi-bill

# Start all services with Docker
./docker-start.sh start

# Access the application
# Frontend: http://localhost:3001
# Backend API: http://localhost:3000
# Admin Panel: http://localhost:3000/admin
```

### 🎯 Option 2: Server Deployment (PostgreSQL + FreeRADIUS Direct Installation)
```bash
# Clone the repository
git clone https://github.com/feedad/kilusi-bill.git
cd kilusi-bill

# Automated server deployment
./scripts/deploy-server.sh

# With options:
./scripts/deploy-server.sh --mode development    # Development mode
./scripts/deploy-server.sh --with-apps          # Include application deployment
./scripts/deploy-server.sh --db-only            # Database only
```

### 🎯 Option 3: Docker Deployment (PostgreSQL + FreeRADIUS in Containers)
```bash
# Clone the repository
git clone https://github.com/feedad/kilusi-bill.git
cd kilusi-bill

# Docker deployment
./scripts/deploy-docker.sh

# With options:
./scripts/deploy-docker.sh --mode development   # Development with PgAdmin
./scripts/deploy-docker.sh --detach            # Run detached
./scripts/deploy-docker.sh --with-apps         # Include applications
```

### 🎯 Option 4: Fresh Database Setup
```bash
# Clone the repository
git clone https://github.com/feedad/kilusi-bill.git
cd kilusi-bill

# Setup database with automation script
./scripts/setup-database.sh --demo-data

# Backend setup
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
npm run dev

# Frontend setup (new terminal)
cd frontend
npm install
npm run dev
```

## 🗄️ Database Setup

### Quick Database Initialization
```bash
# Run automated setup
./scripts/setup-database.sh

# With custom parameters
./scripts/setup-database.sh \
  --database my_isp_db \
  --user my_user \
  --password my_secure_password \
  --demo-data
```

### Manual Database Setup
```bash
# Create database and user
sudo -u postgres psql
CREATE DATABASE kilusi_bill;
CREATE USER kilusi_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE kilusi_bill TO kilusi_user;
\q

# Initialize schema
psql -h localhost -U kilusi_user -d kilusi_bill -f scripts/database-init.sql
```

## 🐳 Docker Setup

### Option A: Database + FreeRADIUS on Docker
```bash
# Clone and setup
git clone https://github.com/feedad/kilusi-bill.git
cd kilusi-bill

# Setup Docker services
./scripts/setup-docker.sh --option-a

# Access points:
# Frontend: http://localhost:3001
# Backend: http://localhost:3000
# PgAdmin: http://localhost:5050
```

### Option B: Full Stack Docker Compose
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

## 📱 Access Points

### Development Environment
- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin
- **API Documentation**: http://localhost:3000/api/v1/docs

### Default Credentials
- **Admin Username**: `admin`
- **Admin Password**: `admin123` (change after first login)

## 📚 Documentation

### Setup Guides
- 📖 [Complete Installation Guide](./README-SETUP.md)
- 🐳 [Docker Setup Guide](./docker/README.md)
- 🗄️ [Database Schema Documentation](./docs/database-schema.md)
- 🔌 [API Documentation](./docs/api-reference.md)

### User Guides
- 👨‍💼 [Admin Dashboard Guide](./docs/admin-guide.md)
- 👤 [Customer Portal Guide](./docs/customer-portal.md)
- 🔧 [RADIUS Integration Guide](./docs/radius-integration.md)

### Development
- 🛠️ [Development Setup](./docs/development.md)
- 🧪 [Testing Guide](./docs/testing.md)
- 🔄 [Migration Guide](./docs/migrations.md)

## 🎯 Deployment Options

### Development Environment
```bash
# Start development servers
npm run dev:all
```

### Production Deployment

#### Server Installation (Ubuntu/Debian)
```bash
# Auto installation script
chmod +x scripts/deploy-server.sh
./scripts/deploy-server.sh --mode production
```

#### Docker Deployment
```bash
# Production Docker compose
docker-compose -f docker-compose.prod.yml up -d
```

## 📊 Fitur Yang Tersedia


#### Sistem Inti
- **Customer Management**: CRUD data pelanggan dengan lokasi geografis
- **Package Management**: Manajemen paket layanan dan harga
- **Billing System**: Generate invoice otomatis setiap bulan
- **Payment Tracking**: Pencatatan pembayaran manual
- **RADIUS Integration**: Integarsi dengan FreeRADIUS untuk autentikasi
- **WhatsApp Notifications**: Notifikasi OTP dan tagihan via WhatsApp

#### Frontend
- **Admin Dashboard**: Interface admin dengan design responsif
- **Customer Portal**: Portal pelanggan dengan OTP authentication
- **Customer Maps**: Visualisasi lokasi pelanggan dengan koordinat GPS
- **Invoice Management**: Manajemen invoice dan pembayaran
- **Mobile Responsive**: Design yang adaptif untuk mobile devices

#### Backend
- **RESTful API**: API endpoints untuk frontend dan integrasi
- **Authentication System**: JWT tokens untuk admin authentication
- **Database Integration**: PostgreSQL sebagai database utama
- **Support System**: Sistem tiket support pelanggan
- **Referral System**: Sistem referal dengan diskon otomatis

## 🛠️ Management Commands

### Development Commands
```bash
# Install all dependencies
npm run install:all

# Start development servers
npm run dev:all

# Run database migrations
npm run migrate:all

# Run tests
npm run test
```

### Docker Management
```bash
# Start Docker services
./docker-start.sh start

# Check status
./docker-start.sh status

# Stop services
./docker-start.sh stop

# View logs
./docker-start.sh logs
```

### Database Management
```bash
# Setup fresh database
./scripts/setup-database.sh

# Create backup
pg_dump -h localhost -U kilusi_user -d kilusi_bill > backup.sql

# Restore database
psql -h localhost -U kilusi_user -d kilusi_bill < backup.sql
```

## 🔧 Configuration

### Backend Configuration (.env)
```bash
# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/kilusi_bill
DB_HOST=localhost
DB_PORT=5432
DB_NAME=kilusi_bill
DB_USER=kilusi_user
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your-jwt-secret-key
SESSION_SECRET=your-session-secret

# API Configuration
API_SECRET=your-api-secret

# WhatsApp Configuration
WHATSAPP_WEBHOOK_URL=webhook/whatsapp
ADMIN_WHATSAPP=+628123456789
```

### Frontend Configuration (.env.local)
```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3001

# WhatsApp Configuration
NEXT_PUBLIC_WHATSAPP_NUMBER=+628123456789
```

## 🔍 Troubleshooting

### Common Issues

#### Database Connection Error
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection
psql -h localhost -U kilusi_user -d kilusi_bill

# Check logs
sudo journalctl -u postgresql -f
```

#### Port Conflicts
```bash
# Check used ports
sudo netstat -tulpn | grep -E ':(3000|3001|1812|1813|5432)'

# Kill processes if needed
sudo fuser -k 3000/tcp
sudo fuser -k 3001/tcp
```

#### Docker Issues
```bash
# Check container status
docker ps

# View container logs
docker logs kilusi-postgres
docker logs kilusi-freeradius

# Restart services
docker-compose restart
```

## 📋 API Endpoints

### Authentication
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout
- `GET /api/v1/auth/verify` - Token verification

### Customer Management
- `GET /api/v1/customers` - List customers
- `POST /api/v1/customers` - Create customer
- `GET /api/v1/customers/:id` - Get customer details
- `PUT /api/v1/customers/:id` - Update customer
- `DELETE /api/v1/customers/:id` - Delete customer

### Billing
- `GET /api/v1/billing/invoices` - List invoices
- `POST /api/v1/billing/invoices` - Create invoice
- `GET /api/v1/billing/payments` - List payments
- `POST /api/v1/billing/payments` - Record payment

### Customer Portal
- `POST /api/v1/customer-auth/otp` - Request OTP
- `POST /api/v1/customer-billing/my-invoices` - Get customer invoices
- `GET /api/v1/customer-billing/invoices/:id` - Get invoice details

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

### How to Contribute
1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Setup
```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/kilusi-bill.git
cd kilusi-bill

# Install dependencies
npm run install:all

# Start development servers
npm run dev

# Run tests
npm run test
```

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2024 Kilusi Digital Network

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

## 🆘 Support

### Getting Help
- 📖 **Documentation**: Check our comprehensive docs
- 🐛 **Issues**: [Report bugs on GitHub](https://github.com/feedad/kilusi-bill/issues)
- 💬 **Community**: Join our support channels
- 📧 **Email**: support@kilusi.id

### Professional Support
- 🏢 **Enterprise Support**: Custom development and dedicated support
- 🔧 **Installation Service**: Professional setup and configuration
- 📚 **Training**: Comprehensive training for your team
- 🌐 **Hosting**: Managed hosting solutions


<div align="center">

![GitHub stars](https://img.shields.io/github/stars/feedad/kilusi-bill?style=social)
![GitHub forks](https://img.shields.io/github/forks/feedad/kilusi-bill?style=social)
![GitHub issues](https://img.shields.io/github/issues/feedad/kilusi-bill)
![GitHub pull requests](https://img.shields.io/github/issues-pr/feedad/kilusi-bill)

**⭐ Star this repository if it helped you!**

</div>

---

<div align="center">

**Built with ❤️ by [Kilusi Digital Network](https://kilusi.id)**

transforming ISP management with innovative technology

[🌐 Website](https://kilusi.id) • [📧 Email](mailto:info@kilusi.id) • [📱 WhatsApp](https://wa.me/628123456789)

</div>