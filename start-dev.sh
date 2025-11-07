#!/bin/bash

# Script untuk menjalankan aplikasi Kilusi Bill dalam mode development
# Backend dan frontend akan berjalan bersamaan

echo "🚀 Starting Kilusi Bill Development Environment..."

# Fungsi untuk membersihkan proses saat exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

# Trap signal SIGINT (Ctrl+C)
trap cleanup SIGINT

# Jalankan backend
echo "📡 Starting Backend server..."
cd backend
npm run dev &
BACKEND_PID=$!

# Tunggu sebentar agar backend bisa start
sleep 3

# Jalankan frontend
echo "🎨 Starting Frontend server..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Servers started successfully!"
echo "📡 Backend: http://localhost:3000"
echo "🎨 Frontend: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop both servers"

# Tunggu hingga salah satu proses selesai
wait $BACKEND_PID $FRONTEND_PID