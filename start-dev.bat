@echo off
echo 🚀 Starting Kilusi Bill Development Environment...

echo 📡 Starting Backend server...
cd backend
start "Backend" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul

echo 🎨 Starting Frontend server...
cd ..\frontend
start "Frontend" cmd /k "npm run dev"

echo.
echo ✅ Servers started successfully!
echo 📡 Backend: http://localhost:3000
echo 🎨 Frontend: http://localhost:3001
echo.
echo Close this window to continue...
pause