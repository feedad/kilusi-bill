# 🐳 Docker Setup for Kilusi Bill

Docker configuration untuk menjalankan PostgreSQL dan FreeRADIUS services yang dibutuhkan oleh Kilusi Bill.

## 📋 Services

### PostgreSQL
- **Port**: 5432
- **Database**: `kilusi_bill` (main) + `radius` (FreeRADIUS)
- **User**: `kilusi_user`
- **Version**: PostgreSQL 15 Alpine

### FreeRADIUS
- **Version**: 3.2
- **Authentication Port**: 1812/UDP
- **Accounting Port**: 1813/UDP
- **Admin Port**: 18120/TCP
- **Database**: PostgreSQL

### PgAdmin (Optional)
- **Port**: 5050
- **Default Email**: admin@kilusi.com
- **Default Password**: admin123

## 🚀 Quick Start

### 1. Environment Setup
```bash
# Copy environment template
cp .env.docker.example .env

# Edit dengan konfigurasi yang sesuai
nano .env
```

### 2. Start Services
```bash
# Start core services (PostgreSQL + FreeRADIUS)
./docker-start.sh start

# Atau dengan PgAdmin
./docker-start.sh start-admin

# Atau langsung dengan docker-compose
docker-compose up -d
```

### 3. Verify Setup
```bash
# Cek status services
./docker-start.sh status

# Test RADIUS authentication
./docker-start.sh test-radius
```

## 📁 Configuration Files

### Environment Variables
- `.env.docker.example` - Template konfigurasi
- Edit dengan password dan konfigurasi yang sesuai

### Database Schemas
- `postgres/schema/01-radius-schema.sql` - FreeRADIUS database schema
- `postgres/schema/02-kilusi-bill-schema.sql` - Aplikasi database schema
- `postgres/init/01-init-database.sh` - Database initialization script

### FreeRADIUS Configuration
- `freeradius/clients.conf` - RADIUS clients configuration
- `freeradius/mods-enabled/sql` - SQL module configuration
- `freeradius/sites-available/default` - Site configuration
- `freeradius/users` - Local users file

## 🔧 Management Commands

### Using docker-start script (Recommended)
```bash
# Start services
./docker-start.sh start

# Start dengan PgAdmin
./docker-start.sh start-admin

# Stop services
./docker-start.sh stop

# Restart services
./docker-start.sh restart

# Cek status
./docker-start.sh status

# Lihat logs
./docker-start.sh logs postgres
./docker-start.sh logs freeradius

# Reset database (WARNING: hapus semua data!)
./docker-start.sh reset

# Test RADIUS
./docker-start.sh test-radius
```

### Using docker-compose directly
```bash
# Start semua services
docker-compose up -d

# Start dengan PgAdmin
docker-compose --profile admin up -d

# Stop services
docker-compose down

# Lihat logs
docker-compose logs -f postgres
docker-compose logs -f freeradius

# Execute command di container
docker-compose exec postgres psql -U kilusi_user -d kilusi_bill
docker-compose exec freeradius radtest testuser test123 localhost 1812 testing123
```

## 🌐 Access URLs

- **PostgreSQL**: localhost:5432
- **FreeRADIUS Auth**: localhost:1812 (UDP)
- **FreeRADIUS Acct**: localhost:1813 (UDP)
- **PgAdmin**: http://localhost:5050 (jika diaktifkan)

## 📊 Database Structure

### RADIUS Database (`radius`)
- `radcheck` - User authentication attributes
- `radreply` - User reply attributes
- `radgroupcheck` - Group check attributes
- `radgroupreply` - Group reply attributes
- `radusergroup` - User to group mapping
- `radacct` - Accounting records
- `radpostauth` - Post-authentication records
- `nas` - Network Access Server configuration

### Application Database (`kilusi_bill`)
- `customers` - Customer information
- `packages` - Service packages
- `payments` - Payment records
- `invoices` - Billing invoices
- `network_devices` - Network infrastructure
- `olt_devices` - OLT devices
- `onu_devices` - ONU devices
- `online_sessions` - Active sessions
- `system_logs` - Application logs

## 🧪 Testing

### Test RADIUS Authentication
```bash
# Test dengan user default (testuser/test123)
docker exec -it kilusi-freeradius radtest testuser test123 localhost 1812 testing123

# Test dengan custom user
docker exec postgres psql -U kilusi_user -d radius -c "
INSERT INTO radcheck (username, attribute, op, value)
VALUES ('testuser2', 'Cleartext-Password', ':=', 'password123')
ON CONFLICT DO NOTHING;

INSERT INTO radusergroup (username, groupname, priority)
VALUES ('testuser2', 'default', 1)
ON CONFLICT DO NOTHING;
"

docker exec -it kilusi-freeradius radtest testuser2 password123 localhost 1812 testing123
```

### Test Database Connection
```bash
# Connect ke main database
docker-compose exec postgres psql -U kilusi_user -d kilusi_bill

# Connect ke RADIUS database
docker-compose exec postgres psql -U kilusi_user -d radius

# Lihat tabel
\dt

# Lihat users RADIUS
SELECT * FROM radcheck;
```

## 🔍 Troubleshooting

### Common Issues

**1. PostgreSQL connection failed**
```bash
# Cek log PostgreSQL
./docker-start.sh logs postgres

# Verifikasi database berjalan
docker-compose exec postgres pg_isready -U kilusi_user

# Restart services
./docker-start.sh restart
```

**2. FreeRADIUS not authenticating**
```bash
# Cek log FreeRADIUS
./docker-start.sh logs freeradius

# Verifikasi RADIUS berjalan
docker-compose exec freeradius pgrep freeradius

# Test koneksi database dari FreeRADIUS
docker-compose exec freeradius psql -h postgres -U kilusi_user -d radius -c "SELECT COUNT(*) FROM radcheck;"
```

**3. Port conflicts**
```bash
# Cek port yang digunakan
netstat -tulpn | grep :1812
netstat -tulpn | grep :5432

# Ubah port di .env jika konflik
```

**4. Permission issues**
```bash
# Cek file permissions
ls -la docker/postgres/init/
ls -la docker/freeradius/

# Fix permissions
chmod +x docker/postgres/init/*.sh
```

### Reset Everything
```bash
# Hapus semua containers dan volumes
./docker-start.sh reset

# Atau manual
docker-compose down -v
docker system prune -f
```

## 📝 Environment Variables

### PostgreSQL
```bash
POSTGRES_DB=kilusi_bill
POSTGRES_USER=kilusi_user
POSTGRES_PASSWORD=your_password_here
POSTGRES_PORT=5432
```

### FreeRADIUS
```bash
RADIUS_AUTH_PORT=1812
RADIUS_ACCT_PORT=1813
RADIUS_ADMIN_PORT=18120
RADIUS_SECRET=testing123
```

### PgAdmin (Optional)
```bash
PGADMIN_PORT=5050
PGADMIN_EMAIL=admin@yourcompany.com
PGADMIN_PASSWORD=your_pgadmin_password
```

## 🔒 Security

1. **Ubah password default** di environment variables
2. **Generate strong secrets** untuk RADIUS
3. **Limit network access** ke RADIUS ports
4. **Use SSL/TLS** untuk database connections di production
5. **Regular backups** dengan `docker-compose exec postgres pg_dump`

## 🔄 Development Workflow

### Development
```bash
# Start services
./docker-start.sh start

# Connect database ke aplikasi
# Update backend .env:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=kilusi_bill
DB_USER=kilusi_user
DB_PASSWORD=your_password

# Update RADIUS config di backend settings.json
radius_host=localhost
radius_auth_port=1812
radius_acct_port=1813
```

### Production
1. **Update semua passwords** dan secrets
2. **Enable SSL/TLS** untuk database
3. **Configure firewall** untuk port access
4. **Set up monitoring** dan alerting
5. **Regular backup schedule**

## 📚 Additional Resources

- [FreeRADIUS Documentation](https://networkradius.com/doc/)
- [PostgreSQL Docker Hub](https://hub.docker.com/_/postgres)
- [Docker Compose Documentation](https://docs.docker.com/compose/)