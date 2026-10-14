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
# 6. Restore kode aplikasi Kilusi-Bill & Autopay
# 7. Re-konfigurasi .env & database settings ke localhost & WireGuard
# 8. Install dependencies, build Frontend Next.js & Autopay
# 9. Setup & jalankan systemd services
# 10. Konfigurasi Nginx Reverse Proxy untuk seluruh domain
# 11. Pasang cron backup harian otomatis
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
    echo " [1/11] Mengekstrak bundle arsip migrasi"
    echo "=========================================================================="
    tar -xzvf "$BUNDLE_FILE" -C /tmp
fi

echo "=========================================================================="
echo " [2/11] Restore Database PostgreSQL (kilusi_bill & autopay)"
echo "=========================================================================="
# Pastikan user postgres dan database tujuan sudah siap
sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname = 'kilusi_bill'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE kilusi_bill OWNER kilusi_user;"
sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname = 'autopay'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE autopay OWNER kilusi_user;"

PG_KILUSI_DUMP=$(find "${WORK_DIR}/server1_db_radius" -name "*kilusi_bill*.dump" -o -name "*kilusi_bill*.sql" | head -n 1 || true)
if [ -n "$PG_KILUSI_DUMP" ]; then
    echo "Restoring PostgreSQL kilusi_bill dari ${PG_KILUSI_DUMP}..."
    PGPASSWORD='kilusi17!' pg_restore -U kilusi_user -h localhost -d kilusi_bill -v --clean --if-exists "$PG_KILUSI_DUMP" 2>/dev/null || \
    PGPASSWORD='kilusi17!' psql -U kilusi_user -h localhost -d kilusi_bill -f "$PG_KILUSI_DUMP" 2>/dev/null || true
    echo "[OK] Database kilusi_bill berhasil di-restore."
fi

PG_AUTOPAY_DUMP=$(find "${WORK_DIR}/server1_db_radius" -name "*autopay*.dump" -o -name "*autopay*.sql" | head -n 1 || true)
if [ -n "$PG_AUTOPAY_DUMP" ]; then
    echo "Restoring PostgreSQL autopay dari ${PG_AUTOPAY_DUMP}..."
    PGPASSWORD='kilusi17!' pg_restore -U kilusi_user -h localhost -d autopay -v --clean --if-exists "$PG_AUTOPAY_DUMP" 2>/dev/null || \
    PGPASSWORD='kilusi17!' psql -U kilusi_user -h localhost -d autopay -f "$PG_AUTOPAY_DUMP" 2>/dev/null || true
    echo "[OK] Database autopay berhasil di-restore."
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

# Update /opt/genieacs/genieacs.env
cat << 'EOF' > /opt/genieacs/genieacs.env
GENIEACS_MONGODB_CONNECTION_URL=mongodb://127.0.0.1:27017/genieacs
GENIEACS_CWMP_PORT=7547
GENIEACS_NBI_PORT=7557
GENIEACS_FS_PORT=7567
GENIEACS_UI_PORT=3002
GENIEACS_EXT_DIR=/opt/genieacs/ext
EOF
chown -R genieacs:genieacs /opt/genieacs

# Setup GenieACS Systemd Services
for SERVICE in cwmp nbi fs ui; do
cat << EOF > /etc/systemd/system/genieacs-${SERVICE}.service
[Unit]
Description=GenieACS ${SERVICE^}
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
APP_ARCHIVE=$(find "${WORK_DIR}/server3_app" -name "*kilusi_bill_code*.tar.gz" | head -n 1 || true)
mkdir -p /root/kilusi-bill
if [ -n "$APP_ARCHIVE" ]; then
    echo "Extracting Kilusi-Bill code ke /root/kilusi-bill..."
    tar -xzf "$APP_ARCHIVE" -C /root/kilusi-bill/
fi

AUTOPAY_ARCHIVE=$(find "${WORK_DIR}/server3_app" -name "*autopay*.tar.gz" | head -n 1 || true)
mkdir -p /opt/kilusi-bill
if [ -n "$AUTOPAY_ARCHIVE" ]; then
    echo "Extracting Autopay code ke /opt/kilusi-bill/autopay..."
    tar -xzf "$AUTOPAY_ARCHIVE" -C /opt/kilusi-bill/
fi

echo "=========================================================================="
echo " [7/11] Konfigurasi Environment & Database Mappings"
echo "=========================================================================="
cd /root/kilusi-bill

# Backend .env
if [ -f backend/.env ]; then
    sed -i "s|POSTGRES_HOST=.*|POSTGRES_HOST=localhost|" backend/.env
    sed -i "s|POSTGRES_PORT=.*|POSTGRES_PORT=5432|" backend/.env
    sed -i "s|POSTGRES_DATABASE=.*|POSTGRES_DATABASE=kilusi_bill|" backend/.env
    sed -i "s|POSTGRES_USER=.*|POSTGRES_USER=kilusi_user|" backend/.env
    sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=kilusi17!|" backend/.env
    sed -i "s|RADIUS_HOST=.*|RADIUS_HOST=localhost|" backend/.env
    sed -i "s|RADIUS_DATABASE=.*|RADIUS_DATABASE=kilusi_bill|" backend/.env
    sed -i "s|RADIUS_USER=.*|RADIUS_USER=kilusi_user|" backend/.env
    sed -i "s|RADIUS_PASSWORD=.*|RADIUS_PASSWORD=kilusi17!|" backend/.env
    sed -i "s|GENIEACS_URL=.*|GENIEACS_URL=http://localhost:7557|" backend/.env
    sed -i "s|PORT=.*|PORT=3001|" backend/.env
fi

# Frontend .env.local
if [ -f frontend/.env.local ]; then
    sed -i "s|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=https://api.kilusi.id|" frontend/.env.local
fi

# Autopay .env
if [ -f /opt/kilusi-bill/autopay/.env ]; then
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://kilusi_user:kilusi17!@localhost:5432/autopay|" /opt/kilusi-bill/autopay/.env
fi

# Update settings di database jika ada tabel app_config
PGPASSWORD='kilusi17!' psql -U kilusi_user -h localhost -d kilusi_bill -c "
UPDATE app_config SET config_value = 'http://localhost:7557' WHERE config_key = 'genieacs_url';
UPDATE app_config SET config_value = 'localhost' WHERE config_key = 'postgres_host';
" 2>/dev/null || true

# Update tabel nas ke IP WireGuard (MikroTik: 10.100.0.2, accel-ppp: 10.100.0.3)
PGPASSWORD='kilusi17!' psql -U kilusi_user -h localhost -d kilusi_bill -c "
UPDATE nas SET nasname = '10.100.0.2', ip_address = '10.100.0.2', secret = 'kilusiradiussecret!' WHERE is_active = true AND shortname ILIKE '%mikrotik%';
INSERT INTO nas (nasname, shortname, ip_address, secret, ports, type, is_active, snmp_enabled, snmp_port)
VALUES ('10.100.0.3', 'accel-ppp-bras', '10.100.0.3', 'kilusiradiussecret!', 1812, 'other', true, true, 161)
ON CONFLICT (nasname) DO UPDATE SET ip_address = '10.100.0.3', secret = 'kilusiradiussecret!';
" 2>/dev/null || true

echo "=========================================================================="
echo " [8/11] Install Dependencies & Build Frontend"
echo "=========================================================================="
echo "--> Building Backend..."
cd /root/kilusi-bill/backend
npm install --omit=dev

echo "--> Building Frontend..."
cd /root/kilusi-bill/frontend
npm install
npm run build

if [ -d /opt/kilusi-bill/autopay ]; then
    echo "--> Building Autopay..."
    cd /opt/kilusi-bill/autopay
    npm install
    npm run build 2>/dev/null || true
fi

echo "=========================================================================="
echo " [9/11] Setup Systemd Services"
echo "=========================================================================="
cat << 'EOF' > /etc/systemd/system/kilusi-bill-backend.service
[Unit]
Description=Kilusi Bill Backend Service
After=network.target postgresql.service mongod.service
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/root/kilusi-bill/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node app.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kilusi-bill-backend
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

cat << 'EOF' > /etc/systemd/system/kilusi-bill-frontend.service
[Unit]
Description=Kilusi Bill Frontend Service
After=network.target kilusi-bill-backend.service
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/root/kilusi-bill/frontend
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

cat << 'EOF' > /etc/systemd/system/kilusi-autopay.service
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
ExecStart=/usr/bin/npx next start --port 3087
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
cat << 'EOF' > /etc/nginx/sites-available/kilusi-single-server.conf
# HTTP Redirect ke HTTPS
server {
    listen 80 default_server;
    server_name _;
    return 301 https://$host$request_uri;
}

# Frontend Next.js: billing.kilusi.id & portal.kilusi.id
server {
    listen 443 ssl http2;
    server_name billing.kilusi.id portal.kilusi.id;

    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
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
    }

    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}

# Backend API: api.kilusi.id
server {
    listen 443 ssl http2;
    server_name api.kilusi.id;

    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Landing & Public: kilusi.id
server {
    listen 443 ssl http2;
    server_name kilusi.id www.kilusi.id;

    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Autopay Service: autopay.kilusi.id
server {
    listen 443 ssl http2;
    server_name autopay.kilusi.id;

    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;

    location / {
        proxy_pass http://127.0.0.1:3087;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Isolir Portal: isolir.kilusi.id
server {
    listen 443 ssl http2;
    server_name isolir.kilusi.id;

    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;

    location / {
        proxy_pass http://127.0.0.1:3001/isolir;
        proxy_http_version 1.1;
        proxy_set_header Host isolir.kilusi.id;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# GenieACS CWMP (Port 7547)
server {
    listen 7547;
    server_name acs.kilusi.id;

    location / {
        proxy_pass http://127.0.0.1:7547;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# GenieACS Web UI (Port 443)
server {
    listen 443 ssl http2;
    server_name acs.kilusi.id;

    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;

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

apt-get install -y ssl-cert || true
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/kilusi-single-server.conf /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
echo "[OK] Nginx reverse proxy aktif."

echo "=========================================================================="
echo " [11/11] Pasang Cron Backup Harian Otomatis"
echo "=========================================================================="
cat << 'EOF' > /root/kilusi-bill/backup.sh
#!/bin/bash
BACKUP_DIR=/root/kilusi-bill/backups
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
PGPASSWORD='kilusi17!' pg_dump -h localhost -U kilusi_user -d kilusi_bill | gzip > "$BACKUP_DIR/db_kilusi_${DATE}.sql.gz"
PGPASSWORD='kilusi17!' pg_dump -h localhost -U kilusi_user -d autopay | gzip > "$BACKUP_DIR/db_autopay_${DATE}.sql.gz"
mongodump --db genieacs --archive="$BACKUP_DIR/mongo_genieacs_${DATE}.gz" --gzip
find "$BACKUP_DIR" -name "*.gz" -mtime +7 -delete
EOF
chmod +x /root/kilusi-bill/backup.sh

# Daftarkan di root crontab jika belum ada
(crontab -l 2>/dev/null | grep -v "/root/kilusi-bill/backup.sh" ; echo "0 2 * * * /root/kilusi-bill/backup.sh") | crontab -
echo "[OK] Cron backup harian terpasang (02:00 WIB)."

echo "=========================================================================="
echo " RESTORE & DEPLOYMENT DI SINGLE SERVER VPS SELESAI!"
echo " Silakan pasang sertifikat SSL publik dengan Certbot:"
echo " certbot --nginx -d billing.kilusi.id -d api.kilusi.id -d portal.kilusi.id -d kilusi.id -d acs.kilusi.id -d autopay.kilusi.id -d isolir.kilusi.id"
echo "=========================================================================="
