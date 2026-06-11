const express = require('express');
const router = express.Router();

// Import middleware
const { jwtAuth } = require('../../../middleware/jwtAuth');

// Import API management tracking
const { trackApiCall } = require('./api-management');

// Apply tracking middleware to all API routes
router.use(trackApiCall);

// Import route modules
// Integration API routes (public, authenticated via API key)
router.use('/integration', require('./integration')); // Omnichat integration endpoints

// Omnichat API key verification middleware
// This verifies that Omnichat can access Kilusi-Bill API
// Uses a SEPARATE API key from the Omnichat API key
const verifyOmnichatApiKey = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'] ||
                       req.headers['authorization']?.replace('Bearer ', '') ||
                       req.headers['authorization']?.replace('Basic ', '');

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'API_KEY_MISSING',
                message: 'API key is required. Please provide Billing API Key in Omnichat settings.'
            });
        }

        // Use SEPARATE API key for Kilusi-Bill integration (NOT the Omnichat API key)
        // Query directly from database to avoid cache issues
        const { query } = require('../../../config/database');
        const result = await query(
            "SELECT value FROM app_config WHERE key = 'kilusi_integration_api_key'"
        );

        if (result.rows.length === 0) {
            console.error('[OmnichatIntegration] Integration API key not found in database!');
            return res.status(500).json({
                success: false,
                error: 'API_KEY_NOT_CONFIGURED',
                message: 'Integration API key not configured on server'
            });
        }

        const expectedApiKey = result.rows[0].value;

        if (apiKey !== expectedApiKey) {
            console.warn('[OmnichatIntegration] Invalid API key attempt', {
                ip: req.ip,
                userAgent: req.headers['user-agent']
            });
            return res.status(403).json({
                success: false,
                error: 'INVALID_API_KEY',
                message: 'Invalid API key. Please check your Billing API Key in Omnichat settings.'
            });
        }

        next();
    } catch (error) {
        console.error('[OmnichatIntegration] Error verifying API key:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Error verifying API key'
        });
    }
};

// Omnichat public endpoints (no JWT required, API key auth only)
// Must be defined BEFORE JWT-authenticated routes
const omnichatContactSync = require('../../../services/omnichat-contact-sync');
const { getSetting } = require('../../../config/settingsManager');

// GET /settings/billing/config - Billing configuration for Omnichat
router.get('/settings/billing/config', verifyOmnichatApiKey, async (req, res) => {
    try {
        const config = {
            company_name: getSetting('company_name', 'Kilusi ISP'),
            currency: getSetting('currency', 'IDR'),
            billing_enabled: getSetting('billing_enabled', true),
            auto_invoice: getSetting('billing_monthly_invoice_enable', true),
            invoice_time: getSetting('billing_monthly_invoice_time', '00:00'),
            reminder_enabled: getSetting('billing_reminder_enable', true),
            reminder_time: getSetting('billing_reminder_time', '08:00'),
            due_date: getSetting('billing_due_date', '1'),
            grace_period: getSetting('billing_grace_period', '3')
        };
        res.json({ success: true, data: config });
    } catch (error) {
        res.status(500).json({ success: false, error: 'FETCH_ERROR', message: error.message });
    }
});

// GET /settings/whatsapp/waba-config - WhatsApp configuration for Omnichat
router.get('/settings/whatsapp/waba-config', verifyOmnichatApiKey, async (req, res) => {
    try {
        const config = {
            provider: getSetting('whatsapp_provider', 'omnichat'),
            api_url: getSetting('kilusi_omnichat_api_url', 'https://whatsapp.kilusi.id/api'),
            sync_enabled: getSetting('omnichat_sync_enabled', false),
            sync_schedule: getSetting('omnichat_sync_schedule', 'manual')
        };
        res.json({ success: true, data: config });
    } catch (error) {
        res.status(500).json({ success: false, error: 'FETCH_ERROR', message: error.message });
    }
});

// GET /settings/integration/api-keys - API keys info for Omnichat
router.get('/settings/integration/api-keys', verifyOmnichatApiKey, async (req, res) => {
    try {
        const apiKey = getSetting('kilusi_omnichat_api_key') || process.env.KILUSI_OMNICHAT_API_KEY;
        const config = {
            api_key_configured: !!apiKey,
            api_key_prefix: apiKey ? apiKey.substring(0, 10) + '...' : null,
            integration_enabled: true
        };
        res.json({ success: true, data: config });
    } catch (error) {
        res.status(500).json({ success: false, error: 'FETCH_ERROR', message: error.message });
    }
});

// POST /payments/sync-contacts - Trigger contact sync from Omnichat
router.post('/payments/sync-contacts', verifyOmnichatApiKey, async (req, res) => {
    try {
        const result = await omnichatContactSync.syncContacts();
        res.json({
            success: true,
            data: {
                synced: result.synced,
                failed: result.failed,
                total: result.total,
                last_sync: result.last_sync
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'SYNC_ERROR', message: error.message });
    }
});

// GET /payments/sync-status - Get sync status
router.get('/payments/sync-status', verifyOmnichatApiKey, async (req, res) => {
    try {
        const lastSync = await omnichatContactSync.getLastSyncStatus();
        const statistics = await omnichatContactSync.getSyncStatistics();
        res.json({
            success: true,
            data: {
                last_sync: lastSync,
                total_customers: statistics.total_customers,
                sync_enabled: getSetting('omnichat_sync_enabled', false)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'FETCH_ERROR', message: error.message });
    }
});

router.use('/auth', require('./auth'));
router.use('/admins', jwtAuth, require('./admins'));
router.use('/customers', jwtAuth, require('./customers'));
router.use('/packages', jwtAuth, require('./packages'));
router.use('/billing', jwtAuth, require('./billing'));
router.use('/customer-billing', require('./customer-billing'));
router.use('/regions', jwtAuth, require('./regions'));
router.use('/mitra', jwtAuth, require('./mitra'));
// Autopay callback is public (validated by API key), config endpoints use JWT internally
router.use('/autopay', require('./autopay'));
router.use('/chatbot', require('./chatbot'));
router.use('/dashboard', require('./dashboard'));
router.use('/settings', jwtAuth, require('./settings'));
router.use('/realtime', jwtAuth, require('./realtime'));
router.use('/radius', jwtAuth, require('./radius'));
router.use('/genieacs', require('./genieacs'));
router.use('/technician', jwtAuth, require('./technician'));
router.use('/whatsapp', require('./whatsapp')); // Re-enabled WhatsApp functionality
router.use('/whatsapp-templates', require('./whatsapp-templates')); // Unified WhatsApp templates (public read for dev)
router.use('/baileys', jwtAuth, require('./baileys')); // Baileys QR & Management

// Import payments routes
const { router: paymentsRouter, webhookRouter } = require('./payments');

// Webhook routes (no auth required for external payment gateways) - mounted first
// Must be BEFORE the payments-integration router which applies API key middleware to /payments/*
router.use('/payments/webhook', webhookRouter);
router.use('/payments/callback', webhookRouter); // Alias for Tripay (different URL convention)

// QRIS image serving (public, no auth) - serves QR code images for payment
router.get('/payments/qris/:filename', async (req, res) => {
    try {
        const filepath = require('path').resolve(__dirname, '../../../public/qris', req.params.filename);
        const fs = require('fs');
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ success: false, error: 'QRIS image not found' });
        }
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        fs.createReadStream(filepath).pipe(res);
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to serve QRIS image' });
    }
});

// Omnichat Integration Routes (public, authenticated via API key)
// These must be mounted before the JWT-authenticated settings routes
router.use('/settings', require('./omnichat-integration')); // Omnichat billing/whatsapp config endpoints
router.use('/payments', require('./payments-integration')); // Omnichat sync contacts endpoint

// Omnichat public status endpoint (no auth required - for connection status display)
router.get('/omnichat/status', async (req, res) => {
  const kilusiOmnichat = require('../../../config/kilusi-whatsapp');
  try {
    const result = await kilusiOmnichat.testConnection();
    const { getSetting } = require('../../../config/settingsManager');
    res.json({
      success: true,
      data: {
        connected: result.connected,
        api_key_valid: result.apiKeyValid,
        whatsapp_connected: result.whatsappConnected,
        status: result.status,
        provider: getSetting('whatsapp_provider', 'omnichat'),
        fallback_enabled: getSetting('baileys_fallback_enabled', false),
        phone_number_id: result.phoneNumberId,
        total_contacts: result.totalContacts
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check Omnichat status',
      error: error.message
    });
  }
});

// Omnichat public stats endpoint (no auth required - for dashboard stats)
router.get('/omnichat/stats', async (req, res) => {
  const messageLogger = require('../../../services/omnichat-message-logger');
  try {
    // Get today's date range (start of day to now)
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const stats = await messageLogger.getStatistics({
      date_from: startOfDay,
      date_to: today
    });

    // Calculate delivery rate
    const totalMessages = stats.total_messages || 0;
    const successMessages = (stats.sent || 0) + (stats.delivered || 0) + (stats.read || 0);
    const deliveryRate = totalMessages > 0 ? Math.round((successMessages / totalMessages) * 100) : 0;

    res.json({
      success: true,
      data: {
        daily_messages: totalMessages,
        delivery_rate: deliveryRate,
        sent: stats.sent || 0,
        delivered: stats.delivered || 0,
        read: stats.read || 0,
        failed: stats.failed || 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Omnichat stats',
      error: error.message
    });
  }
});

// Omnichat public logs endpoint (no auth required - for dashboard display)
router.get('/omnichat-logs/logs', async (req, res) => {
  const messageLogger = require('../../../services/omnichat-message-logger');
  try {
    const {
      phone_number,
      customer_id,
      status,
      notification_type,
      date_from,
      date_to,
      limit = 20,
      offset = 0
    } = req.query;

    const filters = {
      phone_number,
      customer_id: customer_id ? parseInt(customer_id) : undefined,
      status,
      notification_type,
      date_from: date_from ? new Date(date_from) : undefined,
      date_to: date_to ? new Date(date_to) : undefined,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    // Remove undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined) delete filters[key];
    });

    const result = await messageLogger.getMessageLogs(filters);

    // Map data to match frontend expected format
    const mappedLogs = (result.logs || []).map(log => ({
      id: log.id,
      phone_number: log.phone_number,
      notification_type: log.notification_type || 'general',
      message: log.message_content,
      status: log.status === 'sent' || log.status === 'delivered' || log.status === 'read' ? 'success' : 'failed',
      created_at: log.created_at
    }));

    res.json({
      success: true,
      data: mappedLogs,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch message logs',
      error: error.message
    });
  }
});

// Omnichat public test send endpoint (no auth required - for testing via production backend)
router.post('/omnichat/test-send', async (req, res) => {
  const kilusiOmnichat = require('../../../config/kilusi-whatsapp');
  try {
    const { phone_number, message } = req.body;

    if (!phone_number || !message) {
      return res.status(400).json({
        success: false,
        message: 'phone_number and message are required'
      });
    }

    const result = await kilusiOmnichat.sendMessage(phone_number, message, {
      source: 'test',
      saveToHistory: true
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
});

// Omnichat routes with JWT auth
router.use('/omnichat', jwtAuth, require('./omnichat')); // Omnichat integration routes
router.use('/omnichat-logs', jwtAuth, require('./omnichat-logs')); // Omnichat message logs
router.use('/meta-templates', jwtAuth, require('./meta-templates')); // Meta Template Manager routes
// Separate auth and non-auth billing cycle routes
router.use('/billing-cycles', require('./billing-cycles-public'));
router.use('/billing-cycles', jwtAuth, require('./billing-cycles'));
router.use('/odp', jwtAuth, require('./odp'));
router.use('/cable-routes', jwtAuth, require('./cable-routes'));
router.use('/customer-settings', require('./customer-settings'));
router.use('/financial', jwtAuth, require('./financial'));
router.use('/accounting', jwtAuth, require('./accounting'));
router.use('/installation-fees', require('./installation-fees')); // Temporarily remove auth for testing
	router.use('/installations', jwtAuth, require('./installations')); // Installation jobs management
router.use('/auto-expenses', jwtAuth, require('./auto-expenses'));
router.use('/referrals', jwtAuth, require('./referrals'));
router.use('/customer-referrals', require('./customer-referrals'));
router.use('/discounts', jwtAuth, require('./discounts'));
router.use('/discounts-public', require('./discounts-public'));
router.use('/whatsapp-test', jwtAuth, require('./whatsapp-test'));
router.use('/customer-auth', require('./customer-auth'));
router.use('/customer-auth-nextjs', require('./customer-auth-nextjs'));
router.use('/customer-token-auth', require('./customer-token-auth'));
router.use('/support', jwtAuth, require('./support'));
router.use('/customer-support', require('./customer-support'));
router.use('/customer-radius', require('./customer-radius'));
router.use('/customer-traffic', require('./customer-traffic'));
router.use('/customer-usage', require('./customer-usage'));
router.use('/simple-customer', require('./simple-customer'));
router.use('/broadcast', jwtAuth, require('./broadcast')); // Broadcast messages management (admin)
router.use('/broadcasts', jwtAuth, require('./broadcasts-dynamic')); // Dynamic WhatsApp broadcast with personalized messages
router.use('/broadcast-public', require('./broadcast-public'));
router.use('/maintenance', jwtAuth, require('./maintenance')); // New maintenance route
router.use('/services', jwtAuth, require('./services'));
router.use('/technical-details', jwtAuth, require('./technical-details')); // Technical details & MAC sync
router.use('/radius-comments', jwtAuth, require('./radius-comments'));
router.use('/branding-public', require('./branding-public'));
router.use('/branding', jwtAuth, require('./branding'));
router.use('/system', require('./system'));
router.use('/monitoring', jwtAuth, require('./monitoring'));
router.use('/landing', require('./landing-page'));
router.use('/notifications', jwtAuth, require('./notifications'));
router.use('/blog', require('./blog')); // Blog Routes
router.use('/public', require('./public-registration')); // Public Registration
router.use('/hotspot', require('./hotspot')); // Hotspot voucher management (public + admin endpoints inside)

// Payment routes (with auth for admin operations) - mounted after webhook routes
// paymentsRouter already imported above with webhookRouter
router.use('/payments', jwtAuth, paymentsRouter);

router.use('/customer-payments', require('./customer-payments'));
router.use('/payment-upload', require('./payment-upload'));
router.use('/payment-test', require('./payment-test'));

// Admin payment verification routes
router.use('/admin/payments-verification', jwtAuth, require('./admin/payments-verification'));

// API Management routes (admin only)
router.use('/api-management', require('./api-management').router);

// Development-only endpoints
router.use('/dev-generate-token', require('./dev-generate-token'));

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Cron catch-up — local network only (MikroTik watchdog)
router.use('/cron-catchup', require('./cron-catchup'));

// Public Settings Route
const publicSettingsRouter = require('./public-settings');
router.use('/public', publicSettingsRouter);

module.exports = router;