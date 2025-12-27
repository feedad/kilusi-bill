#!/bin/bash

# =====================================================================
# Kilusi Bill - Automated Installation Script
# =====================================================================
# This script supports multiple deployment scenarios:
# 1. Full Docker deployment
# 2. Native installation (PostgreSQL + FreeRADIUS on server)
# 3. Hybrid (mix of Docker and native)
#
# Author: Kilusi Development Team
# Version: 2.0.0
# =====================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# =====================================================================
# Helper Functions
# =====================================================================

print_header() {
    echo ""
    echo -e "${BLUE}====================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}====================================================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ $1${NC}"
}

check_command() {
    if command -v "$1" &> /dev/null; then
        print_success "$1 is installed"
        return 0
    else
        print_error "$1 is not installed"
        return 1
    fi
}

# Set SUDO variable - empty if running as root, otherwise use sudo
# This allows the script to work correctly whether running as root or via sudo
if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
    else
        SUDO="sudo"
    fi

# =====================================================================
# Connectivity Configuration
# =====================================================================

configure_connectivity() {
    print_header "Connectivity Configuration"
    
    # Detect IP
    DETECTED_IP=$(hostname -I | awk '{print $1}')
    print_info "Detected Server IP: $DETECTED_IP"
    
    read -p "Use this IP for access? (y/n): " USE_DETECTED_IP
    if [[ "$USE_DETECTED_IP" == "y" ]]; then
        SERVER_HOST="$DETECTED_IP"
    else
        read -p "Enter Domain or IP for this server: " SERVER_HOST
    fi
    
    # Determine topology
    echo ""
    echo "Select Domain Topology:"
    echo "  1) Single Host (Admin/Portal/API on same IP/Domain with different ports)"
    echo "  2) Separate Domains (e.g., admin.isp.com, portal.isp.com, api.isp.com)"
    read -p "Enter choice [1-2]: " TOPOLOGY_CHOICE
    
    if [[ "$TOPOLOGY_CHOICE" == "1" ]]; then
        # Single Host Mode
        API_URL="http://$SERVER_HOST:3001"
        ADMIN_URL="http://$SERVER_HOST:8080"
        PORTAL_URL="http://$SERVER_HOST:8080/customer"
        
        # Construct CORS Allowed Origins (Localhost + Server IP)
        CORS_ORIGINS="http://localhost,http://localhost:3000,http://localhost:3001,http://localhost:8080,http://127.0.0.1,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:8080"
        CORS_ORIGINS="$CORS_ORIGINS,http://$SERVER_HOST,http://$SERVER_HOST:3000,http://$SERVER_HOST:3001,http://$SERVER_HOST:8080"
        
        # Frontend API URL (Empty for Proxy Mode is best for single host, but let's be explicit if requested)
        # However, to avoid CORS completely on single host, internal proxy is best.
        # But if user accesses via IP:8080, frontend is served. API calls to /api go to localhost:3001 via proxy.
        # So NEXT_PUBLIC_API_URL should be EMPTY to use relative paths.
        FRONTEND_API_URL="" 
        print_info "Configured for Single Host Mode. Frontend will use Internal Proxy."
        
    else
        # Separate Domains
        read -p "Enter API Domain (e.g. https://api.isp.com): " API_URL
        read -p "Enter Admin Domain (e.g. https://admin.isp.com): " ADMIN_URL
        read -p "Enter Portal Domain (e.g. https://portal.isp.com): " PORTAL_URL
        
        # Construct CORS Allowed Origins
        CORS_ORIGINS="http://localhost,http://localhost:3000,http://localhost:3001,http://localhost:8080,http://127.0.0.1,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:8080"
        CORS_ORIGINS="$CORS_ORIGINS,$API_URL,$ADMIN_URL,$PORTAL_URL"
        
        # Frontend needs absolute URL
        FRONTEND_API_URL="$API_URL"
        print_info "Configured for Separate Domains."
    fi
    
    export SERVER_HOST
    export CORS_ORIGINS
    export FRONTEND_API_URL
}


# =====================================================================
# Welcome and Mode Selection
# =====================================================================

print_header "Kilusi Bill ISP Billing System - Installation"

cat << "EOF"
  _  ___ _           _   ____  _ _ _ 
 | |/ (_) |_   _ ___(_) | __ )(_) | |
 | ' /| | | | | / __| | |  _ \| | | |
 | . \| | | |_| \__ \ | | |_) | | | |
 |_|\_\_|_|\__,_|___/_| |____/|_|_|_|
                                      
    ISP Billing & Management System
EOF

echo ""
print_info "This installer will set up Kilusi Bill on your server."
echo ""

# Deployment mode selection
echo "Select deployment mode:"
echo "  1) Database + FreeRADIUS in Docker, Backend + Frontend Native"
echo "  2) Database + FreeRADIUS Only (for multi-server setup)"
echo "  3) Database + FreeRADIUS + Backend in Docker, Frontend Native"
echo "  4) All Native (everything on server directly)"
echo "  5) All Docker (full containerized deployment)"
echo ""

read -p "Enter your choice [1-5]: " DEPLOY_MODE

case $DEPLOY_MODE in
    1)
        DEPLOYMENT="docker-db-radius"
        print_info "Selected: Docker DB + RADIUS, Native Backend + Frontend"
        ;;
    2)
        DEPLOYMENT="db-radius-only"
        print_info "Selected: Database + FreeRADIUS Only (Multi-server)"
        
        # Sub-menu for mode 2
        echo ""
        echo "What components do you want to install on THIS server?"
        echo "  1) Database Only"
        echo "  2) FreeRADIUS Only"
        echo "  3) Both Database + FreeRADIUS"
        echo ""
        read -p "Enter your choice [1-3]: " COMPONENT_CHOICE
        
        case $COMPONENT_CHOICE in
            1)
                INSTALL_COMPONENT="db-only"
                print_info "Will install: PostgreSQL Database only"
                ;;
            2)
                INSTALL_COMPONENT="radius-only"
                print_info "Will install: FreeRADIUS only"
                ;;
            3)
                INSTALL_COMPONENT="both"
                print_info "Will install: Both Database and FreeRADIUS"
                ;;
            *)
                print_error "Invalid choice"
                exit 1
                ;;
        esac
        ;;
    3)
        DEPLOYMENT="docker-backend"
        print_info "Selected: Docker DB + RADIUS + Backend, Native Frontend"
        ;;
    4)
        DEPLOYMENT="native"
        print_info "Selected: All Native Installation"
        ;;
    5)
        DEPLOYMENT="docker"
        print_info "Selected: Full Docker Deployment"
        ;;
    *)
        print_error "Invalid choice"
        exit 1
        ;;
esac

# =====================================================================
# Check Prerequisites & Auto-Install
# =====================================================================

print_header "Checking Prerequisites"

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
else
    print_error "Cannot detect OS. Manual installation required."
    exit 1
fi

print_info "Detected OS: $OS $VER"

# Function to install dependencies
install_dependencies() {
    print_info "Installing missing dependencies..."
    
    if [[ "$OS" == "ubuntu" ]] || [[ "$OS" == "debian" ]]; then
        $SUDO apt-get update
        
        # Install basic tools
        if ! command -v curl &> /dev/null; then
            $SUDO apt-get install -y curl
        fi
        
        if ! command -v wget &> /dev/null; then
            $SUDO apt-get install -y wget
        fi
        
        if ! command -v git &> /dev/null; then
            $SUDO apt-get install -y git
        fi
        
        # Install Node.js (if needed for native/hybrid deployment)
        if [[ "$DEPLOYMENT" == "native" ]] || [[ "$DEPLOYMENT" == "docker-db-radius" ]] || [[ "$DEPLOYMENT" == "docker-backend" ]]; then
            if ! command -v node &> /dev/null; then
                print_info "Installing Node.js..."
                curl -fsSL https://deb.nodesource.com/setup_24.x | $SUDO bash -
                $SUDO apt-get install -y nodejs
            fi
        fi
        
        # Install PostgreSQL client (if needed)
        if [[ "$DEPLOYMENT" == "native" ]] || [[ "$DEPLOYMENT" == "db-radius-only" ]]; then
            if ! command -v psql &> /dev/null; then
                print_info "Installing PostgreSQL client..."
                $SUDO apt-get install -y postgresql-client
            fi
        fi
        
        # Install Docker (if needed)
        if [[ "$DEPLOYMENT" == "docker"* ]]; then
            if ! command -v docker &> /dev/null; then
                print_info "Installing Docker..."
                curl -fsSL https://get.docker.com -o get-docker.sh
                $SUDO sh get-docker.sh
                $SUDO usermod -aG docker $USER
                rm get-docker.sh
            fi
            
            if ! command -v docker-compose &> /dev/null; then
                print_info "Installing Docker Compose..."
                $SUDO curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
                $SUDO chmod +x /usr/local/bin/docker-compose
            fi
        fi
        
    elif [[ "$OS" == "centos" ]] || [[ "$OS" == "rhel" ]] || [[ "$OS" == "fedora" ]]; then
        $SUDO yum update -y
        
        if ! command -v git &> /dev/null; then
            $SUDO yum install -y git
        fi
        
            if ! command -v node &> /dev/null; then
                curl -fsSL https://rpm.nodesource.com/setup_24.x | $SUDO bash -
                $SUDO yum install -y nodejs
            fi
        
        if [[ "$DEPLOYMENT" == "docker"* ]]; then
            if ! command -v docker &> /dev/null; then
                $SUDO yum install -y yum-utils
                $SUDO yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
                $SUDO yum install -y docker-ce docker-ce-cli containerd.io
                $SUDO systemctl start docker
                $SUDO systemctl enable docker
                $SUDO usermod -aG docker $USER
            fi
        fi
    else
        print_warning "Unsupported OS: $OS. Please install dependencies manually."
    fi
}

# Ask user if they want to auto-install dependencies
print_info "Checking for required dependencies..."
MISSING_DEPS=0

# Check based on new deployment modes
if [[ "$DEPLOYMENT" == "docker" ]] || [[ "$DEPLOYMENT" == "docker-backend" ]] || [[ "$DEPLOYMENT" == "docker-db-radius" ]]; then
    check_command "docker" || MISSING_DEPS=1
    check_command "docker-compose" || MISSING_DEPS=1
fi

if [[ "$DEPLOYMENT" == "native" ]] || [[ "$DEPLOYMENT" == "docker-db-radius" ]] || [[ "$DEPLOYMENT" == "db-radius-only" ]]; then
    check_command "node" || MISSING_DEPS=1
    check_command "npm" || MISSING_DEPS=1
fi

# PostgreSQL client needed for native modes
if [[ "$DEPLOYMENT" == "native" ]] || [[ "$DEPLOYMENT" == "db-radius-only" ]]; then
    check_command "psql" || MISSING_DEPS=1
fi

check_command "git" || MISSING_DEPS=1

if [ $MISSING_DEPS -eq 1 ]; then
    print_warning "Some dependencies are missing"
    read -p "Do you want to install missing dependencies automatically? (y/n): " AUTO_INSTALL
    
    if [[ "$AUTO_INSTALL" == "y" ]] || [[ "$AUTO_INSTALL" == "Y" ]]; then
        install_dependencies
        print_success "Dependencies installed successfully"
        if [[ "$DEPLOYMENT" == "docker"* ]] && ! docker info > /dev/null 2>&1; then
            print_warning "Docker group changes might need a re-login to take effect."
            read -p "Have you already re-logged in or want to try forcing continuation? (y/n): " FORCE_CONTINUE
            if [[ "$FORCE_CONTINUE" != "y" ]] && [[ "$FORCE_CONTINUE" != "Y" ]]; then
                 print_info "Please logout and login again, then run this script again."
                 exit 0
            fi
        fi
        print_success "Dependencies ready. Proceeding..."
    else
        print_error "Please install missing dependencies manually and run this script again"
        print_info ""
        print_info "Required dependencies based on deployment mode:"
        if [[ "$DEPLOYMENT" == "docker"* ]]; then
            print_info "  - Docker"
            print_info "  - Docker Compose"
        fi
        if [[ "$DEPLOYMENT" == "native" ]]; then
            print_info "  - Node.js (v18+)"
            print_info "  - PostgreSQL client"
        fi
        print_info "  - Git"
        exit 1
    fi
fi

print_success "All prerequisites met"


# =====================================================================
# Configuration
# =====================================================================

print_header "Configuration"

# Database configuration
if [[ "$DEPLOYMENT" == "docker" ]] || [[ "$DEPLOYMENT" == "docker-backend" ]] || [[ "$DEPLOYMENT" == "docker-db-radius" ]]; then
    DB_HOST="postgres"
    DB_PORT="5432"
    print_info "Database will run in Docker container"
elif [[ "$DEPLOYMENT" == "db-radius-only" ]]; then
    # Mode 2: Multi-server setup
    if [[ "$INSTALL_COMPONENT" == "db-only" ]] || [[ "$INSTALL_COMPONENT" == "both" ]]; then
        # Installing database on this server
        DB_HOST="localhost"
        DB_PORT="5432"
        print_info "Database will be installed on THIS server"
    else
        # Installing RADIUS only, need remote DB host
        read -p "Remote Database host (IP or hostname): " DB_HOST
        read -p "Remote Database port [5432]: " DB_PORT
        DB_PORT=${DB_PORT:-5432}
        print_info "Will connect to remote database at $DB_HOST:$DB_PORT"
    fi
else
    # Native modes
    read -p "PostgreSQL host [localhost]: " DB_HOST
    DB_HOST=${DB_HOST:-localhost}
    read -p "PostgreSQL port [5432]: " DB_PORT
    DB_PORT=${DB_PORT:-5432}
fi

read -p "Database name [kilusi_bill]: " DB_NAME
DB_NAME=${DB_NAME:-kilusi_bill}

read -p "Database user [kilusi_user]: " DB_USER
DB_USER=${DB_USER:-kilusi_user}

read -p "Database password [kilusi1234]: " -s DB_PASSWORD
DB_PASSWORD=${DB_PASSWORD:-kilusi1234}
echo ""

# FreeRADIUS configuration  
if [[ "$DEPLOYMENT" == "docker" ]] || [[ "$DEPLOYMENT" == "docker-backend" ]] || [[ "$DEPLOYMENT" == "docker-db-radius" ]]; then
    RADIUS_HOST="freeradius"
    print_info "FreeRADIUS will run in Docker container"
elif [[ "$DEPLOYMENT" == "db-radius-only" ]]; then
    # Mode 2: Multi-server setup
    if [[ "$INSTALL_COMPONENT" == "radius-only" ]] || [[ "$INSTALL_COMPONENT" == "both" ]]; then
        # Installing RADIUS on this server
        RADIUS_HOST="localhost"
        print_info "FreeRADIUS will be installed on THIS server"
    else
        # Installing DB only, need remote RADIUS host
        read -p "Remote FreeRADIUS host (IP or hostname): " RADIUS_HOST
        print_info "Backend will connect to remote FreeRADIUS at $RADIUS_HOST"
    fi
else
    RADIUS_HOST="localhost"
    print_info "FreeRADIUS will be installed on local server"
fi

read -p "RADIUS shared secret [testing123]: " RADIUS_SECRET
RADIUS_SECRET=${RADIUS_SECRET:-testing123}

# Admin credentials (only needed for full installations)
if [[ "$DEPLOYMENT" != "db-radius-only" ]] || [[ "$INSTALL_COMPONENT" == "db-only" ]] || [[ "$INSTALL_COMPONENT" == "both" ]]; then
    read -p "Admin username [admin]: " ADMIN_USER
    ADMIN_USER=${ADMIN_USER:-admin}

    read -p "Admin password [admin]: " -s ADMIN_PASS
    ADMIN_PASS=${ADMIN_PASS:-admin}
    echo ""
fi

# =====================================================================
# Create Environment File
# =====================================================================

print_header "Creating Environment Configuration"

cat > .env << EOF
# Kilusi Bill Environment Configuration
# Generated by install.sh on $(date)

# Deployment
DEPLOYMENT_MODE=$DEPLOYMENT

# Database
POSTGRES_HOST=$DB_HOST
POSTGRES_PORT=$DB_PORT
POSTGRES_DATABASE=$DB_NAME
POSTGRES_USER=$DB_USER
POSTGRES_PASSWORD=$DB_PASSWORD

# FreeRADIUS
RADIUS_HOST=$RADIUS_HOST
RADIUS_PORT=1812
RADIUS_SECRET=$RADIUS_SECRET

# Backend
NODE_ENV=production
BACKEND_PORT=3001
SESSION_SECRET=$(openssl rand -hex 32)
API_KEY=kilusi-api-$(date +%Y)

# Admin
ADMIN_USERNAME=$ADMIN_USER
ADMIN_PASSWORD=$ADMIN_PASS

# SNMP Monitoring
SNMP_MONITOR_ENABLED=true
SNMP_MONITOR_INTERVAL=3

# Logging
LOG_LEVEL=info
EOF

print_success "Environment file created (.env)"

# =====================================================================
# Database Setup
# =====================================================================

print_header "Database Setup"

# Setup database for modes that need it
if [[ "$DEPLOYMENT" == "native" ]]; then
    # Mode 4: Full native installation
    print_info "Setting up PostgreSQL database..."
    
    # Check if database exists
    if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
        print_warning "Database $DB_NAME already exists"
        read -p "Do you want to migrate existing database? (y/n): " MIGRATE
        if [[ "$MIGRATE" == "y" ]]; then
            print_info "Running migration script..."
            PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f backend/migrations/001_rename_nas_servers_to_nas.sql
            print_success "Migration completed"
        fi
    else
        print_info "Creating database $DB_NAME..."
        PGPASSWORD=$DB_PASSWORD createdb -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME
        
        print_info "Initializing database schema (includes views)..."
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f scripts/master-schema.sql
        print_success "Database schema and views initialized"
    fi
    
elif [[ "$DEPLOYMENT" == "db-radius-only" ]]; then
    # Mode 2: Install what user selected
    if [[ "$INSTALL_COMPONENT" == "db-only" ]] || [[ "$INSTALL_COMPONENT" == "both" ]]; then
        print_info "Setting up PostgreSQL database..."
        
        # Check if database exists
        if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
            print_warning "Database $DB_NAME already exists"
            read -p "Do you want to migrate existing database? (y/n): " MIGRATE
            if [[ "$MIGRATE" == "y" ]]; then
                print_info "Running migration script..."
                PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f backend/migrations/001_rename_nas_servers_to_nas.sql
                print_success "Migration completed"
            fi
        else
            print_info "Creating database $DB_NAME..."
            PGPASSWORD=$DB_PASSWORD createdb -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME
            
            print_info "Initializing database schema (includes views)..."
            PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f scripts/master-schema.sql
            print_success "Database schema and views initialized"
        fi
    else
        print_info "Skipping database installation (RADIUS only mode)"
        print_warning "Ensure database is accessible at $DB_HOST:$DB_PORT"
    fi
    
elif [[ "$DEPLOYMENT" == "docker" ]] || [[ "$DEPLOYMENT" == "docker-backend" ]] || [[ "$DEPLOYMENT" == "docker-db-radius" ]]; then
    print_info "Database will be initialized via Docker"
fi

# =====================================================================
# FreeRADIUS Setup
# =====================================================================

if [[ "$DEPLOYMENT" == "native" ]]; then
    # Mode 4: All native
    print_header "FreeRADIUS Installation"
    
    read -p "Install FreeRADIUS now? (y/n): " INSTALL_RADIUS
    if [[ "$INSTALL_RADIUS" == "y" ]]; then
        print_info "Installing FreeRADIUS..."
        
        # Update SQL module configuration
        cp freeradius/config/mods-available/sql freeradius/config/mods-available/sql.configured
        sed -i "s/\${DB_HOST}/$DB_HOST/g" freeradius/config/mods-available/sql.configured
        sed -i "s/\${DB_PORT}/$DB_PORT/g" freeradius/config/mods-available/sql.configured
        sed -i "s/\${DB_NAME}/$DB_NAME/g" freeradius/config/mods-available/sql.configured
        sed -i "s/\${DB_USER}/$DB_USER/g" freeradius/config/mods-available/sql.configured
        sed -i "s/\${DB_PASSWORD}/$DB_PASSWORD/g" freeradius/config/mods-available/sql.configured
        
        # Run FreeRADIUS installer
        cd freeradius
        chmod +x install-freeradius.sh
        ./install-freeradius.sh -m native -h $DB_HOST -u $DB_USER -P $DB_PASSWORD -d $DB_NAME -s $RADIUS_SECRET
        cd ..
        
        print_success "FreeRADIUS installed"
    fi
    
elif [[ "$DEPLOYMENT" == "db-radius-only" ]]; then
    # Mode 2: Install based on component choice
    if [[ "$INSTALL_COMPONENT" == "radius-only" ]] || [[ "$INSTALL_COMPONENT" == "both" ]]; then
        print_header "FreeRADIUS Installation"
        
        print_info "Installing FreeRADIUS..."
        
        # Update SQL module configuration
        cp freeradius/config/mods-available/sql freeradius/config/mods-available/sql.configured
        sed -i "s/\${DB_HOST}/$DB_HOST/g" freeradius/config/mods-available/sql.configured
        sed -i "s/\${DB_PORT}/$DB_PORT/g" freeradius/config/mods-available/sql.configured
        sed -i "s/\${DB_NAME}/$DB_NAME/g" freeradius/config/mods-available/sql.configured
        sed -i "s/\${DB_USER}/$DB_USER/g" freeradius/config/mods-available/sql.configured
        sed -i "s/\${DB_PASSWORD}/$DB_PASSWORD/g" freeradius/config/mods-available/sql.configured
        
        # Run FreeRADIUS installer
        cd freeradius
        chmod +x install-freeradius.sh
        ./install-freeradius.sh -m native -h $DB_HOST -u $DB_USER -P $DB_PASSWORD -d $DB_NAME -s $RADIUS_SECRET
        cd ..
        
        print_success "FreeRADIUS installed"
    else
        print_info "Skipping FreeRADIUS installation (Database only mode)"
        print_warning "Ensure FreeRADIUS is accessible at $RADIUS_HOST"
    fi
fi

# =====================================================================
# Docker Deployment
# =====================================================================

if [[ "$DEPLOYMENT" == "docker"* ]]; then
    print_header "Docker Deployment"
    
    # Copy docker environment
    if [ ! -f .env ]; then
        cp .env.docker.example .env
    fi

    # Determine which services to start based on deployment mode
    DOCKER_SERVICES=""
    case "$DEPLOYMENT" in
        "docker-db-radius")
            # Only postgres and freeradius
            DOCKER_SERVICES="postgres freeradius"
            ;;
        "docker-backend")
            # postgres, freeradius, backend
            DOCKER_SERVICES="postgres freeradius backend"
            ;;
        "docker")
            # All services
            DOCKER_SERVICES=""
            ;;

    esac

    # Configure Connectivity (Interactive)
    configure_connectivity

    # Setup FreeRADIUS configuration files
    print_info "Setting up FreeRADIUS configuration..."
    
    # Generate Backend .env from example if not exists, then update it
    if [ ! -f .env ]; then
        cp .env.docker.example .env
    fi
    
    # Update ALLOWED_ORIGINS in .env
    # We use a temp file to avoid issues with sed and special characters
    sed "/^ALLOWED_ORIGINS=/d" .env > .env.tmp
    echo "ALLOWED_ORIGINS=$CORS_ORIGINS" >> .env.tmp
    mv .env.tmp .env
    
    # Generate Frontend .env.local
    if [ -d "frontend" ]; then
        echo "# Generated by install.sh" > frontend/.env.local
        if [ -n "$FRONTEND_API_URL" ]; then
             echo "NEXT_PUBLIC_API_URL=$FRONTEND_API_URL" >> frontend/.env.local
        else
             echo "# Leave empty to use Next.js Proxy" >> frontend/.env.local
             echo "NEXT_PUBLIC_API_URL=" >> frontend/.env.local
        fi
        print_success "Frontend environment configured"
    fi
    
    # Ensure FreeRADIUS config files are ready
    if [ -f "freeradius/config/mods-available/sql" ]; then
        cp freeradius/config/mods-available/sql freeradius/config/sql-symlink
        print_success "FreeRADIUS SQL module configured"
    fi
    
    if [ -f "freeradius/config/sites-available/default" ]; then
        cp freeradius/config/sites-available/default freeradius/config/default
        print_success "FreeRADIUS site configuration ready"
    fi
    
    print_info "Starting Docker containers..."
    if [ -n "$DOCKER_SERVICES" ]; then
        $SUDO docker-compose up -d $DOCKER_SERVICES
    else
        $SUDO docker-compose up -d
    fi
    
    print_success "Docker containers started"
    
    # Wait for services
    # Wait for services
    print_info "Waiting for database to be ready..."
    MAX_RETRIES=30
    COUNT=0
    while ! $SUDO docker exec kilusi-postgres pg_isready -U ${POSTGRES_USER:-kilusi_user} > /dev/null 2>&1; do
        sleep 2
        COUNT=$((COUNT+1))
        if [ $COUNT -ge $MAX_RETRIES ]; then
            print_error "Database timed out waiting for readiness"
            break
        fi
        echo -n "."
    done
    echo ""
    echo ""

    # Check if schema is loaded (by checking admins table)
    print_info "Verifying database schema..."
    if ! $SUDO docker exec kilusi-postgres psql -U ${POSTGRES_USER:-kilusi_user} -d ${POSTGRES_DATABASE:-kilusi_bill} -c "SELECT count(*) FROM admins;" > /dev/null 2>&1; then
        print_warning "Schema not found (admins table missing). Loading schema manually..."
        
        # Load Master Schema
        if [ -f "scripts/master-schema.sql" ]; then
            cat scripts/master-schema.sql | $SUDO docker exec -i kilusi-postgres psql -U ${POSTGRES_USER:-kilusi_user} -d ${POSTGRES_DATABASE:-kilusi_bill}
            print_success "Master schema loaded"
        else
            print_error "scripts/master-schema.sql not found!"
        fi

        # Load Views
        if [ -f "scripts/02-views.sql" ]; then
            cat scripts/02-views.sql | $SUDO docker exec -i kilusi-postgres psql -U ${POSTGRES_USER:-kilusi_user} -d ${POSTGRES_DATABASE:-kilusi_bill}
            print_success "Views loaded"
        fi
    else
        print_success "Schema already loaded"
    fi
    
    # Check service health
    $SUDO docker-compose ps
    
    # Insert default admin user if not exists
    print_info "Creating admin user in database..."
    sleep 5 # Give a little extra time for schema initialization if it just started
    $SUDO docker exec kilusi-postgres psql -U ${POSTGRES_USER:-kilusi_user} -d ${POSTGRES_DATABASE:-kilusi_bill} -c "
        INSERT INTO users (username, password, role, email, is_active, created_at, updated_at) VALUES 
        ('${ADMIN_USERNAME:-admin}', '\$2b\$10\$X7V.7/8h.8/9.8/9.8/9.8/9.8/9.8/9', 'superadmin', 'admin@kilusi.id', true, NOW(), NOW())
        ON CONFLICT (username) DO UPDATE SET role = 'superadmin', password = CASE WHEN '${ADMIN_PASSWORD:-admin}' != 'admin' THEN '\$2b\$10\$X7V.7/8h.8/9.8/9.8/9.8/9.8/9.8/9' ELSE users.password END;
    " || print_warning "Could not create default admin user. Check logs above."
    print_success "Admin user created (User: ${ADMIN_USERNAME:-admin}, Pass: ${ADMIN_PASSWORD:-admin})"
    
    # Setup default NAS entries for FreeRADIUS (multi-NAS support)
    print_info "Setting up default NAS entries in database..."
    $SUDO docker exec kilusi-postgres psql -U ${POSTGRES_USER:-kilusi_user} -d ${POSTGRES_DATABASE:-kilusi_bill} -c "
        INSERT INTO nas (nasname, shortname, ip_address, secret, ports, type, description, is_active) VALUES 
        ('172.20.0.0/16', 'docker-net', '172.20.0.1', '${RADIUS_SECRET:-testing123}', 1812, 'other', 'Docker network', true),
        ('10.0.0.0/8', 'private-10', '10.0.0.1', '${RADIUS_SECRET:-testing123}', 1812, 'other', 'Private network 10.x', true),
        ('192.168.0.0/16', 'private-192', '192.168.0.1', '${RADIUS_SECRET:-testing123}', 1812, 'other', 'Private network 192.x', true)
        ON CONFLICT DO NOTHING;
    " 2>/dev/null || print_warning "Could not add default NAS entries (may already exist)"
    print_success "FreeRADIUS NAS configuration complete"
    
    # Note: FreeRADIUS needs restart to load new NAS from database
    print_info "Restarting FreeRADIUS to load NAS from database..."
    $SUDO docker-compose restart freeradius 2>/dev/null || true
    print_success "FreeRADIUS restarted"
fi

# =====================================================================
# Backend Setup
# =====================================================================

if [[ "$DEPLOYMENT" == "native" ]] || [[ "$DEPLOYMENT" == "docker-db-radius" ]]; then
    print_header "Backend Setup"
    
    # If not already configured (e.g. if we skipped docker section), run config
    if [ -z "$CORS_ORIGINS" ]; then
        configure_connectivity
    fi
    
    cd backend
    
    if [ ! -f .env ]; then
        cp .env.example .env
    fi
    
    # Update ALLOWED_ORIGINS in backend/.env
    sed "/^ALLOWED_ORIGINS=/d" .env > .env.tmp
    echo "ALLOWED_ORIGINS=$CORS_ORIGINS" >> .env.tmp
    mv .env.tmp .env
    
    if [ ! -d "node_modules" ]; then
        print_info "Installing Node.js dependencies..."
        npm install
        print_success "Dependencies installed"
    fi
    
    # Build legacy dashboard (dashboard-src)
    if [ -d "dashboard-src" ]; then
        print_info "Building legacy dashboard..."
        cd dashboard-src
        if [ ! -d "node_modules" ]; then
            npm install --silent
        fi
        npm run build
        cd ..
        print_success "Legacy dashboard built"
    fi
    
    # Create systemd service
    print_info "Creating systemd service..."

    # Get the actual node path
    NODE_PATH=$(which node)

    # Check if node is in NVM directory and setup environment accordingly
    if [[ "$NODE_PATH" == *".nvm"* ]]; then
        NVM_DIR=$(dirname "$(dirname "$(dirname "$NODE_PATH")")")
        print_info "Node.js detected in NVM, configuring environment..."

        $SUDO tee /etc/systemd/system/kilusi-backend.service > /dev/null <<EOF
[Unit]
Description=Kilusi Bill Backend Service
After=network.target postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR/backend
Environment="NODE_ENV=production"
Environment="PATH=$NVM_DIR/versions/node/$(node -v)/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="NVM_DIR=$NVM_DIR"
ExecStart=$NODE_PATH $SCRIPT_DIR/backend/app.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    else
        $SUDO tee /etc/systemd/system/kilusi-backend.service > /dev/null <<EOF
[Unit]
Description=Kilusi Bill Backend Service
After=network.target postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR/backend
Environment="NODE_ENV=production"
ExecStart=$NODE_PATH $SCRIPT_DIR/backend/app.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    fi

    $SUDO systemctl daemon-reload
    $SUDO systemctl enable kilusi-backend
    $SUDO systemctl start kilusi-backend

    print_success "Backend service started"

    cd ..
fi

# =====================================================================
# Frontend Setup
# =====================================================================

if [[ "$DEPLOYMENT" == "native" ]] || [[ "$DEPLOYMENT" == "docker-db-radius" ]] || [[ "$DEPLOYMENT" == "docker-backend" ]]; then
    print_header "Frontend Setup"

    cd frontend

    # Generate Frontend .env.local
    echo "# Generated by install.sh" > .env.local
    if [ -n "$FRONTEND_API_URL" ]; then
            echo "NEXT_PUBLIC_API_URL=$FRONTEND_API_URL" >> .env.local
    else
            echo "# Leave empty to use Next.js Proxy" >> .env.local
            echo "NEXT_PUBLIC_API_URL=" >> .env.local
    fi
    print_success "Frontend environment configured"

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_info "Installing Node.js dependencies..."
        npm install --silent
        print_success "Dependencies installed"
    fi

    # Build frontend
    print_info "Building frontend..."
    npm run build
    print_success "Frontend built successfully"

    # Create systemd service for frontend
    print_info "Creating systemd service for frontend..."

    # Get the actual node path
    NODE_PATH=$(which node)

    # Check if node is in NVM directory and setup environment accordingly
    if [[ "$NODE_PATH" == *".nvm"* ]]; then
        NVM_DIR=$(dirname "$(dirname "$(dirname "$NODE_PATH")")")
        print_info "Node.js detected in NVM, configuring environment..."

        $SUDO tee /etc/systemd/system/kilusi-frontend.service > /dev/null <<EOF
[Unit]
Description=Kilusi Bill Frontend Service
After=network.target kilusi-backend.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR/frontend
Environment="NODE_ENV=production"
Environment="PATH=$NVM_DIR/versions/node/$(node -v)/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="NVM_DIR=$NVM_DIR"
ExecStart=$NODE_PATH $SCRIPT_DIR/frontend/node_modules/.bin/next start -p 8080
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    else
        $SUDO tee /etc/systemd/system/kilusi-frontend.service > /dev/null <<EOF
[Unit]
Description=Kilusi Bill Frontend Service
After=network.target kilusi-backend.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR/frontend
Environment="NODE_ENV=production"
ExecStart=$NODE_PATH $SCRIPT_DIR/frontend/node_modules/.bin/next start -p 8080
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    fi

    $SUDO systemctl daemon-reload
    $SUDO systemctl enable kilusi-frontend
    $SUDO systemctl start kilusi-frontend

    print_success "Frontend service started on port 8080"

    cd ..
fi

# =====================================================================
# Post-Installation
# =====================================================================

print_header "Post-Installation"

# Create admin user (only if backend is being installed)
# Skip for radius-only mode (no backend, no admin needed)
if [[ "$DEPLOYMENT" != "db-radius-only" ]] || [[ "$INSTALL_COMPONENT" == "db-only" ]] || [[ "$INSTALL_COMPONENT" == "both" ]]; then
    # Create admin user (if database was just created)
    print_info "Creating admin user in database..."

    # For Docker mode, install dependencies temporarily to create admin user
    if [[ "$DEPLOYMENT" == "docker" ]]; then
        cd backend
        if [ ! -d "node_modules" ]; then
            print_info "Installing Node.js dependencies temporarily for admin creation..."
            npm install --silent > /dev/null 2>&1
        fi
        ADMIN_PASS_HASH=$(node -e "const bcrypt = require('bcrypt'); bcrypt.hash('$ADMIN_PASS', 10).then(hash => console.log(hash));")
        cd ..
    else
        # For native modes, dependencies are already installed
        cd backend
        ADMIN_PASS_HASH=$(node -e "const bcrypt = require('bcrypt'); bcrypt.hash('$ADMIN_PASS', 10).then(hash => console.log(hash));")
        cd ..
    fi

    # Use docker-compose exec for modes where database is in Docker
    if [[ "$DEPLOYMENT" == "docker" ]] || [[ "$DEPLOYMENT" == "docker-backend" ]] || [[ "$DEPLOYMENT" == "docker-db-radius" ]]; then
        $SUDO docker-compose exec -T postgres psql -U $DB_USER -d $DB_NAME << EOF
INSERT INTO users (username, password, role, email)
VALUES ('$ADMIN_USER', '$ADMIN_PASS_HASH', 'admin', 'admin@localhost')
ON CONFLICT (username) DO NOTHING;
EOF
    else
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << EOF
INSERT INTO users (username, password, role, email)
VALUES ('$ADMIN_USER', '$ADMIN_PASS_HASH', 'admin', 'admin@localhost')
ON CONFLICT (username) DO NOTHING;
EOF
    fi

    print_success "Admin user created"
else
    print_info "Skipping admin user creation (radius-only mode)"
fi

# =====================================================================
# Installation Complete
# =====================================================================

print_header "Installation Complete!"

echo -e "${GREEN}✓ Kilusi Bill has been successfully installed!${NC}"
echo ""
echo -e "${BLUE}Configuration Summary:${NC}"
echo "  Deployment Mode: $DEPLOYMENT"
echo "  Database: ${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo "  FreeRADIUS: ${RADIUS_HOST}:1812"
echo "  Admin User: $ADMIN_USER"
echo ""
echo -e "${BLUE}Access Information:${NC}"

if [[ "$DEPLOYMENT" == "docker" ]]; then
    echo "  Backend API: http://localhost:3001"
    echo "  Frontend: http://localhost:80"
    echo ""
    echo "  View logs: ${SUDO}docker-compose logs -f"
    echo "  Stop services: ${SUDO}docker-compose down"
    echo "  Restart: ${SUDO}docker-compose restart"
elif [[ "$DEPLOYMENT" == "docker-backend" ]]; then
    echo "  Backend API: http://localhost:3001 (Docker)"
    echo "  Frontend: http://localhost:8080 (Native)"
    echo ""
    echo "  Docker logs: ${SUDO}docker-compose logs -f"
    echo "  Frontend logs: ${SUDO}journalctl -u kilusi-frontend -f"
    echo "  Restart frontend: ${SUDO}systemctl restart kilusi-frontend"
elif [[ "$DEPLOYMENT" == "docker-db-radius" ]]; then
    echo "  Backend API: http://localhost:3001 (Native)"
    echo "  Frontend: http://localhost:8080 (Native)"
    echo ""
    echo "  Docker logs: ${SUDO}docker-compose logs -f"
    echo "  Backend logs: ${SUDO}journalctl -u kilusi-backend -f"
    echo "  Frontend logs: ${SUDO}journalctl -u kilusi-frontend -f"
    echo "  Restart backend: ${SUDO}systemctl restart kilusi-backend"
    echo "  Restart frontend: ${SUDO}systemctl restart kilusi-frontend"
else
    echo "  Backend API: http://localhost:3001"
    echo "  Frontend: http://localhost:8080"
    echo ""
    echo "  Backend logs: ${SUDO}journalctl -u kilusi-backend -f"
    echo "  Frontend logs: ${SUDO}journalctl -u kilusi-frontend -f"
    echo "  Restart backend: ${SUDO}systemctl restart kilusi-backend"
    echo "  Restart frontend: ${SUDO}systemctl restart kilusi-frontend"
fi

echo ""
echo -e "${YELLOW}Important Next Steps:${NC}"
echo "  1. Test database connection"
echo "  2. Add your NAS servers to the 'nas' table"
echo "  3. Configure FreeRADIUS clients (if not using Docker)"
echo "  4. Update firewall rules to allow RADIUS ports (1812, 1813)"
echo "  5. Configure WhatsApp and payment gateway (optional)"
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo "  - Setup Guide: README-SETUP.md"
echo "  - FreeRADIUS Integration: docs/FREERADIUS-INTEGRATION.md"
echo "  - Database Schema: docs/DATABASE-SCHEMA.md"
echo ""
echo -e "${GREEN}Happy billing!${NC}"
echo ""

# Save installation summary (plain text, no colors)
cat > installation-summary.txt << EOF
================================================================================
Kilusi Bill - Installation Summary
================================================================================
Generated: $(date)

Configuration Summary:
  Deployment Mode: $DEPLOYMENT
  Database: ${DB_HOST}:${DB_PORT}/${DB_NAME}
  FreeRADIUS: ${RADIUS_HOST}:1812
  Admin User: $ADMIN_USER

Access Information:
EOF

if [[ "$DEPLOYMENT" == "docker" ]]; then
    cat >> installation-summary.txt << EOF
  Backend API: http://localhost:3001
  Frontend: http://localhost:80

  View logs: ${SUDO}docker-compose logs -f
  Stop services: ${SUDO}docker-compose down
  Restart: ${SUDO}docker-compose restart
EOF
elif [[ "$DEPLOYMENT" == "docker-backend" ]]; then
    cat >> installation-summary.txt << EOF
  Backend API: http://localhost:3001 (Docker)
  Frontend: http://localhost:8080 (Native)

  Docker logs: ${SUDO}docker-compose logs -f
  Frontend logs: ${SUDO}journalctl -u kilusi-frontend -f
  Restart frontend: ${SUDO}systemctl restart kilusi-frontend
EOF
elif [[ "$DEPLOYMENT" == "docker-db-radius" ]]; then
    cat >> installation-summary.txt << EOF
  Backend API: http://localhost:3001 (Native)
  Frontend: http://localhost:8080 (Native)

  Docker logs: ${SUDO}docker-compose logs -f
  Backend logs: ${SUDO}journalctl -u kilusi-backend -f
  Frontend logs: ${SUDO}journalctl -u kilusi-frontend -f
  Restart backend: ${SUDO}systemctl restart kilusi-backend
  Restart frontend: ${SUDO}systemctl restart kilusi-frontend
EOF
else
    cat >> installation-summary.txt << EOF
  Backend API: http://localhost:3001
  Frontend: http://localhost:8080

  Backend logs: ${SUDO}journalctl -u kilusi-backend -f
  Frontend logs: ${SUDO}journalctl -u kilusi-frontend -f
  Restart backend: ${SUDO}systemctl restart kilusi-backend
  Restart frontend: ${SUDO}systemctl restart kilusi-frontend
EOF
fi

cat >> installation-summary.txt << EOF

Important Next Steps:
  1. Test database connection
  2. Add your NAS servers to the 'nas' table
  3. Configure FreeRADIUS clients (if not using Docker)
  4. Update firewall rules to allow RADIUS ports (1812, 1813)
  5. Configure WhatsApp and payment gateway (optional)

Documentation:
  - Setup Guide: README-SETUP.md
  - FreeRADIUS Integration: docs/FREERADIUS-INTEGRATION.md
  - Database Schema: docs/DATABASE-SCHEMA.md

Installation Directory: $SCRIPT_DIR
Environment File: backend/.env

================================================================================
Happy billing!
================================================================================
EOF

print_success "Installation summary saved to installation-summary.txt"
