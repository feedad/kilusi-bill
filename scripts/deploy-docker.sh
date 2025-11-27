#!/bin/bash

# =====================================================================
# Kilusi Bill - Docker Deployment Script (Option 2)
# =====================================================================
#
# This script deploys PostgreSQL and FreeRADIUS using Docker containers
# for production deployment of Kilusi Bill ISP billing system.
#
# Usage:
#   ./scripts/deploy-docker.sh [options]
#
# Options:
#   -h, --help              Show this help message
#   -m, --mode MODE         Deployment mode (development|production, default: production)
#   --db-only              Deploy database only
#   --radius-only          Deploy FreeRADIUS only
#   --with-apps            Also deploy Node.js applications
#   --detach               Run containers in detached mode
#   --stop                 Stop all containers
#   --restart              Restart all containers
#   --logs                 Show container logs
#   --clean                Remove containers and volumes
#   --force                Force recreation of containers
#
# Examples:
#   ./scripts/deploy-docker.sh                    # Full production deployment
#   ./scripts/deploy-docker.sh --mode development # Development setup
#   ./scripts/deploy-docker.sh --db-only         # Database only
#   ./scripts/deploy-docker.sh --detach          # Run detached
#   ./scripts/deploy-docker.sh --stop            # Stop containers
#
# Requirements:
#   - Docker and Docker Compose installed
#   - Sufficient disk space for containers
#   - Ports 5432, 1812, 1813, 1814 available
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
DETACH=false
STOP=false
RESTART=false
LOGS=false
CLEAN=false
FORCE=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"

# Functions
print_banner() {
    echo -e "${BLUE}"
    echo "===================================================================="
    echo "    KILUSI BILL - DOCKER DEPLOYMENT SCRIPT (OPTION 2)"
    echo "===================================================================="
    echo "    PostgreSQL + FreeRADIUS Docker Deployment"
    echo "===================================================================="
    echo -e "${NC}"
}

print_help() {
    cat << EOF
${BLUE}Kilusi Bill Docker Deployment Script${NC}

${YELLOW}USAGE:${NC}
    $0 [OPTIONS]

${YELLOW}OPTIONS:${NC}
    -h, --help              Show this help message
    -m, --mode MODE         Deployment mode (development|production, default: $DEFAULT_MODE)
    --db-only              Deploy database only
    --radius-only          Deploy FreeRADIUS only
    --with-apps            Also deploy Node.js applications
    --detach               Run containers in detached mode
    --stop                 Stop all containers
    --restart              Restart all containers
    --logs                 Show container logs
    --clean                Remove containers and volumes
    --force                Force recreation of containers

${YELLOW}EXAMPLES:${NC}
    $0                                    # Full production deployment
    $0 --mode development                 # Development setup
    $0 --db-only                         # Database only
    $0 --detach                          # Run detached
    $0 --stop                            # Stop containers

${YELLOW}REQUIREMENTS:${NC}
    - Docker and Docker Compose installed
    - Sufficient disk space for containers
    - Ports 5432, 1812, 1813, 1814 available

${YELLOW}WHAT THIS DEPLOYS:${NC}
    - PostgreSQL database in Docker container
    - FreeRADIUS server in Docker container
    - Database schemas for both systems
    - Volume persistence for data
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

check_requirements() {
    log_step "Checking system requirements..."

    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        log_info "Install Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi

    # Check if Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker is not running"
        log_info "Start Docker: sudo systemctl start docker"
        exit 1
    fi

    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        log_info "Install Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi

    # Check available disk space
    local available_kb=$(df / | awk 'NR==2 {print $4}')
    local available_gb=$((available_kb / 1024 / 1024))

    if [[ $available_gb -lt 2 ]]; then
        log_error "Insufficient disk space. At least 2GB required, $available_gb GB available"
        exit 1
    fi

    log_success "System requirements check passed"
}

create_docker_compose() {
    log_step "Creating Docker Compose configuration..."

    # Create docker-compose directory if it doesn't exist
    mkdir -p "$PROJECT_ROOT/docker"

    # Create Docker Compose file
    cat > "$COMPOSE_FILE" << 'EOF'
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    container_name: kilusi-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: kilusi_bill
      POSTGRES_USER: kilusi_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_RADIUS_DB: radius
      POSTGRES_RADIUS_USER: radius
      POSTGRES_RADIUS_PASSWORD: ${RADIUS_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    networks:
      - kilusi-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kilusi_user -d kilusi_bill"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  # FreeRADIUS Server
  freeradius:
    image: freeradius/freeradius-server:3.2
    container_name: kilusi-freeradius
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      RADIUS_DB_HOST: postgres
      RADIUS_DB_PORT: 5432
      RADIUS_DB_NAME: radius
      RADIUS_DB_USER: radius
      RADIUS_DB_PASSWORD: ${RADIUS_PASSWORD}
    volumes:
      - ./docker/freeradius/config:/etc/freeradius/3.0
      - ./docker/freeradius/sql:/etc/raddb/sql
    ports:
      - "1812:1812/udp"
      - "1813:1813/udp"
      - "1814:1814/tcp"
    networks:
      - kilusi-network
    healthcheck:
      test: ["CMD", "radiusd", "-XC"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  # PgAdmin (optional, for development)
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: kilusi-pgadmin
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@kilusi.id
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_PASSWORD}
    volumes:
      - pgadmin_data:/var/lib/pgadmin
    ports:
      - "5050:80"
    networks:
      - kilusi-network
    profiles:
      - development

  # Backend Application (optional)
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: kilusi-backend
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: ${NODE_ENV}
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: kilusi_bill
      DB_USER: kilusi_user
      DB_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
      API_SECRET: ${API_SECRET}
    volumes:
      - ./backend:/app
      - /app/node_modules
    ports:
      - "3000:3000"
    networks:
      - kilusi-network
    profiles:
      - apps

  # Frontend Application (optional)
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: kilusi-frontend
    restart: unless-stopped
    depends_on:
      - backend
    environment:
      NODE_ENV: ${NODE_ENV}
      NEXT_PUBLIC_API_URL: http://localhost:3000
    volumes:
      - ./frontend:/app
      - /app/node_modules
      - /app/.next
    ports:
      - "3001:3001"
    networks:
      - kilusi-network
    profiles:
      - apps

volumes:
  postgres_data:
    driver: local
  pgadmin_data:
    driver: local

networks:
  kilusi-network:
    driver: bridge
EOF

    log_success "Docker Compose configuration created"
}

create_environment_file() {
    log_step "Creating environment file..."

    # Generate secure passwords if not provided
    if [[ -z "$DB_PASSWORD" ]]; then
        DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    fi

    if [[ -z "$RADIUS_PASSWORD" ]]; then
        RADIUS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    fi

    if [[ -z "$PGADMIN_PASSWORD" ]]; then
        PGADMIN_PASSWORD=$(openssl rand -base64 16 | tr -d "=+/" | cut -c1-12)
    fi

    if [[ -z "$JWT_SECRET" ]]; then
        JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-50)
    fi

    if [[ -z "$API_SECRET" ]]; then
        API_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-50)
    fi

    # Create .env file
    cat > "$PROJECT_ROOT/.env" << EOF
# Database Configuration
DB_PASSWORD=$DB_PASSWORD
RADIUS_PASSWORD=$RADIUS_PASSWORD

# PgAdmin Configuration (Development)
PGADMIN_PASSWORD=$PGADMIN_PASSWORD

# Application Configuration
NODE_ENV=$MODE
JWT_SECRET=$JWT_SECRET
API_SECRET=$API_SECRET

# Kilusi Bill Environment Variables
# Generated on $(date)
EOF

    log_success "Environment file created"
}

create_postgres_init() {
    log_step "Creating PostgreSQL initialization scripts..."

    mkdir -p "$PROJECT_ROOT/docker/postgres/init"

    # Create database initialization script
    cat > "$PROJECT_ROOT/docker/postgres/init/01-create-databases.sh" << 'EOF'
#!/bin/bash
set -e

# Create additional databases
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create RADIUS database
    CREATE DATABASE radius;
    CREATE USER radius WITH PASSWORD '$RADIUS_PASSWORD';
    GRANT ALL PRIVILEGES ON DATABASE radius TO radius;

    -- Connect to RADIUS database and set privileges
    \c radius;
    GRANT ALL ON SCHEMA public TO radius;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO radius;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO radius;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO radius;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO radius;
EOSQL

echo "Additional databases created successfully"
EOF

    chmod +x "$PROJECT_ROOT/docker/postgres/init/01-create-databases.sh"

    # Copy application database schema
    local app_schema="$SCRIPT_DIR/database-init.sql"
    if [[ -f "$app_schema" ]]; then
        cp "$app_schema" "$PROJECT_ROOT/docker/postgres/init/02-app-schema.sql"
    else
        log_warning "Application schema not found: $app_schema"
    fi

    # Copy RADIUS schema if available
    local radius_schema="$PROJECT_ROOT/backend/freeradius-docker/sql/schema.sql"
    if [[ -f "$radius_schema" ]]; then
        cp "$radius_schema" "$PROJECT_ROOT/docker/postgres/init/03-radius-schema.sql"
    else
        log_warning "RADIUS schema not found: $radius_schema"
    fi

    log_success "PostgreSQL initialization scripts created"
}

create_freeradius_config() {
    log_step "Creating FreeRADIUS configuration..."

    mkdir -p "$PROJECT_ROOT/docker/freeradius/config"
    mkdir -p "$PROJECT_ROOT/docker/freeradius/sql"

    # Create FreeRADIUS SQL configuration
    cat > "$PROJECT_ROOT/docker/freeradius/sql/postgresql.conf" << EOF
# PostgreSQL configuration for FreeRADIUS
sql {
    driver = "rlm_sql_postgresql"
    server = "postgres"
    port = 5432
    login = "radius"
    password = "\${RADIUS_DB_PASSWORD}"
    radius_db = "radius"

    # Table names
    acct_table1 = "radacct"
    acct_table2 = "radacct"
    nas_table = "nas"
    radgroupcheck_table = "radgroupcheck"
    radgroupreply_table = "radgroupreply"
    radusergroup_table = "radusergroup"
    radcheck_table = "radcheck"
    radreply_table = "radreply"

    # Connection settings
    connect_timeout = 10
    read_timeout = 5
    write_timeout = 5

    # SQL queries
    authorize_check_query = "SELECT id, username, attribute, value, op FROM radcheck WHERE username = '%{SQL-User-Name}' ORDER BY id"
    authorize_reply_query = "SELECT id, username, attribute, value, op FROM radreply WHERE username = '%{SQL-User-Name}' ORDER BY id"

    accounting_onoff_query = "UPDATE radacct SET acctstoptime = '%S', acctsessiontime = 0, acctterminatecause = 'Admin-Reset' WHERE acctsessionid = '%{Acct-Session-Id}' AND username = '%{SQL-User-Name}' AND nasipaddress = '%{NAS-IP-Address}'"

    accounting_update_query = "UPDATE radacct SET framedipaddress = '%{Framed-IP-Address}', acctsessiontime = '%{Acct-Session-Time}', acctinputoctets = '%{Acct-Input-Octets}', acctoutputoctets = '%{Acct-Output-Octets}' WHERE acctsessionid = '%{Acct-Session-Id}' AND username = '%{SQL-User-Name}' AND nasipaddress = '%{NAS-IP-Address}'"

    accounting_start_query = "INSERT INTO radacct (acctsessionid, acctuniqueid, username, realm, nasipaddress, nasportid, nasporttype, acctstarttime, acctstoptime, acctsessiontime, acctauthentic, connectinfo_start, connectinfo_stop, acctinputoctets, acctoutputoctets, calledstationid, callingstationid, acctterminatecause, servicetype, framedprotocol, framedipaddress) VALUES ('%{Acct-Session-Id}', '%{Acct-Unique-Session-Id}', '%{SQL-User-Name}', '%{Realm}', '%{NAS-IP-Address}', '%{NAS-Port}', '%{NAS-Port-Type}', '%S', NULL, '0', '%{Acct-Authentic}', '%{Connect-Info}', '', '0', '0', '%{Called-Station-Id}', '%{Calling-Station-Id}', '', '%{Service-Type}', '%{Framed-Protocol}', '%{Framed-IP-Address}')"

    accounting_stop_query = "UPDATE radacct SET acctstoptime = '%S', acctsessiontime = '%{Acct-Session-Time}', acctinputoctets = '%{Acct-Input-Octets}', acctoutputoctets = '%{Acct-Output-Octets}', acctterminatecause = '%{Acct-Terminate-Cause}', connectinfo_stop = '%{Connect-Info}' WHERE acctsessionid = '%{Acct-Session-Id}' AND username = '%{SQL-User-Name}' AND nasipaddress = '%{NAS-IP-Address}'"

    group_membership_query = "SELECT groupname FROM radusergroup WHERE username = '%{SQL-User-Name}' ORDER BY priority"

    simul_count_query = "SELECT COUNT(*) FROM radacct WHERE username = '%{SQL-User-Name}' AND acctstoptime IS NULL"

    simul_verify_query = "SELECT radacctid, acctsessionid, username, nasipaddress, nasportid, framedipaddress, callingstationid, framedprotocol FROM radacct WHERE username = '%{SQL-User-Name}' AND acctstoptime IS NULL"
}
EOF

    log_success "FreeRADIUS configuration created"
}

create_dockerfiles() {
    if [[ "$WITH_APPS" != true ]]; then
        return
    fi

    log_step "Creating Dockerfiles for applications..."

    # Backend Dockerfile
    cat > "$PROJECT_ROOT/backend/Dockerfile" << 'EOF'
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000

CMD ["npm", "start"]
EOF

    # Frontend Dockerfile
    cat > "$PROJECT_ROOT/frontend/Dockerfile" << 'EOF'
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Build application
RUN npm run build

# Production image
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV production

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3001

CMD ["node", "server.js"]
EOF

    log_success "Dockerfiles created"
}

deploy_containers() {
    log_step "Deploying Docker containers..."

    cd "$PROJECT_ROOT"

    # Build arguments for docker-compose
    local compose_args=""

    if [[ "$DETACH" == true ]]; then
        compose_args="-d"
    fi

    if [[ "$FORCE" == true ]]; then
        compose_args="$compose_args --force-recreate"
    fi

    # Select services based on options
    local services=""

    if [[ "$DB_ONLY" == true ]]; then
        services="postgres"
    elif [[ "$RADIUS_ONLY" == true ]]; then
        services="freeradius"
    elif [[ "$WITH_APPS" == true ]]; then
        services="postgres freeradius backend frontend"
    else
        services="postgres freeradius"
    fi

    # Deploy containers
    if [[ -n "$services" ]]; then
        log_info "Starting services: $services"

        if [[ "$MODE" == "development" ]]; then
            docker-compose --profile development up $compose_args $services
        else
            docker-compose up $compose_args $services
        fi
    else
        log_info "Starting all services"
        if [[ "$MODE" == "development" ]]; then
            docker-compose --profile development up $compose_args
        else
            docker-compose up $compose_args
        fi
    fi

    log_success "Containers deployed"
}

wait_for_containers() {
    log_step "Waiting for containers to be ready..."

    cd "$PROJECT_ROOT"

    # Wait for PostgreSQL to be ready
    if [[ "$RADIUS_ONLY" != true ]]; then
        log_info "Waiting for PostgreSQL..."
        timeout 300 bash -c 'until docker exec kilusi-postgres pg_isready -U kilusi_user; do sleep 2; done'

        if [[ $? -eq 0 ]]; then
            log_success "PostgreSQL is ready"
        else
            log_error "PostgreSQL failed to start within timeout"
            exit 1
        fi
    fi

    # Wait for FreeRADIUS to be ready
    if [[ "$DB_ONLY" != true ]]; then
        log_info "Waiting for FreeRADIUS..."
        timeout 300 bash -c 'until docker exec kilusi-freeradius radiusd -XC > /dev/null 2>&1; do sleep 5; done'

        if [[ $? -eq 0 ]]; then
            log_success "FreeRADIUS is ready"
        else
            log_warning "FreeRADIUS configuration may need manual adjustment"
        fi
    fi

    log_success "All containers are ready"
}

manage_containers() {
    cd "$PROJECT_ROOT"

    if [[ "$STOP" == true ]]; then
        log_step "Stopping containers..."
        docker-compose down
        log_success "Containers stopped"
        exit 0
    fi

    if [[ "$RESTART" == true ]]; then
        log_step "Restarting containers..."
        docker-compose restart
        log_success "Containers restarted"
        exit 0
    fi

    if [[ "$LOGS" == true ]]; then
        log_step "Showing container logs..."
        docker-compose logs -f
        exit 0
    fi

    if [[ "$CLEAN" == true ]]; then
        log_step "Cleaning containers and volumes..."
        docker-compose down -v --remove-orphans
        docker system prune -f
        log_success "Containers and volumes removed"
        exit 0
    fi
}

print_completion_info() {
    echo -e "${GREEN}"
    echo "===================================================================="
    echo "                 DOCKER DEPLOYMENT COMPLETE!"
    echo "===================================================================="
    echo -e "${NC}"

    echo -e "${CYAN}Container Status:${NC}"
    cd "$PROJECT_ROOT"
    docker-compose ps

    echo
    echo -e "${CYAN}Database Information:${NC}"
    echo -e "  Application DB:  ${YELLOW}kilusi_bill${NC}"
    echo -e "  RADIUS DB:       ${YELLOW}radius${NC}"
    echo -e "  Username:        ${YELLOW}kilusi_user${NC}"
    echo -e "  Password:        ${YELLOW}$DB_PASSWORD${NC}"
    echo -e "  Host:            ${YELLOW}localhost${NC}"
    echo -e "  Port:            ${YELLOW}5432${NC}"
    echo

    if [[ "$MODE" == "development" ]]; then
        echo -e "${CYAN}PgAdmin Access:${NC}"
        echo -e "  URL:             ${YELLOW}http://localhost:5050${NC}"
        echo -e "  Email:           ${YELLOW}admin@kilusi.id${NC}"
        echo -e "  Password:        ${YELLOW}$PGADMIN_PASSWORD${NC}"
        echo
    fi

    if [[ "$WITH_APPS" == true ]]; then
        echo -e "${CYAN}Application Access:${NC}"
        echo -e "  Frontend:        ${YELLOW}http://localhost:3001${NC}"
        echo -e "  Backend API:     ${YELLOW}http://localhost:3000${NC}"
        echo -e "  Admin Panel:     ${YELLOW}http://localhost:3000/admin${NC}"
        echo
    fi

    echo -e "${CYAN}Connection Strings:${NC}"
    echo -e "  Application:     ${YELLOW}postgresql://kilusi_user:$DB_PASSWORD@localhost:5432/kilusi_bill${NC}"
    echo -e "  RADIUS:          ${YELLOW}postgresql://radius:$RADIUS_PASSWORD@localhost:5432/radius${NC}"
    echo

    echo -e "${CYAN}Container Management:${NC}"
    echo -e "  Status:          ${YELLOW}docker-compose ps${NC}"
    echo -e "  Logs:            ${YELLOW}docker-compose logs -f${NC}"
    echo -e "  Stop:            ${YELLOW}docker-compose down${NC}"
    echo -e "  Restart:         ${YELLOW}docker-compose restart${NC}"
    echo

    echo -e "${CYAN}Database Access:${NC}"
    echo -e "  Connect App DB:  ${YELLOW}docker exec -it kilusi-postgres psql -U kilusi_user -d kilusi_bill${NC}"
    echo -e "  Connect RADIUS:  ${YELLOW}docker exec -it kilusi-postgres psql -U radius -d radius${NC}"
    echo

    echo -e "${YELLOW}⚠️  IMPORTANT:${NC}"
    echo -e "  1. Database passwords are stored in .env file - keep it secure"
    echo -e "  2. Update your application .env files with the database credentials"
    echo -e "  3. Use docker-compose logs to troubleshoot any issues"
    echo -e "  4. Volumes are persistent - data survives container restarts"
    echo -e "  5. Configure firewall rules as needed for production"
    echo

    echo -e "${GREEN}Docker deployment completed successfully!${NC}"
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
        --detach)
            DETACH=true
            shift
            ;;
        --stop)
            STOP=true
            shift
            ;;
        --restart)
            RESTART=true
            shift
            ;;
        --logs)
            LOGS=true
            shift
            ;;
        --clean)
            CLEAN=true
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

    log_info "Starting Docker deployment in $MODE mode"

    # Handle management operations
    if [[ "$STOP" == true || "$RESTART" == true || "$LOGS" == true || "$CLEAN" == true ]]; then
        manage_containers
        exit 0
    fi

    # Check requirements
    check_requirements

    # Create Docker configuration
    create_docker_compose
    create_environment_file
    create_postgres_init
    create_freeradius_config
    create_dockerfiles

    # Deploy containers
    deploy_containers

    # Wait for containers to be ready
    if [[ "$DETACH" == true ]]; then
        log_info "Containers started in detached mode"
    else
        wait_for_containers
    fi

    # Print completion information
    print_completion_info
}

# Error handling
trap 'log_error "Script failed at line $LINENO"' ERR

# Run main function
main "$@"