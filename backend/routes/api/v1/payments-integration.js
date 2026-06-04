/**
 * Payments Integration Routes (Public)
 *
 * Public API endpoints for Omnichat payments integration
 *
 * @module routes/api/v1/payments-integration
 */

const express = require('express');
const router = express.Router();
const { getSetting } = require('../../../config/settingsManager');
const { logger } = require('../../../config/logger');
const omnichatContactSync = require('../../../services/omnichat-contact-sync');

/**
 * Verify API key for Omnichat integration requests
 */
const verifyOmnichatApiKey = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'] ||
                       req.headers['authorization']?.replace('Bearer ', '') ||
                       req.headers['authorization']?.replace('Basic ', '');

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'API_KEY_MISSING',
                message: 'API key is required'
            });
        }

        const expectedApiKey = getSetting('kilusi_omnichat_api_key') ||
                               getSetting('integration_api_key') ||
                               process.env.KILUSI_OMNICHAT_API_KEY;

        if (!expectedApiKey || apiKey !== expectedApiKey) {
            logger.warn('[PaymentsIntegration] Invalid API key attempt', {
                ip: req.ip
            });
            return res.status(403).json({
                success: false,
                error: 'INVALID_API_KEY',
                message: 'Invalid API key'
            });
        }

        req.omnichatAuth = true;
        next();
    } catch (error) {
        logger.error('[PaymentsIntegration] Error verifying API key:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Error verifying API key'
        });
    }
};

router.use(verifyOmnichatApiKey);

/**
 * POST /api/v1/payments/sync-contacts
 * Trigger contact sync from Omnichat
 */
router.post('/sync-contacts', async (req, res) => {
    try {
        logger.info('[PaymentsIntegration] Contact sync triggered from Omnichat', {
            ip: req.ip,
            body: req.body
        });

        // Start sync process
        const result = await omnichatContactSync.syncContacts();

        logger.info('[PaymentsIntegration] Contact sync completed', {
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
                last_sync: result.last_sync,
                message: `Sync completed: ${result.synced} contacts synced, ${result.failed} failed`
            }
        });
    } catch (error) {
        logger.error('[PaymentsIntegration] Error syncing contacts:', error);
        res.status(500).json({
            success: false,
            error: 'SYNC_CONTACTS_ERROR',
            message: 'Failed to sync contacts',
            details: error.message
        });
    }
});

/**
 * GET /api/v1/payments/sync-status
 * Get contact sync status
 */
router.get('/sync-status', async (req, res) => {
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
        logger.error('[PaymentsIntegration] Error fetching sync status:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_SYNC_STATUS_ERROR',
            message: 'Failed to fetch sync status'
        });
    }
});

module.exports = router;
