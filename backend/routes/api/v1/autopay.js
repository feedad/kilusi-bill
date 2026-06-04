const express = require('express');
const router = express.Router();
const autopayService = require('../../../services/autopay-service');
const { getSetting, updateSetting } = require('../../../config/settingsManager');
const { logger } = require('../../../config/logger');
const { jwtAuth } = require('../../../middleware/jwtAuth');

// Raw body capture for HMAC verification (raw body saved by express.json verify hook in app.js)
router.post('/callback', async (req, res) => {
  try {
    const rawBody = req.rawBody || ''; // Raw string body from verify hook

    // 1. Verify HMAC signature
    const signature = req.headers['x-autopay-signature'];
    if (!autopayService.verifySignature(rawBody, signature)) {
      logger.warn('[Autopay] Callback rejected: HMAC signature mismatch');
      return res.status(403).json({ success: false, message: 'Signature mismatch' });
    }

    // 2. Parse JSON payload
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      logger.warn('[Autopay] Callback rejected: invalid JSON');
      return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
    }

    // 3. Validate API Key (additional layer)
    const apiKey = req.headers['x-api-key'];
    const expectedKey = getSetting('autopay_api_key');
    if (expectedKey && apiKey !== expectedKey) {
      logger.warn('[Autopay] Callback rejected: invalid API key');
      return res.status(403).json({ success: false, message: 'Invalid API key' });
    }

    logger.info(`[Autopay] Callback verified:`, JSON.stringify(payload));

    const result = await autopayService.processCallback(payload);
    
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[Autopay] Callback error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/v1/autopay/config - Get Autopay configuration (admin only)
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

    // Mask sensitive values for display
    const displayConfig = {
      ...config,
      api_key: config.api_key ? config.api_key.substring(0, 8) + '...' + config.api_key.slice(-4) : '',
      secret: config.secret ? config.secret.substring(0, 8) + '...' : '',
      unique_code_enabled: config.unique_code_enabled === true || config.unique_code_enabled === 'true',
      unique_code_length: parseInt(config.unique_code_length) || 3,
    };

    // Test connection if enabled
    let connectionStatus = null;
    if (config.enabled && config.api_key && config.base_url) {
      connectionStatus = await autopayService.testConnection();
    }

    res.json({ success: true, data: { ...displayConfig, connection: connectionStatus } });
  } catch (error) {
    logger.error('[Autopay] Config fetch error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/v1/autopay/config - Update Autopay configuration (admin only)
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

    logger.info(`[Autopay] Config updated: ${updates.join(', ')}`);
    res.json({ success: true, message: `Updated: ${updates.join(', ')}` });
  } catch (error) {
    logger.error('[Autopay] Config update error:', error);
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

// GET /api/v1/autopay/test - Test connection to Autopay (admin only)
router.get('/test', jwtAuth, async (req, res) => {
  try {
    const result = await autopayService.testConnection();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
