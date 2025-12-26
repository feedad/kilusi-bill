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
        sudo apt-get update
        
        # Install basic tools
        if ! command -v curl &> /dev/null; then
            sudo apt-get install -y curl
        fi
        
        if ! command -v wget &> /dev/null; then
            sudo apt-get install -y wget
        fi
        
        if ! command -v git &> /dev/null; then
            sudo apt-get install -y git
        fi
        
        # Install Node.js (if needed for native deployment)
        if [[ "$DEPLOYMENT" == "native" ]]; then
            if ! command -v node &> /dev/null; then
                print_info "Installing Node.js..."
                curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
                sudo apt-get install -y nodejs
            fi
        fi
        
        # Install PostgreSQL client (if needed)
        if [[ "$DEPLOYMENT" == "native" ]] || [[ "$DEPLOYMENT" == "docker-external-db" ]]; then
            if ! command -v psql &> /dev/null; then
                print_info "Installing PostgreSQL client..."
                sudo apt-get install -y postgresql-client
            fi
        fi
        
        # Install Docker (if needed)
        if [[ "$DEPLOYMENT" == "docker"* ]]; then
            if ! command -v docker &> /dev/null; then
                print_info "Installing Docker..."
                curl -fsSL https://get.docker.com -o get-docker.sh
                sudo sh get-docker.sh
                sudo usermod -aG docker $USER
                rm get-docker.sh
            fi
            
            if ! command -v docker-compose &> /dev/null; then
                print_info "Installing Docker Compose..."
                sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
                sudo chmod +x /usr/local/bin/docker-compose
            fi
        fi
        
    elif [[ "$OS" == "centos" ]] || [[ "$OS" == "rhel" ]] || [[ "$OS" == "fedora" ]]; then
        sudo yum update -y
        
        if ! command -v git &> /dev/null; then
            sudo yum install -y git
        fi
        
        if [[ "$DEPLOYMENT" == "native" ]]; then
            if ! command -v node &> /dev/null; then
                curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
                sudo yum install -y nodejs
            fi
        fi
        
        if [[ "$DEPLOYMENT" == "docker"* ]]; then
            if ! command -v docker &> /dev/null; then
                sudo yum install -y yum-utils
                sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
                sudo yum install -y docker-ce docker-ce-cli containerd.io
                sudo systemctl start docker
                sudo systemctl enable docker
                sudo usermod -aG docker $USER
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
        print_warning "Please logout and login again for Docker group changes to take effect"
        print_info "After re-login, run this script again"
        exit 0
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
        
        print_info "Initializing database schema..."
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f scripts/master-schema.sql
        print_success "Database schema initialized"
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
            
            print_info "Initializing database schema..."
            PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f scripts/master-schema.sql
            print_success "Database schema initialized"
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
    
    # Modify docker-compose.yml based on deployment mode
    if [[ "$DEPLOYMENT" == "docker-external-db" ]]; then
        print_info "Configuring for external PostgreSQL..."
        # Comment out postgres service (this is just informational, user should do manually or we use sed)
        print_warning "Please comment out 'postgres' service in docker-compose.yml"
    fi
    
    if [[ "$DEPLOYMENT" == "docker-external-radius" ]]; then
        print_info "Configuring for native FreeRADIUS..."
        print_warning "Please comment out 'freeradius' service in docker-compose.yml"
    fi
    
    print_info "Starting Docker containers..."
    docker-compose up -d
    
    print_success "Docker containers started"
    
    # Wait for services
    print_info "Waiting for services to be ready..."
    sleep 10
    
    # Check service health
    docker-compose ps
fi

# =====================================================================
# Backend Setup
# =====================================================================

if [[ "$DEPLOYMENT" == "native" ]]; then
    print_header "Backend Setup"
    
    cd backend
    
    if [ ! -d "node_modules" ]; then
        print_info "Installing Node.js dependencies..."
        npm install
        print_success "Dependencies installed"
    fi
    
    # Create systemd service
    print_info "Creating systemd service..."
    
    sudo tee /etc/systemd/system/kilusi-backend.service > /dev/null <<EOF
[Unit]
Description=Kilusi Bill Backend Service
After=network.target postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR/backend
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node app.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable kilusi-backend
    sudo systemctl start kilusi-backend
    
    print_success "Backend service started"
    
    cd ..
fi

# =====================================================================
# Post-Installation
# =====================================================================

print_header "Post-Installation"

# Create admin user (if database was just created)
print_info "Creating admin user in database..."

ADMIN_PASS_HASH=$(node -e "const bcrypt = require('bcrypt'); bcrypt.hash('$ADMIN_PASS', 10).then(hash => console.log(hash));")

if [[ "$DEPLOYMENT" == "docker" ]]; then
    docker-compose exec -T postgres psql -U $DB_USER -d $DB_NAME << EOF
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

# =====================================================================
# Installation Complete
# =====================================================================

print_header "Installation Complete!"

cat << EOF
${GREEN}✓ Kilusi Bill has been successfully installed!${NC}

${BLUE}Configuration Summary:${NC}
  Deployment Mode: $DEPLOYMENT
  Database: ${DB_HOST}:${DB_PORT}/${DB_NAME}
  FreeRADIUS: ${RADIUS_HOST}:1812
  Admin User: $ADMIN_USER

${BLUE}Access Information:${NC}
EOF

if [[ "$DEPLOYMENT" == "docker"* ]]; then
    cat << EOF
  Backend API: http://localhost:3001
  Frontend: http://localhost:80
  
  View logs: docker-compose logs -f
  Stop services: docker-compose down
  Restart: docker-compose restart
EOF
else
    cat << EOF
  Backend API: http://localhost:3001
  
  View logs: sudo journalctl -u kilusi-backend -f
  Stop service: sudo systemctl stop kilusi-backend
  Restart: sudo systemctl restart kilusi-backend
EOF
fi

cat << EOF

${YELLOW}Important Next Steps:${NC}
  1. Test database connection: psql -h $DB_HOST -U $DB_USER -d $DB_NAME
  2. Add your NAS servers to the 'nas' table
  3. Configure FreeRADIUS clients (if not using Docker)
  4. Update firewall rules to allow RADIUS ports (1812, 1813)
  5. Configure WhatsApp and payment gateway (optional)

${BLUE}Documentation:${NC}
  - Setup Guide: README-SETUP.md
  - FreeRADIUS Integration: docs/FREERADIUS-INTEGRATION.md
  - Database Schema: docs/DATABASE-SCHEMA.md

${GREEN}Happy billing!${NC}

EOF

# Save installation summary
cat > installation-summary.txt << EOF
Kilusi Bill Installation Summary
Generated: $(date)

Deployment Mode: $DEPLOYMENT
Database Host: $DB_HOST:$DB_PORT
Database Name: $DB_NAME
Database User: $DB_USER
FreeRADIUS Host: $RADIUS_HOST
Admin Username: $ADMIN_USER

Installation Directory: $SCRIPT_DIR
Environment File: .env
EOF

print_success "Installation summary saved to installation-summary.txt"
