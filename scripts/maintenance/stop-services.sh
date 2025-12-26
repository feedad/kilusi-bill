#!/bin/bash

# Stop script for kilusi-bill services
echo "🛑 Stopping kilusi-bill services..."

# Kill all backend processes
echo "Stopping backend processes on port 3000..."
pkill -f "node.*app.js"
pkill -f "nodemon"
pkill -f "npm.*start"
fuser -k 3000/tcp 2>/dev/null || true

# Kill all frontend processes
echo "Stopping frontend processes on port 3001..."
pkill -f "next.*dev"
pkill -f "npm.*run.*dev"
fuser -k 3001/tcp 2>/dev/null || true

# Wait a moment
sleep 2

# Verify ports are free
if ! lsof -ti:3000 >/dev/null 2>&1; then
    echo "✅ Port 3000 is now free"
else
    echo "⚠️  Port 3000 still in use"
fi

if ! lsof -ti:3001 >/dev/null 2>&1; then
    echo "✅ Port 3001 is now free"
else
    echo "⚠️  Port 3001 still in use"
fi

echo "🛑 Stop script completed!"