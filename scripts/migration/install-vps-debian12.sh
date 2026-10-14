#!/usr/bin/env bash
# ==============================================================================
# SCRIPT PROVISIONING & INSTALASI SINGLE SERVER VPS (DEBIAN 12 BOOKWORM)
# ==============================================================================
# Target Spesifikasi:
#   - OS: Debian 12 (Bookworm) 64-bit
#   - CPU: 4 vCPU (Intel Xeon)
#   - RAM: 16 GB
#   - Disk: 100 GB NVMe
#
# Stack yang diinstall:
#   1. Node.js 20 LTS + NPM
#   2. PostgreSQL 16 + FreeRADIUS postgresql driver
#   3. MongoDB 7.0 (Community Edition)
#   4. FreeRADIUS 3.2
#   5. GenieACS (TR-069 Server: CWMP, NBI, FS, UI)
#   6. WireGuard Tunnel (Kernel Module)
#   7. Nginx Web Server + Certbot SSL
#   8. Tuning Performa untuk RAM 16 GB
# ==============================================================================

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
   echo "[ERROR] Script ini harus dijalankan sebagai root!" 
   exit 1
fi

echo "=========================================================================="
echo " [1/9] MEMPERBARUI SISTEM & MENGATUR TIMEZONE (Asia/Jakarta)"
echo "=========================================================================="
timedatectl set-timezone Asia/Jakarta
apt update && apt upgrade -y
apt install -y curl wget gnupg lsb-release ca-certificates apt-transport-https \
    git build-essential software-properties-common ufw net-tools procps \
    snmp snmpd freeradius-utils htop iotop jq

echo "=========================================================================="
echo " [2/9] MEMBUAT 4 GB SWAP FILE SEBAGAI PENGAMAN"
echo "=========================================================================="
if [ ! -f /swapfile ]; then
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    sysctl vm.swappiness=10
    echo 'vm.swappiness=10' >> /etc/sysctl.d/99-sysctl.conf
    echo "[OK] Swap 4GB aktif (swappiness=10)."
else
    echo "[INFO] Swapfile sudah ada."
fi

echo "=========================================================================="
echo " [3/9] INSTALASI NODE.JS 20 LTS"
echo "=========================================================================="
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
    npm install -g npm@latest pm2
    echo "[OK] Node.js $(node -v) & npm $(npm -v) terinstall."
else
    echo "[INFO] Node.js sudah terinstall: $(node -v)"
fi

echo "=========================================================================="
echo " [4/9] INSTALASI & TUNING POSTGRESQL 16 (RAM 16 GB PROFILE)"
echo "=========================================================================="
install -d /etc/apt/keyrings
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg
echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list

apt update
apt install -y postgresql-16 postgresql-contrib-16

# Konfigurasi tuning PostgreSQL untuk 16 GB RAM
PG_CONF="/etc/postgresql/16/main/postgresql.conf"
if [ -f "$PG_CONF" ]; then
    sed -i "s/#shared_buffers = 128MB/shared_buffers = 2GB/" "$PG_CONF"
    sed -i "s/#work_mem = 4MB/work_mem = 32MB/" "$PG_CONF"
    sed -i "s/#maintenance_work_mem = 64MB/maintenance_work_mem = 512MB/" "$PG_CONF"
    sed -i "s/#effective_cache_size = 4GB/effective_cache_size = 6GB/" "$PG_CONF"
    sed -i "s/#max_connections = 100/max_connections = 200/" "$PG_CONF"
    sed -i "s/timezone = 'UTC'/timezone = 'Asia/Jakarta'/" "$PG_CONF"
fi

systemctl restart postgresql
systemctl enable postgresql

# Buat user kilusi_user dan radius
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='kilusi_user'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER kilusi_user WITH ENCRYPTED PASSWORD 'kilusi17!';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='radius'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER radius WITH ENCRYPTED PASSWORD 'kilusi17!';"

# Database kilusi_bill
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='kilusi_bill'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE kilusi_bill OWNER kilusi_user;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE kilusi_bill TO kilusi_user;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE kilusi_bill TO radius;"
sudo -u postgres psql -d kilusi_bill -c "ALTER SCHEMA public OWNER TO kilusi_user;"

# Database autopay
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='autopay'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE autopay OWNER kilusi_user;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE autopay TO kilusi_user;"
sudo -u postgres psql -d autopay -c "ALTER SCHEMA public OWNER TO kilusi_user;"

echo "[OK] PostgreSQL 16 siap (kilusi_bill & autopay)."

echo "=========================================================================="
echo " [5/9] INSTALASI & TUNING MONGODB 7 (GENIEACS BACKEND)"
echo "=========================================================================="
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list

apt update
apt install -y mongodb-org

# Batasi WiredTiger cache MongoDB ke 2.0 GB agar tidak boros RAM
cat << 'EOF' > /etc/mongod.conf
storage:
  dbPath: /var/lib/mongodb
  journal:
    enabled: true
  wiredTiger:
    engineConfig:
      cacheSizeGB: 2.0

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

net:
  port: 27017
  bindIp: 127.0.0.1

processManagement:
  timeZoneInfo: /usr/share/zoneinfo
EOF

systemctl daemon-reload
systemctl restart mongod
systemctl enable mongod
echo "[OK] MongoDB 7.0 siap (cacheSizeGB: 2.0)."

echo "=========================================================================="
echo " [6/9] INSTALASI GENIEACS (TR-069 ACS)"
echo "=========================================================================="
npm install -g genieacs@1.2.9

# Buat direktori dan user genieacs
id -u genieacs &>/dev/null || useradd --system --no-create-home --user-group genieacs
mkdir -p /opt/genieacs/ext /var/log/genieacs
chown -R genieacs:genieacs /opt/genieacs /var/log/genieacs

cat << 'EOF' > /opt/genieacs/genieacs.env
GENIEACS_CWMP_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-cwmp-access.log
GENIEACS_NBI_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-nbi-access.log
GENIEACS_FS_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-fs-access.log
GENIEACS_UI_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-ui-access.log
GENIEACS_UI_PORT=3002
GENIEACS_MONGODB_CONNECTION_URL=mongodb://127.0.0.1:27017/genieacs
EOF
chown genieacs:genieacs /opt/genieacs/genieacs.env

# Pasang systemd services untuk GenieACS (cwmp, nbi, fs, ui)
for svc in cwmp nbi fs ui; do
cat << EOF > /etc/systemd/system/genieacs-${svc}.service
[Unit]
Description=GenieACS ${svc^^}
After=network.target mongod.service

[Service]
User=genieacs
EnvironmentFile=/opt/genieacs/genieacs.env
ExecStart=/usr/bin/genieacs-${svc}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl enable genieacs-${svc}
systemctl restart genieacs-${svc}
done
echo "[OK] GenieACS 4 services (cwmp, nbi, fs, ui) aktif."

echo "=========================================================================="
echo " [7/9] INSTALASI FREERADIUS 3.2"
echo "=========================================================================="
apt install -y freeradius freeradius-postgresql freeradius-utils
systemctl stop freeradius || true
echo "[OK] FreeRADIUS terpasang (menunggu restore config)."

echo "=========================================================================="
echo " [8/9] SETUP WIREGUARD VPN SERVER (10.100.0.1/24)"
echo "=========================================================================="
apt install -y wireguard wireguard-tools

# Aktifkan IP Forwarding di Linux kernel
echo "net.ipv4.ip_forward = 1" > /etc/sysctl.d/99-wireguard-forward.conf
sysctl -p /etc/sysctl.d/99-wireguard-forward.conf

mkdir -p /etc/wireguard
chmod 700 /etc/wireguard

if [ ! -f /etc/wireguard/private.key ]; then
    wg genkey | tee /etc/wireguard/private.key | wg pubkey > /etc/wireguard/public.key
    chmod 600 /etc/wireguard/private.key
fi

VPS_PRIVATE_KEY=$(cat /etc/wireguard/private.key)
VPS_PUBLIC_KEY=$(cat /etc/wireguard/public.key)

cat << EOF > /etc/wireguard/wg0.conf
[Interface]
Address = 10.100.0.1/24
ListenPort = 51820
PrivateKey = ${VPS_PRIVATE_KEY}

# Peer 1: MikroTik NAS (10.100.0.2)
# [Peer]
# PublicKey = <MIKROTIK_PUBLIC_KEY>
# AllowedIPs = 10.100.0.2/32, 172.22.10.0/24, 10.20.0.0/16

# Peer 2: accel-ppp Linux BRAS (10.100.0.3)
# [Peer]
# PublicKey = <ACCEL_PPP_PUBLIC_KEY>
# AllowedIPs = 10.100.0.3/32, 10.30.0.0/16
EOF

chmod 600 /etc/wireguard/wg0.conf
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0 || true

echo "[OK] WireGuard wg0 dibuat. Public Key VPS:"
echo "------------------------------------------------------------------------"
echo "${VPS_PUBLIC_KEY}"
echo "------------------------------------------------------------------------"

echo "=========================================================================="
echo " [9/9] INSTALASI NGINX & SETUP FIREWALL (UFW)"
echo "=========================================================================="
apt install -y nginx certbot python3-certbot-nginx

# Setup UFW
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp      comment "SSH"
ufw allow 80/tcp      comment "HTTP Nginx"
ufw allow 443/tcp     comment "HTTPS Nginx"
ufw allow 51820/udp   comment "WireGuard Tunnel"
ufw allow 7547/tcp    comment "GenieACS CWMP (TR-069)"
# Port internal di interface WireGuard (10.100.0.0/24)
ufw allow in on wg0 to any port 1812 proto udp comment "RADIUS Auth via WireGuard"
ufw allow in on wg0 to any port 1813 proto udp comment "RADIUS Acct via WireGuard"
ufw allow in on wg0 to any port 18121 proto udp comment "RADIUS Status via WireGuard"
ufw allow in on wg0 to any port 3001 proto tcp comment "Backend API via WireGuard"
ufw --force enable

echo "=========================================================================="
echo " INSTALASI DASAR VPS SELESAI!"
echo " Silakan transfer bundle backup produksi dan jalankan restore-vps.sh"
echo "=========================================================================="
