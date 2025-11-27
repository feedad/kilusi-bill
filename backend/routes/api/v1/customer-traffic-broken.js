const express = require('express');
const router = express.Router();
const snmpMonitor = require('../../../config/snmp-monitor');
const { getSetting } = require('../../../config/settingsManager');
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');

// Middleware to verify customer authentication
const verifyCustomer = async (req, res, next) => {
  try {
    console.log('🔍 Customer traffic API authentication check...');
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No auth header or invalid format');
      return res.status(401).json({
        success: false,
        message: 'Authorization token required'
      });
    }

    const token = authHeader.substring(7);
    console.log('🔑 Token extracted (first 10 chars):', token.substring(0, 10) + '...');

    // Get customer by token from portal_access_token
    const customerQuery = await query(`
      SELECT id, name, phone, pppoe_username, status
      FROM customers
      WHERE portal_access_token = $1 AND status = 'active'
    `, [token]);

    if (customerQuery.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    req.customer = customerQuery.rows[0];
    next();
  } catch (error) {
    logger.error('Customer authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

// GET /api/v1/customer-traffic/realtime - Get real-time traffic data for logged-in customer
router.get('/realtime', verifyCustomer, async (req, res) => {
  try {
    console.log('🚀 Customer traffic API called for customer:', req.customer.name, '(', req.customer.pppoe_username, ')');
    const monitorMode = String(getSetting('monitor_mode', 'mikrotik')).toLowerCase();
    let trafficData = {
      uploadSpeed: 0,
      downloadSpeed: 0,
      interface: 'N/A',
      mode: monitorMode,
      timestamp: new Date().toISOString(),
      customerUsername: req.customer.pppoe_username,
      pppoeInterface: null,
      pppoeTraffic: null
    };

    if (monitorMode === 'snmp') {
      const host = getSetting('snmp_host', '');
      const community = getSetting('snmp_community', 'public');
      const version = getSetting('snmp_version', '2c');
      const port = getSetting('snmp_port', '161');

      if (host && req.customer.pppoe_username) {
        try {
          console.log('🔍 Trying SNMP connection to host:', host, 'for username:', req.customer.pppoe_username);
          // First, get all interfaces from SNMP
          const interfaces = await snmpMonitor.listInterfaces({
            host,
            community,
            version,
            port
          });
          console.log('📡 SNMP returned', interfaces.length, 'interfaces');

          // Find PPPoE interface matching customer username
          const customerUsername = req.customer.pppoe_username.toLowerCase();
          let pppoeInterface = null;
          let pppoeTraffic = null;

          // Try to find interface by username
          for (const iface of interfaces) {
            // Check if interface name matches username (case insensitive)
            if (iface.name && iface.name.toLowerCase() === customerUsername) {
              pppoeInterface = iface;
              break;
            }
            // Check if interface name contains username
            if (iface.name && iface.name.toLowerCase().includes(customerUsername)) {
              pppoeInterface = iface;
              break;
            }
            // Check if interface type is PPPoE
            if (snmpMonitor.classifyInterface(iface) === 'pppoe') {
              // For PPPoE interfaces, try to extract username from description or MAC
              if (iface.descr && iface.descr.toLowerCase().includes(customerUsername)) {
                pppoeInterface = iface;
                break;
              }
            }
          }

          if (pppoeInterface) {
            // Get traffic data for the specific PPPoE interface
            const snmpTraffic = await snmpMonitor.getInterfaceTraffic({
              host,
              community,
              version,
              port,
              interfaceName: pppoeInterface.index.toString()
            });

            pppoeTraffic = {
              index: pppoeInterface.index,
              name: pppoeInterface.name,
              uploadSpeed: snmpTraffic.out_bps || 0,
              downloadSpeed: snmpTraffic.in_bps || 0,
              totalUpload: snmpTraffic.total_out_bytes || 0,
              totalDownload: snmpTraffic.total_in_bytes || 0,
              timestamp: snmpTraffic.timestamp
            };

            trafficData = {
              ...trafficData,
              uploadSpeed: snmpTraffic.out_bps || 0,
              downloadSpeed: snmpTraffic.in_bps || 0,
              interface: pppoeInterface.name || `pppoe-${pppoeInterface.index}`,
              mode: 'snmp',
              pppoeInterface: pppoeInterface,
              pppoeTraffic: pppoeTraffic
            };

            logger.info(`Found PPPoE interface for customer ${customerUsername}: ${ppoeInterface.name} (index: ${ppoeInterface.index})`);
          } else {
            // Fallback to main interface if no PPPoE interface found
            const mainInterface = getSetting('snmp_interface', 'ether1');
            const snmpTraffic = await snmpMonitor.getInterfaceTraffic({
              host,
              community,
              version,
              port,
              interfaceName: mainInterface
            });

            trafficData = {
              ...trafficData,
              uploadSpeed: snmpTraffic.out_bps || 0,
              downloadSpeed: snmpTraffic.in_bps || 0,
              interface: mainInterface,
              mode: 'snmp'
            };

            logger.warn(`No PPPoE interface found for customer ${customerUsername}, using main interface: ${mainInterface}`);
          }
        } catch (error) {
          logger.warn('SNMP PPPoE traffic fetch failed:', error.message);
          // Return fallback values
        }
      }
    } else {
      // MikroTik mode - fallback to basic data
      try {
        // For MikroTik, try to get PPPoE interface data
        trafficData = {
          ...trafficData,
          interface: getSetting('main_interface', 'ether1'),
          mode: 'mikrotik'
        };
      } catch (error) {
        logger.warn('MikroTik traffic fetch failed:', error.message);
      }
    }

    res.json({
      success: true,
      data: { traffic: trafficData }
    });

  } catch (error) {
    logger.error('Error fetching customer traffic data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch traffic data'
    });
  }
});

// GET /api/v1/customer-traffic/session - Get customer's current session traffic from RADIUS
router.get('/session', verifyCustomer, async (req, res) => {
  try {
    const { radiusDb } = require('../../config/radius-postgres');

    // Get current active session for this customer
    const activeSession = await radiusDb.getActiveSessions()
      .then(sessions => sessions.find(session =>
        session.name === req.customer.pppoe_username
      ));

    if (!activeSession) {
      return res.json({
        success: true,
        data: {
          online: false,
          uploadBytes: 0,
          downloadBytes: 0,
          sessionTime: 0,
          ipAddress: null,
          startTime: null
        }
      });
    }

    // Extract bytes from session data (assuming format like "10 KB / 5 MB")
    const parseBytes = (byteString) => {
      if (!byteString || typeof byteString !== 'string') return 0;

      const match = byteString.match(/([\d.]+)\s*(B|KB|MB|GB)/i);
      if (!match) return 0;

      const value = parseFloat(match[1]);
      const unit = match[2].toUpperCase();

      switch (unit) {
        case 'KB': return Math.round(value * 1024);
        case 'MB': return Math.round(value * 1024 * 1024);
        case 'GB': return Math.round(value * 1024 * 1024 * 1024);
        default: return Math.round(value);
      }
    };

    const uploadBytes = parseBytes(activeSession.upload);
    const downloadBytes = parseBytes(activeSession.download);

    res.json({
      success: true,
      data: {
        online: true,
        uploadBytes: uploadBytes,
        downloadBytes: downloadBytes,
        totalBytes: uploadBytes + downloadBytes,
        sessionTime: activeSession.uptime || 0,
        ipAddress: activeSession.address,
        startTime: activeSession.startTime,
        macAddress: activeSession.mac
      }
    });

  } catch (error) {
    logger.error('Error fetching customer session traffic:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch session data'
    });
  }
});

module.exports = router;