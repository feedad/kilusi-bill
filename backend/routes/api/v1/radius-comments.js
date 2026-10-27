const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { jwtAuth } = require('../../../middleware/jwtAuth');
const localIpOnly = require('../../../middleware/localIpOnly');
const { asyncHandler } = require('../../../middleware/response');
const RadiusCommentService = require('../../../services/radius-comment-service');

// GET /api/v1/radius-comments/lookup - Plain-text customer name + region lookup for MikroTik RouterOS scripts
router.get('/lookup', asyncHandler(async (req, res) => {
    const username = req.query.user || req.query.username;
    const wantJson = req.query.format === 'json';
    const includeFull = req.query.full === '1' || req.query.full === 'true';
    const excludeRegion = req.query.region === '0' || req.query.region === 'false';

    if (!username) {
        if (wantJson) {
            return res.status(400).json({
                success: false,
                message: 'Query parameter user or username is required',
                data: null
            });
        }
        return res.status(400).type('text/plain; charset=utf-8').send('UNKNOWN');
    }

    const customer = await RadiusCommentService.getCustomerByPppoeUsername(username);

    if (wantJson) {
        return res.json({
            success: true,
            data: customer
        });
    }

    res.type('text/plain; charset=utf-8');
    if (!customer || !customer.sanitized_name) {
        return res.send('UNKNOWN');
    }

    if (includeFull) {
        return res.send(RadiusCommentService.formatComment(customer, RadiusCommentService.normalizeUsername(username)));
    }

    if (excludeRegion) {
        return res.send(customer.sanitized_name);
    }

    return res.send(customer.display_label);
}));

// GET /api/v1/radius-comments/mikrotik-script - Generate RouterOS PPP profile on-up/on-down & active session sync script
router.get('/mikrotik-script', asyncHandler(async (req, res) => {
    const apiUrl = String(req.query.api_url || 'https://api.kilusi.id').replace(/\/+$/, '');
    const checkCertOpt = apiUrl.startsWith('https://') ? ' check-certificate=no' : '';
    const profileFilter = req.query.profile || '';

    const script = [
        '# ============================================================================',
        '# Kilusi Bill - MikroTik PPPoE Customer Comment: NAMA-MITRA (PPPOE-ACTIVE)',
        '# View in WinBox: IP -> Firewall -> Address Lists (Filter List: PPPOE-ACTIVE)',
        '# ============================================================================',
        '',
        '# 1. PPP Profile on-up script (paste into /ppp profile on-up):',
        ':local custName $user;',
        `:do { :local res [/tool fetch url=("${apiUrl}/api/v1/radius-comments/lookup?user=" . $user)${checkCertOpt} as-value output=user]; :if (($res->"status") = "finished" and ($res->"data") != "") do={ :set custName ($res->"data"); } } on-error={};`,
        ':do { /ip firewall address-list remove [find where list="PPPOE-ACTIVE" and address=$"remote-address"]; } on-error={};',
        ':do { /ip firewall address-list add list="PPPOE-ACTIVE" address=$"remote-address" comment=$custName; } on-error={};',
        ':log info ("PPPoE-UP: " . $user . " -> " . $custName . " IP=" . $"remote-address");',
        '',
        '# 2. PPP Profile on-down script (paste into /ppp profile on-down):',
        ':do { /ip firewall address-list remove [find where list="PPPOE-ACTIVE" and address=$"remote-address"]; } on-error={};',
        '',
        '# 3. One-time sync for all currently active PPPoE sessions (run in Terminal):',
        ':foreach i in=[/ppp active find where service="pppoe"] do={',
        '    :local u [/ppp active get $i name];',
        '    :local ip [/ppp active get $i address];',
        '    :local custName $u;',
        `    :do { :local res [/tool fetch url=("${apiUrl}/api/v1/radius-comments/lookup?user=" . $u)${checkCertOpt} as-value output=user]; :if (($res->"status") = "finished" and ($res->"data") != "") do={ :set custName ($res->"data"); } } on-error={};`,
        '    :do { /ip firewall address-list remove [find where list="PPPOE-ACTIVE" and address=$ip]; } on-error={};',
        '    :do { /ip firewall address-list add list="PPPOE-ACTIVE" address=$ip comment=$custName; } on-error={};',
        '}',
        ...(profileFilter ? [
            '',
            `# 4. Apply on-up / on-down to PPP profile "${profileFilter}":`,
            `/ppp profile set [find where name="${profileFilter}"] on-up=":local custName \\$user; :do { :local res [/tool fetch url=(\\"${apiUrl}/api/v1/radius-comments/lookup?user=\\" . \\$user)${checkCertOpt} as-value output=user]; :if ((\\$res->\\"status\\") = \\"finished\\" and (\\$res->\\"data\\") != \\"\\") do={ :set custName (\\$res->\\"data\\"); } } on-error={}; :do { /ip firewall address-list remove [find where list=\\"PPPOE-ACTIVE\\" and address=\\$\\\"remote-address\\\"]; } on-error={}; :do { /ip firewall address-list add list=\\"PPPOE-ACTIVE\\" address=\\$\\\"remote-address\\\" comment=\\$custName; } on-error={}; :log info (\\"PPPoE-UP: \\" . \\$user . \\" -> \\" . \\$custName . \\" IP=\\" . \\$\\\"remote-address\\\");" on-down=":do { /ip firewall address-list remove [find where list=\\"PPPOE-ACTIVE\\" and address=\\$\\\"remote-address\\\"]; } on-error={};"`
        ] : [])
    ].join('\n');

    res.type('text/plain; charset=utf-8').send(script + '\n');
}));

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
            lookupEndpoint: '/api/v1/radius-comments/lookup',
            scriptEndpoint: '/api/v1/radius-comments/mikrotik-script',
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