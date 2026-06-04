/**
 * Integration API Routes
 *
 * Public API endpoints for Omnichat integration
 * These endpoints are accessible via API key authentication
 *
 * @module routes/api/v1/integration
 */

const express = require('express');
const router = express.Router();
const { getSetting, getAllSettings } = require('../../../config/settingsManager');
const { logger } = require('../../../config/logger');
const omnichatContactSync = require('../../../services/omnichat-contact-sync');
const kilusiOmnichat = require('../../../config/kilusi-whatsapp');

/**
 * Verify API key for integration requests
 */
const verifyIntegrationApiKey = async (req, res, next) => {
    try {
        // Get API key from header
        const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'API_KEY_MISSING',
                message: 'API key is required'
            });
        }

        // Get expected API key from settings
        const expectedApiKey = getSetting('kilusi_omnichat_api_key') ||
                               getSetting('integration_api_key') ||
                               process.env.KILUSI_OMNICHAT_API_KEY;

        if (!expectedApiKey) {
            return res.status(500).json({
                success: false,
                error: 'API_KEY_NOT_CONFIGURED',
                message: 'Integration API key not configured'
            });
        }

        // Verify API key
        if (apiKey !== expectedApiKey) {
            logger.warn('[Integration] Invalid API key attempt', {
                ip: req.ip,
                userAgent: req.headers['user-agent']
            });
            return res.status(403).json({
                success: false,
                error: 'INVALID_API_KEY',
                message: 'Invalid API key'
            });
        }

        // API key is valid, proceed
        req.apiKeyValid = true;
        next();
    } catch (error) {
        logger.error('[Integration] Error verifying API key:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Error verifying API key'
        });
    }
};

// Apply API key verification to all routes
router.use(verifyIntegrationApiKey);

/**
 * GET /api/v1/integration/config
 * Get integration configuration for Omnichat
 */
router.get('/config', async (req, res) => {
    try {
        const allSettings = getAllSettings();

        const config = {
            billing: {
                company_name: getSetting('company_name', 'Kilusi ISP'),
                currency: getSetting('currency', 'IDR'),
                due_date: getSetting('billing_due_date', '1'),
                grace_period: getSetting('billing_grace_period', '3'),
                auto_isolir: getSetting('billing_auto_isolir', false),
                isolir_profile: getSetting('billing_isolir_profile', 'ISOLIR')
            },
            whatsapp: {
                provider: getSetting('whatsapp_provider', 'omnichat'),
                api_url: getSetting('kilusi_omnichat_api_url', 'https://whatsapp.kilusi.id/api'),
                fallback_enabled: getSetting('baileys_fallback_enabled', false),
                sync_enabled: getSetting('omnichat_sync_enabled', false),
                sync_schedule: getSetting('omnichat_sync_schedule', 'manual')
            },
            api: {
                base_url: process.env.ALLOWED_ORIGINS?.split(',')[0] || 'https://api.kilusi.id',
                version: '1.0.0'
            }
        };

        logger.info('[Integration] Config fetched', {
            ip: req.ip
        });

        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        logger.error('[Integration] Error fetching config:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_CONFIG_ERROR',
            message: 'Failed to fetch configuration'
        });
    }
});

/**
 * GET /api/v1/integration/settings/billing/config
 * Get billing configuration (Omnichat compatibility)
 */
router.get('/settings/billing/config', async (req, res) => {
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

        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        logger.error('[Integration] Error fetching billing config:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_BILLING_CONFIG_ERROR',
            message: 'Failed to fetch billing configuration'
        });
    }
});

/**
 * GET /api/v1/integration/settings/whatsapp/waba-config
 * Get WhatsApp WABA configuration (Omnichat compatibility)
 */
router.get('/settings/whatsapp/waba-config', async (req, res) => {
    try {
        const config = {
            provider: getSetting('whatsapp_provider', 'omnichat'),
            api_url: getSetting('kilusi_omnichat_api_url', 'https://whatsapp.kilusi.id/api'),
            phone_number_id: getSetting('whatsapp_phone_number_id'),
            waba_id: getSetting('whatsapp_waba_id'),
            fallback_enabled: getSetting('baileys_fallback_enabled', false),
            sync_enabled: getSetting('omnichat_sync_enabled', false)
        };

        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        logger.error('[Integration] Error fetching WABA config:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_WABA_CONFIG_ERROR',
            message: 'Failed to fetch WhatsApp configuration'
        });
    }
});

/**
 * GET /api/v1/integration/settings/integration/api-keys
 * Get integration API keys (Omnichat compatibility)
 * Note: Returns masked API keys for security
 */
router.get('/settings/integration/api-keys', async (req, res) => {
    try {
        const apiKey = getSetting('kilusi_omnichat_api_key') ||
                      process.env.KILUSI_OMNICHAT_API_KEY;

        const maskedKey = apiKey ?
            apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 5) :
            null;

        const config = {
            omnichat_api_key: maskedKey,
            omnichat_api_url: getSetting('kilusi_omnichat_api_url', 'https://whatsapp.kilusi.id/api'),
            api_key_configured: !!apiKey,
            api_key_prefix: apiKey ? apiKey.substring(0, 10) + '...' : null
        };

        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        logger.error('[Integration] Error fetching API keys:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_API_KEYS_ERROR',
            message: 'Failed to fetch API keys configuration'
        });
    }
});

/**
 * POST /api/v1/integration/payments/sync-contacts
 * Trigger contact sync from Omnichat
 */
router.post('/payments/sync-contacts', async (req, res) => {
    try {
        logger.info('[Integration] Contact sync triggered from Omnichat', {
            ip: req.ip,
            body: req.body
        });

        // Start sync process
        const result = await omnichatContactSync.syncContacts();

        logger.info('[Integration] Contact sync completed', {
            synced: result.synced,
            failed: result.failed,
            total: result.total
        });

        res.json({
            success: true,
            data: {
                synced: result.synced,
                failed: result.failed,
                total: result.total,
                last_sync: result.last_sync
            },
            message: `Sync completed: ${result.synced} contacts synced, ${result.failed} failed`
        });
    } catch (error) {
        logger.error('[Integration] Error syncing contacts:', error);
        res.status(500).json({
            success: false,
            error: 'SYNC_CONTACTS_ERROR',
            message: 'Failed to sync contacts',
            details: error.message
        });
    }
});

/**
 * GET /api/v1/integration/health
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
    try {
        // Test Omnichat connection
        kilusiOmnichat.initialize();
        const status = await kilusiOmnichat.testConnection();

        res.json({
            success: true,
            data: {
                status: 'healthy',
                omnichat_connected: status.connected,
                whatsapp_connected: status.whatsappConnected,
                database_connected: true,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('[Integration] Health check failed:', error);
        res.status(500).json({
            success: false,
            error: 'HEALTH_CHECK_ERROR',
            message: 'Health check failed'
        });
    }
});

/**
 * POST /api/v1/integration/sync/status
 * Get sync status
 */
router.get('/sync/status', async (req, res) => {
    try {
        const lastSync = await omnichatContactSync.getLastSyncStatus();
        const statistics = await omnichatContactSync.getSyncStatistics();

        res.json({
            success: true,
            data: {
                last_sync: lastSync,
                statistics: {
                    total_syncs: statistics.total_syncs,
                    total_synced: statistics.total_synced,
                    total_failed: statistics.total_failed,
                    total_customers: statistics.total_customers
                },
                sync_enabled: getSetting('omnichat_sync_enabled', false),
                sync_schedule: getSetting('omnichat_sync_schedule', 'manual')
            }
        });
    } catch (error) {
        logger.error('[Integration] Error fetching sync status:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_SYNC_STATUS_ERROR',
            message: 'Failed to fetch sync status'
        });
    }
});

module.exports = router;
