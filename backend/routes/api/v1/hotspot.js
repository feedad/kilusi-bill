/**
 * Hotspot API Routes
 * Public API for hotspot voucher purchase and management
 */

const express = require('express');
const router = express.Router();
const VoucherService = require('../../../services/voucher-service');
const PaymentGatewayService = require('../../../config/paymentGateway');
const { query, getOne } = require('../../../config/database');
const { logger } = require('../../../config/logger');
const { jwtAuth } = require('../../../middleware/jwtAuth');
const radiusSync = require('../../../config/radius-sync');

// Helper function to format duration from RADIUS acctsessiontime format (seconds)
function formatDuration(seconds) {
  if (!seconds || seconds === '0') return '0s';

  const totalSecs = parseInt(seconds);
  if (isNaN(totalSecs)) return '0s';

  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0) parts.push(`${secs}s`);

  return parts.join(' ') || '0s';
}

/**
 * GET /api/v1/hotspot/packages
 * Get available hotspot packages
 */
router.get('/packages', async (req, res) => {
  try {
    const result = await query(`
      SELECT id, name_display as name, description, price, duration_hours, speed_limit, mikrotik_profile as server_profile
      FROM hotspot_packages
      WHERE is_active = true
      ORDER BY display_order ASC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Error fetching hotspot packages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch packages'
    });
  }
});

/**
 * POST /api/v1/hotspot/purchase
 * Create voucher purchase order
 */
router.post('/purchase', async (req, res) => {
  try {
    const { package_id, customer_name, customer_phone, customer_email } = req.body;

    // Validation
    if (!package_id || !customer_name || !customer_phone) {
      return res.status(400).json({
        success: false,
        message: 'Package, name, and phone are required'
      });
    }

    // Normalize phone number
    let phone = customer_phone.replace(/\D/g, '');
    if (phone.startsWith('0')) {
      phone = '62' + phone.substring(1);
    }

    // Create voucher order
    const voucher = await VoucherService.createPurchaseOrder({
      packageId: package_id,
      customerName: customer_name,
      customerPhone: phone,
      customerEmail: customer_email
    });

    // Get package info for payment
    const pkg = await getOne(
      'SELECT * FROM hotspot_packages WHERE id = $1',
      [package_id]
    );

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    // Create payment via Tripay (QRIS ONLY for hotspot)
    const gateway = PaymentGatewayService.getGateway('tripay');

    // Get portal URL from environment or settings
    const portalUrl = process.env.PORTAL_URL || 'http://localhost:3000';

    const payment = await gateway.createPaymentWithMethod({
      order_id: `HS-${voucher.code}`,
      invoice_number: voucher.code,
      amount: voucher.amount,
      customer_name: customer_name,
      customer_phone: phone,
      package_name: pkg.name_display,
      callback_url: `${portalUrl}/api/v1/hotspot/webhook/tripay`,
      return_url: `${portalUrl}/hotspot/success?code=${voucher.code}`
    }, 'QRIS', 'voucher');  // Hardcoded QRIS - hotspot only accepts QRIS

    // Update voucher with merchant_ref
    await query(
      'UPDATE vouchers SET merchant_ref = $1 WHERE id = $2',
      [payment.order_id, voucher.id]
    );

    logger.info(`✅ Hotspot purchase created: ${voucher.code} - ${pkg.name_display} - Rp ${voucher.amount}`);

    res.json({
      success: true,
      data: {
        voucher_code: voucher.code,
        amount: voucher.amount,
        payment_url: payment.payment_url,
        qr_code: payment.payment_url // Tripay returns QR URL
      }
    });
  } catch (error) {
    logger.error('Hotspot purchase error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create purchase order'
    });
  }
});

/**
 * POST /api/v1/hotspot/webhook/:gateway
 * Payment webhook handler
 */
router.post('/webhook/:gateway', async (req, res) => {
  try {
    const { gateway: gatewayName } = req.params;
    const payload = req.body;

    logger.info(`📨 Received ${gatewayName} webhook for hotspot`);

    // Process webhook
    const gatewayService = PaymentGatewayService.getGateway(gatewayName);
    const result = await gatewayService.handleWebhook(payload, req.headers);

    // Find voucher by merchant_ref
    const voucher = await getOne(
      'SELECT * FROM vouchers WHERE merchant_ref = $1',
      [result.order_id]
    );

    if (!voucher) {
      logger.warn(`Voucher not found for merchant_ref: ${result.order_id}`);
      return res.json({ success: true }); // Return success to avoid webhook retries
    }

    logger.info(`Processing webhook for voucher: ${voucher.code}, status: ${result.status}`);

    if (result.status === 'success' && voucher.payment_status === 'unpaid') {
      // Activate voucher
      await VoucherService.activateVoucher(voucher.code, result.reference);
      logger.info(`✅ Voucher activated via webhook: ${voucher.code}`);
    } else if (result.status === 'failed') {
      // Mark payment as failed
      await query(
        'UPDATE vouchers SET payment_status = $1 WHERE code = $2',
        ['failed', voucher.code]
      );
      logger.info(`❌ Voucher payment failed: ${voucher.code}`);
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Hotspot webhook error:', error);
    // Still return success to avoid webhook retries
    res.json({ success: true });
  }
});

/**
 * GET /api/v1/hotspot/status/:code
 * Check voucher status
 */
router.get('/status/:code', async (req, res) => {
  try {
    const voucher = await VoucherService.getVoucherByCode(req.params.code);

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found'
      });
    }

    res.json({
      success: true,
      data: voucher
    });
  } catch (error) {
    logger.error('Voucher status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check status'
    });
  }
});

/**
 * POST /api/v1/hotspot/validate
 * Validate voucher for login
 * This can be used by Mikrotik/RADIUS for external authentication
 */
router.post('/validate', async (req, res) => {
  try {
    const { code, password } = req.body;

    if (!code || !password) {
      return res.status(400).json({
        success: false,
        message: 'Code and password are required'
      });
    }

    const voucher = await VoucherService.validateVoucher(code, password);

    if (!voucher) {
      return res.status(401).json({
        success: false,
        message: 'Invalid voucher'
      });
    }

    res.json({
      success: true,
      data: {
        username: voucher.username,
        profile: voucher.mikrotik_profile,
        speed_limit: voucher.speed_limit,
        session_timeout: voucher.duration_hours * 3600
      }
    });
  } catch (error) {
    logger.error('Voucher validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Validation failed'
    });
  }
});

/**
 * POST /api/v1/hotspot/login
 * Record voucher login (for tracking)
 */
router.post('/login', async (req, res) => {
  try {
    const { code, username, ip_address, mac_address } = req.body;

    await VoucherService.markAsUsed(code, username, ip_address, mac_address);

    res.json({
      success: true,
      message: 'Login recorded'
    });
  } catch (error) {
    logger.error('Hotspot login recording error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record login'
    });
  }
});

// ============================================================================
// ADMIN ENDPOINTS (Require JWT authentication)
// These routes are for admin management of hotspot vouchers and packages
// ============================================================================

/**
 * GET /api/v1/admin/hotspot/vouchers
 * Get all vouchers with filtering (Admin only)
 */
router.get('/admin/hotspot/vouchers', jwtAuth, async (req, res) => {
  try {
    const { status, payment_status, limit = 100, offset = 0 } = req.query;

    let queryText = `
      SELECT id, code, customer_name, customer_phone, amount, duration_hours, speed_limit,
             status, payment_status, created_at, paid_at, activated_at, expires_at, used_at
      FROM vouchers
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      queryText += ' AND status = $' + (params.length + 1);
      params.push(status);
    }

    if (payment_status) {
      queryText += ' AND payment_status = $' + (params.length + 1);
      params.push(payment_status);
    }

    queryText += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const vouchersResult = await query(queryText, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM vouchers WHERE 1=1';
    const countParams = [];
    if (status) {
      countQuery += ' AND status = $' + (countParams.length + 1);
      countParams.push(status);
    }
    if (payment_status) {
      countQuery += ' AND payment_status = $' + (countParams.length + 1);
      countParams.push(payment_status);
    }

    const countResult = await getOne(countQuery, countParams);

    res.json({
      success: true,
      data: vouchersResult.rows,
      pagination: {
        total: parseInt(countResult.total),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    logger.error('Error fetching admin vouchers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vouchers'
    });
  }
});

/**
 * GET /api/v1/admin/hotspot/vouchers/:code
 * Get detailed voucher information
 */
router.get('/admin/hotspot/vouchers/:code', jwtAuth, async (req, res) => {
  try {
    const voucher = await getOne(`
      SELECT v.*, hp.name_display as package_name, hp.name as package_internal_name
      FROM vouchers v
      LEFT JOIN hotspot_packages hp ON v.package_id = hp.id
      WHERE v.code = $1
    `, [req.params.code]);

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found'
      });
    }

    // Get usage history if any
    const usageHistory = await query(`
      SELECT * FROM voucher_usage
      WHERE voucher_code = $1
      ORDER BY login_time DESC
      LIMIT 10
    `, [req.params.code]);

    res.json({
      success: true,
      data: {
        ...voucher,
        usage_history: usageHistory
      }
    });
  } catch (error) {
    logger.error('Error fetching voucher details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voucher details'
    });
  }
});

/**
 * POST /api/v1/admin/hotspot/vouchers/generate
 * Manually generate a voucher (Admin only)
 */
router.post('/admin/hotspot/vouchers/generate', jwtAuth, async (req, res) => {
  try {
    const { package_id, customer_name, customer_phone, customer_email, notes } = req.body;

    if (!package_id || !customer_name || !customer_phone) {
      return res.status(400).json({
        success: false,
        message: 'Package, name, and phone are required'
      });
    }

    // Create voucher
    const voucher = await VoucherService.createPurchaseOrder({
      packageId: package_id,
      customerName: customer_name,
      customerPhone: customer_phone,
      customerEmail: customer_email
    });

    // Add notes if provided
    if (notes) {
      await query('UPDATE vouchers SET notes = $1 WHERE id = $2', [notes, voucher.id]);
    }

    logger.info(`✅ Manual voucher generated: ${voucher.code} by admin`);

    res.json({
      success: true,
      data: voucher,
      message: 'Voucher generated successfully'
    });
  } catch (error) {
    logger.error('Error generating manual voucher:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate voucher'
    });
  }
});

/**
 * PUT /api/v1/admin/hotspot/vouchers/:code
 * Update voucher (suspend/extend/etc)
 */
router.put('/admin/hotspot/vouchers/:code', jwtAuth, async (req, res) => {
  try {
    const { status, expires_at, notes } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (expires_at) {
      updates.push(`expires_at = $${paramIndex++}`);
      params.push(expires_at);
    }

    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    params.push(req.params.code);

    const voucher = await getOne(`
      UPDATE vouchers
      SET ${updates.join(', ')}
      WHERE code = $${paramIndex}
      RETURNING *
    `, params);

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found'
      });
    }

    logger.info(`✅ Voucher updated: ${voucher.code}`);

    res.json({
      success: true,
      data: voucher,
      message: 'Voucher updated successfully'
    });
  } catch (error) {
    logger.error('Error updating voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update voucher'
    });
  }
});

/**
 * DELETE /api/v1/admin/hotspot/vouchers/:code
 * Delete/suspend a voucher
 */
router.delete('/admin/hotspot/vouchers/:code', jwtAuth, async (req, res) => {
  try {
    const voucher = await getOne('SELECT * FROM vouchers WHERE code = $1', [req.params.code]);

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found'
      });
    }

    // Delete from RADIUS if active
    if (voucher.status === 'active') {
      await radiusSync.deleteVoucherUser(voucher.username);
    }

    // Delete voucher
    await query('DELETE FROM vouchers WHERE code = $1', [req.params.code]);

    logger.info(`✅ Voucher deleted: ${req.params.code}`);

    res.json({
      success: true,
      message: 'Voucher deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete voucher'
    });
  }
});

/**
 * GET /api/v1/admin/hotspot/packages
 * Get all packages (including inactive) - Admin only
 */
router.get('/admin/hotspot/packages', jwtAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM hotspot_packages
      ORDER BY display_order ASC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Error fetching admin packages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch packages'
    });
  }
});

/**
 * POST /api/v1/admin/hotspot/packages
 * Create a new package - Admin only
 */
router.post('/admin/hotspot/packages', jwtAuth, async (req, res) => {
  try {
    const { name, name_display, description, price, duration_hours, speed_limit, mikrotik_profile, server_profile, display_order } = req.body;
    const finalProfile = server_profile || mikrotik_profile || 'default';

    if (!name || !name_display || !price || !duration_hours) {
      return res.status(400).json({
        success: false,
        message: 'Name, display name, price, and duration are required'
      });
    }

    const pkg = await getOne(`
      INSERT INTO hotspot_packages (name, name_display, description, price, duration_hours, speed_limit, mikrotik_profile, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [name, name_display, description, price, duration_hours, speed_limit, finalProfile, display_order || 0]);

    logger.info(`✅ Hotspot package created: ${name}`);

    res.json({
      success: true,
      data: pkg,
      message: 'Package created successfully'
    });
  } catch (error) {
    logger.error('Error creating package:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create package'
    });
  }
});

/**
 * PUT /api/v1/admin/hotspot/packages/:id
 * Update a package - Admin only
 */
router.put('/admin/hotspot/packages/:id', jwtAuth, async (req, res) => {
  try {
    const { name, name_display, description, price, duration_hours, speed_limit, mikrotik_profile, server_profile, display_order, is_active } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (name_display !== undefined) {
      updates.push(`name_display = $${paramIndex++}`);
      params.push(name_display);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    if (price !== undefined) {
      updates.push(`price = $${paramIndex++}`);
      params.push(price);
    }
    if (duration_hours !== undefined) {
      updates.push(`duration_hours = $${paramIndex++}`);
      params.push(duration_hours);
    }
    if (speed_limit !== undefined) {
      updates.push(`speed_limit = $${paramIndex++}`);
      params.push(speed_limit);
    }
    if (mikrotik_profile !== undefined) {
      updates.push(`mikrotik_profile = $${paramIndex++}`);
      params.push(mikrotik_profile);
    }
    if (server_profile !== undefined) {
      updates.push(`mikrotik_profile = $${paramIndex++}`);
      params.push(server_profile);
    }
    if (display_order !== undefined) {
      updates.push(`display_order = $${paramIndex++}`);
      params.push(display_order);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }
    updates.push(`updated_at = NOW()`);

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    params.push(req.params.id);

    const pkg = await getOne(`
      UPDATE hotspot_packages
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, params);

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    logger.info(`✅ Hotspot package updated: ${pkg.name}`);

    res.json({
      success: true,
      data: pkg,
      message: 'Package updated successfully'
    });
  } catch (error) {
    logger.error('Error updating package:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update package'
    });
  }
});

/**
 * DELETE /api/v1/admin/hotspot/packages/:id
 * Delete a package - Admin only
 */
router.delete('/admin/hotspot/packages/:id', jwtAuth, async (req, res) => {
  try {
    // Check if package is being used
    const usage = await getOne(
      'SELECT COUNT(*) as count FROM vouchers WHERE package_id = $1',
      [req.params.id]
    );

    if (parseInt(usage.count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete package that has been used'
      });
    }

    await query('DELETE FROM hotspot_packages WHERE id = $1', [req.params.id]);

    logger.info(`✅ Hotspot package deleted: ${req.params.id}`);

    res.json({
      success: true,
      message: 'Package deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting package:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete package'
    });
  }
});

/**
 * GET /api/v1/admin/hotspot/stats
 * Get hotspot statistics - Admin only
 */
router.get('/admin/hotspot/stats', jwtAuth, async (req, res) => {
  try {
    const stats = await getOne(`
      SELECT
        COUNT(*) as total_vouchers,
        COUNT(*) FILTER (WHERE status = 'active') as active_vouchers,
        COUNT(*) FILTER (WHERE status = 'used') as used_vouchers,
        COUNT(*) FILTER (WHERE status = 'expired') as expired_vouchers,
        COUNT(*) FILTER (WHERE payment_status = 'paid') as paid_vouchers,
        COALESCE(SUM(amount) FILTER (WHERE payment_status = 'paid'), 0) as total_revenue
      FROM vouchers
    `);

    const todayStats = await getOne(`
      SELECT
        COUNT(*) as today_vouchers,
        COALESCE(SUM(amount) FILTER (WHERE payment_status = 'paid'), 0) as today_revenue
      FROM vouchers
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    const packageStats = await query(`
      SELECT
        hp.name_display,
        hp.price,
        COUNT(v.id) as total_sold,
        COALESCE(SUM(v.amount) FILTER (WHERE v.payment_status = 'paid'), 0) as revenue
      FROM hotspot_packages hp
      LEFT JOIN vouchers v ON hp.id = v.package_id
      GROUP BY hp.id, hp.name_display, hp.price
      ORDER BY total_sold DESC
    `);

    res.json({
      success: true,
      data: {
        ...stats,
        ...todayStats,
        top_packages: packageStats.rows
      }
    });
  } catch (error) {
    logger.error('Error fetching hotspot stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

/**
 * GET /api/v1/admin/hotspot/stats/sales
 * Get detailed sales statistics with trends - Admin only
 */
router.get('/admin/hotspot/stats/sales', jwtAuth, async (req, res) => {
  try {
    const { period = '7days', package_id } = req.query;

    let startDate = new Date();
    let groupBy = 'day';

    switch (period) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        groupBy = 'hour';
        break;
      case '7days':
        startDate.setDate(startDate.getDate() - 7);
        groupBy = 'day';
        break;
      case '30days':
        startDate.setDate(startDate.getDate() - 30);
        groupBy = 'day';
        break;
      case '90days':
        startDate.setDate(startDate.getDate() - 90);
        groupBy = 'day';
        break;
      case '12months':
        startDate.setMonth(startDate.getMonth() - 12);
        groupBy = 'month';
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Sales trend data
    let dateFormat = '';
    switch (groupBy) {
      case 'hour':
        dateFormat = "YYYY-MM-DD HH24:00";
        break;
      case 'day':
        dateFormat = "YYYY-MM-DD";
        break;
      case 'month':
        dateFormat = "YYYY-MM";
        break;
    }

    let salesQuery = `
      SELECT
        TO_CHAR(created_at, '${dateFormat}') as date_label,
        COUNT(*) as total_sold,
        COUNT(*) FILTER (WHERE payment_status = 'paid') as paid_sold,
        COALESCE(SUM(amount) FILTER (WHERE payment_status = 'paid'), 0) as revenue
      FROM vouchers
      WHERE created_at >= $1
    `;

    const queryParams = [startDate];

    if (package_id) {
      salesQuery += ` AND package_id = $2`;
      queryParams.push(package_id);
    }

    salesQuery += ` GROUP BY date_label ORDER BY date_label`;

    const salesTrend = await query(salesQuery, queryParams);

    // Summary stats for the period
    const periodStats = await getOne(`
      SELECT
        COUNT(*) as total_sold,
        COUNT(*) FILTER (WHERE payment_status = 'paid') as paid_sold,
        COALESCE(SUM(amount) FILTER (WHERE payment_status = 'paid'), 0) as revenue,
        COUNT(*) FILTER (WHERE payment_status = 'unpaid') as pending_payment
      FROM vouchers
      WHERE created_at >= $1
      ${package_id ? 'AND package_id = $2' : ''}
    `, queryParams);

    // Peak sales time
    const peakSales = await getOne(`
      SELECT
        TO_CHAR(created_at, 'HH24:00') as hour,
        COUNT(*) as sales_count
      FROM vouchers
      WHERE DATE(created_at) = CURRENT_DATE
      GROUP BY hour
      ORDER BY sales_count DESC
      LIMIT 1
    `);

    res.json({
      success: true,
      data: {
        sales_trend: salesTrend.rows,
        period_stats: periodStats,
        peak_hour: peakSales
      }
    });
  } catch (error) {
    logger.error('Error fetching sales stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales statistics'
    });
  }
});

/**
 * GET /api/v1/admin/hotspot/active-users
 * Get currently active hotspot users from RADIUS accounting - Admin only
 */
router.get('/admin/hotspot/active-users', jwtAuth, async (req, res) => {
  try {
    // Get active sessions from RADIUS accounting - HOTSPOT ONLY
    // Filter: Only users with username starting with 'HS-' (hotspot vouchers)
    const activeUsers = await query(`
      SELECT
        radacct.username,
        radacct.nasipaddress as mikrotik_ip,
        radacct.calledstationid as hotspot_name,
        radacct.acctstarttime as login_time,
        radacct.acctsessiontime as session_duration,
        radacct.acctinputoctets as download_bytes,
        radacct.acctoutputoctets as upload_bytes,
        radacct.acctterminatecause as terminate_cause,
        v.code as voucher_code,
        v.customer_name,
        v.customer_phone,
        v.expires_at
      FROM radacct
      LEFT JOIN vouchers v ON radacct.username = v.username
      WHERE radacct.acctstoptime IS NULL
        AND radacct.username LIKE 'HS-%'
      ORDER BY radacct.acctstarttime DESC
    `);

    // Get connection info for each user
    const usersWithInfo = activeUsers.rows.map(user => ({
      ...user,
      session_duration_formatted: formatDuration(user.acctsessiontime || '0'),
      download_mb: Math.round((user.download_bytes || 0) / 1024 / 1024 * 100) / 100,
      upload_mb: Math.round((user.upload_bytes || 0) / 1024 / 1024 * 100) / 100,
      total_mb: Math.round(((user.download_bytes || 0) + (user.upload_bytes || 0)) / 1024 / 1024 * 100) / 100,
      is_expired: user.expires_at ? new Date(user.expires_at) < new Date() : false
    }));

    res.json({
      success: true,
      data: {
        total_users: usersWithInfo.length,
        active_users: usersWithInfo
      }
    });
  } catch (error) {
    logger.error('Error fetching active users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active users'
    });
  }
});

/**
 * POST /api/v1/admin/hotspot/active-users/:username/kick
 * Kick/disconnect a hotspot user - Admin only
 */
router.post('/admin/hotspot/active-users/:username/kick', jwtAuth, async (req, res) => {
  try {
    const { username } = req.params;
    const { reason } = req.body;

    // Import Mikrotik functions
    const { deleteHotspotUser } = require('../../config/mikrotik2');

    // Kick user from Mikrotik hotspot
    try {
      await deleteHotspotUser(username);
      logger.info(`🦵 Kicked hotspot user: ${username}${reason ? ` - Reason: ${reason}` : ''}`);
    } catch (kickError) {
      logger.warn(`Failed to kick user from Mikrotik: ${kickError.message}`);
      // Continue anyway - user might have already logged off
    }

    // Update voucher if exists
    await query(`
      UPDATE vouchers
      SET status = 'used',
          used_at = NOW(),
          notes = COALESCE(notes, '') || 'Kicked by admin'
    WHERE username = $1 AND status = 'active'
    `, [username]);

    res.json({
      success: true,
      message: `User ${username} kicked successfully`
    });
  } catch (error) {
    logger.error('Error kicking user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to kick user'
    });
  }
});

/**
 * POST /api/v1/admin/hotspot/cleanup-expired
 * Cleanup expired vouchers - Admin only
 */
router.post('/admin/hotspot/cleanup-expired', jwtAuth, async (req, res) => {
  try {
    const { delete_from_radius = true } = req.body;

    // Find and mark expired vouchers
    const expiredVouchers = await query(`
      UPDATE vouchers
      SET status = 'expired'
      WHERE status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
      RETURNING id, code, username, customer_name
    `);

    let deletedFromRadius = 0;

    if (delete_from_radius && expiredVouchers.length > 0) {
      // Delete from RADIUS
      for (const voucher of expiredVouchers) {
        try {
          await radiusSync.deleteVoucherUser(voucher.username);
          deletedFromRadius++;
        } catch (radiusError) {
          logger.error(`Failed to delete ${voucher.username} from RADIUS: ${radiusError.message}`);
        }
      }
    }

    logger.info(`🧹 Cleanup completed: ${expiredVouchers.length} vouchers expired, ${deletedFromRadius} removed from RADIUS`);

    res.json({
      success: true,
      data: {
        expired_count: expiredVouchers.length,
        deleted_from_radius: deletedFromRadius
      },
      message: `Cleaned up ${expiredVouchers.length} expired vouchers`
    });
  } catch (error) {
    logger.error('Error cleaning up expired vouchers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup expired vouchers'
    });
  }
});

/**
 * POST /api/v1/admin/hotspot/update-used-vouchers
 * Check and update vouchers that have exhausted their duration - Admin only
 */
router.post('/admin/hotspot/update-used-vouchers', jwtAuth, async (req, res) => {
  try {
    const updatedCount = await VoucherService.checkAndUpdateExpiredVouchers();

    logger.info(`🔄 Updated ${updatedCount} vouchers to used status`);

    res.json({
      success: true,
      data: {
        updated_count: updatedCount
      },
      message: `Updated ${updatedCount} voucher(s) to used status`
    });
  } catch (error) {
    logger.error('Error updating used vouchers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update used vouchers'
    });
  }
});

/**
 * POST /api/v1/hotspot/voucher/session-end
 * Webhook from FreeRADIUS Exec-Module when session ends
 * Marks voucher as used automatically if session_time >= 95% of duration
 */
router.post('/voucher/session-end', async (req, res) => {
  try {
    const { username, session_duration, acct_session_time, terminate_cause, start_time, stop_time } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }

    const sessionTime = parseInt(session_duration || acct_session_time || 0);
    logger.info(`📥 Received session-end webhook: user=${username}, cause=${terminate_cause || '?'}, duration=${sessionTime}s`);

    // Only mark as used if session was long enough (>= 95% of voucher duration)
    const voucher = await getOne(
      'SELECT code, duration_hours, status FROM vouchers WHERE username = $1 AND status = \'active\' AND payment_status = \'paid\'',
      [username]
    );

    if (!voucher) {
      logger.info(`ℹ️ No active voucher found for user: ${username} (already used or not found)`);
      return res.json({ success: true, message: 'No voucher to update' });
    }

    const allowedSeconds = (voucher.duration_hours || 0) * 3600;
    const threshold = Math.floor(allowedSeconds * 0.95);

    if (sessionTime < threshold && sessionTime > 0) {
      logger.info(`⏳ Voucher ${voucher.code} session only ${sessionTime}s of ${allowedSeconds}s — keeping active`);
      return res.json({ success: true, message: 'Session ended but voucher still valid' });
    }

    // Mark as used
    const updated = await query(`
      UPDATE vouchers
      SET status = 'used', used_at = NOW()
      WHERE code = $1 AND status = 'active'
      RETURNING code, customer_name
    `, [voucher.code]);

    if (updated.rowCount > 0) {
      logger.info(`✅ Voucher ${voucher.code} marked as used via webhook`);

      try {
        await radiusSync.deleteVoucherUser(username);
        logger.info(`🗑️ Removed from RADIUS: ${username}`);
      } catch (radiusError) {
        logger.warn(`Failed to remove from RADIUS: ${radiusError.message}`);
      }

      return res.json({ success: true, message: 'Voucher marked as used' });
    }

    res.json({ success: true, message: 'No voucher to update' });
  } catch (error) {
    logger.error('Error processing voucher session-end webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process session end'
    });
  }
});

/**
 * POST /api/v1/admin/hotspot/update-used-vouchers
 * Check and update vouchers that have exhausted their duration - Admin only
 */
router.post('/admin/hotspot/update-used-vouchers', jwtAuth, async (req, res) => {
  try {
    const updatedCount = await VoucherService.checkAndUpdateExpiredVouchers();

    logger.info(`🔄 Updated ${updatedCount} vouchers to used status`);

    res.json({
      success: true,
      data: {
        updated_count: updatedCount
      },
      message: `Updated ${updatedCount} voucher(s) to used status`
    });
  } catch (error) {
    logger.error('Error updating used vouchers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update used vouchers'
    });
  }
});

/**
 * DELETE /api/v1/admin/hotspot/vouchers/:code/hard
 * Hard delete a voucher and remove from RADIUS
 */
router.delete('/admin/hotspot/vouchers/:code/hard', jwtAuth, async (req, res) => {
  try {
    const { code } = req.params;

    const voucher = await getOne('SELECT * FROM vouchers WHERE code = $1', [code]);

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found'
      });
    }

    // Delete from RADIUS if active
    if (voucher.status === 'active' && voucher.username) {
      try {
        await radiusSync.deleteVoucherUser(voucher.username);
        logger.info(`🗑️ Removed from RADIUS: ${voucher.username}`);
      } catch (radiusError) {
        logger.error(`Failed to remove from RADIUS: ${radiusError.message}`);
      }
    }

    // Delete voucher usage records
    await query('DELETE FROM voucher_usage WHERE voucher_code = $1', [code]);

    // Delete voucher
    await query('DELETE FROM vouchers WHERE code = $1', [code]);

    logger.info(`🗑️ Hard deleted voucher: ${code}`);

    res.json({
      success: true,
      message: 'Voucher permanently deleted'
    });
  } catch (error) {
    logger.error('Error hard deleting voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete voucher'
    });
  }
});

/**
 * GET /api/v1/hotspot/admin/hotspot/voucher-format
 * Get voucher format settings - Admin only
 */
router.get('/admin/hotspot/voucher-format', jwtAuth, async (req, res) => {
  try {
    const settings = await VoucherService.getFormatSettings();
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('Error fetching voucher format settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch format settings'
    });
  }
});

/**
 * PUT /api/v1/hotspot/admin/hotspot/voucher-format
 * Update voucher format settings - Admin only
 */
router.put('/admin/hotspot/voucher-format', jwtAuth, async (req, res) => {
  try {
    const {
      username_prefix,
      username_length,
      username_use_numbers,
      username_use_uppercase,
      username_use_lowercase,
      password_same_as_username,
      password_length,
      password_use_numbers,
      password_use_uppercase,
      password_use_lowercase,
      code_template,
      description
    } = req.body;

    // Validation
    if (!username_prefix || username_prefix.length > 20) {
      return res.status(400).json({
        success: false,
        message: 'Username prefix is required and max 20 characters'
      });
    }

    if (!username_length || username_length < 4 || username_length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Username length must be between 4 and 50'
      });
    }

    if (!username_use_numbers && !username_use_uppercase && !username_use_lowercase) {
      return res.status(400).json({
        success: false,
        message: 'At least one character type must be enabled for username'
      });
    }

    if (!password_same_as_username) {
      if (!password_length || password_length < 4 || password_length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Password length must be between 4 and 50'
        });
      }

      if (!password_use_numbers && !password_use_uppercase && !password_use_lowercase) {
        return res.status(400).json({
          success: false,
          message: 'At least one character type must be enabled for password'
        });
      }
    }

    // Deactivate old settings
    await query('UPDATE voucher_format_settings SET is_active = false');

    // Insert new settings
    const result = await query(`
      INSERT INTO voucher_format_settings (
        username_prefix, username_length, username_use_numbers, username_use_uppercase, username_use_lowercase,
        password_same_as_username, password_length, password_use_numbers, password_use_uppercase, password_use_lowercase,
        code_template, description, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
      RETURNING *
    `, [
      username_prefix,
      username_length,
      username_use_numbers,
      username_use_uppercase,
      username_use_lowercase,
      password_same_as_username,
      password_length || 8,
      password_use_numbers,
      password_use_uppercase,
      password_use_lowercase,
      code_template || '{PREFIX}-{RANDOM}',
      description || ''
    ]);

    logger.info(`🔧 Voucher format settings updated by user ${req.user?.id || 'unknown'}`);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Voucher format settings updated successfully'
    });
  } catch (error) {
    logger.error('Error updating voucher format settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update format settings'
    });
  }
});

/**
 * POST /api/v1/hotspot/admin/hotspot/voucher-format/preview
 * Generate preview voucher codes based on current settings - Admin only
 */
router.post('/admin/hotspot/voucher-format/preview', jwtAuth, async (req, res) => {
  try {
    const { count = 5 } = req.body;

    if (count < 1 || count > 20) {
      return res.status(400).json({
        success: false,
        message: 'Preview count must be between 1 and 20'
      });
    }

    const previews = [];
    for (let i = 0; i < count; i++) {
      const { code, username, password } = await VoucherService.generateCode();
      previews.push({ code, username, password });
    }

    res.json({
      success: true,
      data: {
        count: previews.length,
        previews
      }
    });
  } catch (error) {
    logger.error('Error generating voucher preview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate preview'
    });
  }
});

module.exports = router;
