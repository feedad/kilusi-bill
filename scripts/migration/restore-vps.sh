#!/usr/bin/env bash
# ==============================================================================
# SCRIPT RESTORE & DEPLOYMENT DI SINGLE SERVER VPS DEBIAN 12
# ==============================================================================
# Input: /tmp/kilusi-migration-bundle.tar.gz
# Aksi:
# 1. Ekstrak bundle arsip migrasi
# 2. Restore Database PostgreSQL (kilusi_bill & autopay)
# 3. Restore MongoDB (genieacs)
# 4. Restore & deploy konfigurasi FreeRADIUS 3.0 & scripts /usr/local/bin
# 5. Restore & deploy konfigurasi GenieACS & systemd services
# 6. Restore kode aplikasi Kilusi-Bill & Autopay (/opt/kilusi-bill)
# 7. Re-konfigurasi .env & database settings ke localhost
# 8. Install dependencies, build Frontend Next.js & Autopay
# 9. Setup & jalankan systemd services (backend, frontend, autopay, genieacs)
# 10. Konfigurasi Nginx Unified Reverse Proxy (Cloudflare-ready & Isolir NAT)
# 11. Pasang cron backup harian otomatis & verifikasi kesehatan sistem
# ==============================================================================

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
   echo "[ERROR] Script ini harus dijalankan sebagai root!"
   exit 1
fi

BUNDLE_FILE="/tmp/kilusi-migration-bundle.tar.gz"
WORK_DIR="/tmp/kilusi-migration-bundle"

if [ ! -f "$BUNDLE_FILE" ] && [ ! -d "$WORK_DIR" ]; then
    echo "[ERROR] Bundle file ${BUNDLE_FILE} atau direktori ${WORK_DIR} tidak ditemukan!"
    echo "Salin file bundle hasil backup dari server lama ke ${BUNDLE_FILE} terlebih dahulu."
    exit 1
fi

if [ -f "$BUNDLE_FILE" ]; then
    echo "=========================================================================="
    echo " [1/11] Mengekstrak bundle arsip migrasi..."
    echo "=========================================================================="
    tar -xzvf "$BUNDLE_FILE" -C /tmp
fi

echo "=========================================================================="
echo " [2/11] Restore Database PostgreSQL (kilusi_bill & autopay)"
echo "=========================================================================="
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'kilusi_bill'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE kilusi_bill OWNER kilusi_user;"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'autopay'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE autopay OWNER kilusi_user;"

PG_KILUSI_DUMP=$(find "${WORK_DIR}/server1_db_radius" -name "*kilusi_bill*.dump" | head -n 1 || true)
PG_KILUSI_SQL=$(find "${WORK_DIR}/server1_db_radius" -name "*kilusi_bill*.sql.gz" -o -name "*kilusi_bill*.sql" | head -n 1 || true)

if [ -n "$PG_KILUSI_DUMP" ]; then
    echo "Restoring PostgreSQL kilusi_bill via pg_restore (${PG_KILUSI_DUMP})..."
    PGPASSWORD='kilusi17!' pg_restore -U kilusi_user -h localhost -d kilusi_bill -v --clean --if-exists "$PG_KILUSI_DUMP" 2>/dev/null || true
    echo "[OK] pg_restore kilusi_bill selesai."
elif [ -n "$PG_KILUSI_SQL" ]; then
    echo "Restoring PostgreSQL kilusi_bill via psql (${PG_KILUSI_SQL})..."
    if [[ "$PG_KILUSI_SQL" == *.gz ]]; then
        gunzip -c "$PG_KILUSI_SQL" | PGPASSWORD='kilusi17!' psql -U kilusi_user -h localhost -d kilusi_bill
    else
        PGPASSWORD='kilusi17!' psql -U kilusi_user -h localhost -d kilusi_bill -f "$PG_KILUSI_SQL"
    fi
    echo "[OK] psql kilusi_bill selesai."
fi

PG_AUTOPAY_DUMP=$(find "${WORK_DIR}/server1_db_radius" -name "*autopay*.dump" | head -n 1 || true)
PG_AUTOPAY_SQL=$(find "${WORK_DIR}/server1_db_radius" -name "*autopay*.sql.gz" -o -name "*autopay*.sql" | head -n 1 || true)

if [ -n "$PG_AUTOPAY_DUMP" ]; then
    echo "Restoring PostgreSQL autopay via pg_restore (${PG_AUTOPAY_DUMP})..."
    PGPASSWORD='kilusi17!' pg_restore -U kilusi_user -h localhost -d autopay -v --clean --if-exists "$PG_AUTOPAY_DUMP" 2>/dev/null || true
    echo "[OK] pg_restore autopay selesai."
elif [ -n "$PG_AUTOPAY_SQL" ]; then
    echo "Restoring PostgreSQL autopay via psql (${PG_AUTOPAY_SQL})..."
    if [[ "$PG_AUTOPAY_SQL" == *.gz ]]; then
        gunzip -c "$PG_AUTOPAY_SQL" | PGPASSWORD='kilusi17!' psql -U kilusi_user -h localhost -d autopay
    else
        PGPASSWORD='kilusi17!' psql -U kilusi_user -h localhost -d autopay -f "$PG_AUTOPAY_SQL"
    fi
    echo "[OK] psql autopay selesai."
fi

echo "=========================================================================="
echo " [3/11] Restore Database MongoDB (GenieACS)"
echo "=========================================================================="
MONGO_ARCHIVE=$(find "${WORK_DIR}/server2_genieacs" -name "*mongo*.tar.gz" -o -name "*genieacs_dump*.tar.gz" | head -n 1 || true)
if [ -n "$MONGO_ARCHIVE" ]; then
    echo "Extracting MongoDB dump..."
    tar -xzf "$MONGO_ARCHIVE" -C /tmp/
    if [ -d "/tmp/genieacs_mongo_dump/genieacs" ]; then
        mongorestore --db genieacs --drop /tmp/genieacs_mongo_dump/genieacs
        echo "[OK] MongoDB genieacs berhasil di-restore."
    elif [ -d "/tmp/genieacs" ]; then
        mongorestore --db genieacs --drop /tmp/genieacs
        echo "[OK] MongoDB genieacs berhasil di-restore."
    fi
fi

echo "=========================================================================="
echo " [4/11] Restore Konfigurasi FreeRADIUS 3.0 & Scripts"
echo "=========================================================================="
FR_CONFIG_ARCHIVE=$(find "${WORK_DIR}/server1_db_radius" -name "*freeradius*.tar.gz" | head -n 1 || true)
if [ -n "$FR_CONFIG_ARCHIVE" ]; then
    echo "Restoring FreeRADIUS config..."
    mkdir -p /etc/freeradius/3.0/
    tar -xzf "$FR_CONFIG_ARCHIVE" -C /etc/freeradius/3.0/
    
    # Pastikan koneksi SQL FreeRADIUS mengarah ke localhost
    if [ -f /etc/freeradius/3.0/mods-available/sql ]; then
        sed -i "s|server = .*|server = \"localhost\"|" /etc/freeradius/3.0/mods-available/sql
        sed -i "s|port = .*|port = 5432|" /etc/freeradius/3.0/mods-available/sql
        sed -i "s|login = .*|login = \"kilusi_user\"|" /etc/freeradius/3.0/mods-available/sql
        sed -i "s|password = .*|password = \"kilusi17!\"|" /etc/freeradius/3.0/mods-available/sql
        sed -i "s|radius_db = .*|radius_db = \"kilusi_bill\"|" /etc/freeradius/3.0/mods-available/sql
    fi

    # Pastikan link mods-enabled/sql aktif
    ln -sf /etc/freeradius/3.0/mods-available/sql /etc/freeradius/3.0/mods-enabled/sql || true

    # Pastikan status server aktif untuk radclient status monitoring
    ln -sf /etc/freeradius/3.0/sites-available/status /etc/freeradius/3.0/sites-enabled/status || true
fi

FR_SCRIPTS_ARCHIVE=$(find "${WORK_DIR}/server1_db_radius" -name "*radius_bin_scripts*.tar.gz" | head -n 1 || true)
if [ -n "$FR_SCRIPTS_ARCHIVE" ]; then
    echo "Restoring FreeRADIUS helper scripts ke /usr/local/bin..."
    tar -xzf "$FR_SCRIPTS_ARCHIVE" -C /usr/local/bin/
    chmod +x /usr/local/bin/gen-coa-config.sh /usr/local/bin/coa-relay.sh /usr/local/bin/voucher-mark-used.sh 2>/dev/null || true
fi

# Regenerasi config CoA FreeRADIUS dari tabel nas
if [ -x /usr/local/bin/gen-coa-config.sh ]; then
    /usr/local/bin/gen-coa-config.sh || true
fi

chown -R freerad:freerad /etc/freeradius/3.0
systemctl restart freeradius || true
systemctl enable freeradius || true
echo "[OK] FreeRADIUS 3.0 berhasil dikonfigurasi."

echo "=========================================================================="
echo " [5/11] Restore Konfigurasi GenieACS & Systemd Services"
echo "=========================================================================="
GENIEACS_ARCHIVE=$(find "${WORK_DIR}/server2_genieacs" -name "*genieacs_config*.tar.gz" | head -n 1 || true)
if [ -n "$GENIEACS_ARCHIVE" ]; then
    echo "Restoring GenieACS config..."
    mkdir -p /opt/genieacs /opt/genieacs/ext
    tar -xzf "$GENIEACS_ARCHIVE" -C /opt/genieacs/
fi

cat << 'EOF' > /opt/genieacs/genieacs.env
GENIEACS_CWMP_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-cwmp-access.log
GENIEACS_NBI_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-nbi-access.log
GENIEACS_FS_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-fs-access.log
GENIEACS_UI_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-ui-access.log
GENIEACS_DEBUG_FILE=/var/log/genieacs/genieacs-debug.yaml
GENIEACS_EXT_DIR=/opt/genieacs/ext
GENIEACS_UI_JWT_SECRET=secret
GENIEACS_CWMP_PORT=7547
GENIEACS_NBI_PORT=7557
GENIEACS_FS_PORT=7567
GENIEACS_UI_PORT=3002
GENIEACS_MONGODB_CONNECTION_URL=mongodb://127.0.0.1:27017/genieacs
EOF
chown -R genieacs:genieacs /opt/genieacs

for SERVICE in cwmp nbi fs ui; do
cat << EOF > /etc/systemd/system/genieacs-${SERVICE}.service
[Unit]
Description=GenieACS ${SERVICE^^}
After=network.target mongod.service
Wants=mongod.service

[Service]
User=genieacs
EnvironmentFile=/opt/genieacs/genieacs.env
ExecStart=/usr/bin/genieacs-${SERVICE}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
done

systemctl daemon-reload
systemctl enable genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui
systemctl restart genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui
echo "[OK] GenieACS services aktif."

echo "=========================================================================="
echo " [6/11] Restore Source Code Kilusi-Bill & Autopay"
echo "=========================================================================="
mkdir -p /opt/kilusi-bill/server3
mkdir -p /opt/kilusi-bill/autopay

APP_ARCHIVE=$(find "${WORK_DIR}/server3_app" -name "*kilusi_bill_code*.tar.gz" | head -n 1 || true)
if [ -n "$APP_ARCHIVE" ]; then
    echo "Extracting Kilusi-Bill code ke /opt/kilusi-bill/server3..."
    tar -xzf "$APP_ARCHIVE" -C /opt/kilusi-bill/server3/
fi

AUTOPAY_ARCHIVE=$(find "${WORK_DIR}/server3_app" -name "*autopay*.tar.gz" | head -n 1 || true)
if [ -n "$AUTOPAY_ARCHIVE" ]; then
    echo "Extracting Autopay code ke /opt/kilusi-bill/autopay..."
    tar -xzf "$AUTOPAY_ARCHIVE" -C /opt/kilusi-bill/
fi

# Symlink compatibility: /root/kilusi-bill -> /opt/kilusi-bill/server3
if [ ! -d /root/kilusi-bill ]; then
    ln -sf /opt/kilusi-bill/server3 /root/kilusi-bill
fi

echo "=========================================================================="
echo " [7/11] Konfigurasi Environment & Database Mappings"
echo "=========================================================================="
APP_BASE="/opt/kilusi-bill/server3"

# Backend .env
if [ -f "${APP_BASE}/backend/.env" ]; then
    sed -i "s|POSTGRES_HOST=.*|POSTGRES_HOST=localhost|" "${APP_BASE}/backend/.env"
    sed -i "s|POSTGRES_PORT=.*|POSTGRES_PORT=5432|" "${APP_BASE}/backend/.env"
    sed -i "s|POSTGRES_DATABASE=.*|POSTGRES_DATABASE=kilusi_bill|" "${APP_BASE}/backend/.env"
    sed -i "s|POSTGRES_USER=.*|POSTGRES_USER=kilusi_user|" "${APP_BASE}/backend/.env"
    sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=kilusi17!|" "${APP_BASE}/backend/.env"
    sed -i "s|RADIUS_HOST=.*|RADIUS_HOST=localhost|" "${APP_BASE}/backend/.env"
    sed -i "s|RADIUS_DATABASE=.*|RADIUS_DATABASE=kilusi_bill|" "${APP_BASE}/backend/.env"
    sed -i "s|RADIUS_USER=.*|RADIUS_USER=kilusi_user|" "${APP_BASE}/backend/.env"
    sed -i "s|RADIUS_PASSWORD=.*|RADIUS_PASSWORD=kilusi17!|" "${APP_BASE}/backend/.env"
    sed -i "s|GENIEACS_URL=.*|GENIEACS_URL=http://localhost:7557|" "${APP_BASE}/backend/.env"
    sed -i "s|PORT=.*|PORT=3001|" "${APP_BASE}/backend/.env"
fi

# Frontend .env.local
if [ -f "${APP_BASE}/frontend/.env.local" ]; then
    sed -i "s|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=https://api.kilusi.id|" "${APP_BASE}/frontend/.env.local"
fi

# Autopay .env
if [ -f "/opt/kilusi-bill/autopay/.env" ]; then
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://kilusi_user:kilusi17!@localhost:5432/autopay|" /opt/kilusi-bill/autopay/.env
fi

# Update settings di database jika ada tabel app_config
PGPASSWORD='kilusi17!' psql -U kilusi_user -h localhost -d kilusi_bill -c "
UPDATE app_config SET config_value = 'http://localhost:7557' WHERE config_key = 'genieacs_url';
UPDATE app_config SET config_value = 'localhost' WHERE config_key = 'postgres_host';
" 2>/dev/null || true

echo "=========================================================================="
echo " [8/11] Install Dependencies & Build Frontend"
echo "=========================================================================="
echo "--> Installing Backend dependencies..."
cd "${APP_BASE}/backend"
npm install --omit=dev

echo "--> Installing & Building Frontend..."
cd "${APP_BASE}/frontend"
npm install
npm run build

if [ -d "/opt/kilusi-bill/autopay" ]; then
    echo "--> Installing & Building Autopay..."
    cd /opt/kilusi-bill/autopay
    npm install
    npm run build 2>/dev/null || true
fi

echo "=========================================================================="
echo " [9/11] Setup Systemd Services"
echo "=========================================================================="
NODE_BIN=$(command -v node)

cat << EOF > /etc/systemd/system/kilusi-bill-backend.service
[Unit]
Description=Kilusi Bill Backend Service
After=network.target postgresql.service mongod.service
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${APP_BASE}/backend
Environment=NODE_ENV=production
ExecStart=${NODE_BIN} app.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kilusi-bill-backend
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

cat << EOF > /etc/systemd/system/kilusi-bill-frontend.service
[Unit]
Description=Kilusi Bill Frontend Service
After=network.target kilusi-bill-backend.service
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${APP_BASE}/frontend
Environment=NODE_ENV=production
ExecStart=/usr/bin/npx next start -p 8080
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kilusi-bill-frontend
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

cat << EOF > /etc/systemd/system/kilusi-autopay.service
[Unit]
Description=Kilusi Autopay - Middleware Verifikasi Pembayaran Otomatis
After=network.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/kilusi-bill/autopay
Environment=NODE_ENV=production
Environment=PORT=3087
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start --port 3087
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kilusi-autopay
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable kilusi-bill-backend kilusi-bill-frontend kilusi-autopay
systemctl restart kilusi-bill-backend kilusi-bill-frontend kilusi-autopay
echo "[OK] Systemd services aktif."

echo "=========================================================================="
echo " [10/11] Konfigurasi Nginx Unified Reverse Proxy"
echo "=========================================================================="
cat << 'EOF' > /etc/nginx/sites-available/kilusi-unified.conf
# ==============================================================================
# KILUSI-BILL UNIFIED NGINX CONFIGURATION (SINGLE SERVER VPS)
# Mendukung Cloudflare Proxy (Port 80/443) & MikroTik Isolir NAT Redirect
# ==============================================================================

# --- Isolir Catch-All (default_server) — NAT redirect dari MikroTik ---
server {
    listen 80 default_server;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:3001/isolir;
        proxy_http_version 1.1;
        proxy_set_header Host "isolir.kilusi.id";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host "isolir.kilusi.id";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host "isolir.kilusi.id";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# --- Backend API: api.kilusi.id ---
server {
    listen 80;
    server_name api.kilusi.id;

    location /api/v1/payments/webhook/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "no-store, no-cache, must-revalidate, private" always;
    }

    location /api/v1/payments/callback/ {
        proxy_pass http://127.0.0.1:3001;
        add_header Cache-Control "no-store, no-cache, must-revalidate, private" always;
    }

    location /api/v1/hotspot/webhook/ {
        proxy_pass http://127.0.0.1:3001;
        add_header Cache-Control "no-store, no-cache, must-revalidate, private" always;
    }

    location ~ ^/api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    client_max_body_size 100M;
}

# --- Billing Frontend: billing.kilusi.id ---
server {
    listen 80;
    server_name billing.kilusi.id;

    location /api/v1/payments/webhook/ {
        proxy_pass http://127.0.0.1:3001;
        add_header Cache-Control "no-store, no-cache, must-revalidate, private" always;
    }

    location /api/v1/payments/callback/ {
        proxy_pass http://127.0.0.1:3001;
        add_header Cache-Control "no-store, no-cache, must-revalidate, private" always;
    }

    location /api/v1/hotspot/webhook/ {
        proxy_pass http://127.0.0.1:3001;
        add_header Cache-Control "no-store, no-cache, must-revalidate, private" always;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    client_max_body_size 100M;
}

# --- Customer Portal: portal.kilusi.id ---
server {
    listen 80;
    server_name portal.kilusi.id;

    location /api/v1/payments/webhook/ {
        proxy_pass http://127.0.0.1:3001;
        add_header Cache-Control "no-store, no-cache, must-revalidate, private" always;
    }

    location /api/v1/payments/callback/ {
        proxy_pass http://127.0.0.1:3001;
        add_header Cache-Control "no-store, no-cache, must-revalidate, private" always;
    }

    location /api/v1/hotspot/webhook/ {
        proxy_pass http://127.0.0.1:3001;
        add_header Cache-Control "no-store, no-cache, must-revalidate, private" always;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    client_max_body_size 100M;
}

# --- Landing Page: kilusi.id & www.kilusi.id ---
server {
    listen 80;
    server_name kilusi.id www.kilusi.id;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}

# --- Autopay: autopay.kilusi.id ---
server {
    listen 80;
    server_name autopay.kilusi.id;

    location / {
        proxy_pass http://127.0.0.1:3087;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3087;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# --- Isolir Domain: isolir.kilusi.id ---
server {
    listen 80;
    server_name isolir.kilusi.id;

    location / {
        proxy_pass http://127.0.0.1:3001/isolir;
        proxy_http_version 1.1;
        proxy_set_header Host "isolir.kilusi.id";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host "isolir.kilusi.id";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host "isolir.kilusi.id";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# --- GenieACS Web UI: acs.kilusi.id (Port 80) ---
server {
    listen 80;
    server_name acs.kilusi.id;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/kilusi-unified.conf /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
echo "[OK] Nginx unified reverse proxy aktif."

echo "=========================================================================="
echo " [11/11] Pasang Cron Backup Harian & Verifikasi Kesehatan Sistem"
echo "=========================================================================="
mkdir -p /opt/kilusi-bill/backups

cat << 'EOF' > /opt/kilusi-bill/backup.sh
#!/bin/bash
BACKUP_DIR=/opt/kilusi-bill/backups
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
PGPASSWORD='kilusi17!' pg_dump -h localhost -U kilusi_user -d kilusi_bill | gzip > "$BACKUP_DIR/db_kilusi_${DATE}.sql.gz"
PGPASSWORD='kilusi17!' pg_dump -h localhost -U kilusi_user -d autopay | gzip > "$BACKUP_DIR/db_autopay_${DATE}.sql.gz"
mongodump --db genieacs --archive="$BACKUP_DIR/mongo_genieacs_${DATE}.gz" --gzip
find "$BACKUP_DIR" -name "*.gz" -mtime +7 -delete
EOF
chmod +x /opt/kilusi-bill/backup.sh

(crontab -l 2>/dev/null | grep -v "/opt/kilusi-bill/backup.sh" ; echo "0 2 * * * /opt/kilusi-bill/backup.sh") | crontab -
echo "[OK] Cron backup harian terpasang (02:00 WIB)."

echo "--------------------------------------------------------------------------"
echo " VERIFIKASI KESEHATAN SISTEM:"
echo "--------------------------------------------------------------------------"
echo -n "1. PostgreSQL kilusi_bill: "
PGPASSWORD='kilusi17!' psql -U kilusi_user -h localhost -d kilusi_bill -tc "SELECT count(*) FROM customers;" 2>/dev/null && echo " OK" || echo " FAILED"

echo -n "2. Backend API Health: "
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/api/v1/health || echo "FAILED"

echo -n "3. Frontend App (Admin Accounting): "
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/admin/accounting || echo "FAILED"

echo -n "4. Autopay Service: "
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3087 || echo "FAILED"

echo -n "5. GenieACS NBI: "
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7557/devices || echo "FAILED"

echo -n "6. FreeRADIUS Status: "
radclient -s 127.0.0.1:18121 status adminsecret 2>&1 | grep -q "Accept" && echo "OK (Accept)" || echo "CHECK MANUALLY"

echo "=========================================================================="
echo " RESTORE & DEPLOYMENT DI SINGLE SERVER VPS SELESAI!"
echo "=========================================================================="
