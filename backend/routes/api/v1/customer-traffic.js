const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const { logger } = require('../../../config/logger');
const jwt = require('jsonwebtoken');
const { validateSessionToken } = require('./customer-auth-nextjs');
const snmpMonitor = require('../../../config/snmp-monitor');

const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'your-customer-jwt-secret-key-change-in-production';

// In-memory cache for rate calculations
const trafficCache = new Map();

const verifyCustomer = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authorization token required' });
    }

    const token = authHeader.substring(7);

    // 1. Try validating as Session Token (Next.js Frontend)
    try {
      const sessionValidation = await validateSessionToken(token);
      if (sessionValidation.valid && sessionValidation.customer) {
        req.customer = sessionValidation.customer;
        return next();
      }
    } catch (sessionError) {
      // Continue to JWT
    }

    // 2. JWT token authentication (for OTP login)
    try {
      const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);
      if (decoded.type === 'customer') {
        const customerQuery = await query(`
          SELECT id, name, phone FROM customers WHERE id = $1
        `, [decoded.customerId]);
        if (customerQuery.rows.length > 0) {
          req.customer = customerQuery.rows[0];
          return next();
        }
        return res.status(401).json({ success: false, message: 'Customer not found' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    } catch (jwtError) {
      return res.status(401).json({ success: false, message: 'Invalid or expired JWT token' });
    }
  } catch (error) {
    logger.error('Customer auth error:', error);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

// GET /api/v1/customer-traffic/realtime - Get real-time traffic data via SNMP
router.get('/realtime', verifyCustomer, async (req, res) => {
  try {
    const pppoeUsername = req.customer.pppoe_username;
    if (!pppoeUsername) {
      return res.json({ success: true, data: { traffic: { bytes_in: 0, bytes_out: 0, interface: 'No PPPoE', mode: 'error' } } });
    }

    // 1. Find active RADIUS session to get NAS IP
    const session = await query(`
      SELECT nasipaddress FROM radacct
      WHERE username = $1 AND acctstoptime IS NULL
      ORDER BY acctstarttime DESC LIMIT 1
    `, [pppoeUsername]);

    const nasIp = session.rows[0]?.nasipaddress;
    if (!nasIp) {
      return res.json({ success: true, data: { traffic: { bytes_in: 0, bytes_out: 0, interface: 'Offline', mode: 'offline' } } });
    }

    // 2. Get NAS SNMP config
    const nasConfig = await query(`
      SELECT nasname, snmp_community, snmp_port, snmp_version, snmp_enabled
      FROM nas WHERE nasname = $1 AND snmp_enabled = true LIMIT 1
    `, [nasIp]);

    if (nasConfig.rows.length === 0) {
      return res.json({ success: true, data: { traffic: { bytes_in: 0, bytes_out: 0, interface: 'No SNMP', mode: 'error' } } });
    }

    const nas = nasConfig.rows[0];
    const snmpOpts = { host: nas.nasname, community: nas.snmp_community, port: nas.snmp_port, version: nas.snmp_version };

    // 3. List interfaces and find PPPoE interface matching username
    const interfaces = await snmpMonitor.listInterfaces(snmpOpts);
    const nameLower = pppoeUsername.toLowerCase();
    const iface = interfaces.find(i => i.name && i.name.toLowerCase() === nameLower);

    if (!iface) {
      return res.json({ success: true, data: { traffic: { bytes_in: 0, bytes_out: 0, interface: 'No PPPoE iface', mode: 'error' } } });
    }

    // 4. Get byte counters for this interface
    const traffic = await snmpMonitor.getInterfaceTraffic({
      ...snmpOpts, interfaceName: iface.index.toString()
    });

    // 5. Calculate rate from delta (cache)
    const now = Date.now();
    const cacheKey = `${nas.nasname}:${pppoeUsername}`;
    const prev = trafficCache.get(cacheKey);
    let uploadBps = 0, downloadBps = 0;

    if (prev) {
      const dt = (now - prev.time) / 1000;
      if (dt > 0) {
        const inDelta = traffic.total_in_bytes >= prev.bytes_in
          ? traffic.total_in_bytes - prev.bytes_in : 0;
        const outDelta = traffic.total_out_bytes >= prev.bytes_out
          ? traffic.total_out_bytes - prev.bytes_out : 0;
        downloadBps = Math.round(inDelta / dt);
        uploadBps = Math.round(outDelta / dt);
      }
    }

    trafficCache.set(cacheKey, { time: now, bytes_in: traffic.total_in_bytes, bytes_out: traffic.total_out_bytes });

    // Clean cache periodically
    if (trafficCache.size > 10000) trafficCache.clear();

    res.json({
      success: true,
      data: {
        traffic: {
          bytes_in: traffic.total_in_bytes || 0,
          bytes_out: traffic.total_out_bytes || 0,
          downloadSpeed: downloadBps,
          uploadSpeed: uploadBps,
          interface: iface.name || `pppoe-${iface.index}`,
          mode: 'snmp',
          pppoeTraffic: {
            totalDownload: traffic.total_in_bytes || 0,
            totalUpload: traffic.total_out_bytes || 0,
            index: iface.index,
            name: iface.name
          },
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching customer traffic:', error);
    res.json({ success: true, data: { traffic: { bytes_in: 0, bytes_out: 0, interface: 'Error', mode: 'error' } } });
  }
});

module.exports = router;
