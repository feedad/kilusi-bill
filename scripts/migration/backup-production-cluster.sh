#!/usr/bin/env bash
# ==============================================================================
# SCRIPT BACKUP CLUSTER PRODUKSI KILUSI-BILL (101, 102, 103)
# ==============================================================================
# Ekstrak data lengkap langsung dari 3 server produksi:
#   - Server 1 (172.22.10.101): PostgreSQL 16 (kilusi_bill, autopay) & FreeRADIUS 3
#   - Server 2 (172.22.10.102): GenieACS TR-069 & MongoDB (genieacs)
#   - Server 3 (172.22.10.103): Kilusi-Bill App (server3, autopay, nginx, systemd)
#
# Output akhir: /tmp/kilusi-migration-bundle.tar.gz
# ==============================================================================

set -euo pipefail

BACKUP_DIR="/tmp/kilusi-migration-bundle"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo "=========================================================================="
echo " [1/5] MENYIAPKAN DIREKTORI BACKUP STAGING: ${BACKUP_DIR}"
echo "=========================================================================="
rm -rf "${BACKUP_DIR}"
mkdir -p "${BACKUP_DIR}/server1_db_radius"
mkdir -p "${BACKUP_DIR}/server2_genieacs"
mkdir -p "${BACKUP_DIR}/server3_app"

echo "=========================================================================="
echo " [2/5] BACKUP SERVER 1 (172.22.10.101 - PostgreSQL & FreeRADIUS)"
echo "=========================================================================="
echo "--> Dump PostgreSQL: kilusi_bill..."
ssh feedad@172.22.10.101 "PGPASSWORD='kilusi17!' pg_dump -U kilusi_user -h localhost -d kilusi_bill -F c -b -f /tmp/kilusi_bill.dump"

echo "--> Dump PostgreSQL: autopay..."
ssh feedad@172.22.10.101 "PGPASSWORD='kilusi17!' pg_dump -U kilusi_user -h localhost -d autopay -F c -b -f /tmp/autopay.dump"

echo "--> Backup konfigurasi FreeRADIUS 3.0 & scripts /usr/local/bin..."
ssh feedad@172.22.10.101 "sudo -n tar -czf /tmp/freeradius_config.tar.gz -C /etc/freeradius/3.0 ."
ssh feedad@172.22.10.101 "sudo -n tar -czf /tmp/radius_bin_scripts.tar.gz -C /usr/local/bin gen-coa-config.sh coa-relay.sh voucher-mark-used.sh 2>/dev/null || true"

echo "--> Salin file dari Server 1 ke staging..."
scp feedad@172.22.10.101:/tmp/kilusi_bill.dump "${BACKUP_DIR}/server1_db_radius/"
scp feedad@172.22.10.101:/tmp/autopay.dump "${BACKUP_DIR}/server1_db_radius/"
scp feedad@172.22.10.101:/tmp/freeradius_config.tar.gz "${BACKUP_DIR}/server1_db_radius/"
scp feedad@172.22.10.101:/tmp/radius_bin_scripts.tar.gz "${BACKUP_DIR}/server1_db_radius/"
echo "[OK] Server 1 backup selesai."

echo "=========================================================================="
echo " [3/5] BACKUP SERVER 2 (172.22.10.102 - GenieACS & MongoDB)"
echo "=========================================================================="
echo "--> Dump MongoDB genieacs..."
ssh feedad@172.22.10.102 "rm -rf /tmp/genieacs_mongo_dump && mongodump --db genieacs --out /tmp/genieacs_mongo_dump && tar -czf /tmp/genieacs_dump.tar.gz -C /tmp genieacs_mongo_dump"

echo "--> Backup konfigurasi GenieACS & systemd services..."
ssh feedad@172.22.10.102 "sudo -n tar -czf /tmp/genieacs_config.tar.gz /opt/genieacs /etc/systemd/system/genieacs* 2>/dev/null || true"

echo "--> Salin file dari Server 2 ke staging..."
scp feedad@172.22.10.102:/tmp/genieacs_dump.tar.gz "${BACKUP_DIR}/server2_genieacs/"
scp feedad@172.22.10.102:/tmp/genieacs_config.tar.gz "${BACKUP_DIR}/server2_genieacs/"
echo "[OK] Server 2 backup selesai."
echo "--> Backup kode aplikasi /opt/kilusi-bill/server3..."
ssh feedad@172.22.10.103 "sudo -n tar --warning=no-file-changed -czf /tmp/kilusi_bill_code.tar.gz --exclude='node_modules' --exclude='.next' --exclude='*.log' --exclude='.git' -C /opt/kilusi-bill/server3 ."

echo "--> Backup kode autopay /opt/kilusi-bill/autopay..."
ssh feedad@172.22.10.103 "sudo -n tar --warning=no-file-changed -czf /tmp/kilusi_autopay.tar.gz --exclude='node_modules' --exclude='.next' --exclude='*.log' --exclude='.git' -C /opt/kilusi-bill autopay"

echo "--> Backup Nginx configs..."
ssh feedad@172.22.10.103 "sudo -n tar -czf /tmp/nginx_config.tar.gz /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null || true"

echo "--> Backup Systemd services..."
ssh feedad@172.22.10.103 "sudo -n tar -czf /tmp/systemd_services.tar.gz /etc/systemd/system/kilusi* /etc/systemd/system/autopay* 2>/dev/null || true"

echo "--> Salin file dari Server 3 ke staging..."
scp feedad@172.22.10.103:/tmp/kilusi_bill_code.tar.gz "${BACKUP_DIR}/server3_app/"
scp feedad@172.22.10.103:/tmp/kilusi_autopay.tar.gz "${BACKUP_DIR}/server3_app/"
scp feedad@172.22.10.103:/tmp/nginx_config.tar.gz "${BACKUP_DIR}/server3_app/"
scp feedad@172.22.10.103:/tmp/systemd_services.tar.gz "${BACKUP_DIR}/server3_app/"
echo "[OK] Server 3 backup selesai."

echo "=========================================================================="
echo " [5/5] PACKAGING BUNDLE ARSIP MIGRASI"
echo "=========================================================================="
BUNDLE_OUTPUT="/tmp/kilusi-migration-bundle.tar.gz"
tar -czf "${BUNDLE_OUTPUT}" -C /tmp kilusi-migration-bundle
echo "=========================================================================="
echo " BUNDLE MIGRASI BERHASIL DIBUAT: ${BUNDLE_OUTPUT}"
echo " Ukuran bundle:"
ls -lh "${BUNDLE_OUTPUT}"
echo " Ringkasan isi direktori staging:"
find "${BACKUP_DIR}" -type f -exec ls -lh {} +
echo "=========================================================================="
