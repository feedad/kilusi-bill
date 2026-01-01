#!/bin/bash

# ===========================================
# Kilusi Bill - Fresh Clone Setup Script
# ===========================================
# This script helps set up the application after a fresh clone
# by copying example configuration files and installing dependencies

set -e  # Exit on any error

echo "🚀 Setting up Kilusi Bill - ISP Billing System"
echo "=================================================="

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

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] && [ ! -d "backend" ] && [ ! -d "frontend" ]; then
    print_error "Please run this script from the kilusi-bill root directory"
    exit 1
fi

print_step "1. Installing Backend Dependencies"
if [ -d "backend" ]; then
    cd backend
    if [ -f "package.json" ]; then
        print_status "Installing backend Node.js dependencies..."
        npm install
        print_status "✅ Backend dependencies installed successfully"
    else
        print_warning "No package.json found in backend directory"
    fi
    cd ..
else
    print_error "Backend directory not found"
    exit 1
fi

print_step "2. Installing Frontend Dependencies"
if [ -d "frontend" ]; then
    cd frontend
    if [ -f "package.json" ]; then
        print_status "Installing frontend Node.js dependencies..."
        npm install
        print_status "✅ Frontend dependencies installed successfully"
    else
        print_warning "No package.json found in frontend directory"
    fi
    cd ..
else
    print_error "Frontend directory not found"
    exit 1
fi

print_step "3. Setting Up Backend Configuration Files"
cd backend

# Copy .env.example to .env if it doesn't exist
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_status "✅ Created backend/.env from .env.example"
        print_warning "⚠️  Please EDIT backend/.env with your actual configuration values"
    else
        print_error "❌ backend/.env.example not found - cannot create .env file"
    fi
else
    print_warning "⚠️  backend/.env already exists - skipping creation"
fi

# Copy settings.example.json to settings.json if it doesn't exist
if [ ! -f "settings.json" ]; then
    if [ -f "settings.example.json" ]; then
        cp settings.example.json settings.json
        print_status "✅ Created backend/settings.json from settings.example.json"
        print_warning "⚠️  Please EDIT backend/settings.json with your actual configuration values"
    else
        print_error "❌ backend/settings.example.json not found - cannot create settings.json"
    fi
else
    print_warning "⚠️  backend/settings.json already exists - skipping creation"
fi

# Create necessary directories that are in .gitignore
directories=("logs" "uploads" "backups" "sessions" "auth/keys" "whatsapp-session")

for dir in "${directories[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        print_status "✅ Created directory: backend/$dir"
    fi
done

cd ..

print_step "4. Setting Up Frontend Configuration Files"
cd frontend

# Copy .env.example to .env.local if it doesn't exist
if [ ! -f ".env.local" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env.local
        print_status "✅ Created frontend/.env.local from .env.example"
        print_warning "⚠️  Please EDIT frontend/.env.local with your actual configuration values"
    else
        print_error "❌ frontend/.env.example not found - cannot create .env.local"
    fi
else
    print_warning "⚠️  frontend/.env.local already exists - skipping creation"
fi

cd ..

print_step "5. Checking Database Connection Script"
# Create a simple database connection checker
if [ ! -f "scripts/check-database.sh" ]; then
    print_status "Creating database connection checker..."
    mkdir -p scripts
    cat > scripts/check-database.sh << 'EOF'
#!/bin/bash

# Database connection checker
echo "Checking database connection..."

if [ -f "backend/.env" ]; then
    source backend/.env

    # Check if PostgreSQL is running
    if command -v psql &> /dev/null; then
        if PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DATABASE -c "SELECT 1;" &> /dev/null; then
            echo "✅ Database connection successful"
            exit 0
        else
            echo "❌ Database connection failed"
            echo "Please check your PostgreSQL configuration and make sure it's running"
            exit 1
        fi
    else
        echo "❌ PostgreSQL client (psql) not found"
        exit 1
    fi
else
    echo "❌ backend/.env file not found"
    exit 1
fi
EOF
    chmod +x scripts/check-database.sh
    print_status "✅ Created scripts/check-database.sh"
fi

print_step "6. Making Scripts Executable"
# Make common scripts executable
scripts_to_make_executable=(
    "scripts/check-database.sh"
    "docker-start.sh"
)

for script in "${scripts_to_make_executable[@]}"; do
    if [ -f "$script" ]; then
        chmod +x "$script"
        print_status "✅ Made $script executable"
    fi
done

echo ""
echo "🎉 Setup completed successfully!"
echo "=================================="
echo ""
echo "📋 NEXT STEPS:"
echo ""
echo "1. ⚙️  CONFIGURE BACKEND:"
echo "   - Edit backend/.env with your database credentials"
echo "   - Edit backend/settings.json with your application settings"
echo ""
echo "2. 🗄️  SET UP DATABASE:"
echo "   - Make sure PostgreSQL is running"
echo "   - Run: ./scripts/check-database.sh to test connection"
echo "   - Create database: sudo -u postgres createdb kilusi_bill"
echo ""
echo "3. 🔐  GENERATE SECURE SECRETS:"
echo "   - Generate JWT_SECRET: openssl rand -base64 64"
echo "   - Generate SESSION_SECRET: openssl rand -base64 64"
echo "   - Update these in backend/.env"
echo ""
echo "4. ▶️  START THE APPLICATION:"
echo "   - Backend: cd backend && npm run dev"
echo "   - Frontend: cd frontend && npm run dev"
echo "   - Or use Docker: ./docker-start.sh start"
echo ""
echo "5. 🌐  ACCESS THE APPLICATION:"
echo "   - Frontend: http://localhost:3001"
echo "   - Backend API: http://localhost:3000"
echo "   - Admin Panel: http://localhost:3000/admin"
echo ""
echo "⚠️  IMPORTANT SECURITY NOTES:"
echo "   - Change all default passwords before production use"
echo "   - Use strong, unique secrets for production"
echo "   - Never commit .env or settings.json to version control"
echo ""
echo "📚 For detailed setup instructions, see:"
echo "   - README.md (main documentation)"
echo "   - config-examples/README.md (configuration guide)"
echo ""

print_status "Setup script completed! 🚀"