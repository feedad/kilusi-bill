#!/bin/bash

# =====================================================================
# Kilusi Bill - Server Deployment Script (Option 1)
# =====================================================================
#
# This script installs PostgreSQL and FreeRADIUS directly on the server
# for production deployment of Kilusi Bill ISP billing system.
#
# Usage:
#   ./scripts/deploy-server.sh [options]
#
# Options:
#   -h, --help              Show this help message
#   -m, --mode MODE         Deployment mode (development|production, default: production)
#   --db-only              Install database only
#   --radius-only          Install FreeRADIUS only
#   --with-apps            Also install Node.js apps
#   --skip-backup          Skip database backup
#   --force                Force installation (overwrite existing)
#
# Examples:
#   ./scripts/deploy-server.sh                    # Full production deployment
#   ./scripts/deploy-server.sh --mode development # Development setup
#   ./scripts/deploy-server.sh --db-only         # Database only
#   ./scripts/deploy-server.sh --with-apps       # Include app deployment
#
# Requirements:
#   - Ubuntu/Debian Linux system
#   - Sudo privileges
#   - Internet connection
#   - 2GB+ RAM, 10GB+ disk space recommended
#
# Author: Kilusi Development Team
# Version: 1.0.0
# Last Updated: November 2024
# =====================================================================

set -euo pipefail

# Default configuration
DEFAULT_MODE="production"
DEFAULT_DB_HOST="localhost"
DEFAULT_DB_PORT="5432"
DEFAULT_DB_NAME="kilusi_bill"
DEFAULT_DB_USER="kilusi_user"
DEFAULT_RADIUS_DB="radius"
DEFAULT_RADIUS_USER="radius"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Variables
MODE="$DEFAULT_MODE"
DB_HOST="$DEFAULT_DB_HOST"
DB_PORT="$DEFAULT_DB_PORT"
DB_NAME="$DEFAULT_DB_NAME"
DB_USER="$DEFAULT_DB_USER"
DB_PASSWORD=""
RADIUS_DB="$DEFAULT_RADIUS_DB"
RADIUS_USER="$DEFAULT_RADIUS_USER"
RADIUS_PASSWORD=""
DB_ONLY=false
RADIUS_ONLY=false
WITH_APPS=false
SKIP_BACKUP=false
FORCE=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Functions
print_banner() {
    echo -e "${BLUE}"
    echo "===================================================================="
    echo "    KILUSI BILL - SERVER DEPLOYMENT SCRIPT (OPTION 1)"
    echo "===================================================================="
    echo "    PostgreSQL + FreeRADIUS Direct Server Installation"
    echo "===================================================================="
    echo -e "${NC}"
}

print_help() {
    cat << EOF
${BLUE}Kilusi Bill Server Deployment Script${NC}

${YELLOW}USAGE:${NC}
    $0 [OPTIONS]

${YELLOW}OPTIONS:${NC}
    -h, --help              Show this help message
    -m, --mode MODE         Deployment mode (development|production, default: $DEFAULT_MODE)
    --db-only              Install database only
    --radius-only          Install FreeRADIUS only
    --with-apps            Also install Node.js applications
    --skip-backup          Skip database backup
    --force                Force installation (overwrite existing)

${YELLOW}EXAMPLES:${NC}
    $0                                    # Full production deployment
    $0 --mode development                 # Development setup
    $0 --db-only                         # Database only
    $0 --with-apps                       # Include app deployment

${YELLOW}REQUIREMENTS:${NC}
    - Ubuntu/Debian Linux system
    - Sudo privileges
    - Internet connection
    - 2GB+ RAM, 10GB+ disk space recommended

${YELLOW}WHAT THIS INSTALLS:${NC}
    - PostgreSQL database server
    - FreeRADIUS server with MySQL backend
    - Database schemas for both systems
    - System service configurations
    - Optional: Node.js application deployment
EOF
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

check_system() {
    log_step "Checking system requirements..."

    # Check if running as root (not recommended)
    if [[ $EUID -eq 0 ]]; then
        log_error "This script should not be run as root. Use sudo when needed."
        exit 1
    fi

    # Check OS
    if [[ ! -f /etc/os-release ]]; then
        log_error "Cannot determine operating system"
        exit 1
    fi

    source /etc/os-release
    if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
        log_error "This script supports Ubuntu/Debian systems only"
        exit 1
    fi

    # Check sudo access
    if ! sudo -n true 2>/dev/null; then
        log_warning "This script requires sudo privileges"
        sudo -v || {
            log_error "Failed to obtain sudo privileges"
            exit 1
        }
    fi

    # Check system resources
    local mem_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    local mem_gb=$((mem_kb / 1024 / 1024))

    if [[ $mem_gb -lt 2 ]]; then
        log_warning "System has less than 2GB RAM ($mem_gb GB detected)"
    fi

    local disk_kb=$(df / | awk 'NR==2 {print $4}')
    local disk_gb=$((disk_kb / 1024 / 1024))

    if [[ $disk_gb -lt 5 ]]; then
        log_error "Insufficient disk space. At least 5GB required, $disk_gb GB available"
        exit 1
    fi

    log_success "System requirements check passed"
}

update_system() {
    log_step "Updating system packages..."

    sudo apt update
    sudo apt upgrade -y

    log_success "System packages updated"
}

install_dependencies() {
    log_step "Installing system dependencies..."

    local packages=(
        curl
        wget
        gnupg2
        software-properties-common
        apt-transport-https
        ca-certificates
        lsb-release
        build-essential
        git
        htop
        vim
        unzip
    )

    sudo apt install -y "${packages[@]}"

    log_success "System dependencies installed"
}

install_postgresql() {
    if [[ "$RADIUS_ONLY" == true ]]; then
        log_step "Skipping PostgreSQL installation (radius-only mode)"
        return
    fi

    log_step "Installing PostgreSQL database server..."

    # Check if PostgreSQL is already installed
    if command -v psql &> /dev/null && [[ "$FORCE" != true ]]; then
        log_warning "PostgreSQL is already installed"
        if [[ "$MODE" == "production" ]]; then
            log_info "Use --force to reinstall"
            return
        fi
    fi

    # Add PostgreSQL repository
    if [[ "$MODE" == "production" ]]; then
        wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
        echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
        sudo apt update
    fi

    # Install PostgreSQL
    local pg_version="14"
    if [[ "$MODE" == "production" ]]; then
        pg_version="15"
    fi

    sudo apt install -y postgresql-$pg_version postgresql-client-$pg_version postgresql-contrib-$pg_version

    # Enable and start PostgreSQL service
    sudo systemctl enable postgresql
    sudo systemctl start postgresql

    # Verify installation
    if sudo systemctl is-active --quiet postgresql; then
        log_success "PostgreSQL installed and running"
    else
        log_error "PostgreSQL failed to start"
        exit 1
    fi
}

install_freeradius() {
    if [[ "$DB_ONLY" == true ]]; then
        log_step "Skipping FreeRADIUS installation (database-only mode)"
        return
    fi

    log_step "Installing FreeRADIUS server..."

    # Check if FreeRADIUS is already installed
    if command -v radiusd &> /dev/null && [[ "$FORCE" != true ]]; then
        log_warning "FreeRADIUS is already installed"
        if [[ "$MODE" == "production" ]]; then
            log_info "Use --force to reinstall"
            return
        fi
    fi

    # Install FreeRADIUS with MySQL support
    sudo apt install -y freeradius freeradius-mysql freeradius-utils

    # Enable and start FreeRADIUS service
    sudo systemctl enable freeradius
    sudo systemctl start freeradius

    # Verify installation
    if sudo systemctl is-active --quiet freeradius; then
        log_success "FreeRADIUS installed and running"
    else
        log_error "FreeRADIUS failed to start"
        exit 1
    fi
}

setup_databases() {
    log_step "Setting up databases..."

    # Generate secure passwords
    if [[ -z "$DB_PASSWORD" ]]; then
        DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    fi

    if [[ -z "$RADIUS_PASSWORD" ]]; then
        RADIUS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    fi

    if [[ "$RADIUS_ONLY" != true ]]; then
        # Setup PostgreSQL databases
        log_info "Setting up PostgreSQL databases..."

        # Create users and databases
        sudo -u postgres psql << EOF
-- Create application database user
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';

-- Create main application database
CREATE DATABASE $DB_NAME OWNER $DB_USER;

-- Create RADIUS database
CREATE DATABASE $RADIUS_DB OWNER $DB_USER;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $RADIUS_DB TO $DB_USER;

-- Connect to application database and set privileges
\c $DB_NAME;
GRANT ALL ON SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;

-- Connect to RADIUS database and set privileges
\c $RADIUS_DB;
GRANT ALL ON SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
EOF

        log_success "PostgreSQL databases created"
    fi

    # Initialize database schemas
    if [[ "$RADIUS_ONLY" != true ]]; then
        log_info "Initializing application database schema..."

        # Run database initialization script
        local db_init_script="$SCRIPT_DIR/database-init.sql"
        if [[ -f "$db_init_script" ]]; then
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$db_init_script"
            log_success "Application database schema initialized"
        else
            log_warning "Database initialization script not found: $db_init_script"
        fi
    fi

    if [[ "$DB_ONLY" != true ]]; then
        log_info "Setting up FreeRADIUS database..."

        # Set up FreeRADIUS with MySQL (if using MySQL for RADIUS)
        # For now, we'll use PostgreSQL for RADIUS as well

        # Import RADIUS schema
        local radius_schema="$PROJECT_ROOT/backend/freeradius-docker/sql/schema.sql"
        if [[ -f "$radius_schema" ]]; then
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$RADIUS_DB" -f "$radius_schema"
            log_success "FreeRADIUS database schema initialized"
        else
            log_warning "FreeRADIUS schema not found: $radius_schema"
            log_info "You may need to initialize FreeRADIUS database manually"
        fi
    fi
}

configure_freeradius() {
    if [[ "$DB_ONLY" == true ]]; then
        return
    fi

    log_step "Configuring FreeRADIUS..."

    # Backup original configuration
    sudo cp /etc/freeradius/3.0/radiusd.conf /etc/freeradius/3.0/radiusd.conf.backup

    # Configure FreeRADIUS to use PostgreSQL
    sudo tee /etc/freeradius/3.0/mods-available/sql > /dev/null << EOF
sql {
    driver = "rlm_sql_postgresql"
    server = "localhost"
    port = "$DB_PORT"
    login = "$DB_USER"
    password = "$DB_PASSWORD"
    radius_db = "$RADIUS_DB"

    acct_table1 = "radacct"
    acct_table2 = "radacct"
    nas_table = "nas"
    radgroupcheck_table = "radgroupcheck"
    radgroupreply_table = "radgroupreply"
    radusergroup_table = "radusergroup"

    deletestalesessions = yes
    sqltrace = no
    sqltracefile = \${logdir}/sqltrace.sql

    connect_timeout = 10
    read_timeout = 5
    write_timeout = 5
    sql_user_name = "%{User-Name}"

    authorize_check_query = "SELECT id, username, attribute, value, op FROM radcheck WHERE username = '%{SQL-User-Name}' ORDER BY id"
    authorize_reply_query = "SELECT id, username, attribute, value, op FROM radreply WHERE username = '%{SQL-User-Name}' ORDER BY id"

    authorize_group_check_query = "SELECT id, groupname, attribute, Value, op FROM radgroupcheck WHERE groupname = '%{Sql-Group}' ORDER BY id"
    authorize_group_reply_query = "SELECT id, groupname, attribute, value, op FROM radgroupreply WHERE groupname = '%{Sql-Group}' ORDER BY id"

    accounting_onoff_query = "UPDATE radacct SET acctstarttime = '%S', acctstoptime = '%S', acctsessiontime = 0, acctterminatecause = 'Admin-Reset' WHERE acctsessionid = '%{Acct-Session-Id}' AND username = '%{SQL-User-Name}' AND nasipaddress = '%{NAS-IP-Address}'"

    accounting_update_query = "UPDATE radacct SET framedipaddress = '%{Framed-IP-Address}', acctsessiontime = '%{Acct-Session-Time}', acctinputoctets = '%{Acct-Input-Octets}', acctoutputoctets = '%{Acct-Output-Octets}' WHERE acctsessionid = '%{Acct-Session-Id}' AND username = '%{SQL-User-Name}' AND nasipaddress = '%{NAS-IP-Address}'"

    accounting_update_query_alt = "INSERT INTO radacct (acctsessionid, acctuniqueid, username, realm, nasipaddress, nasportid, nasporttype, acctstarttime, acctupdatetime, framedipaddress, acctsessiontime, acctinputoctets, acctoutputoctets) VALUES ('%{Acct-Session-Id}', '%{Acct-Unique-Session-Id}', '%{SQL-User-Name}', '%{Realm}', '%{NAS-IP-Address}', '%{NAS-Port}', '%{NAS-Port-Type}', '%S', '%S', '%{Framed-IP-Address}', '0', '0', '0')"

    accounting_start_query = "INSERT INTO radacct (acctsessionid, acctuniqueid, username, realm, nasipaddress, nasportid, nasporttype, acctstarttime, acctstoptime, acctsessiontime, acctauthentic, connectinfo_start, connectinfo_stop, acctinputoctets, acctoutputoctets, calledstationid, callingstationid, acctterminatecause, servicetype, framedprotocol, framedipaddress) VALUES ('%{Acct-Session-Id}', '%{Acct-Unique-Session-Id}', '%{SQL-User-Name}', '%{Realm}', '%{NAS-IP-Address}', '%{NAS-Port}', '%{NAS-Port-Type}', '%S', NULL, '0', '%{Acct-Authentic}', '%{Connect-Info}', '', '0', '0', '%{Called-Station-Id}', '%{Calling-Station-Id}', '', '%{Service-Type}', '%{Framed-Protocol}', '%{Framed-IP-Address}')"

    accounting_start_query_alt = "UPDATE radacct SET acctstarttime = '%S', acctstartdelay = '%{%{Acct-Delay-Time}:-0}', connectinfo_start = '%{Connect-Info}' WHERE acctsessionid = '%{Acct-Session-Id}' AND username = '%{SQL-User-Name}' AND nasipaddress = '%{NAS-IP-Address}'"

    accounting_stop_query = "UPDATE radacct SET acctstoptime = '%S', acctsessiontime = '%{Acct-Session-Time}', acctinputoctets = '%{Acct-Input-Octets}', acctoutputoctets = '%{Acct-Output-Octets}', acctterminatecause = '%{Acct-Terminate-Cause}', connectinfo_stop = '%{Connect-Info}' WHERE acctsessionid = '%{Acct-Session-Id}' AND username = '%{SQL-User-Name}' AND nasipaddress = '%{NAS-IP-Address}'"

    accounting_stop_query_alt = "INSERT INTO radacct (acctsessionid, acctuniqueid, username, realm, nasipaddress, nasportid, nasporttype, acctstarttime, acctstoptime, acctsessiontime, acctauthentic, connectinfo_start, connectinfo_stop, acctinputoctets, acctoutputoctets, calledstationid, callingstationid, acctterminatecause, servicetype, framedprotocol, framedipaddress) VALUES ('%{Acct-Session-Id}', '%{Acct-Unique-Session-Id}', '%{SQL-User-Name}', '%{Realm}', '%{NAS-IP-Address}', '%{NAS-Port}', '%{NAS-Port-Type}', '0', '%S', '%{Acct-Session-Time}', '%{Acct-Authentic}', '', '%{Connect-Info}', '%{Acct-Input-Octets}', '%{Acct-Output-Octets}', '%{Called-Station-Id}', '%{Calling-Station-Id}', '%{Acct-Terminate-Cause}', '%{Service-Type}', '%{Framed-Protocol}', '%{Framed-IP-Address}')"

    group_membership_query = "SELECT groupname FROM radusergroup WHERE username = '%{SQL-User-Name}' ORDER BY priority"

    simul_count_query = "SELECT COUNT(*) FROM radacct WHERE username = '%{SQL-User-Name}' AND acctstoptime IS NULL"

    simul_verify_query = "SELECT radacctid, acctsessionid, username, nasipaddress, nasportid, framedipaddress, callingstationid, framedprotocol FROM radacct WHERE username = '%{SQL-User-Name}' AND acctstoptime IS NULL"
}
EOF

    # Enable SQL module
    sudo ln -sf /etc/freeradius/3.0/mods-available/sql /etc/freeradius/3.0/mods-enabled/

    # Configure default site to use SQL
    sudo sed -i 's/# sql/sql/' /etc/freeradius/3.0/sites-available/default
    sudo sed -i 's/# sql/sql/' /etc/freeradius/3.0/sites-available/inner-tunnel

    # Test configuration
    if sudo freeradius -XC; then
        log_success "FreeRADIUS configuration test passed"
        sudo systemctl restart freeradius
        log_success "FreeRADIUS configured and restarted"
    else
        log_error "FreeRADIUS configuration test failed"
        exit 1
    fi
}

setup_applications() {
    if [[ "$WITH_APPS" != true ]]; then
        return
    fi

    log_step "Setting up Node.js applications..."

    # Install Node.js
    if [[ "$MODE" == "production" ]]; then
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        sudo apt install -y nodejs npm
    fi

    # Install PM2 for process management
    sudo npm install -g pm2

    # Set up application directory
    local app_dir="/opt/kilusi-bill"
    sudo mkdir -p "$app_dir"
    sudo chown $USER:$USER "$app_dir"

    # Copy application files
    if [[ -d "$PROJECT_ROOT" ]]; then
        rsync -av --exclude='node_modules' --exclude='.git' --exclude='backups' "$PROJECT_ROOT/" "$app_dir/"
        log_success "Application files copied to $app_dir"
    else
        log_warning "Application source not found at $PROJECT_ROOT"
        log_info "You'll need to deploy the application manually"
    fi

    # Install dependencies
    if [[ -d "$app_dir/backend" ]]; then
        cd "$app_dir/backend"
        npm ci --production
    fi

    if [[ -d "$app_dir/frontend" ]]; then
        cd "$app_dir/frontend"
        npm ci
        npm run build
    fi

    # Create PM2 configuration
    cat > "$app_dir/ecosystem.config.js" << EOF
module.exports = {
  apps: [
    {
      name: 'kilusi-bill-backend',
      script: './backend/app.js',
      cwd: '$app_dir',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'kilusi-bill-frontend',
      script: 'npm',
      args: 'start',
      cwd: '$app_dir/frontend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    }
  ]
};
EOF

    # Start applications with PM2
    if [[ -f "$app_dir/ecosystem.config.js" ]]; then
        pm2 start "$app_dir/ecosystem.config.js"
        pm2 save
        pm2 startup
        log_success "Applications started with PM2"
    fi
}

configure_firewall() {
    log_step "Configuring firewall..."

    # Install UFW if not present
    if ! command -v ufw &> /dev/null; then
        sudo apt install -y ufw
    fi

    # Configure UFW rules
    sudo ufw --force reset
    sudo ufw default deny incoming
    sudo ufw default allow outgoing

    # Allow SSH
    sudo ufw allow ssh

    # Allow application ports
    sudo ufw allow 3000/tcp comment "Kilusi Bill Backend"
    sudo ufw allow 3001/tcp comment "Kilusi Bill Frontend"

    # Allow RADIUS ports
    sudo ufw allow 1812/udp comment "RADIUS Authentication"
    sudo ufw allow 1813/udp comment "RADIUS Accounting"
    sudo ufw allow 1814/tcp comment "RADIUS CoA"

    # Enable firewall
    sudo ufw --force enable

    log_success "Firewall configured"
}

create_backup_script() {
    log_step "Creating backup script..."

    local backup_dir="/var/backups/kilusi-bill"
    sudo mkdir -p "$backup_dir"

    sudo tee /usr/local/bin/kilusi-bill-backup > /dev/null << EOF
#!/bin/bash

# Kilusi Bill Database Backup Script
BACKUP_DIR="$backup_dir"
DATE=\$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "\$BACKUP_DIR"

# Backup application database
if PGPASSWORD='$DB_PASSWORD' pg_dump -h localhost -p $DB_PORT -U $DB_USER -d $DB_NAME --no-owner --no-privileges > "\$BACKUP_DIR/kilusi_bill_\$DATE.sql" 2>/dev/null; then
    echo "Application database backup created: \$BACKUP_DIR/kilusi_bill_\$DATE.sql"
else
    echo "Failed to backup application database"
fi

# Backup RADIUS database
if PGPASSWORD='$DB_PASSWORD' pg_dump -h localhost -p $DB_PORT -U $DB_USER -d $RADIUS_DB --no-owner --no-privileges > "\$BACKUP_DIR/radius_\$DATE.sql" 2>/dev/null; then
    echo "RADIUS database backup created: \$BACKUP_DIR/radius_\$DATE.sql"
else
    echo "Failed to backup RADIUS database"
fi

# Clean old backups (keep last 7 days)
find "\$BACKUP_DIR" -name "*.sql" -mtime +7 -delete

echo "Backup completed"
EOF

    sudo chmod +x /usr/local/bin/kilusi-bill-backup

    # Add to crontab for daily backups at 2 AM
    (crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/kilusi-bill-backup") | crontab -

    log_success "Backup script created and scheduled"
}

print_completion_info() {
    echo -e "${GREEN}"
    echo "===================================================================="
    echo "                 SERVER DEPLOYMENT COMPLETE!"
    echo "===================================================================="
    echo -e "${NC}"

    echo -e "${CYAN}Installation Summary:${NC}"
    echo -e "  PostgreSQL:     ${GREEN}✓ Installed${NC}"
    echo -e "  FreeRADIUS:     ${GREEN}✓ Installed${NC}"
    echo -e "  Database:       ${GREEN}✓ Configured${NC}"
    echo -e "  Firewall:       ${GREEN}✓ Configured${NC}"
    echo -e "  Backup:         ${GREEN}✓ Scheduled${NC}"

    if [[ "$WITH_APPS" == true ]]; then
        echo -e "  Applications:   ${GREEN}✓ Deployed${NC}"
    fi

    echo
    echo -e "${CYAN}Database Information:${NC}"
    echo -e "  Application DB:  ${YELLOW}$DB_NAME${NC}"
    echo -e "  RADIUS DB:       ${YELLOW}$RADIUS_DB${NC}"
    echo -e "  Username:        ${YELLOW}$DB_USER${NC}"
    echo -e "  Password:        ${YELLOW}$DB_PASSWORD${NC}"
    echo -e "  Host:            ${YELLOW}$DB_HOST${NC}"
    echo -e "  Port:            ${YELLOW}$DB_PORT${NC}"
    echo
    echo -e "${CYAN}Connection Strings:${NC}"
    echo -e "  Application:     ${YELLOW}postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME${NC}"
    echo -e "  RADIUS:          ${YELLOW}postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$RADIUS_DB${NC}"
    echo

    if [[ "$WITH_APPS" == true ]]; then
        echo -e "${CYAN}Application Access:${NC}"
        echo -e "  Frontend:        ${YELLOW}http://$(hostname -I | awk '{print $1}'):3001${NC}"
        echo -e "  Backend API:     ${YELLOW}http://$(hostname -I | awk '{print $1}'):3000${NC}"
        echo -e "  Admin Panel:     ${YELLOW}http://$(hostname -I | awk '{print $1}'):3000/admin${NC}"
        echo
    fi

    echo -e "${CYAN}Service Management:${NC}"
    echo -e "  PostgreSQL:      ${YELLOW}sudo systemctl status postgresql${NC}"
    echo -e "  FreeRADIUS:      ${YELLOW}sudo systemctl status freeradius${NC}"
    echo -e "  Firewall:        ${YELLOW}sudo ufw status${NC}"
    echo

    if [[ "$WITH_APPS" == true ]]; then
        echo -e "  Applications:    ${YELLOW}pm2 status${NC}"
        echo
    fi

    echo -e "${CYAN}Database Management:${NC}"
    echo -e "  Connect:         ${YELLOW}psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME${NC}"
    echo -e "  Backup:          ${YELLOW}/usr/local/bin/kilusi-bill-backup${NC}"
    echo -e "  View tables:     ${YELLOW}\\\\dt${NC}"
    echo

    echo -e "${YELLOW}⚠️  IMPORTANT:${NC}"
    echo -e "  1. Save the database credentials in a secure location"
    echo -e "  2. Update your application .env files with the database credentials"
    echo -e "  3. Configure your firewall rules as needed"
    echo -e "  4. Set up SSL certificates for production use"
    echo -e "  5. Monitor system logs and performance"
    echo

    echo -e "${GREEN}Server deployment completed successfully!${NC}"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            print_help
            exit 0
            ;;
        -m|--mode)
            MODE="$2"
            shift 2
            ;;
        --db-only)
            DB_ONLY=true
            shift
            ;;
        --radius-only)
            RADIUS_ONLY=true
            shift
            ;;
        --with-apps)
            WITH_APPS=true
            shift
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            print_help
            exit 1
            ;;
    esac
done

# Validate mode
if [[ "$MODE" != "development" && "$MODE" != "production" ]]; then
    log_error "Invalid mode: $MODE (must be development or production)"
    exit 1
fi

# Validate mutually exclusive options
if [[ "$DB_ONLY" == true && "$RADIUS_ONLY" == true ]]; then
    log_error "Cannot use --db-only and --radius-only together"
    exit 1
fi

# Main execution
main() {
    print_banner

    log_info "Starting server deployment in $MODE mode"

    # Check system requirements
    check_system

    # Update system packages
    update_system

    # Install dependencies
    install_dependencies

    # Install PostgreSQL
    install_postgresql

    # Install FreeRADIUS
    install_freeradius

    # Setup databases
    setup_databases

    # Configure FreeRADIUS
    configure_freeradius

    # Setup applications if requested
    setup_applications

    # Configure firewall
    configure_firewall

    # Create backup script
    if [[ "$SKIP_BACKUP" != true ]]; then
        create_backup_script
    fi

    # Print completion information
    print_completion_info
}

# Error handling
trap 'log_error "Script failed at line $LINENO"' ERR

# Run main function
main "$@"