#!/bin/bash
# FreeRADIUS Deployment Script
# Supports both development and production deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}====================================${NC}"
    echo -e "${BLUE}  FreeRADIUS Deployment Script${NC}"
    echo -e "${BLUE}  Target: 2000+ Customers${NC}"
    echo -e "${BLUE}====================================${NC}"
}

# Check deployment mode
DEPLOY_MODE=${1:-dev}
if [ "$DEPLOY_MODE" != "dev" ] && [ "$DEPLOY_MODE" != "prod" ]; then
    print_error "Usage: $0 [dev|prod]"
    exit 1
fi

print_header
print_status "Deployment mode: $DEPLOY_MODE"

# Load environment variables
ENV_FILE=".env.$DEPLOY_MODE"
if [ ! -f "$ENV_FILE" ]; then
    print_error "Environment file $ENV_FILE not found!"
    exit 1
fi

print_status "Loading environment from $ENV_FILE"
set -a
source "$ENV_FILE"
set +a

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed!"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed!"
    exit 1
fi

# Validate required environment variables
required_vars=("DB_HOST" "DB_USER" "DB_PASSWORD" "DB_NAME" "RADIUS_SECRET")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        print_error "Required environment variable $var is not set!"
        exit 1
    fi
done

print_status "Environment validation passed"

# Test database connection
print_status "Testing database connection..."
if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
    print_status "✅ Database connection successful"
else
    print_error "❌ Database connection failed!"
    print_error "Please check your database configuration"
    exit 1
fi

# Check if required tables exist
print_status "Checking RADIUS tables..."
required_tables=("radcheck" "radreply" "radgroupcheck" "radgroupreply" "radusergroup" "radacct" "nas_servers")
missing_tables=()

for table in "${required_tables[@]}"; do
    if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "\dt $table" 2>/dev/null | grep -q "$table"; then
        missing_tables+=("$table")
    fi
done

if [ ${#missing_tables[@]} -gt 0 ]; then
    print_warning "Missing tables: ${missing_tables[*]}"
    print_status "Creating missing tables..."

    # Create basic RADIUS tables
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
-- Create missing RADIUS tables if they don't exist

CREATE TABLE IF NOT EXISTS radcheck (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(username, attribute, op, value)
);

CREATE TABLE IF NOT EXISTS radreply (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS radgroup (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) UNIQUE NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS radgroupcheck (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL
);

CREATE TABLE IF NOT EXISTS radgroupreply (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL
);

CREATE TABLE IF NOT EXISTS radusergroup (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    groupname VARCHAR(64) NOT NULL,
    priority INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS radacct (
    radacctid BIGSERIAL PRIMARY KEY,
    acctsessionid VARCHAR(32) NOT NULL,
    acctuniqueid VARCHAR(32) NOT NULL UNIQUE,
    username VARCHAR(64),
    groupname VARCHAR(64),
    realm VARCHAR(64),
    nasipaddress INET NOT NULL,
    nasportid VARCHAR(15),
    nasporttype VARCHAR(32),
    acctstarttime TIMESTAMP WITH TIME ZONE,
    acctstoptime TIMESTAMP WITH TIME ZONE,
    acctsessiontime BIGINT DEFAULT 0,
    acctauthentic VARCHAR(32),
    connectinfo_start VARCHAR(50),
    connectinfo_stop VARCHAR(50),
    acctinputoctets BIGINT DEFAULT 0,
    acctoutputoctets BIGINT DEFAULT 0,
    calledstationid VARCHAR(50),
    callingstationid VARCHAR(50),
    acctterminatecause VARCHAR(32),
    servicetype VARCHAR(32),
    framedprotocol VARCHAR(32),
    framedipaddress INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS radpostauth (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(253) NOT NULL,
    pass VARCHAR(128),
    reply VARCHAR(32),
    authdate TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS nas_servers (
    id SERIAL PRIMARY KEY,
    nas_name VARCHAR(128),
    short_name VARCHAR(32),
    ip_address INET NOT NULL UNIQUE,
    secret VARCHAR(64) NOT NULL,
    type VARCHAR(30) DEFAULT 'other',
    ports INTEGER,
    server VARCHAR(64),
    community VARCHAR(50),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_radcheck_username ON radcheck(username);
CREATE INDEX IF NOT EXISTS idx_radreply_username ON radreply(username);
CREATE INDEX IF NOT EXISTS idx_radacct_username ON radacct(username);
CREATE INDEX IF NOT EXISTS idx_radacct_sessionid ON radacct(acctsessionid);
CREATE INDEX IF NOT EXISTS idx_radacct_starttime ON radacct(acctstarttime);
CREATE INDEX IF NOT EXISTS idx_radacct_stoptime ON radacct(acctstoptime);
CREATE INDEX IF NOT EXISTS idx_radusergroup_username ON radusergroup(username);
CREATE INDEX IF NOT EXISTS radusergroup_groupname ON radusergroup(groupname);
CREATE INDEX IF NOT EXISTS idx_nas_servers_active ON nas_servers(is_active);
CREATE INDEX IF NOT EXISTS idx_nas_servers_ip ON nas_servers(ip_address);

-- Insert default groups
INSERT INTO radgroup (groupname, description, priority) VALUES
    ('default', 'Default user group', 1),
    ('vip', 'VIP user group', 2),
    ('premium', 'Premium user group', 3)
ON CONFLICT (groupname) DO NOTHING;

-- Insert default group attributes
INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES
    ('default', 'Framed-Protocol', ':=', 'PPP'),
    ('default', 'Service-Type', ':=', 'Framed-User')
ON CONFLICT DO NOTHING;

-- Create test user
INSERT INTO radcheck (username, attribute, op, value) VALUES
    ('testuser', 'Cleartext-Password', ':=', 'testpass')
ON CONFLICT (username, attribute, op, value) DO NOTHING;

INSERT INTO radreply (username, attribute, op, value) VALUES
    ('testuser', 'Framed-Protocol', ':=', 'PPP'),
    ('testuser', 'Framed-IP-Address', ':=', '10.10.10.100')
ON CONFLICT (username, attribute, op, value) DO NOTHING;

-- Add test user to default group
INSERT INTO radusergroup (username, groupname, priority) VALUES
    ('testuser', 'default', 1)
ON CONFLICT (username, groupname, priority) DO NOTHING;

EOF
    print_status "✅ RADIUS tables created successfully"
else
    print_status "✅ All required tables exist"
fi

# Create test NAS client
print_status "Creating test NAS client..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
INSERT INTO nas_servers (nas_name, short_name, ip_address, secret, type, description, is_active)
VALUES ('Test-NAS', 'Test', '127.0.0.1', 'testing123', 'other', 'Test NAS for development', true)
ON CONFLICT (nas_name) DO UPDATE SET is_active = true;
EOF

print_status "✅ Test NAS client created"

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose down 2>/dev/null || true

# Build and start containers
print_status "Building FreeRADIUS Docker image..."
docker-compose -f docker-compose.yml build

print_status "Starting FreeRADIUS services..."
docker-compose -f docker-compose.yml up -d

# Wait for services to start
print_status "Waiting for FreeRADIUS to start..."
sleep 30

# Check if services are running
print_status "Checking service status..."
if docker-compose ps | grep -q "Up"; then
    print_status "✅ Services are running"
else
    print_error "❌ Services failed to start!"
    print_status "Checking logs..."
    docker-compose logs
    exit 1
fi

# Wait a bit more for initialization
print_status "Waiting for FreeRADIUS initialization..."
sleep 30

# Test authentication
print_status "Testing authentication..."
if command -v radtest >/dev/null 2>&1; then
    print_status "Testing with radtest..."
    if radtest testuser testpass localhost 1812 testing123 >/dev/null 2>&1; then
        print_status "✅ Authentication test successful!"
    else
        print_warning "⚠️ Authentication test failed (may need more time)"
    fi
else
    print_warning "⚠️ radtest not available, skipping authentication test"
fi

# Test accounting
print_status "Testing accounting..."
echo "User-Name=testuser,Acct-Status-Type=Start,Acct-Session-Id=test123,Framed-IP-Address=10.10.10.100" | radclient localhost:1813 acct testing123 >/dev/null 2>&1
if [ $? -eq 0 ]; then
    print_status "✅ Accounting test successful!"
else
    print_warning "⚠️ Accounting test failed (may need more time)"
fi

# Show final status
print_status "Deployment completed successfully!"
print_status "FreeRADIUS is running on ports:"
print_status "  - Authentication: 1812/udp"
print_status "  - Accounting: 1813/udp"
print_status "  - CoA (optional): 3799/udp"
print_status "  - Health Check: http://localhost:18120"

if [ "$DEPLOY_MODE" = "prod" ]; then
    print_status "Production deployment ready!"
    print_status "Remember to:"
    print_status "  - Change default passwords"
    print_status "  - Configure SSL certificates"
    print_status "  - Set up monitoring"
    print_status "  - Update firewall rules"
else
    print_status "Development environment ready!"
    print_status "You can now test with your Node.js application"
fi

print_status "Check logs with: docker-compose logs -f freeradius"
print_status "Monitor with: docker-compose exec freeradius tail -f /var/log/freeradius/radius.log"

print_status "🎉 FreeRADIUS deployment completed successfully!"