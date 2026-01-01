#!/bin/bash

# =====================================================================
# FreeRADIUS Installer Script for Kilusi Bill ISP Billing System
# =====================================================================
# This script installs and configures FreeRADIUS with PostgreSQL
# integration for the Kilusi Bill system.
#
# Author: Kilusi Development Team
# Version: 1.0.0
# Requirements:
#   - Ubuntu 20.04+ / Debian 11+
#   - PostgreSQL 13+
#   - Docker & Docker Compose (optional)
# =====================================================================

set -e

# Non-interactive installation
export DEBIAN_FRONTEND=noninteractive
export APT_KEY_DONT_WARN_ON_DANGEROUS_USAGE=DontWarn

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration values
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="radius"
DB_USER="radius"
DB_PASSWORD="radius1234"
RADIUS_SECRET="testing123"
ADMIN_PORT="18120"
AUTH_PORT="1812"
ACCT_PORT="1813"
INSTALL_MODE="native"  # native or docker
NETWORK_INTERFACE="eth0"

# Function to print colored messages
print_message() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_header() {
    echo -e "${BLUE}====================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}====================================================================${NC}"
}

# Function to detect OS
detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$NAME
        VER=$VERSION_ID
    else
        print_error "Cannot detect operating system"
        exit 1
    fi

    print_message "Detected OS: $OS $VER"
}

# Function to check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root (sudo)."
        exit 1
    fi
}

# Function to install system dependencies
install_dependencies() {
    print_header "Installing System Dependencies"

    # Update package list
    sudo apt update

    # Install required packages
    sudo apt install -y \
        wget \
        curl \
        gnupg \
        lsb-release \
        ca-certificates \
        build-essential \
        libssl-dev \
        libpq-dev \
        postgresql-client \
        htop \
        vim \
        ufw

    print_message "System dependencies installed successfully"
}

# Function to install Docker (if requested)
install_docker() {
    if [[ "$INSTALL_MODE" != "docker" ]]; then
        return 0
    fi

    print_header "Installing Docker & Docker Compose"

    # Install Docker
    if ! command -v docker &> /dev/null; then
        print_message "Installing Docker..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        sudo usermod -aG docker $USER
        rm get-docker.sh
    else
        print_message "Docker is already installed"
    fi

    # Install Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_message "Installing Docker Compose..."
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
    else
        print_message "Docker Compose is already installed"
    fi
}

# Function to setup PostgreSQL database
setup_database() {
    print_header "Setting up PostgreSQL Database"

    # Check if PostgreSQL is accessible
    if ! sudo -u postgres psql -h $DB_HOST -p $DB_PORT -c '\q' &> /dev/null; then
        print_error "Cannot connect to PostgreSQL server at $DB_HOST:$DB_PORT"
        print_message "Please ensure PostgreSQL is running and accessible"
        exit 1
    fi

    # Create database and user
    print_message "Creating RADIUS database and user..."

    # Create database
    sudo -u postgres psql -h $DB_HOST -p $DB_PORT -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || print_warning "Database $DB_NAME already exists"

    # Create user
    sudo -u postgres psql -h $DB_HOST -p $DB_PORT -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || print_warning "User $DB_USER already exists"

    # Grant privileges
    sudo -u postgres psql -h $DB_HOST -p $DB_PORT -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

    # Setup RADIUS schema
    print_message "Setting up RADIUS database schema..."
    sudo -u postgres psql -h $DB_HOST -p $DB_PORT -d $DB_NAME -f ./config/radius-schema.sql

    print_message "Database setup completed"
}

# Function to install FreeRADIUS (native mode)
install_freeradius_native() {
    print_header "Installing FreeRADIUS (Native Mode)"

    # Add FreeRADIUS repository
    wget -qO- https://packages.networkradius.com/apt/gpg | sudo apt-key add -
    echo "deb [arch=amd64] https://packages.networkradius.com/apt/ focal main" | sudo tee /etc/apt/sources.list.d/networkradius.list

    # Update package list
    sudo apt update

    # Install FreeRADIUS with PostgreSQL support
    sudo apt install -y freeradius freeradius-postgresql freeradius-utils

    # Stop FreeRADIUS service for configuration
    sudo systemctl stop freeradius
    sudo systemctl disable freeradius

    print_message "FreeRADIUS installed successfully"
}

# Function to configure FreeRADIUS (native mode)
configure_freeradius_native() {
    print_header "Configuring FreeRADIUS (Native Mode)"

    # Backup original configuration
    sudo cp -r /etc/freeradius/3.0 /etc/freeradius/3.0.backup

    # Copy configuration files
    print_message "Copying FreeRADIUS configuration files..."

    # Create mods-available/sql if it doesn't exist
    sudo mkdir -p /etc/freeradius/3.0/mods-available

    # Copy SQL module configuration
    sudo cp ./config/sql /etc/freeradius/3.0/mods-available/

    # Replace database credentials in SQL config
    sudo sed -i "s/DB_HOST/$DB_HOST/g" /etc/freeradius/3.0/mods-available/sql
    sudo sed -i "s/DB_PORT/$DB_PORT/g" /etc/freeradius/3.0/mods-available/sql
    sudo sed -i "s/DB_USER/$DB_USER/g" /etc/freeradius/3.0/mods-available/sql
    sudo sed -i "s/DB_PASSWORD/$DB_PASSWORD/g" /etc/freeradius/3.0/mods-available/sql
    sudo sed -i "s/DB_NAME/$DB_NAME/g" /etc/freeradius/3.0/mods-available/sql

    # Enable SQL module
    sudo ln -sf /etc/freeradius/3.0/mods-available/sql /etc/freeradius/3.0/mods-enabled/

    # Copy clients.conf
    sudo cp ./config/clients.conf /etc/freeradius/3.0/

    # Copy sites-available/default
    sudo mkdir -p /etc/freeradius/3.0/sites-available
    sudo cp ./config/default /etc/freeradius/3.0/sites-available/

    # Copy users file
    sudo cp ./config/users /etc/freeradius/3.0/

    # Set proper permissions
    sudo chown -R freerad:freerad /etc/freeradius/3.0/

    print_message "FreeRADIUS configuration completed"
}

# Function to setup Docker configuration
setup_docker_config() {
    print_header "Setting up Docker Configuration"

    # Create directory structure
    mkdir -p docker/freeradius/{config,mods-enabled,sites-available}

    # Copy configuration files
    cp config/clients.conf docker/freeradius/
    cp config/default docker/freeradius/sites-available/
    cp config/users docker/freeradius/

    # Copy SQL configuration with environment variables
    cat > docker/freeradius/config/postgresql << EOF
sql {
    driver = "rlm_sql_postgresql"
    server = "postgres"
    port = 5432
    login = "\${POSTGRES_USER:-$DB_USER}"
    password = "\${POSTGRES_PASSWORD:-$DB_PASSWORD}"
    radius_db = "\${POSTGRES_DB:-$DB_NAME}"

    # All other SQL configuration from the original file
    acct_table1 = "radacct"
    acct_table2 = "radacct"
    postauth_table = "radpostauth"
    authcheck_table = "radcheck"
    authreply_table = "radreply"
    groupcheck_table = "radgroupcheck"
    groupreply_table = "radgroupreply"
    usergroup_table = "radusergroup"

    delete_stale_sessions = yes
    sqltrace = no
    sqltracefile = \${logdir}/sqltrace.sql
    num_sql_socks = 5
    connect_timeout = 3
    lifetime = 0
    max_queries = 0
    read_clients = yes
    client_table = "nas"
    read_groups = yes
    deletestalesessions = yes
    debug = 0

    # Include the queries from the original SQL config
    \$(cat config/sql-queries.conf)
}
EOF

    # Create Docker Compose file
    cat > docker-compose.yml << EOF
version: '3.8'

services:
  freeradius:
    image: freeradius/freeradius-server:3.2
    container_name: kilusi-freeradius
    restart: unless-stopped
    volumes:
      - ./docker/freeradius/clients.conf:/etc/freeradius/3.0/clients.conf
      - ./docker/freeradius/mods-enabled:/etc/freeradius/3.0/mods-enabled
      - ./docker/freeradius/sites-available:/etc/freeradius/3.0/sites-available
      - ./docker/freeradius/users:/etc/freeradius/3.0/users
      - ./docker/freeradius/config:/etc/freeradius/3.0/mods-config/sql/main/postgresql
    ports:
      - "$AUTH_PORT:1812/udp"
      - "$ACCT_PORT:1813/udp"
      - "$ADMIN_PORT:18120/tcp"
    environment:
      - DB_NAME=$DB_NAME
      - DB_HOST=$DB_HOST
      - DB_PORT=$DB_PORT
      - DB_USER=$DB_USER
      - DB_PASS=$DB_PASSWORD
    networks:
      - radius-network
    healthcheck:
      test: ["CMD", "pgrep", "freeradius"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  radius-network:
    driver: bridge
EOF

    print_message "Docker configuration created"
}

# Function to configure firewall
configure_firewall() {
    print_header "Configuring Firewall"

    # Allow RADIUS ports
    sudo ufw allow $AUTH_PORT/udp comment "FreeRADIUS Authentication"
    sudo ufw allow $ACCT_PORT/udp comment "FreeRADIUS Accounting"
    sudo ufw allow $ADMIN_PORT/tcp comment "FreeRADIUS Admin"

    # Allow SSH if not already allowed
    sudo ufw allow ssh || true

    print_message "Firewall configured successfully"
}

# Function to create systemd service (native mode)
create_systemd_service() {
    if [[ "$INSTALL_MODE" != "native" ]]; then
        return 0
    fi

    print_header "Creating Systemd Service"

    # Create systemd service file
    sudo tee /etc/systemd/system/freeradius-custom.service > /dev/null << EOF
[Unit]
Description=FreeRADIUS Service (Custom Configuration)
After=postgresql.service
Wants=postgresql.service

[Service]
Type=forking
PIDFile=/var/run/freeradius/freeradius.pid
User=freerad
Group=freerad
ExecStart=/usr/sbin/freeradius -f -l stdout -xx
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable freeradius-custom

    print_message "Systemd service created"
}

# Function to test FreeRADIUS installation
test_freeradius() {
    print_header "Testing FreeRADIUS Installation"

    if [[ "$INSTALL_MODE" == "docker" ]]; then
        # Start Docker containers
        docker-compose up -d

        # Wait for container to start
        sleep 10

        # Test if FreeRADIUS is responding
        if docker exec kilusi-freeradius pgrep freeradius > /dev/null; then
            print_message "FreeRADIUS Docker container is running"
        else
            print_error "FreeRADIUS Docker container failed to start"
            docker-compose logs freeradius
            exit 1
        fi
    else
        # Start native service
        sudo systemctl start freeradius-custom

        # Wait for service to start
        sleep 5

        # Test if FreeRADIUS is responding
        if sudo systemctl is-active --quiet freeradius-custom; then
            print_message "FreeRADIUS service is running"
        else
            print_error "FreeRADIUS service failed to start"
            sudo journalctl -u freeradius-custom -n 50
            exit 1
        fi
    fi

    # Test authentication with test user
    print_message "Testing authentication with test user..."
    echo "User-Name = testuser, User-Password = test123" | radclient localhost:$AUTH_PORT auth $RADIUS_SECRET

    if [[ $? -eq 0 ]]; then
        print_message "Authentication test successful!"
    else
        print_warning "Authentication test failed. Please check configuration."
    fi
}

# Function to show installation summary
show_summary() {
    print_header "Installation Summary"

    echo -e "${GREEN}FreeRADIUS has been successfully installed and configured!${NC}"
    echo
    echo -e "${BLUE}Configuration Details:${NC}"
    echo "  Installation Mode: $INSTALL_MODE"
    echo "  Database Host: $DB_HOST:$DB_PORT"
    echo "  Database Name: $DB_NAME"
    echo "  Database User: $DB_USER"
    echo "  Authentication Port: $AUTH_PORT"
    echo "  Accounting Port: $ACCT_PORT"
    echo "  Admin Port: $ADMIN_PORT"
    echo
    echo -e "${BLUE}Next Steps:${NC}"

    if [[ "$INSTALL_MODE" == "docker" ]]; then
        echo "  1. Start FreeRADIUS: docker-compose up -d"
        echo "  2. View logs: docker-compose logs -f freeradius"
        echo "  3. Stop FreeRADIUS: docker-compose down"
    else
        echo "  1. Start FreeRADIUS: sudo systemctl start freeradius-custom"
        echo "  2. View logs: sudo journalctl -u freeradius-custom -f"
        echo "  3. Stop FreeRADIUS: sudo systemctl stop freeradius-custom"
    fi

    echo
    echo -e "${BLUE}Test Authentication:${NC}"
    echo "  radclient localhost:$AUTH_PORT auth $RADIUS_SECRET"
    echo "  (Use with: User-Name = testuser, User-Password = test123)"
    echo
    echo -e "${BLUE}Configuration Files:${NC}"
    if [[ "$INSTALL_MODE" == "docker" ]]; then
        echo "  - Clients: ./docker/freeradius/clients.conf"
        echo "  - SQL Config: ./docker/freeradius/config/postgresql"
        echo "  - Docker Compose: ./docker-compose.yml"
    else
        echo "  - Clients: /etc/freeradius/3.0/clients.conf"
        echo "  - SQL Config: /etc/freeradius/3.0/mods-available/sql"
        echo "  - Sites: /etc/freeradius/3.0/sites-available/default"
    fi
    echo
    echo -e "${YELLOW}Important:${NC}"
    echo "  - Make sure your Kilusi Bill backend is configured to connect to this RADIUS server"
    echo "  - Update the RADIUS secret in your Mikrotik/NAS devices to match: $RADIUS_SECRET"
    echo "  - Configure firewall rules to allow RADIUS traffic from your network devices"
}

# Function to display help
show_help() {
    echo "FreeRADIUS Installer Script for Kilusi Bill"
    echo
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Options:"
    echo "  -m, --mode MODE       Installation mode: native (default) or docker"
    echo "  -h, --host HOST       PostgreSQL host (default: localhost)"
    echo "  -p, --port PORT       PostgreSQL port (default: 5432)"
    echo "  -d, --database DB     Database name (default: radius)"
    echo "  -u, --user USER       Database user (default: radius)"
    echo "  -P, --password PASS   Database password (default: radius1234)"
    echo "  -s, --secret SECRET   RADIUS secret (default: testing123)"
    echo "  --auth-port PORT      Authentication port (default: 1812)"
    echo "  --acct-port PORT      Accounting port (default: 1813)"
    echo "  --admin-port PORT     Admin port (default: 18120)"
    echo "  --help                Show this help message"
    echo
    echo "Examples:"
    echo "  $0                                    # Install with default settings (native mode)"
    echo "  $0 -m docker                          # Install using Docker"
    echo "  $0 -h 192.168.1.100 -u radius_user    # Connect to remote PostgreSQL"
    echo "  $0 -s MySecret123                      # Use custom RADIUS secret"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--mode)
            INSTALL_MODE="$2"
            shift 2
            ;;
        -h|--host)
            DB_HOST="$2"
            shift 2
            ;;
        -p|--port)
            DB_PORT="$2"
            shift 2
            ;;
        -d|--database)
            DB_NAME="$2"
            shift 2
            ;;
        -u|--user)
            DB_USER="$2"
            shift 2
            ;;
        -P|--password)
            DB_PASSWORD="$2"
            shift 2
            ;;
        -s|--secret)
            RADIUS_SECRET="$2"
            shift 2
            ;;
        --auth-port)
            AUTH_PORT="$2"
            shift 2
            ;;
        --acct-port)
            ACCT_PORT="$2"
            shift 2
            ;;
        --admin-port)
            ADMIN_PORT="$2"
            shift 2
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate installation mode
if [[ "$INSTALL_MODE" != "native" && "$INSTALL_MODE" != "docker" ]]; then
    print_error "Invalid installation mode: $INSTALL_MODE"
    exit 1
fi

# Main installation flow
main() {
    print_header "FreeRADIUS Installer for Kilusi Bill ISP System"

    # Check if running as root
    check_root

    # Detect operating system
    detect_os

    # Install dependencies
    install_dependencies

    # Install Docker if requested
    install_docker

    # Setup database
    setup_database

    # Install FreeRADIUS based on mode
    if [[ "$INSTALL_MODE" == "docker" ]]; then
        setup_docker_config
    else
        install_freeradius_native
        configure_freeradius_native
        create_systemd_service
    fi

    # Configure firewall
    configure_firewall

    # Test installation
    test_freeradius

    # Show summary
    show_summary

    print_header "Installation Complete!"
}

# Run main function
main