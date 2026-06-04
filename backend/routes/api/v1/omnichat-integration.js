/**
 * Omnichat Integration Routes (Public)
 *
 * Public API endpoints for Omnichat integration
 * These are accessible via API key authentication from Omnichat frontend
 *
 * @module routes/api/v1/omnichat-integration
 */

const express = require('express');
const router = express.Router();
const { getSetting } = require('../../../config/settingsManager');
const { logger } = require('../../../config/logger');
const omnichatContactSync = require('../../../services/omnichat-contact-sync');

/**
 * Verify API key for Omnichat integration requests
 * Accepts API key via X-API-Key header or Authorization header
 */
const verifyOmnichatApiKey = async (req, res, next) => {
    try {
        // Get API key from header (try both X-API-Key and Authorization)
        const apiKey = req.headers['x-api-key'] ||
                       req.headers['authorization']?.replace('Bearer ', '') ||
                       req.headers['authorization']?.replace('Basic ', '');

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'API_KEY_MISSING',
                message: 'API key is required. Please provide X-API-Key header.'
            });
        }

        // Get expected API key from settings or environment
        const expectedApiKey = getSetting('kilusi_omnichat_api_key') ||
                               getSetting('integration_api_key') ||
                               process.env.KILUSI_OMNICHAT_API_KEY;

        if (!expectedApiKey) {
            logger.error('[OmnichatIntegration] API key not configured');
            return res.status(500).json({
                success: false,
                error: 'API_KEY_NOT_CONFIGURED',
                message: 'Integration API key not configured on server'
            });
        }

        // Verify API key
        if (apiKey !== expectedApiKey) {
            logger.warn('[OmnichatIntegration] Invalid API key attempt', {
                ip: req.ip,
                userAgent: req.headers['user-agent']
            });
            return res.status(403).json({
                success: false,
                error: 'INVALID_API_KEY',
                message: 'Invalid API key. Please check your Billing API Key in Omnichat settings.'
            });
        }

        // API key is valid
        req.omnichatAuth = true;
        next();
    } catch (error) {
        logger.error('[OmnichatIntegration] Error verifying API key:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Error verifying API key'
        });
    }
};

// Apply API key verification to all routes
router.use(verifyOmnichatApiKey);

/**
 * GET /api/v1/settings/billing/config
 * Get billing configuration for Omnichat
 */
router.get('/billing/config', async (req, res) => {
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
            grace_period: getSetting('billing_grace_period', '3'),
            auto_isolir: getSetting('billing_auto_isolir', false),
            isolir_profile: getSetting('billing_isolir_profile', 'ISOLIR'),
            invoice_prefix: getSetting('invoice_prefix', 'INV'),
            company_header: getSetting('company_header', 'KILUSI DIGITAL NETWORK'),
            footer_info: getSetting('footer_info', 'Info Hubungi : +628XXXXXXXXXX')
        };

        logger.info('[OmnichatIntegration] Billing config fetched', {
            ip: req.ip
        });

        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        logger.error('[OmnichatIntegration] Error fetching billing config:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_BILLING_CONFIG_ERROR',
            message: 'Failed to fetch billing configuration'
        });
    }
});

/**
 * GET /api/v1/settings/whatsapp/waba-config
 * Get WhatsApp WABA configuration for Omnichat
 */
router.get('/whatsapp/waba-config', async (req, res) => {
    try {
        const config = {
            provider: getSetting('whatsapp_provider', 'omnichat'),
            api_url: getSetting('kilusi_omnichat_api_url', 'https://whatsapp.kilusi.id/api'),
            phone_number_id: getSetting('whatsapp_phone_number_id'),
            waba_id: getSetting('whatsapp_waba_id'),
            fallback_enabled: getSetting('baileys_fallback_enabled', false),
            sync_enabled: getSetting('omnichat_sync_enabled', false),
            sync_schedule: getSetting('omnichat_sync_schedule', 'manual'),
            sync_time: getSetting('omnichat_sync_time', '02:00')
        };

        logger.info('[OmnichatIntegration] WABA config fetched', {
            ip: req.ip
        });

        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        logger.error('[OmnichatIntegration] Error fetching WABA config:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_WABA_CONFIG_ERROR',
            message: 'Failed to fetch WhatsApp configuration'
        });
    }
});

/**
 * GET /api/v1/settings/integration/api-keys
 * Get integration API keys for Omnichat (returns masked keys for security)
 */
router.get('/integration/api-keys', async (req, res) => {
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
            api_key_prefix: apiKey ? apiKey.substring(0, 10) + '...' : null,
            integration_enabled: true
        };

        logger.info('[OmnichatIntegration] API keys config fetched', {
            ip: req.ip
        });

        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        logger.error('[OmnichatIntegration] Error fetching API keys:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_API_KEYS_ERROR',
            message: 'Failed to fetch API keys configuration'
        });
    }
});

module.exports = router;
