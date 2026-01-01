#!/bin/bash

# Restart frontend script for kilusi-bill
echo "🔄 Restarting frontend service..."

# Stop current frontend
echo "Stopping frontend..."
pkill -f "next.*dev"
pkill -f "npm.*run.*dev"
fuser -k 3001/tcp 2>/dev/null || true

# Wait a moment
sleep 2

# Start frontend in correct directory
echo "Starting frontend from frontend directory..."
cd /home/feedad/Project/kilusi-bill/frontend
npm run dev > /dev/null 2>&1 &

# Wait for frontend to start
echo "Waiting for frontend to start..."
sleep 8

# Check if frontend is running
if curl -s http://localhost:3001 >/dev/null; then
    echo "✅ Frontend restarted successfully on port 3001"
else
    echo "❌ Frontend failed to start"
    echo "Checking if port 3001 is in use..."
    lsof -ti:3001
fi

echo "🔄 Frontend restart completed!"