#!/bin/bash
# Fix & Restart Script for Kilusi Bill
echo "== Kilusi Bill Quick Fix =="
cd /home/feedad/Project/kilusi-bill || exit
# Adjust path above if needed, or run from project root

echo "[1/4] Pulling latest updates..."
git pull origin development

echo "[2/4] Ensuring Backend Dependencies..."
cd backend
npm install
cd ..

echo "[3/4] Re-generating Configurations..."
# Run full install to regenerate .env and fix DB/CORS
./install.sh

echo "[4/4] Verifying Status..."
sleep 5
curl -I http://localhost:3001/api/v1/health
echo "Done!"
