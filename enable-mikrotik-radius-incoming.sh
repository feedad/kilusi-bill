#!/bin/bash
# enable-mikrotik-radius-incoming.sh
# Script to enable RADIUS incoming on MikroTik router

MIKROTIK_IP="172.22.10.156"
MIKROTIK_USER="admin"

echo "🔧 Enabling RADIUS Incoming on MikroTik $MIKROTIK_IP"
echo ""
echo "⚠️  WARNING: This script requires SSH access to MikroTik"
echo "   Make sure you have:"
echo "   1. SSH enabled on MikroTik (/ip service enable ssh)"
echo "   2. Admin credentials ready"
echo ""

read -p "Do you want to continue? (y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted"
    exit 1
fi

echo ""
echo "📡 Connecting to MikroTik via SSH..."
echo ""

# Execute command on MikroTik
ssh -o StrictHostKeyChecking=no ${MIKROTIK_USER}@${MIKROTIK_IP} << 'ENDSSH'
# Enable RADIUS incoming
/radius incoming set accept=yes

# Print current settings to verify
echo ""
echo "✅ RADIUS Incoming Configuration:"
/radius incoming print detail

echo ""
echo "📋 Current RADIUS Server Configuration:"
/radius print detail

echo ""
echo "🔥 IP Firewall Rules for Port 3799:"
/ip firewall filter print where dst-port=3799

echo ""
echo "✅ Configuration complete!"

ENDSSH

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Successfully configured MikroTik RADIUS incoming!"
    echo ""
    echo "📊 Next steps:"
    echo "   1. Test kick user dari dashboard"
    echo "   2. Monitor logs: tail -f /home/kilusi-bill/logs/app.log | grep Disconnect"
    echo "   3. Verify session hilang: /ppp active print"
    echo ""
else
    echo "❌ Failed to connect to MikroTik"
    echo ""
    echo "🔧 Manual steps:"
    echo "   1. SSH to MikroTik: ssh admin@172.22.10.156"
    echo "   2. Run: /radius incoming set accept=yes"
    echo "   3. Verify: /radius incoming print"
    echo ""
fi

exit $EXIT_CODE
