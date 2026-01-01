#!/bin/bash

# Restart backend script for kilusi-bill
echo "🔄 Restarting backend service..."

# Stop current backend
echo "Stopping backend..."
pkill -f "node.*app.js"
pkill -f "nodemon"
pkill -f "npm.*start"
fuser -k 3000/tcp 2>/dev/null || true

# Wait a moment
sleep 2

# Start backend in correct directory
echo "Starting backend from backend directory..."
cd /home/feedad/Project/kilusi-bill/backend
npm start > /dev/null 2>&1 &

# Wait for backend to start
echo "Waiting for backend to start..."
sleep 5

# Check if backend is running
if curl -s http://localhost:3000 >/dev/null; then
    echo "✅ Backend restarted successfully on port 3000"
else
    echo "❌ Backend failed to start"
    echo "Checking if port 3000 is in use..."
    lsof -ti:3000
fi

echo "🔄 Backend restart completed!"