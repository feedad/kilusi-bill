/**
 * Simple Customer API - No Complex JWT/CORS
 * For same-origin application with session-based auth
 */

const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const radiusDb = require('../../../config/radius-postgres');

// Simple in-memory session storage (use Redis for production)
const customerSessions = new Map();

/**
 * Helper: Get customer data with simple session validation
 */
async function getCustomerDataSimple(pppoeUsername) {
  try {
    // Get customer data
    const customerQuery = `
      SELECT
        c.*,
        p.name as package_name,
        p.speed as package_speed,
        p.price as package_price,
        r.name as region_name
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      LEFT JOIN regions r ON c.region_id = r.id
      WHERE c.pppoe_username = $1 AND c.status = 'active'
    `;

    const customerResult = await query(customerQuery, [pppoeUsername]);

    if (customerResult.rows.length === 0) {
      return { success: false, message: 'Pelanggan tidak ditemukan' };
    }

    const customer = customerResult.rows[0];

    // Get RADIUS status
    let radiusStatus = { connected: false };

    try {
      const radiusConnection = await radiusDb.getUserConnectionStatus(pppoeUsername);
      radiusStatus = {
        connected: radiusConnection.online || false,
        ipAddress: radiusConnection.ip_address,
        sessionStart: radiusConnection.session_start,
        nasIP: radiusConnection.nas_ip,
        macAddress: radiusConnection.mac_address,
        sessionTime: radiusConnection.session_time || 0
      };
    } catch (radiusError) {
      console.log('RADIUS check failed:', radiusError.message);
    }

    // Get billing info
    const billingQuery = `
      SELECT
        COUNT(*) as total_invoices,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_invoices,
        COUNT(CASE WHEN status = 'unpaid' THEN 1 END) as unpaid_invoices,
        COUNT(CASE WHEN status = 'unpaid' AND due_date < CURRENT_DATE THEN 1 END) as overdue_invoices,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END), 0) as total_paid
      FROM invoices
      WHERE customer_id = $1
    `;

    const billingResult = await query(billingQuery, [customer.id]);
    const billing = billingResult.rows[0];

    return {
      success: true,
      data: {
        customer: {
          id: customer.id,
          customer_id: customer.customer_id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
          package_name: customer.package_name,
          package_speed: customer.package_speed,
          package_price: customer.package_price,
          status: customer.status,
          pppoe_username: customer.pppoe_username,
          ssid: customer.ssid || `KilusiNet-${customer.pppoe_username}`,
          wifi_password: customer.wifi_password || '********',
          enable_isolir: customer.enable_isolir,
          expiry_date: customer.expiry_date
        },
        radiusStatus,
        billing: {
          totalInvoices: parseInt(billing.total_invoices),
          paidInvoices: parseInt(billing.paid_invoices),
          unpaidInvoices: parseInt(billing.unpaid_invoices),
          overdueInvoices: parseInt(billing.overdue_invoices),
          totalPaid: parseFloat(billing.total_paid)
        }
      }
    };

  } catch (error) {
    console.error('Simple customer data error:', error);
    return { success: false, message: 'Error mengambil data pelanggan' };
  }
}

/**
 * POST /api/v1/simple-customer/login
 * Simple login with username/password - create session
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username dan password diperlukan'
      });
    }

    // Find customer by PPPoE username
    const customerQuery = `
      SELECT * FROM customers
      WHERE pppoe_username = $1 AND status = 'active'
    `;

    const customerResult = await query(customerQuery, [username]);

    if (customerResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Username atau password salah'
      });
    }

    const customer = customerResult.rows[0];

    // Simple password check (you can use bcrypt for production)
    if (customer.wifi_password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Username atau password salah'
      });
    }

    // Create simple session
    const sessionId = Math.random().toString(36).substring(2, 15) +
                      Math.random().toString(36).substring(2, 15);

    customerSessions.set(sessionId, {
      customerId: customer.id,
      pppoeUsername: customer.pppoe_username,
      name: customer.name,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });

    res.json({
      success: true,
      message: 'Login berhasil',
      data: {
        sessionId,
        customer: {
          name: customer.name,
          username: customer.pppoe_username,
          package: customer.package_name
        }
      }
    });

  } catch (error) {
    console.error('Simple login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saat login'
    });
  }
});

/**
 * GET /api/v1/simple-customer/data/:sessionId
 * Get customer data with simple session
 */
router.get('/data/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Validate session
    const session = customerSessions.get(sessionId);

    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'Session tidak valid atau kadaluarsa'
      });
    }

    // Get customer data
    const result = await getCustomerDataSimple(session.pppoeUsername);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Simple data error:', error);
    res.status(500).json({
      success: false,
      message: 'Error mengambil data'
    });
  }
});

/**
 * GET /api/v1/simple-customer/quick-data/:username
 * Quick access to RADIUS data without auth (for internal use)
 */
router.get('/quick-data/:username', async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username diperlukan'
      });
    }

    // Get data without session (for development/internal tools)
    const result = await getCustomerDataSimple(username);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Quick data error:', error);
    res.status(500).json({
      success: false,
      message: 'Error mengambil data'
    });
  }
});

/**
 * POST /api/v1/simple-customer/logout
 */
router.post('/logout', (req, res) => {
  const { sessionId } = req.body;

  if (sessionId) {
    customerSessions.delete(sessionId);
  }

  res.json({
    success: true,
    message: 'Logout berhasil'
  });
});

/**
 * Session cleanup (run periodically)
 */
setInterval(() => {
  const now = new Date();
  for (const [sessionId, session] of customerSessions.entries()) {
    if (session.expiresAt < now) {
      customerSessions.delete(sessionId);
    }
  }
  console.log(`Cleaned ${customerSessions.size} active sessions`);
}, 60 * 60 * 1000); // Every hour

module.exports = router;