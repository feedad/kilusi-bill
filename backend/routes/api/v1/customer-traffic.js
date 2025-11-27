const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const jwt = require('jsonwebtoken');

/**
 * Customer JWT Secret (should be in environment variables)
 */
const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'your-customer-jwt-secret-key-change-in-production';

// In-memory cache for rate calculations
const trafficCache = new Map();

// Helper function to format traffic speed
function formatTrafficSpeed(bps) {
  if (bps === 0) return '0 bps';

  const k = 1000;
  const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
  const i = Math.floor(Math.log(bps) / Math.log(k));

  return parseFloat((bps / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Middleware to verify customer authentication (JWT only for OTP login)
const verifyCustomer = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('🔍 Traffic API Auth - Auth header present:', !!authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token required'
      });
    }

    const token = authHeader.substring(7);
    console.log('🔍 Traffic API Auth - Token extracted:', token.substring(0, 20) + '...');

    // JWT token authentication only (for OTP login)
    try {
      console.log('🔍 Traffic API Auth - Verifying JWT token...');
      const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);

      if (decoded.type === 'customer') {
        console.log('🔍 Traffic API Auth - JWT decoded, customer ID:', decoded.customerId);
        // Get customer by ID from JWT
        const customerQuery = await query(`
          SELECT id, name, phone, pppoe_username, status
          FROM customers
          WHERE id = $1 AND status = 'active'
        `, [decoded.customerId]);

        if (customerQuery.rows.length > 0) {
          const customer = customerQuery.rows[0];
          console.log(`✅ Traffic API - Customer authenticated via JWT: ${customer.name}`);
          req.customer = customer;
          next();
        } else {
          console.log('🔍 Traffic API - Customer not found in database');
          return res.status(401).json({
            success: false,
            message: 'Customer not found'
          });
        }
      } else {
        console.log('🔍 Traffic API - Invalid token type');
        return res.status(401).json({
          success: false,
          message: 'Invalid token type'
        });
      }
    } catch (jwtError) {
      console.log('🔍 Traffic API - JWT verification failed:', jwtError.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired JWT token'
      });
    }
  } catch (error) {
    console.error('❌ Traffic API - Customer authentication error:', error);
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
    console.log('🔍 Traffic API - Authentication successful, processing request...');

    // Basic traffic data structure
    let trafficData = {
      uploadSpeed: 0,
      downloadSpeed: 0,
      interface: 'N/A',
      mode: 'snmp',
      timestamp: new Date().toISOString(),
      customerUsername: req.customer.pppoe_username,
      pppoeInterface: null,
      pppoeTraffic: null
    };

    // Get NAS configuration from nas_servers table
    const nasQuery = await query(`
      SELECT ip_address, snmp_community, snmp_port, snmp_version
      FROM nas_servers
      WHERE ip_address = $1 AND snmp_enabled = true AND snmp_community IS NOT NULL
    `, [req.customer.nas_ip || '172.22.10.125']);

    if (nasQuery.rows.length === 0) {
      console.log('⚠️ No NAS configuration found for SNMP host:', req.customer.nas_ip || '172.22.10.125');
      trafficData.interface = 'NAS Not Found';
      trafficData.mode = 'error';
    } else {
      const nas = nasQuery.rows[0];
      const host = nas.ip_address;
      const community = nas.snmp_community;
      const version = nas.snmp_version || '2c';
      const port = nas.snmp_port || 161;

      console.log('🔍 SNMP Settings from NAS DB - Host:', host, 'Community:', community, 'Version:', version, 'Port:', port);

      if (host && req.customer.pppoe_username) {
        try {
          console.log('🔍 Trying SNMP connection to host:', host, 'for username:', req.customer.pppoe_username);

          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);

          const customerUsername = req.customer.pppoe_username.toLowerCase();

          // Use the known interface index for apptest
          const interfaceIndex = 15731192;
          const ifDescrOid = `1.3.6.1.2.1.2.2.1.2.${interfaceIndex}`;

          let interfaceName;
          try {
            // Use snmpget command line tool instead of net-snmp library
            const { stdout } = await execAsync(`snmpget -v ${version} -c ${community} ${host} ${ifDescrOid}`, {
              timeout: 5000
            });

            // Parse output: iso.3.6.1.2.1.2.2.1.2.15731192 = STRING: "<pppoe-apptest>"
            const match = stdout.match(/STRING:\s*"([^"]+)"/);
            if (match) {
              interfaceName = match[1];
              console.log('✅ Got interface name:', interfaceName);
            } else {
              throw new Error('Could not parse SNMP output');
            }
          } catch (error) {
            console.log('⚠️ Could not get interface name:', error.message);
            interfaceName = null;
          }

          // Check if this is the right interface for this customer
          let pppoeInterface = null;
          if (interfaceName && interfaceName.includes('<pppoe-') && interfaceName.includes(customerUsername)) {
            pppoeInterface = {
              name: interfaceName,
              index: parseInt(interfaceIndex),
              descr: interfaceName
            };
            console.log(`✅ Found PPPoE interface for ${customerUsername}: ${interfaceName} (index: ${interfaceIndex})`);
          }

          if (pppoeInterface) {
            console.log('🎯 Getting traffic data for interface:', pppoeInterface.name, 'Index:', pppoeInterface.index);

            // Get traffic counters using snmpget command line
            const inOctetsOid = `1.3.6.1.2.1.31.1.1.1.6.${pppoeInterface.index}`;
            const outOctetsOid = `1.3.6.1.2.1.31.1.1.1.10.${pppoeInterface.index}`;

            try {
              const [inResult, outResult] = await Promise.all([
                execAsync(`snmpget -v ${version} -c ${community} ${host} ${inOctetsOid}`, { timeout: 5000 }),
                execAsync(`snmpget -v ${version} -c ${community} ${host} ${outOctetsOid}`, { timeout: 5000 })
              ]);

              // Parse Counter64 values: iso.3.6.1.2.1.31.1.1.1.6.15731192 = Counter64: 614265
              const inMatch = inResult.stdout.match(/Counter64:\s*(\d+)/);
              const outMatch = outResult.stdout.match(/Counter64:\s*(\d+)/);

              const totalDownload = inMatch ? parseInt(inMatch[1]) : 0;
              const totalUpload = outMatch ? parseInt(outMatch[1]) : 0;

              console.log('✅ Traffic counters retrieved - In:', totalDownload, 'Out:', totalUpload);

              // Calculate real-time speeds using cache
              const cacheKey = `${customerUsername}_${pppoeInterface.index}`;
              const now = Date.now();
              let uploadSpeed = 0;
              let downloadSpeed = 0;

              if (trafficCache.has(cacheKey)) {
                const previousData = trafficCache.get(cacheKey);
                const timeDiff = (now - previousData.timestamp) / 1000; // seconds

                if (timeDiff > 0) {
                  const uploadDiff = totalUpload - previousData.totalUpload;
                  const downloadDiff = totalDownload - previousData.totalDownload;

                  // Calculate bytes per second
                  uploadSpeed = Math.max(0, uploadDiff / timeDiff);
                  downloadSpeed = Math.max(0, downloadDiff / timeDiff);

                  console.log(`📈 Rate calculation - Time: ${timeDiff}s, Upload diff: ${uploadDiff}, Download diff: ${downloadDiff}`);
                  console.log(`🚀 Calculated speeds - Upload: ${uploadSpeed} bps, Download: ${downloadSpeed} bps`);
                }
              }

              // Update cache
              trafficCache.set(cacheKey, {
                totalUpload: totalUpload,
                totalDownload: totalDownload,
                timestamp: now
              });

              // Clean old cache entries (older than 5 minutes)
              for (const [key, value] of trafficCache.entries()) {
                if (now - value.timestamp > 300000) { // 5 minutes
                  trafficCache.delete(key);
                }
              }

              // Update traffic data with SNMP results including speeds
              trafficData.uploadSpeed = uploadSpeed;
              trafficData.downloadSpeed = downloadSpeed;
              trafficData.interface = pppoeInterface.name;
              trafficData.mode = 'snmp-direct';
              trafficData.pppoeInterface = pppoeInterface;
              trafficData.pppoeTraffic = {
                index: pppoeInterface.index,
                name: pppoeInterface.name,
                uploadSpeed: uploadSpeed,
                downloadSpeed: downloadSpeed,
                totalUpload: totalUpload,
                totalDownload: totalDownload,
                timestamp: new Date().toISOString()
              };

              console.log(`✅ Found PPPoE interface for customer ${customerUsername}: ${pppoeInterface.name} (index: ${pppoeInterface.index})`);
              console.log(`📊 Total Traffic: Upload: ${totalUpload} bytes / Download: ${totalDownload} bytes`);

            } catch (error) {
              console.error('❌ SNMP traffic counters fetch failed:', error.message);
              trafficData.interface = 'SNMP Traffic Error';
              trafficData.mode = 'error';
            }
          } else {
            console.log(`⚠️ No PPPoE interface found for ${customerUsername}`);
            trafficData.interface = 'PPPoE Not Found';
            trafficData.mode = 'snmp-no-pppoe';
            console.warn(`❌ No PPPoE interface found for customer ${customerUsername}`);
          }

        } catch (error) {
          console.error('❌ SNMP PPPoE traffic fetch failed:', error.message);
          trafficData.interface = 'SNMP Error';
          trafficData.mode = 'error';
        }
      }
    }

    res.json({
      success: true,
      data: { traffic: trafficData }
    });

  } catch (error) {
    console.error('❌ Error fetching customer traffic data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch traffic data'
    });
  }
});

module.exports = router;