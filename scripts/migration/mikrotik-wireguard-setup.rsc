# ==============================================================================
# MIKROTIK ROUTEROS V7 SETUP FOR KILUSI-BILL SINGLE SERVER VPS WIREGUARD TUNNEL
# ==============================================================================
# Ganti <VPS_PUBLIC_KEY> dan <IP_PUBLIK_VPS> dengan nilai aktual dari VPS
# ==============================================================================

# 1. Setup Interface WireGuard
/interface wireguard add name=wg-vps listen-port=13231 mtu=1420

# 2. Tambah IP WireGuard MikroTik
/ip address add address=10.100.0.2/24 interface=wg-vps

# 3. Hubungkan Peer ke VPS
/interface wireguard peers add interface=wg-vps \
    public-key="<VPS_PUBLIC_KEY>" \
    endpoint-address="<IP_PUBLIK_VPS>" \
    endpoint-port=51820 \
    allowed-address=10.100.0.1/32 \
    persistent-keepalive=25s

# 4. Tambah RADIUS Server ke VPS (WireGuard IP: 10.100.0.1)
/radius add service=ppp address=10.100.0.1 secret="kilusiradiussecret!" \
    authentication-port=1812 accounting-port=1813 timeout=3000ms src-address=10.100.0.2 comment="Kilusi Single Server VPS"

# 5. Aktifkan RADIUS Incoming CoA (Change of Authorization / Disconnect Request)
/radius incoming set accept=yes port=3799

# 6. Pastikan Firewall MikroTik mengizinkan trafik RADIUS dan SNMP dari VPS (10.100.0.1)
/ip firewall filter add chain=input in-interface=wg-vps src-address=10.100.0.1 action=accept comment="Allow WireGuard VPS traffic"
