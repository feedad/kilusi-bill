const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { jwtAuth } = require('../../../middleware/jwtAuth');
const { asyncHandler } = require('../../../middleware/response');
const RadiusCommentService = require('../../../services/radius-comment-service');
// POST /api/v1/radius-comments/sync - Clean up invalid radreply comments & verify lookup readiness
router.post('/sync', jwtAuth, asyncHandler(async (req, res) => {
    try {
        logger.info('🔄 Starting manual sync/cleanup of RADIUS comments...');

        // Check if RADIUS is accessible
        const radiusAccessible = await RadiusCommentService.checkRadiusAccess();
        if (!radiusAccessible) {
            return res.sendError(
                'RADIUS_UNAVAILABLE',
                'RADIUS database is not accessible. Please check RADIUS configuration.',
                {},
                503
            );
        }

        // Perform bulk sync / cleanup
        const syncedCount = await RadiusCommentService.syncAllCustomerComments();

        return res.sendSuccess({
            syncedCount,
            message: `Successfully verified ${syncedCount} customer PPPoE comment lookups`
        }, {
            totalSynced: syncedCount,
            radiusAccessible: radiusAccessible
        });

    } catch (error) {
        logger.error('Error in manual RADIUS comment sync:', error);
        return res.sendError(
            'SYNC_ERROR',
            'Failed to sync customer comments to RADIUS',
            { error: error.message }
        );
    }
}));

// GET /api/v1/radius-comments/status - Check RADIUS comment service status
router.get('/status', jwtAuth, asyncHandler(async (req, res) => {
    try {
        const radiusAccessible = await RadiusCommentService.checkRadiusAccess();

        // Get some statistics
        const { query } = require('../../../config/database');

        let invalidRadreplyComments = 0;
        let totalCustomersWithPPPoE = 0;

        if (radiusAccessible) {
            // Count any remaining invalid Mikrotik-Comment rows in radreply
            const commentCount = await query(`
                SELECT COUNT(*) as count
                FROM radreply
                WHERE attribute = 'Mikrotik-Comment'
            `);
            invalidRadreplyComments = parseInt(commentCount.rows[0].count, 10);

            // Count customers with PPPoE in technical_details
            const pppoeCount = await query(`
                SELECT COUNT(*) as count
                FROM technical_details td
                JOIN services s ON td.service_id = s.id
                JOIN customers c ON s.customer_id::text = c.id::text
                WHERE td.pppoe_username IS NOT NULL AND td.pppoe_username != ''
            `);
            totalCustomersWithPPPoE = parseInt(pppoeCount.rows[0].count, 10);
        }

        return res.sendSuccess({
            radiusAccessible,
            totalComments: totalCustomersWithPPPoE,
            invalidRadreplyComments,
            totalCustomersWithPPPoE,
            syncStatus: invalidRadreplyComments === 0 ? 'synced' : 'cleanup_needed'
        }, {
            serviceStatus: 'active',
            note: 'RouterOS does not support a RADIUS reply attribute for PPPoE comments',
            lastChecked: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error checking RADIUS comment status:', error);
        return res.sendError(
            'STATUS_ERROR',
            'Failed to check RADIUS comment service status',
            { error: error.message }
        );
    }
}));

// GET /api/v1/radius-comments/customer/:username - Get customer's RADIUS comment
router.get('/customer/:username', jwtAuth, asyncHandler(async (req, res) => {
    try {
        const { username } = req.params;

        if (!username) {
            return res.sendValidationErrors([
                {
                    field: 'username',
                    message: 'Username is required',
                    value: username
                }
            ]);
        }

        const radiusAccessible = await RadiusCommentService.checkRadiusAccess();
        if (!radiusAccessible) {
            return res.sendError(
                'RADIUS_UNAVAILABLE',
                'RADIUS database is not accessible',
                {},
                503
            );
        }

        const comment = await RadiusCommentService.getMikrotikComment(username);

        return res.sendSuccess({
            username,
            comment,
            hasComment: !!comment
        }, {
            commentLength: comment ? comment.length : 0
        });

    } catch (error) {
        logger.error('Error getting RADIUS comment:', error);
        return res.sendError(
            'GET_ERROR',
            'Failed to get RADIUS comment',
            { error: error.message }
        );
    }
}));

// DELETE /api/v1/radius-comments/customer/:username - Remove customer's RADIUS comment
router.delete('/customer/:username', jwtAuth, asyncHandler(async (req, res) => {
    try {
        const { username } = req.params;

        if (!username) {
            return res.sendValidationErrors([
                {
                    field: 'username',
                    message: 'Username is required',
                    value: username
                }
            ]);
        }

        const radiusAccessible = await RadiusCommentService.checkRadiusAccess();
        if (!radiusAccessible) {
            return res.sendError(
                'RADIUS_UNAVAILABLE',
                'RADIUS database is not accessible',
                {},
                503
            );
        }

        const removed = await RadiusCommentService.removeMikrotikComment(username);

        if (removed) {
            logger.info(`🗑️ Removed RADIUS comment for ${username}`);
            return res.sendSuccess({
                username,
                removed: true,
                message: `Successfully removed RADIUS comment for ${username}`
            });
        } else {
            return res.sendSuccess({
                username,
                removed: false,
                message: `No RADIUS comment found for ${username}`
            });
        }

    } catch (error) {
        logger.error('Error removing RADIUS comment:', error);
        return res.sendError(
            'DELETE_ERROR',
            'Failed to remove RADIUS comment',
            { error: error.message }
        );
    }
}));

module.exports = router;