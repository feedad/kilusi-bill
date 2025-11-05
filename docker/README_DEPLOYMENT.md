# FreeRADIUS Deployment Guide
## Production-Ready Docker Setup for 2000+ Customers

### 🚀 Overview

Docker deployment ini dirancang khusus untuk kilusi-bill dengan target 2000+ pelanggan konkuren. FreeRADIUS akan berjalan sebagai container terpisah dan dapat di-deploy pada server berbeda untuk scaling yang optimal.

### 📋 Prerequisites

**System Requirements:**
- **RAM**: Minimum 4GB (Production: 8GB+)
- **CPU**: Minimum 2 cores (Production: 4+ cores)
- **Storage**: Minimum 20GB (Production: 50GB+ SSD)
- **Network**: Open ports 1812/udp, 1813/udp, 3799/udp, 18120/tcp
- **Docker**: Version 20.10+
- **Docker Compose**: Version 2.0+

**Database Requirements:**
- PostgreSQL 12+ (bisa di server terpisah)
- Database yang sudah dibuat dengan user dan password
- Akses network dari Docker container ke database

### 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Device │◄──►│   Mikrotik NAS  │◄──►│  FreeRADIUS     │
│  (PPPoE/Hotspot)│    │   (Multiple)    │    │  Docker Container│
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
                                              ┌─────────────────┐
                                              │   PostgreSQL    │
                                              │  (Separate DB)  │
                                              └─────────────────┘
```

### 📁 Directory Structure

```
docker/
├── freeradius/
│   ├── Dockerfile
│   ├── config/
│   │   ├── radiusd.conf
│   │   ├── clients.conf
│   │   ├── sites-enabled/default
│   │   ├── mods-available/sql
│   │   └── mods-config/sql/main/postgresql/queries.conf
│   └── scripts/
│       └── health-check.sh
├── scripts/
│   └── deploy.sh
├── .env.dev
├── .env.prod
├── docker-compose.yml
├── docker-compose.prod.yml
└── README_DEPLOYMENT.md
```

### 🔧 Quick Start Development

1. **Setup Environment Variables:**
```bash
cp .env.dev.example .env.dev
# Edit .env.dev dengan konfigurasi database Anda
```

2. **Deploy Development Environment:**
```bash
./scripts/deploy.sh dev
```

3. **Verify Installation:**
```bash
# Check container status
docker-compose ps

# Check logs
docker-compose logs -f freeradius

# Test authentication
radtest testuser testpass localhost 1812 testing123
```

### 🚀 Production Deployment

#### 1. Server Configuration

**Production Server Setup:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Create docker user
sudo usermod -aG docker $USER
```

#### 2. Environment Configuration

**Production Environment File (.env.prod):**
```bash
# Database Configuration
DB_HOST=192.168.1.100          # IP PostgreSQL server
DB_PORT=5432
DB_USER=radius_user
DB_PASSWORD=secure_password
DB_NAME=kilusi_radius

# RADIUS Configuration
RADIUS_SECRET=mikrotik_secret_2024
RADIUS_HOST=0.0.0.0

# Performance Settings
THREAD_POOL_START=32
THREAD_POOL_MAX=128
MAX_REQUESTS=8192

# Security
ALLOW_VULNERABLE_OPENSSL=no
MAX_ATTRIBUTES=200

# Logging
LOG_LEVEL=warn
LOG_AUTH_BADPASS=yes
LOG_AUTH_GOODPASS=no

# Monitoring
HEALTH_CHECK_INTERVAL=30
MONITORING_ENABLED=true
```

#### 3. Deploy Production

```bash
# Deploy dengan production settings
./scripts/deploy.sh prod

# Atau manual:
docker-compose -f docker-compose.prod.yml up -d

# Verify production deployment
docker-compose -f docker-compose.prod.yml ps
```

### 📊 Performance Optimization

#### Thread Pool Configuration

**Untuk 2000+ Pelanggan:**
```bash
# Development (32-64 concurrent users)
THREAD_POOL_START=8
THREAD_POOL_MAX=32

# Production (2000+ concurrent users)
THREAD_POOL_START=32
THREAD_POOL_MAX=128
MIN_SPARE_SERVERS=16
MAX_SPARE_SERVERS=64
```

#### Database Optimization

**PostgreSQL Settings (postgresql.conf):**
```sql
# Connection settings
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB

# Performance
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
```

**Index Optimization:**
```sql
-- Critical indexes untuk performance
CREATE INDEX CONCURRENTLY idx_radcheck_username ON radcheck(username);
CREATE INDEX CONCURRENTLY idx_radacct_sessionid ON radacct(acctsessionid);
CREATE INDEX CONCURRENTLY idx_radacct_starttime ON radacct(acctstarttime);
CREATE INDEX CONCURRENTLY idx_radacct_username ON radacct(username);
CREATE INDEX CONCURRENTLY idx_nas_servers_ip ON nas_servers(ip_address);
CREATE INDEX CONCURRENTLY idx_nas_servers_active ON nas_servers(is_active);
```

### 🔍 Monitoring & Health Checks

#### Health Check Endpoint

```bash
# Check health status
curl http://localhost:18120

# Container health check
docker exec freeradius /scripts/health-check.sh
```

#### Prometheus Metrics

**Monitoring Stack Included:**
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)
- **Redis**: Connection pool monitoring

#### Log Monitoring

```bash
# Real-time logs
docker-compose logs -f freeradius

# Filter errors
docker-compose logs freeradius | grep ERROR

# Access authentication logs
docker exec freeradius tail -f /var/log/freeradius/radius.log
```

### 🔒 Security Configuration

#### Firewall Settings

```bash
# UFW Firewall configuration
sudo ufw allow 1812/udp    # RADIUS Authentication
sudo ufw allow 1813/udp    # RADIUS Accounting
sudo ufw allow 3799/udp    # RADIUS CoA (optional)
sudo ufw allow 18120/tcp   # Health Check
sudo ufw allow from 192.168.1.0/24 to any port 5432  # PostgreSQL
```

#### NAS Client Security

**Database NAS Configuration:**
```sql
-- Update NAS client dengan IP Mikrotik
INSERT INTO nas_servers (
    nas_name, short_name, ip_address, secret, type,
    description, is_active
) VALUES (
    'Mikrotik-POP1', 'POP1', '192.168.1.10', 'super_secret_key', 'other',
    'Mikrotik POP1 - 1000 users', true
);
```

### 📈 Load Testing

#### JMeter Test Plan

**Test untuk 2000 Concurrent Users:**
```xml
<!-- Thread Group: 2000 users, ramp-up 300s -->
<RADIUSTest>
  <users>2000</users>
  <rampup>300</rampup>
  <loop>10</loop>
  <auth_port>1812</auth_port>
  <acct_port>1813</acct_port>
</RADIUSTest>
```

#### Performance Validation

```bash
# Stress test dengan radtest
for i in {1..100}; do
  radtest testuser$(($i % 10)) testpass localhost 1812 testing123 &
done
wait

# Monitor performance
docker stats freeradius
```

### 🔧 Troubleshooting

#### Common Issues

**1. Database Connection Failed:**
```bash
# Check network connectivity
docker exec freeradius ping $DB_HOST

# Test database connection
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1;"
```

**2. Authentication Failed:**
```bash
# Check RADIUS logs
docker exec freeradius tail -f /var/log/freeradius/radius.log

# Check user data
docker exec freeradius psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT * FROM radcheck WHERE username='testuser';"
```

**3. Performance Issues:**
```bash
# Check thread pool
docker exec freeradius radiusd -X | grep "Thread pool"

# Monitor database connections
docker exec freeradius psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT count(*) FROM pg_stat_activity;"
```

#### Debug Mode

```bash
# Enable debug mode
docker-compose exec freeradius radiusd -X

# Check specific user
docker-compose exec freeradius radtest testuser testpass localhost 1812 testing123 -x
```

### 🚀 Scaling Strategies

#### Horizontal Scaling

**Multiple FreeRADIUS Instances:**
```yaml
# docker-compose.scale.yml
version: '3.8'
services:
  freeradius-1:
    extends:
      file: docker-compose.yml
      service: freeradius
    environment:
      - INSTANCE_ID=1

  freeradius-2:
    extends:
      file: docker-compose.yml
      service: freeradius
    environment:
      - INSTANCE_ID=2

  loadbalancer:
    image: nginx:alpine
    ports:
      - "1812:1812/udp"
      - "1813:1813/udp"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

#### Database Scaling

**Read Replica Setup:**
```sql
-- Primary database (writes)
-- Configure in .env.prod for primary instance

-- Read replica (authentication queries)
-- Configure additional FreeRADIUS instances to use replica
```

### 📋 Maintenance

#### Daily Tasks

```bash
#!/bin/bash
# daily-maintenance.sh

# Health check
curl -f http://localhost:18120 || echo "Health check failed"

# Cleanup old logs
docker exec freeradius find /var/log/freeradius -name "*.log.old" -mtime +7 -delete

# Update NAS clients
./scripts/update-nas-clients.sh

# Backup database
pg_dump -h $DB_HOST -U $DB_USER $DB_NAME > backup_$(date +%Y%m%d).sql
```

#### Weekly Tasks

```bash
# Performance review
docker stats --no-stream > performance_$(date +%Y%m%d).log

# Security audit
./scripts/security-audit.sh

# Update containers
docker-compose pull
docker-compose up -d
```

### 📞 Support & Contact

**Emergency Contacts:**
- System Administrator: [admin-email]
- Database Administrator: [dba-email]
- Network Administrator: [network-email]

**Documentation:**
- FreeRADIUS Official: https://freeradius.org/documentation/
- Mikrotik RADIUS: https://wiki.mikrotik.com/wiki/RADIUS_Client
- Docker Deployment: This guide

---

### 🎯 Deployment Checklist

**Pre-Deployment:**
- [ ] Server requirements met
- [ ] Database server ready
- [ ] Network connectivity tested
- [ ] Security certificates (if needed)
- [ ] Backup strategy defined

**Deployment:**
- [ ] Environment files configured
- [ ] Docker images built
- [ ] Containers started successfully
- [ ] Health checks passing
- [ ] Authentication tested
- [ ] NAS clients configured

**Post-Deployment:**
- [ ] Monitoring configured
- [ ] Alerts set up
- [ ] Load testing completed
- [ ] Documentation updated
- [ ] Team trained

---

**🎉 Your FreeRADIUS Docker deployment is now ready for 2000+ customers!**