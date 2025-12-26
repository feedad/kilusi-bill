#!/bin/bash

# ===========================================
# Kilusi Bill - Quick Start Script
# ===========================================
# Quick start guide for developers

set -e

echo "⚡ Kilusi Bill - Quick Start"
echo "============================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_step() {
    echo "🔄 $1"
}

# Check if setup has been run
if [ ! -f "backend/.env" ] || [ ! -f "backend/settings.json" ] || [ ! -f "frontend/.env.local" ]; then
    print_warning "Configuration files not found. Running initial setup..."
    ./setup-fresh-clone.sh
fi

# Check if Docker services are available and running
if [ -f "./docker-start.sh" ]; then
    print_step "Checking Docker services..."
    if ./docker-start.sh status | grep -q "running"; then
        print_status "Docker services are running"
    else
        print_warning "Docker services are not running"
        print_step "Starting Docker services..."
        ./docker-start.sh start
    fi
fi

# Check database connection
if [ -f "./scripts/check-database.sh" ]; then
    print_step "Checking database connection..."
    if ./scripts/check-database.sh; then
        print_status "Database connection successful"
    else
        print_warning "Database connection failed - please check your configuration"
        echo "Make sure PostgreSQL is running and configured in backend/.env"
        exit 1
    fi
fi

# Start development servers
echo ""
print_step "Starting development servers..."
echo ""

# Start backend in background
echo "🚀 Starting backend server on port 3000..."
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 3

# Start frontend in background
echo "🚀 Starting frontend server on port 3001..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
print_status "🎉 Both servers are starting up!"
echo ""
echo "🌐 Access Points:"
echo "   Frontend:     http://localhost:3001"
echo "   Backend API:  http://localhost:3000/api/v1"
echo "   Admin Panel:  http://localhost:3000/admin"
echo ""
echo "📋 Default Credentials:"
echo "   Username: admin"
echo "   Password: admin123 (change immediately after login)"
echo ""
echo "🛑 To stop servers, press Ctrl+C"
echo ""

# Wait for interrupt signal
trap 'echo ""; echo "🛑 Stopping servers..."; kill $BACKEND_PID $FRONTEND_PID; exit 0' INT

# Keep script running
wait