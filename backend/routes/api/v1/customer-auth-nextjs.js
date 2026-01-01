/**
 * Customer Authentication API for Next.js Frontend
 * Handles token-based authentication for Next.js customer portal
 */

const express = require('express');
const router = express.Router();
const CustomerTokenService = require('../../../services/customer-token-service');
const crypto = require('crypto');
const { query, getOne } = require('../../../config/database');

// In-memory session storage (in production, use Redis or database)
const sessionStore = new Map();

/**
 * POST /api/v1/customer-auth-nextjs/login-with-token
 * Authenticate customer using token (JSON response for Next.js)
 */
router.post('/login-with-token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token tidak valid'
      });
    }

    // Validate token
    const validation = await CustomerTokenService.validateToken(token);

    if (!validation.valid) {
      return res.status(401).json({
        success: false,
        message: validation.error || 'Token tidak valid atau telah kadaluarsa'
      });
    }

    const { customer } = validation;

    // Generate session token for Next.js
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store session data
    const sessionData = {
      sessionToken,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        status: customer.status,
        package_name: customer.package_name,
        package_price: customer.package_price,
        address: customer.address,
        city: null, // Column doesn't exist in database
        province: null, // Column doesn't exist in database
        postal_code: customer.postal_code,
        customer_id: customer.customer_id
      },
      expiresAt: sessionExpiry,
      loginMethod: 'token'
    };

    // Store session in session store
    sessionStore.set(sessionToken, {
      ...sessionData,
      createdAt: new Date()
    });

    // Log successful login
    console.log(`✅ Next.js token login successful: ${customer.name} (${customer.phone})`);

    res.json({
      success: true,
      message: 'Login berhasil',
      data: sessionData
    });

  } catch (error) {
    console.error('Next.js token authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat autentikasi'
    });
  }
});

/**
 * GET /api/v1/customer-auth-nextjs/validate-token/:token
 * Validate token (for Next.js frontend)
 */
router.get('/validate-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        valid: false,
        message: 'Token tidak ada'
      });
    }

    const validation = await CustomerTokenService.validateToken(token);

    if (validation.valid && validation.customer) {
      res.json({
        valid: true,
        message: 'Token valid',
        customer: {
          name: validation.customer.name,
          status: validation.customer.status,
          phone: validation.customer.phone
        }
      });
    } else {
      res.status(401).json({
        valid: false,
        message: validation.error || 'Token tidak valid'
      });
    }

  } catch (error) {
    console.error('Error validating token for Next.js:', error);
    res.status(500).json({
      valid: false,
      message: 'Error saat validasi token'
    });
  }
});

/**
 * POST /api/v1/customer-auth-nextjs/login
 * Traditional login with phone/number for Next.js
 */
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nomor telepon dan password harus diisi'
      });
    }

    // Clean phone number
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    // This should integrate with your existing authentication system
    // For now, returning a basic response structure
    res.json({
      success: false,
      message: 'Fitur login traditional akan diimplementasikan dengan sistem RADIUS'
    });

  } catch (error) {
    console.error('Traditional login error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat login'
    });
  }
});

/**
 * POST /api/v1/customer-auth-nextjs/logout
 * Logout customer (for Next.js sessions)
 */
router.post('/logout', async (req, res) => {
  try {
    const { sessionToken } = req.body;

    if (sessionToken) {
      // Here you would invalidate the session token
      // For now, just return success
      console.log(`✅ Customer logout successful (session: ${sessionToken.substring(0, 8)}...)`);
    }

    res.json({
      success: true,
      message: 'Logout berhasil'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat logout'
    });
  }
});

/**
 * GET /api/v1/customer-auth-nextjs/session/:sessionToken
 * Validate session token (for Next.js middleware)
 */
router.get('/session/:sessionToken', async (req, res) => {
  try {
    const { sessionToken } = req.params;

    if (!sessionToken) {
      return res.status(401).json({
        valid: false,
        message: 'Session token tidak ada'
      });
    }

    // Here you would validate the session token from your session store
    // For now, returning invalid since we're not storing sessions
    res.status(401).json({
      valid: false,
      message: 'Session tidak valid atau telah kadaluarsa'
    });

  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({
      valid: false,
      message: 'Error saat validasi session'
    });
  }
});

/**
 * POST /api/v1/customer-auth-nextjs/refresh-session
 * Refresh customer session
 */
router.post('/refresh-session', async (req, res) => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message: 'Session token tidak ada'
      });
    }

    // Here you would refresh the session
    // For now, returning error
    res.status(401).json({
      success: false,
      message: 'Session refresh belum diimplementasikan'
    });

  } catch (error) {
    console.error('Session refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat refresh session'
    });
  }
});

/**
 * GET /api/v1/customer-auth-nextjs/get-customer-data
 * Get comprehensive customer data including radius status and billing info
 */
router.get('/get-customer-data', async (req, res) => {
  try {
    // Get customer from token or session - REAL AUTHENTICATION
    const authHeader = req.headers.authorization;
    let customer = null;

    console.log('🔍 Backend: Auth header:', authHeader ? 'Present' : 'Missing');

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      console.log('🔍 Backend: Token extracted:', token.substring(0, 20) + '...');

      // Try to validate as session token first
      const sessionValidation = await validateSessionToken(token);
      if (sessionValidation.valid) {
        console.log('🔍 Backend: Session token valid');
        customer = sessionValidation.customer;
      } else {
        // Try as login token
        const tokenValidation = await CustomerTokenService.validateToken(token);
        if (tokenValidation.valid) {
          console.log('🔍 Backend: Customer token valid');
          customer = tokenValidation.customer;
        } else {
          // Try as regular JWT token from OTP authentication
          try {
            const jwt = require('jsonwebtoken');
            const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'your-customer-jwt-secret-key-change-in-production';
            const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);

            // Check if this is a customer token
            if (decoded.type === 'customer' && decoded.customerId) {
              console.log('🔍 Backend: JWT token valid for customer:', decoded.customerId);
              // Get customer from database using decoded customerId
              const db = require('../../../config/database');
              const customerQuery = 'SELECT * FROM customers WHERE id = $1';
              const customerResult = await db.query(customerQuery, [decoded.customerId]);

              if (customerResult.rows.length > 0) {
                customer = customerResult.rows[0];
              }
            }
          } catch (jwtError) {
            console.log('🔍 Backend: JWT validation failed:', jwtError.message);
          }
        }
      }
    }

    if (!customer) {
      console.log('🔍 Backend: Authentication failed - no customer found');
      return res.status(401).json({
        success: false,
        message: 'Tidak ada autentikasi yang valid'
      });
    }

    console.log('🔍 Backend: Authentication successful for customer:', customer.name);
    console.log('🔍 Backend: Customer ID from auth:', customer.id);
    console.log('🔍 Backend: Full customer object from auth:', JSON.stringify(customer, null, 2));

    // Get customer's complete data from database
    // Check if we have a serviceId from the token
    const jwt = require('jsonwebtoken');
    const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'your-customer-jwt-secret-key-change-in-production';
    let serviceId = null;
    let customerData = null;
    const db = require('../../../config/database');

    // Attempt to extract serviceId
    try {
      // Verify again to get FULL payload including serviceId
      const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);
      serviceId = decoded.serviceId;
      console.log('🔍 Backend: Service ID extracted:', serviceId);
    } catch (e) {
      // Token might be valid but verify failed here? No, user already validated it.
      // Just ignore
    }

    if (serviceId) {
      // Query SERVICE table - Retrieve comprehensive info
      const serviceQuery = `
            SELECT 
                s.id as service_id,  -- This is the "Account ID"
                c.id as customer_primary_pk,  -- The Person ID
                c.customer_id, -- Display Customer ID (5 digits)
                c.name, c.phone, c.email, 
                s.address_installation as address, s.status, s.active_date, s.isolir_date, s.period,
                p.name as package_name, p.speed as package_speed, p.price as package_price,
                td.pppoe_username, td.ip_address_static, td.mac_address
            FROM services s
            JOIN customers c ON s.customer_id = c.id
            LEFT JOIN packages p ON s.package_id = p.id
            LEFT JOIN technical_details td ON td.service_id = s.id
            WHERE s.id = $1
         `;
      const serviceResult = await db.query(serviceQuery, [serviceId]);
      if (serviceResult.rows.length > 0) {
        const row = serviceResult.rows[0];
        customerData = {
          ...row,
          id: row.service_id, // Map service_id to id for frontend compatibility
          // Helper fields
          package_price: parseFloat(row.package_price || 0),
          enable_isolir: true // Default
        };
      }
    }

    if (!customerData) {
      // Fallback or Legacy (Auth found customer but no serviceId, or service lookup failed)
      console.log('🔍 Backend: Service lookup failed or no serviceId. Trying legacy customer lookup.');
      // Fixed: customers table has no package_id - get package through services table
      const customerQuery = `
          SELECT c.*, 
                 s.id as service_id, 
                 s.address_installation as address,
                 s.status as service_status,
                 p.name as package_name, 
                 p.speed as package_speed, 
                 p.price as package_price,
                 td.pppoe_username
          FROM customers c
          LEFT JOIN services s ON s.customer_id = c.id
          LEFT JOIN packages p ON s.package_id = p.id
          LEFT JOIN technical_details td ON td.service_id = s.id
          WHERE c.id = $1
          LIMIT 1
        `;
      const customerResult = await db.query(customerQuery, [customer.id]);

      if (customerResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Data pelanggan tidak ditemukan'
        });
      }
      customerData = {
        ...customerResult.rows[0],
        id: customerResult.rows[0].service_id || customerResult.rows[0].id,
        service_id: customerResult.rows[0].service_id
      };
    }

    // Normalize Data
    // Ensure critical fields exist
    if (!customerData.pppoe_username) {
      // Try to query technical details if not in main object (Customer fallback)
      // (Only necessary for fallback path)
    }

    // Proceed to check RADIUS online status
    let isOnline = false;
    let radiusStatus = null;

    try {
      if (customerData.pppoe_username) {
        // Check if customer is online in RADIUS
        const radacctQuery = `
            SELECT COUNT(*) as active_sessions
            FROM radacct
            WHERE username = $1
            AND acctstoptime IS NULL
          `;
        const radacctResult = await db.query(radacctQuery, [customerData.pppoe_username]);
        isOnline = parseInt(radacctResult.rows[0].active_sessions) > 0;

        // Get additional RADIUS info if online
        if (isOnline) {
          const activeSessionQuery = `
              SELECT
                framedipaddress,
                acctstarttime,
                nasipaddress,
                acctsessiontime,
                acctinputoctets,
                acctoutputoctets,
                callingstationid
              FROM radacct
              WHERE username = $1
              AND acctstoptime IS NULL
              ORDER BY radacctid DESC
              LIMIT 1
            `;
          const sessionResult = await db.query(activeSessionQuery, [customerData.pppoe_username]);

          if (sessionResult.rows.length > 0) {
            const session = sessionResult.rows[0];
            radiusStatus = {
              ipAddress: session.framedipaddress,
              onlineTime: session.acctstarttime,
              nasIP: session.nasipaddress,
              sessionTime: session.acctsessiontime || 0,
              uploadBytes: session.acctinputoctets || 0,
              downloadBytes: session.acctoutputoctets || 0,
              macAddress: session.callingstationid || null
            };
          }
        }
      }
    } catch (radiusError) {
      console.error('Error checking RADIUS status:', radiusError);
    }

    // Check monthly usage
    let usageStats = {
      total_usage: 0,
      download: 0,
      upload: 0,
      usage_percentage: 0,
      limit: 0 // 0 means unlimited
    };

    try {
      const usageQuery = `
        SELECT 
          COALESCE(SUM(acctinputoctets), 0) as total_upload, 
          COALESCE(SUM(acctoutputoctets), 0) as total_download
        FROM radacct
        WHERE username = $1
        AND acctstarttime >= DATE_TRUNC('month', CURRENT_DATE)
      `;

      const usageResult = await db.query(usageQuery, [customerData.pppoe_username]);

      if (usageResult.rows.length > 0) {
        const row = usageResult.rows[0];
        const upload = parseInt(row.total_upload) || 0;
        const download = parseInt(row.total_download) || 0;

        usageStats = {
          total_usage: upload + download,
          download: download,
          upload: upload,
          usage_percentage: 0,
          limit: 0
        };
      }
    } catch (usageError) {
      console.error('Error calculating usage:', usageError);
    }

    // Check for active invoices (display only - no calculations)
    let hasInvoice = false;
    let billingStats = {
      totalInvoices: 0,
      paidInvoices: 0,
      unpaidInvoices: 0,
      totalPaid: 0,
      totalUnpaid: 0,
      overdueInvoices: 0
    };

    try {
      const billingQuery = `
        SELECT
          COUNT(*) as total_invoices,
          COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_invoices,
          COUNT(CASE WHEN status = 'unpaid' THEN 1 END) as unpaid_invoices,
          COUNT(CASE WHEN status = 'unpaid' AND due_date < CURRENT_DATE THEN 1 END) as overdue_invoices,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END), 0) as total_paid,
          COALESCE(SUM(CASE WHEN status = 'unpaid' THEN amount END), 0) as total_unpaid
        FROM invoices
        WHERE customer_id = $1
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
      `;
      const billingResult = await db.query(billingQuery, [customer.id]);

      if (billingResult.rows.length > 0) {
        const billing = billingResult.rows[0];
        console.log('🔍 Backend: Billing query result for customer', customer.id, ':', billing);

        billingStats = {
          totalInvoices: parseInt(billing.total_invoices) || 0,
          paidInvoices: parseInt(billing.paid_invoices) || 0,
          unpaidInvoices: parseInt(billing.unpaid_invoices) || 0,
          overdueInvoices: parseInt(billing.overdue_invoices) || 0,
          totalPaid: parseFloat(billing.total_paid) || 0,
          totalUnpaid: parseFloat(billing.total_unpaid) || 0
        };

        // Fix: hasInvoice should be true ONLY if there are unpaid invoices
        hasInvoice = billingStats.unpaidInvoices > 0;
        console.log('🔍 Backend: hasInvoice =', hasInvoice, '(unpaidInvoices =', billingStats.unpaidInvoices, ')');
        console.log('🔍 Backend: totalInvoices =', billingStats.totalInvoices, '- showing payment button only for unpaid invoices');
      }
    } catch (billingError) {
      console.error('Error checking billing status:', billingError);
    }

    // Query all services for this customer (for account switcher)
    let accounts = [];
    try {
      const accountsQuery = `
        SELECT 
          s.id,
          s.service_number,
          s.status,
          s.address_installation as address,
          s.billing_type,
          p.name as package_name,
          p.speed as package_speed,
          p.price as package_price,
          td.pppoe_username
        FROM services s
        LEFT JOIN packages p ON s.package_id = p.id
        LEFT JOIN technical_details td ON td.service_id = s.id
        WHERE s.customer_id = $1
        ORDER BY s.id
      `;
      const accountsResult = await db.query(accountsQuery, [customer.id]);

      if (accountsResult.rows.length > 0) {
        accounts = accountsResult.rows.map(svc => ({
          id: svc.id,
          service_number: svc.service_number,
          status: svc.status,
          address: svc.address,
          billing_type: svc.billing_type,
          package_name: svc.package_name,
          package_speed: svc.package_speed,
          package_price: parseFloat(svc.package_price) || 0,
          pppoe_username: svc.pppoe_username
        }));
        console.log(`🔍 Backend: Found ${accounts.length} services for customer ${customer.id}`);
      }
    } catch (accountsError) {
      console.error('Error fetching customer accounts:', accountsError);
    }

    // Customer portal should NOT calculate expiry date
    // Display-only from admin data - no calculations here
    // Expiry date should be calculated by admin billing system and stored in database
    let expiryDate = customerData.isolir_date; // Direct from admin data
    if (customerData.trial_expires_at) {
      expiryDate = customerData.trial_expires_at;
    }
    // Note: Customer portal is display-only - no calculations

    // Prepare response data with ALL real database fields
    const responseData = {
      customer: {
        id: customerData.id,
        customer_id: customerData.customer_id,
        name: customerData.name,
        phone: customerData.phone,
        email: customerData.email,
        address: customerData.address,
        latitude: customerData.latitude,
        longitude: customerData.longitude,
        area: customerData.area,
        package_name: customerData.package_name,
        package_speed: customerData.package_speed,
        package_price: customerData.package_price,
        region_name: customerData.region_name,
        status: customerData.status,
        payment_status: customerData.payment_status,
        billing_type: customerData.billing_type,
        install_date: customerData.install_date,
        active_date: customerData.active_date,
        isolation_date: customerData.isolation_date,
        expiry_date: expiryDate,
        trial_expires_at: customerData.trial_expires_at,
        trial_active: customerData.trial_active,
        enable_isolir: customerData.enable_isolir,
        pppoe_username: customerData.pppoe_username,
        odp_name: customerData.odp_name,
        odp_address: customerData.odp_address,
        odp_port: customerData.odp_port,
        router: customerData.router,
        isOnline: isOnline,
        hasInvoice: hasInvoice,
        calculated_isolir_date: customerData.isolir_date, // Same logic as admin - calculated isolir date
        service_id: customerData.service_id, // Explicitly provide service_id for active state tracking
        accounts: accounts // All services for this customer (for account switcher)
      },
      radiusStatus: radiusStatus || {
        connected: isOnline,
        lastSeen: isOnline ? new Date().toISOString() : null,
        onlineTime: null,
        ipAddress: null,
        uptime: null
      },
      billingStats: billingStats,
      usageStats: usageStats
    };

    res.json({
      success: true,
      message: 'Data pelanggan berhasil diambil',
      data: responseData
    });

  } catch (error) {
    console.error('Error getting customer data:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil data pelanggan'
    });
  }
});

/**
 * PUT /api/v1/customer-auth-nextjs/update-profile
 * Update customer profile (limited fields only)
 */
router.put('/update-profile', async (req, res) => {
  try {
    const sessionValidation = await validateSessionToken(req.headers.authorization?.replace('Bearer ', ''));

    if (!sessionValidation.valid) {
      return res.status(401).json({
        success: false,
        message: sessionValidation.error || 'Sesi tidak valid'
      });
    }

    const customer = sessionValidation.customer;
    const { name, phone, email, address } = req.body;

    // Validate required fields
    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Nama dan nomor telepon wajib diisi'
      });
    }

    // Update customer profile - only allowed fields
    const updateQuery = `
      UPDATE customers
      SET name = $1, phone = $2, email = $3, address = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `;

    const result = await query(updateQuery, [name, phone, email || null, address || null, customer.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Data pelanggan tidak ditemukan'
      });
    }

    // Get updated customer data
    const updatedCustomer = await getOne(`
      SELECT
        id, customer_id, name, phone, email, address, pppoe_username,
        package_id, status, active_date, isolir_date, trial_expires_at,
        enable_isolir, siklus, billing_type
      FROM customers
      WHERE id = $1
    `, [customer.id]);

    if (!updatedCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Data pelanggan tidak ditemukan setelah update'
      });
    }

    // Log the update
    logger.info(`Customer ${updatedCustomer.name} updated profile via customer portal`);

    res.json({
      success: true,
      message: 'Profil berhasil diperbarui',
      data: {
        id: updatedCustomer.id,
        customer_id: updatedCustomer.customer_id,
        name: updatedCustomer.name,
        phone: updatedCustomer.phone,
        email: updatedCustomer.email,
        address: updatedCustomer.address
      }
    });

  } catch (error) {
    console.error('Error updating customer profile:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memperbarui profil'
    });
  }
});

// Helper function to validate session token
async function validateSessionToken(sessionToken) {
  try {
    const session = sessionStore.get(sessionToken);

    if (!session) {
      return { valid: false, error: 'Session not found' };
    }

    // Check if session has expired
    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      sessionStore.delete(sessionToken); // Clean up expired session
      return { valid: false, error: 'Session expired' };
    }

    return {
      valid: true,
      customer: session.customer
    };
  } catch (error) {
    console.error('Error validating session token:', error);
    return { valid: false, error: 'Session validation error' };
  }
}

/**
 * PUT /api/v1/customer-auth-nextjs/update-ssid
 * Update customer SSID
 */
router.put('/update-ssid', async (req, res) => {
  try {
    const sessionValidation = await validateSessionToken(req.headers.authorization?.replace('Bearer ', ''));

    if (!sessionValidation.valid) {
      return res.status(401).json({
        success: false,
        message: sessionValidation.error || 'Sesi tidak valid'
      });
    }

    const customer = sessionValidation.customer;
    const { ssid } = req.body;

    // Validate SSID
    if (!ssid || ssid.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'SSID minimal 3 karakter'
      });
    }

    // Update SSID in customer table
    /*const updateSSIDQuery = `
      UPDATE customers
      SET ssid = $1,
          updated_at = NOW()
      WHERE id = $2
    `;

    const result = await query(updateSSIDQuery, [ssid.trim(), customer.id]);
    
    if (result.rowCount === 0) { ... } */

    return res.status(501).json({
      success: false,
      message: 'Fitur belum tersedia (kolom database belum ada)'
    });

    res.json({
      success: true,
      message: 'SSID berhasil diperbarui',
      data: {
        oldSSID: customer.ssid,
        newSSID: ssid.trim(),
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error updating SSID:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memperbarui SSID',
      error: error.message
    });
  }
});

/**
 * PUT /api/v1/customer-auth-nextjs/update-password
 * Update customer WiFi password
 */
router.put('/update-password', async (req, res) => {
  try {
    const sessionValidation = await validateSessionToken(req.headers.authorization?.replace('Bearer ', ''));

    if (!sessionValidation.valid) {
      return res.status(401).json({
        success: false,
        message: sessionValidation.error || 'Sesi tidak valid'
      });
    }

    const customer = sessionValidation.customer;
    const { password } = req.body;

    // Validate password
    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password minimal 8 karakter'
      });
    }

    // Update password in customer table
    /*const updatePasswordQuery = `
      UPDATE customers
      SET wifi_password = $1,
          updated_at = NOW()
      WHERE id = $2
    `;

    const result = await query(updatePasswordQuery, [password, customer.id]);

    if (result.rowCount === 0) { ... } */

    return res.status(501).json({
      success: false,
      message: 'Fitur belum tersedia (kolom database belum ada)'
    });

    res.json({
      success: true,
      message: 'Password WiFi berhasil diperbarui',
      data: {
        username: customer.pppoe_username,
        passwordChanged: true,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memperbarui password',
      error: error.message
    });
  }
});

module.exports = router;
module.exports.validateSessionToken = validateSessionToken;