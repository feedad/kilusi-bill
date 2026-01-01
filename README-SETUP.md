# Kilusi Bill - Installation Guide

Complete installation guide for Kilusi Bill ISP Billing System.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Deployment Scenarios](#deployment-scenarios)
- [Automated Installation](#automated-installation)
- [Manual Installation](#manual-installation)
- [Configuration](#configuration)
- [Post-Installation](#post-installation)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Minimum Requirements

- **Operating System**: Ubuntu 20.04+, Debian 11+, CentOS 8+, RHEL 8+, Fedora 34+
- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 20GB free space
- **Network**: Internet connection for package installation

### Software Requirements (Auto-Installed by Script)

The installation script will automatically install missing dependencies:

- **Git** - Version control
- **Docker** (if using Docker mode) - v20.10+
- **Docker Compose** (if using Docker mode) - v2.0+
- **Node.js** (if using Native mode) - v18.0+
- **PostgreSQL Client** (if using Native mode) - v13+

---

## Deployment Scenarios

Kilusi Bill supports **5 flexible deployment scenarios**:

### 1. Docker DB/RADIUS + Native Backend/Frontend

**Components:**
- PostgreSQL: Docker container
- FreeRADIUS: Docker container  
- Backend: Native installation (systemd service)
- Frontend: Native installation

**Best for:**
- Production with containerized infrastructure
- Easy database & RADIUS management
- Full backend control

**Requirements:**
- Docker & Docker Compose
- Node.js v18+

---

### 2. DB/RADIUS Only (Multi-server Setup)

**Components:**
This mode has 3 sub-opt ions:
- **Database Only**: Install PostgreSQL
- **FreeRADIUS Only**: Install FreeRADIUS
- **Both**: Install PostgreSQL + FreeRADIUS

**Best for:**
- Multi-server architectures
- Dedicated database server
- Dedicated RADIUS server
- High-availability setups
- Load balancing

**Requirements:**
- PostgreSQL client (for DB installation)
- Git

**Use Cases:**
```
Server 1 (DB only) → PostgreSQL
Server 2 (RADIUS only) → FreeRADIUS (connects to Server 1)
Server 3 → Backend + Frontend (connects to both)
```

---

### 3. Docker Backend Stack + Native Frontend

**Components:**
- PostgreSQL: Docker container
- FreeRADIUS: Docker container
- Backend: Docker container
- Frontend: Native installation

**Best for:**
- Containerized backend services
- Native frontend deployment
- Simplified backend management

**Requirements:**
- Docker & Docker Compose

---

### 4. All Native

**Components:**
- PostgreSQL: Native installation
- FreeRADIUS: Native installation
- Backend: Native installation (systemd)
- Frontend: Native installation

**Best for:**
- Full production control
- No Docker overhead
- Traditional server management
- Performance-critical deployments

**Requirements:**
- Node.js v18+
- PostgreSQL 13+
- Full server access

---

### 5. All Docker

**Components:**
- PostgreSQL: Docker container
- FreeRADIUS: Docker container
- Backend: Docker container
- Frontend: Docker container

**Best for:**
- Development environment
- Quick deployment
- Testing
- Consistent environments

**Requirements:**
- Docker & Docker Compose

---

## Automated Installation

### Quick Start

```bash
# 1. Clone repository
git clone https://github.com/your-username/kilusi-bill.git
cd kilusi-bill

# 2. Make installer executable
chmod +x install.sh

# 3. Run installer
./install.sh
```

### Installation  Steps

The installer will guide you through:

1. **Select Deployment Mode** (1-5)
2. **Automatic Dependency Check**
   - Script detects missing dependencies
   - Asks permission to auto-install
   - Installs Docker, Node.js, PostgreSQL client, Git as needed
3. **Component Selection** (Mode 2 only)
   - Database only
   - FreeRADIUS only
   - Both
4. **Configuration Input**
   - Database credentials
   - RADIUS secret
   - Admin credentials
   - Remote hosts (if multi-server)
5. **Installation**
   - Database initialization
   - Schema creation
   - FreeRADIUS setup
   - Service startup
6. **Completion**
   - Installation summary
   - Access information
   - Next steps

### Example: Mode 1 Installation

```bash
./install.sh

# Select mode 1
Select deployment mode:
  1) Database + FreeRADIUS in Docker, Backend + Frontend Native
> 1

# Auto-install dependencies
Installing missing dependencies...
Installing Docker...
Installing Docker Compose...
Installing Node.js...

# Configure
Database name [kilusi_bill]: (press Enter)
Database user [kilusi_user]: (press Enter)
Database password: ******
Admin username [admin]: (press Enter)
Admin password: ******

# Installation proceeds automatically
# Services start
# Summary displayed
```

### Example: Mode 2 Multi-Server

**Server 1 (Database Server):**
```bash
./install.sh

# Select mode 2
> 2

# Select component
What components do you want to install on THIS server?
  1) Database Only
> 1

# Configure
Database name [kilusi_bill]: (press Enter)
Database user [kilusi_user]: kilusi_prod
Database password: *************
Remote FreeRADIUS host: 192.168.1.20

# Database installed on this server
# FreeRADIUS connection info saved for backend
```

**Server 2 (RADIUS Server):**
```bash
./install.sh

# Select mode 2
> 2

# Select component  
What components do you want to install on THIS server?
  2) FreeRADIUS Only
> 2

# Configure
Remote Database host: 192.168.1.10
Remote Database port [5432]: (press Enter)
Database name [kilusi_bill]: (press Enter)
Database user: kilusi_prod
Database password: *************
RADIUS shared secret: MySecureSecret123

# FreeRADIUS installed on this server
# Connected to remote database
```

---

## Manual Installation

For advanced users who prefer manual control.

### Prerequisites Installation

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y curl wget git
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql-client

# CentOS/RHEL
sudo yum update -y
sudo yum install -y curl wget git
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs postgresql
```

### Database Setup

```bash
# Create database
sudo -u postgres psql -c "CREATE DATABASE kilusi_bill;"
sudo -u postgres psql -c "CREATE USER kilusi_user WITH PASSWORD 'your_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE kilusi_bill TO kilusi_user;"

# Initialize schema
psql -U kilusi_user -d kilusi_bill -f scripts/master-schema.sql
```

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env

# Configure database connection
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=kilusi_bill
POSTGRES_USER=kilusi_user
POSTGRES_PASSWORD=your_password

# Start backend
node app.js

# Or with PM2
npm install -g pm2
pm2 start app.js --name kilusi-backend
pm2 save
pm2 startup
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure
cp .env.example .env.local
nano .env.local

# Set backend URL
NEXT_PUBLIC_API_URL=http://localhost:3001

# Build production
npm run build

# Start
npm start

# Or with PM2
pm2 start npm --name kilusi-frontend -- start
```

### FreeRADIUS Setup

```bash
cd freeradius

# Configure SQL module
cp config/mods-available/sql /etc/freeradius/3.0/mods-available/sql

# Edit with your database credentials
sudo nano /etc/freeradius/3.0/mods-available/sql

# Enable SQL module
sudo ln -s /etc/freeradius/3.0/mods-available/sql /etc/freeradius/3.0/mods-enabled/sql

# Restart FreeRADIUS
sudo systemctl restart freeradius
```

---

## Configuration

### Environment Variables

Complete list in `.env.docker.example`. Key variables:

#### Database
```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=kilusi_bill
POSTGRES_USER=kilusi_user
POSTGRES_PASSWORD=secure_password_here
```

#### FreeRADIUS
```bash
RADIUS_HOST=localhost
RADIUS_PORT=1812
RADIUS_SECRET=your_radius_secret
```

#### Backend
```bash
NODE_ENV=production
BACKEND_PORT=3001
SESSION_SECRET=generate_random_secret
API_KEY=generate_api_key
```

#### SNMP Monitoring
```bash
SNMP_MONITOR_ENABLED=true
SNMP_MONITOR_INTERVAL=3
```

#### WhatsApp (Optional)
```bash
WHATSAPP_SUPER_ADMIN=628115345333
WHATSAPP_ACCESS_TOKEN=your_token
```

---

## Post-Installation

### 1. Verify Installation

```bash
# Check backend
curl http://localhost:3001/api/health

# Check database
psql -U kilusi_user -d kilusi_bill -c "SELECT COUNT(*) FROM customers;"

# Check FreeRADIUS
sudo radiusd -X  # Debug mode
```

### 2. Add NAS Servers

```bash
# Via psql
psql -U kilusi_user -d kilusi_bill

INSERT INTO nas (nasname, shortname, secret, type, description, ip_address, snmp_enabled, snmp_community)
VALUES ('192.168.1.1', 'MikroTik01', 'testing123', 'other', 'Main Router', '192.168.1.1', true, 'public');
```

### 3. Configure Firewall

```bash
# Allow RADIUS ports
sudo ufw allow 1812/udp  # Authentication
sudo ufw allow 1813/udp  # Accounting

# Allow backend API
sudo ufw allow 3001/tcp

# Allow frontend (if applicable)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 4. Setup SSL (Production)

```bash
# Using Let's Encrypt
sudo apt-get install certbot
sudo certbot certonly --standalone -d your-domain.com

# Configure Nginx as reverse proxy
# See docs/nginx-example.conf
```

---

## Troubleshooting

### Database Connection Failed

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check credentials
psql -U kilusi_user -d kilusi_bill -h localhost

# Check firewall
sudo ufw status
```

### FreeRADIUS Not Starting

```bash
# Debug mode
sudo radiusd -X

# Check SQL module
sudo freeradius -C

# Check database connection in SQL module
cat /etc/freeradius/3.0/mods-available/sql
```

### Backend Won't Start

```bash
# Check logs
pm2 logs kilusi-backend

# Check Node.js version
node --version  # Should be v18+

# Check dependencies
cd backend && npm install

# Check environment
cat backend/.env
```

### Docker Issues

```bash
# Check containers
docker-compose ps

# Check logs
docker-compose logs -f

# Rebuild
docker-compose down
docker-compose up -d --build

# Check volumes
docker volume ls
```

---

## Additional Resources

- [README.md](README.md) - Project overview
- [CHANGELOG.md](CHANGELOG.md) - Version history
- [Master Schema](scripts/master-schema.sql) - Database structure
- [FreeRADIUS Config](freeradius/config/mods-available/sql) - RADIUS setup

---

## Support

For installation assistance:
- 📧 Email: support@kilusi-bill.local
- 🐛 Issues: [GitHub Issues](https://github.com/your-username/kilusi-bill/issues)
- 📖 Docs: [docs.kilusi-bill.local](https://docs.kilusi-bill.local)