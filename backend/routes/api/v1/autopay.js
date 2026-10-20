const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const autopayEngine = require('../../../services/autopay-engine');
const autopayService = require('../../../services/autopay-service');
const { query } = require('../../../config/database');
const { getSetting, updateSetting } = require('../../../config/settingsManager');
const { logger } = require('../../../config/logger');
const { jwtAuth } = require('../../../middleware/jwtAuth');

// ============================================================================
// 1. INBOUND WEBHOOK (PUBLIC - AUTHENTICATED BY API KEY)
// Used by Tasker, MacroDroid, Cloudflare Email Worker, etc.
// Supports: POST /api/v1/autopay/inbound, /inbound, /mobile/inbound
// ============================================================================
router.post(['/inbound', '/mobile/inbound'], async (req, res) => {
  try {
    const apiKey =
      req.headers['x-api-key'] ||
      req.headers['api-key'] ||
      req.query.api_key ||
      req.query.key ||
      req.body?.api_key;

    if (!apiKey) {
      logger.warn('[AutopayRoute] Inbound rejected: missing API key');
      return res.status(401).json({ success: false, message: 'API key required' });
    }

    const payload = req.body || {};
    logger.info(`[AutopayRoute] Inbound received from ${payload.app_name || payload.device_name || 'Device'}`);

    const result = await autopayEngine.processInboundMutation(payload, apiKey);
    return res.json({ success: true, data: result });
  } catch (error) {
    if (error.message === 'INVALID_API_KEY') {
      logger.warn('[AutopayRoute] Inbound rejected: invalid API key');
      return res.status(403).json({ success: false, message: 'Invalid API key' });
    }
    logger.error('[AutopayRoute] Inbound processing error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// Legacy callback (HMAC verified, for backward compatibility)
router.post('/callback', async (req, res) => {
  try {
    const rawBody = req.rawBody || '';
    const signature = req.headers['x-autopay-signature'];
    if (!autopayService.verifySignature(rawBody, signature)) {
      logger.warn('[Autopay] Callback rejected: HMAC signature mismatch');
      return res.status(403).json({ success: false, message: 'Signature mismatch' });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
    }

    const apiKey = req.headers['x-api-key'];
    const expectedKey = getSetting('autopay_api_key');
    if (expectedKey && apiKey !== expectedKey) {
      return res.status(403).json({ success: false, message: 'Invalid API key' });
    }

    const result = await autopayService.processCallback(payload);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[Autopay] Callback error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ============================================================================
// 2. ADMIN MUTATIONS MANAGEMENT (JWT AUTH)
// ============================================================================

// GET /api/v1/autopay/mutations - List mutations with filters & stats
router.get('/mutations', jwtAuth, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const { status, search, date_from, date_to } = req.query;

    const whereClauses = [];
    const params = [];

    if (status && status !== 'ALL') {
      params.push(status.toUpperCase());
      whereClauses.push(`m.status = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const pIdx = params.length;
      whereClauses.push(`(
        LOWER(COALESCE(m.sender_info, '')) LIKE $${pIdx} OR
        LOWER(COALESCE(m.description, '')) LIKE $${pIdx} OR
        CAST(m.amount AS TEXT) LIKE $${pIdx} OR
        LOWER(COALESCE(c.name, '')) LIKE $${pIdx} OR
        LOWER(COALESCE(i.invoice_number, '')) LIKE $${pIdx}
      )`);
    }

    if (date_from) {
      params.push(date_from);
      whereClauses.push(`m.created_at >= $${params.length}::timestamptz`);
    }

    if (date_to) {
      params.push(date_to + ' 23:59:59');
      whereClauses.push(`m.created_at <= $${params.length}::timestamptz`);
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total count query
    const countRes = await query(
      `SELECT COUNT(*) as total
       FROM bank_mutations m
       LEFT JOIN invoices i ON i.id = m.matched_invoice_id
       LEFT JOIN customers c ON c.id::text = i.customer_id::text
       ${whereSQL}`,
      params
    );
    const total = parseInt(countRes.rows[0].total) || 0;

    // List query
    const listParams = [...params, limit, offset];
    const listRes = await query(
      `SELECT 
         m.*,
         i.invoice_number,
         i.customer_id,
         c.name as customer_name,
         c.phone as customer_phone
       FROM bank_mutations m
       LEFT JOIN invoices i ON i.id = m.matched_invoice_id
       LEFT JOIN customers c ON c.id::text = i.customer_id::text
       ${whereSQL}
       ORDER BY m.created_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    // Compute summary stats
    const statsRes = await query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_count,
        COALESCE(SUM(amount) FILTER (WHERE created_at >= CURRENT_DATE), 0) as today_amount,
        COUNT(*) FILTER (WHERE status = 'MATCHED' AND created_at >= CURRENT_DATE) as today_matched_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'MATCHED' AND created_at >= CURRENT_DATE), 0) as today_matched_amount,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0) as pending_amount
      FROM bank_mutations
    `);

    const devCountRes = await query(`SELECT COUNT(*) as cnt FROM autopay_devices`);

    res.json({
      success: true,
      data: {
        mutations: listRes.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        stats: {
          todayCount: parseInt(statsRes.rows[0].today_count) || 0,
          todayAmount: parseFloat(statsRes.rows[0].today_amount) || 0,
          todayMatchedCount: parseInt(statsRes.rows[0].today_matched_count) || 0,
          todayMatchedAmount: parseFloat(statsRes.rows[0].today_matched_amount) || 0,
          pendingCount: parseInt(statsRes.rows[0].pending_count) || 0,
          pendingAmount: parseFloat(statsRes.rows[0].pending_amount) || 0,
          activeDevicesCount: parseInt(devCountRes.rows[0].cnt) || 0,
        },
      },
    });
  } catch (error) {
    logger.error('[AutopayRoute] Fetch mutations error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/v1/autopay/mutations/:id/match - Manual matching by admin
router.post('/mutations/:id/match', jwtAuth, async (req, res) => {
  try {
    const mutationId = parseInt(req.params.id);
    const { invoice_id } = req.body;

    if (!invoice_id) {
      return res.status(400).json({ success: false, message: 'invoice_id is required' });
    }

    const result = await autopayEngine.manualMatchMutation(mutationId, parseInt(invoice_id), req.user);
    res.json({
      success: true,
      message: 'Tagihan berhasil dilunaskan via Autopay',
      data: result,
    });
  } catch (error) {
    logger.error('[AutopayRoute] Manual match error:', error);
    if (error.message === 'MUTATION_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Data mutasi tidak ditemukan' });
    }
    if (error.message === 'INVOICE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Tagihan tidak ditemukan' });
    }
    if (error.message === 'INVOICE_ALREADY_PAID') {
      return res.status(400).json({ success: false, message: 'Tagihan sudah lunas' });
    }
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// POST /api/v1/autopay/mutations/:id/ignore - Ignore mutation
router.post('/mutations/:id/ignore', jwtAuth, async (req, res) => {
  try {
    const mutationId = parseInt(req.params.id);
    const result = await autopayEngine.ignoreMutation(mutationId);
    res.json({
      success: true,
      message: 'Mutasi berhasil diabaikan',
      data: result,
    });
  } catch (error) {
    logger.error('[AutopayRoute] Ignore mutation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// GET /api/v1/autopay/unpaid-invoices - Search unpaid invoices for manual match modal
router.get('/unpaid-invoices', jwtAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    let whereClause = `WHERE i.status IN ('unpaid', 'overdue', 'sent', 'draft', 'suspended')`;
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      const pIdx = params.length;
      whereClause += ` AND (
        LOWER(i.invoice_number) LIKE $${pIdx} OR
        LOWER(c.name) LIKE $${pIdx} OR
        c.phone LIKE $${pIdx} OR
        CAST(ROUND(i.amount) AS TEXT) LIKE $${pIdx} OR
        CAST(COALESCE(i.amount_with_code, 0) AS TEXT) LIKE $${pIdx}
      )`;
    }

    params.push(limit);
    const sql = `
      SELECT 
        i.id,
        i.invoice_number,
        i.amount,
        i.total_amount,
        i.unique_code,
        i.amount_with_code,
        i.due_date,
        i.status,
        c.name as customer_name,
        c.phone as customer_phone
      FROM invoices i
      LEFT JOIN customers c ON c.id::text = i.customer_id::text
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT $${params.length}
    `;

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('[AutopayRoute] Unpaid invoices search error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ============================================================================
// 3. DEVICES / API KEYS MANAGEMENT (JWT AUTH)
// ============================================================================

// GET /api/v1/autopay/devices - List devices
router.get('/devices', jwtAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, device_name, api_key, created_at FROM autopay_devices ORDER BY id ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('[AutopayRoute] Get devices error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/v1/autopay/devices - Create new device & API key
router.post('/devices', jwtAuth, async (req, res) => {
  try {
    const { device_name } = req.body;
    if (!device_name || !device_name.trim()) {
      return res.status(400).json({ success: false, message: 'device_name is required' });
    }

    const apiKey = 'ap_live_' + crypto.randomBytes(8).toString('hex');
    const secret = crypto.randomBytes(12).toString('hex');

    const result = await query(
      `INSERT INTO autopay_devices (device_name, api_key, secret, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, device_name, api_key, created_at`,
      [device_name.trim(), apiKey, secret]
    );

    res.json({
      success: true,
      message: 'Perangkat berhasil ditambahkan',
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('[AutopayRoute] Create device error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// DELETE /api/v1/autopay/devices/:id - Delete device
router.delete('/devices/:id', jwtAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await query(`DELETE FROM autopay_devices WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Perangkat berhasil dihapus' });
  } catch (error) {
    logger.error('[AutopayRoute] Delete device error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ============================================================================
// 4. CONFIGURATION (JWT AUTH)
// ============================================================================

// GET /api/v1/autopay/config
router.get('/config', jwtAuth, async (req, res) => {
  try {
    const config = {
      enabled: getSetting('autopay_enabled', false),
      api_key: getSetting('autopay_api_key', ''),
      base_url: getSetting('autopay_base_url', ''),
      secret: getSetting('autopay_secret', ''),
      unique_code_enabled: getSetting('unique_code_enabled', false),
      unique_code_length: getSetting('unique_code_length', '3'),
    };

    const displayConfig = {
      ...config,
      api_key: config.api_key ? config.api_key.substring(0, 8) + '...' + config.api_key.slice(-4) : '',
      secret: config.secret ? config.secret.substring(0, 8) + '...' : '',
      unique_code_enabled: config.unique_code_enabled === true || config.unique_code_enabled === 'true',
      unique_code_length: parseInt(config.unique_code_length) || 3,
    };

    res.json({ success: true, data: displayConfig });
  } catch (error) {
    logger.error('[AutopayRoute] Config fetch error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/v1/autopay/config
router.put('/config', jwtAuth, async (req, res) => {
  try {
    const { enabled, api_key, base_url, secret, unique_code_enabled, unique_code_length } = req.body;
    const updates = [];

    if (enabled !== undefined) {
      await updateSetting('autopay_enabled', enabled ? 'true' : 'false', 'boolean');
      updates.push('enabled');
    }
    if (api_key !== undefined && !api_key.includes('...')) {
      await updateSetting('autopay_api_key', api_key, 'string');
      updates.push('api_key');
    }
    if (base_url !== undefined) {
      await updateSetting('autopay_base_url', base_url, 'string');
      updates.push('base_url');
    }
    if (secret !== undefined && !secret.includes('...')) {
      await updateSetting('autopay_secret', secret, 'string');
      updates.push('secret');
    }
    if (unique_code_enabled !== undefined) {
      await updateSetting('unique_code_enabled', unique_code_enabled ? 'true' : 'false', 'boolean');
      updates.push('unique_code_enabled');
    }
    if (unique_code_length !== undefined) {
      const len = Math.min(Math.max(parseInt(unique_code_length) || 3, 3), 6);
      await updateSetting('unique_code_length', String(len), 'number');
      updates.push('unique_code_length');
    }

    logger.info(`[AutopayRoute] Config updated: ${updates.join(', ')}`);
    res.json({ success: true, message: `Updated: ${updates.join(', ')}` });
  } catch (error) {
    logger.error('[AutopayRoute] Config update error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/v1/autopay/sync-status - Manual trigger status sync (admin only)
router.post('/sync-status', jwtAuth, async (req, res) => {
  try {
    const result = await autopayService.pollPendingInvoices();
    res.json({ success: true, data: result, message: `Checked ${result.checked}, paid ${result.paid}` });
  } catch (error) {
    logger.error('[Autopay] Sync status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
