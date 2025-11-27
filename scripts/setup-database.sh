#!/bin/bash

# =====================================================================
# Kilusi Bill - Database Setup Script
# =====================================================================
#
# This script automates the complete database setup process for Kilusi Bill
# ISP billing system including database creation, user setup, and schema initialization.
#
# Usage:
#   ./scripts/setup-database.sh [options]
#
# Options:
#   -h, --help              Show this help message
#   -d, --database NAME     Database name (default: kilusi_bill)
#   -u, --user NAME         Database user (default: kilusi_user)
#   -p, --password PASS     Database password (prompt if not provided)
#   -H, --host HOST         Database host (default: localhost)
#   -P, --port PORT         Database port (default: 5432)
#   --superuser USER        PostgreSQL superuser (default: postgres)
#   --skip-create           Skip database and user creation (schema only)
#   --init-only             Run schema initialization only
#   --demo-data             Insert demo data after schema creation
#   --backup                Create backup before schema changes
#
# Examples:
#   ./scripts/setup-database.sh
#   ./scripts/setup-database.sh --database my_isp_db --user my_user
#   ./scripts/setup-database.sh --skip-create --init-only
#   ./scripts/setup-database.sh --demo-data
#
# Requirements:
#   - PostgreSQL 13+ installed and running
#   - Sufficient privileges to create databases and users
#   - psql client installed
#
# Author: Kilusi Development Team
# Version: 1.0.0
# Last Updated: November 2024
# =====================================================================

set -euo pipefail

# Default configuration
DEFAULT_DB_NAME="kilusi_bill"
DEFAULT_DB_USER="kilusi_user"
DEFAULT_DB_HOST="localhost"
DEFAULT_DB_PORT="5432"
DEFAULT_SUPERUSER="postgres"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Variables
DB_NAME="$DEFAULT_DB_NAME"
DB_USER="$DEFAULT_DB_USER"
DB_PASSWORD=""
DB_HOST="$DEFAULT_DB_HOST"
DB_PORT="$DEFAULT_DB_PORT"
SUPERUSER="$DEFAULT_SUPERUSER"
SKIP_CREATE=false
INIT_ONLY=false
DEMO_DATA=false
CREATE_BACKUP=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Functions
print_banner() {
    echo -e "${BLUE}"
    echo "===================================================================="
    echo "    KILUSI BILL - DATABASE SETUP SCRIPT"
    echo "===================================================================="
    echo -e "${NC}"
}

print_help() {
    cat << EOF
${BLUE}Kilusi Bill Database Setup Script${NC}

${YELLOW}USAGE:${NC}
    $0 [OPTIONS]

${YELLOW}OPTIONS:${NC}
    -h, --help              Show this help message
    -d, --database NAME     Database name (default: $DEFAULT_DB_NAME)
    -u, --user NAME         Database user (default: $DEFAULT_DB_USER)
    -p, --password PASS     Database password (prompt if not provided)
    -H, --host HOST         Database host (default: $DEFAULT_DB_HOST)
    -P, --port PORT         Database port (default: $DEFAULT_DB_PORT)
    --superuser USER        PostgreSQL superuser (default: $DEFAULT_SUPERUSER)
    --skip-create           Skip database and user creation (schema only)
    --init-only             Run schema initialization only
    --demo-data             Insert demo data after schema creation
    --backup                Create backup before schema changes

${YELLOW}EXAMPLES:${NC}
    $0                                            # Interactive setup with defaults
    $0 --database my_isp_db --user my_user       # Custom database and user
    $0 --skip-create --init-only                  # Schema initialization only
    $0 --demo-data                                # Include demo data

${YELLOW}REQUIREMENTS:${NC}
    - PostgreSQL 13+ installed and running
    - Sufficient privileges to create databases and users
    - psql client installed

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
    log_step "Checking requirements..."

    # Check if psql is available
    if ! command -v psql &> /dev/null; then
        log_error "psql client is not installed or not in PATH"
        exit 1
    fi

    # Check if PostgreSQL is running
    if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$SUPERUSER" &> /dev/null; then
        log_error "PostgreSQL is not running on $DB_HOST:$DB_PORT"
        exit 1
    fi

    # Check if database init script exists
    if [[ ! -f "$SCRIPT_DIR/database-init.sql" ]]; then
        log_error "Database initialization script not found: $SCRIPT_DIR/database-init.sql"
        exit 1
    fi

    log_success "All requirements satisfied"
}

prompt_password() {
    if [[ -z "$DB_PASSWORD" ]]; then
        while true; do
            read -s -p "Enter password for database user '$DB_USER': " password1
            echo
            read -s -p "Confirm password: " password2
            echo

            if [[ "$password1" != "$password2" ]]; then
                log_error "Passwords do not match. Please try again."
                continue
            fi

            if [[ ${#password1} -lt 8 ]]; then
                log_error "Password must be at least 8 characters long."
                continue
            fi

            DB_PASSWORD="$password1"
            break
        done
    fi
}

test_connection() {
    log_step "Testing database connection..."

    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &> /dev/null; then
        log_success "Database connection successful"
        return 0
    else
        return 1
    fi
}

create_database_and_user() {
    if [[ "$SKIP_CREATE" == true ]]; then
        log_step "Skipping database and user creation as requested..."
        return
    fi

    log_step "Creating database and user..."

    # Create user
    PGPASSWORD="" psql -h "$DB_HOST" -p "$DB_PORT" -U "$SUPERUSER" -c "
        DO \$\$
        BEGIN
            IF NOT EXISTS (
                SELECT FROM pg_catalog.pg_roles
                WHERE rolname = '$DB_USER'
            ) THEN
                CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD';
            END IF;
        END
        \$\$;
    " || {
        log_error "Failed to create database user '$DB_USER'"
        exit 1
    }

    # Create database
    PGPASSWORD="" psql -h "$DB_HOST" -p "$DB_PORT" -U "$SUPERUSER" -c "
        SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\\gexec
    " || {
        log_error "Failed to create database '$DB_NAME'"
        exit 1
    }

    # Grant privileges
    PGPASSWORD="" psql -h "$DB_HOST" -p "$DB_PORT" -U "$SUPERUSER" -c "
        GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
    " || {
        log_error "Failed to grant privileges to user '$DB_USER'"
        exit 1
    }

    log_success "Database '$DB_NAME' and user '$DB_USER' created successfully"
}

create_backup() {
    if [[ "$CREATE_BACKUP" == true ]]; then
        log_step "Creating database backup..."

        local backup_file="$PROJECT_ROOT/backups/kilusi_bill_backup_$(date +%Y%m%d_%H%M%S).sql"
        local backup_dir="$(dirname "$backup_file")"

        # Create backup directory if it doesn't exist
        mkdir -p "$backup_dir"

        if PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges > "$backup_file" 2>/dev/null || \
           PGPASSWORD="" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$SUPERUSER" -d "$DB_NAME" --no-owner --no-privileges > "$backup_file"; then
            log_success "Database backup created: $backup_file"
        else
            log_warning "Backup creation failed, continuing without backup"
        fi
    fi
}

initialize_schema() {
    log_step "Initializing database schema..."

    # Use appropriate connection parameters
    local psql_cmd="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
    local env_var="PGPASSWORD=$DB_PASSWORD"

    if ! eval "$env_var $psql_cmd -f $SCRIPT_DIR/database-init.sql" 2>&1 | while IFS= read -r line; do
        if [[ "$line" =~ ERROR ]]; then
            log_error "Schema initialization failed: $line"
            return 1
        elif [[ "$line" =~ NOTICE ]]; then
            echo -e "${CYAN}$line${NC}"
        fi
    done; then
        log_error "Schema initialization failed"
        exit 1
    fi

    log_success "Database schema initialized successfully"
}

insert_demo_data() {
    if [[ "$DEMO_DATA" == true ]]; then
        log_step "Inserting demo data..."

        local demo_script="$SCRIPT_DIR/demo-data.sql"

        if [[ -f "$demo_script" ]]; then
            local psql_cmd="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
            local env_var="PGPASSWORD=$DB_PASSWORD"

            if eval "$env_var $psql_cmd -f $demo_script"; then
                log_success "Demo data inserted successfully"
            else
                log_error "Failed to insert demo data"
                exit 1
            fi
        else
            log_warning "Demo data script not found: $demo_script"
            log_info "Skipping demo data insertion"
        fi
    fi
}

verify_setup() {
    log_step "Verifying database setup..."

    local psql_cmd="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
    local env_var="PGPASSWORD=$DB_PASSWORD"

    # Check if key tables exist
    local tables=("customers" "packages" "invoices" "payments" "nas_servers" "radgroup")
    local missing_tables=()

    for table in "${tables[@]}"; do
        if ! eval "$env_var $psql_cmd -tAc \"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table');\"" | grep -q "t"; then
            missing_tables+=("$table")
        fi
    done

    if [[ ${#missing_tables[@]} -gt 0 ]]; then
        log_error "Missing tables: ${missing_tables[*]}"
        exit 1
    fi

    # Check if default data exists
    local package_count=$(eval "$env_var $psql_cmd -tAc \"SELECT COUNT(*) FROM packages;\"")
    local category_count=$(eval "$env_var $psql_cmd -tAc \"SELECT COUNT(*) FROM accounting_categories;\"")

    if [[ "$package_count" -eq 0 ]]; then
        log_warning "No packages found - you may want to add some default packages"
    fi

    if [[ "$category_count" -eq 0 ]]; then
        log_error "No accounting categories found - schema initialization may be incomplete"
        exit 1
    fi

    log_success "Database setup verification completed successfully"
}

print_completion_info() {
    echo -e "${GREEN}"
    echo "===================================================================="
    echo "                    DATABASE SETUP COMPLETE!"
    echo "===================================================================="
    echo -e "${NC}"
    echo -e "${CYAN}Database Information:${NC}"
    echo -e "  Database Name: ${YELLOW}$DB_NAME${NC}"
    echo -e "  Username:      ${YELLOW}$DB_USER${NC}"
    echo -e "  Host:          ${YELLOW}$DB_HOST${NC}"
    echo -e "  Port:          ${YELLOW}$DB_PORT${NC}"
    echo

    echo -e "${CYAN}Connection String:${NC}"
    echo -e "  ${YELLOW}postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME${NC}"
    echo

    echo -e "${CYAN}Next Steps:${NC}"
    echo -e "  1. Update your application configuration (.env file) with:"
    echo -e "     ${YELLOW}DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME${NC}"
    echo -e "     ${YELLOW}DB_HOST=$DB_HOST${NC}"
    echo -e "     ${YELLOW}DB_PORT=$DB_PORT${NC}"
    echo -e "     ${YELLOW}DB_NAME=$DB_NAME${NC}"
    echo -e "     ${YELLOW}DB_USER=$DB_USER${NC}"
    echo -e "     ${YELLOW}DB_PASSWORD=$DB_PASSWORD${NC}"
    echo
    echo -e "  2. Start your application: ${YELLOW}npm run dev${NC}"
    echo
    echo -e "  3. Add initial packages and test data through the admin interface"
    echo

    if [[ "$DEMO_DATA" == false ]]; then
        echo -e "  4. Optional: Insert demo data: ${YELLOW}./scripts/setup-database.sh --demo-data --skip-create${NC}"
        echo
    fi

    echo -e "${CYAN}Useful Commands:${NC}"
    echo -e "  Connect to database: ${YELLOW}psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME${NC}"
    echo -e "  View tables:          ${YELLOW}\\dt${NC}"
    echo -e "  View customers:       ${YELLOW}SELECT * FROM customers LIMIT 10;${NC}"
    echo

    echo -e "${GREEN}Database is ready for use with Kilusi Bill!${NC}"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            print_help
            exit 0
            ;;
        -d|--database)
            DB_NAME="$2"
            shift 2
            ;;
        -u|--user)
            DB_USER="$2"
            shift 2
            ;;
        -p|--password)
            DB_PASSWORD="$2"
            shift 2
            ;;
        -H|--host)
            DB_HOST="$2"
            shift 2
            ;;
        -P|--port)
            DB_PORT="$2"
            shift 2
            ;;
        --superuser)
            SUPERUSER="$2"
            shift 2
            ;;
        --skip-create)
            SKIP_CREATE=true
            shift
            ;;
        --init-only)
            INIT_ONLY=true
            shift
            ;;
        --demo-data)
            DEMO_DATA=true
            shift
            ;;
        --backup)
            CREATE_BACKUP=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            print_help
            exit 1
            ;;
    esac
done

# Main execution
main() {
    print_banner

    # Handle init-only mode
    if [[ "$INIT_ONLY" == true ]]; then
        SKIP_CREATE=true
    fi

    # Check requirements
    check_requirements

    # Prompt for password if not provided
    if [[ "$SKIP_CREATE" == false ]]; then
        prompt_password
    fi

    # Create backup if requested
    create_backup

    # Create database and user
    create_database_and_user

    # Initialize schema
    initialize_schema

    # Insert demo data if requested
    insert_demo_data

    # Verify setup
    verify_setup

    # Print completion information
    print_completion_info
}

# Error handling
trap 'log_error "Script failed at line $LINENO"' ERR

# Run main function
main "$@"