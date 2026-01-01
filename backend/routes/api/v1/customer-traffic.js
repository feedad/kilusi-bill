const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const jwt = require('jsonwebtoken');
const { validateSessionToken } = require('./customer-auth-nextjs');

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
    require('fs').appendFileSync('/tmp/auth-token.log', `[Traffic] ${new Date().toISOString()} Token: ${token}\n`);
    console.log('🔍 Traffic API Auth - Token extracted:', token.substring(0, 20) + '...');

    // 1. Try validating as Session Token (Next.js Frontend)
    try {
      const sessionValidation = await validateSessionToken(token);
      if (sessionValidation.valid && sessionValidation.customer) {
        console.log('✅ Traffic API - Session Token Validated for:', sessionValidation.customer.name);
        req.customer = sessionValidation.customer;

        // Ensure pppoe_username is present (required for traffic)
        // Note: pppoe_username column missing in DB, disabling logic
        if (!req.customer.pppoe_username) {
          // Logic disabled
        }

        return next();
      }
    } catch (sessionError) {
      console.log('Traffic APISession validation check failed (continuing to JWT):', sessionError.message);
    }

    // JWT token authentication only (for OTP login)
    try {
      console.log('🔍 Traffic API Auth - Verifying JWT token...');
      const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);

      if (decoded.type === 'customer') {
        console.log('🔍 Traffic API Auth - JWT decoded, customer ID:', decoded.customerId);
        // Get customer by ID from JWT
        const customerQuery = await query(`
          SELECT id, name, phone
          FROM customers
          WHERE id = $1
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
    // Note: nas_servers table missing, disabling logic
    /*const nasQuery = await query(`
      SELECT ip_address, snmp_community, snmp_port, snmp_version
      FROM nas_servers
      WHERE ip_address = $1 AND snmp_enabled = true AND snmp_community IS NOT NULL
    `, [req.customer.nas_ip || '172.22.10.125']);*/

    const nasQuery = { rows: [] }; // Mock empty result

    if (nasQuery.rows.length === 0) {
      console.log('⚠️ No NAS configuration found (or table missing)');
      trafficData.interface = 'NAS Not Found';
      trafficData.mode = 'error';
    } else {
      // Logic disabled
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