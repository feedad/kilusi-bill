const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { asyncHandler } = require('../../../middleware/response');
const radiusService = require('../../../services/radius-service');

// Helper: reload FreeRADIUS clients from database (HUP signal, no downtime)
function reloadFreeRadiusClients() {
    const { exec } = require('child_process');
    exec('docker kill -s HUP kilusi-freeradius', (err) => {
        if (err) logger.warn('FreeRADIUS HUP failed:', err.message);
        else logger.info('FreeRADIUS HUP sent — reloading NAS client list');
    });
}

// Regenerate CoA proxy config on FreeRADIUS server and restart
function regenerateCoaConfig() {
    const { exec } = require('child_process');
    const cmd = "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 feedad@172.22.10.101 'sudo /usr/local/bin/gen-coa-config.sh && sudo systemctl restart freeradius'";
    exec(cmd, (err, stdout, stderr) => {
        if (err) {
            logger.error('FreeRADIUS CoA config regeneration failed:', stderr || err.message);
        } else {
            logger.info('FreeRADIUS CoA config regenerated and restarted successfully');
            if (stdout) logger.debug('CoA regen output:', stdout.trim());
        }
    });
}

// Ensure SNMP Monitor service is running (side-effect import)
require('../../../services/snmp-monitor-service');

// GET /api/v1/radius/nas
router.get('/nas', asyncHandler(async (req, res) => {
    const nasList = await radiusService.getAllNas();
    res.json({ success: true, data: { nas: nasList } });
}));

// GET /api/v1/radius/nas/:id
router.get('/nas/:id', asyncHandler(async (req, res) => {
    const data = await radiusService.getNasById(req.params.id);
    if (!data) return res.sendNotFound('NAS Server');
    res.json({ success: true, data });
}));

// POST /api/v1/radius/nas
router.post('/nas', asyncHandler(async (req, res) => {
    try {
        const data = await radiusService.createNas(req.body);
        reloadFreeRadiusClients();
        regenerateCoaConfig();
        res.status(201).json({ success: true, message: 'NAS created successfully', data });
    } catch (e) {
        if (e.code === 'CONFLICT') return res.status(409).json({ success: false, message: e.message });
        throw e;
    }
}));

// PUT /api/v1/radius/nas/:id
router.put('/nas/:id', asyncHandler(async (req, res) => {
    try {
        const data = await radiusService.updateNas(req.params.id, req.body);
        reloadFreeRadiusClients();
        regenerateCoaConfig();
        res.json({ success: true, message: 'NAS updated successfully', data });
    } catch (e) {
        if (e.code === 'NOT_FOUND') return res.sendNotFound('NAS Server');
        if (e.code === 'CONFLICT') return res.sendError('CONFLICT', e.message);
        throw e;
    }
}));

// DELETE /api/v1/radius/nas/:id
router.delete('/nas/:id', asyncHandler(async (req, res) => {
    const success = await radiusService.deleteNas(req.params.id);
    if (!success) return res.sendNotFound('NAS Server');
    reloadFreeRadiusClients();
    regenerateCoaConfig();
    res.json({ success: true, message: 'NAS deleted successfully' });
}));

// POST /api/v1/radius/nas/regenerate-coa - Manual trigger for CoA config regeneration
router.post('/nas/regenerate-coa', asyncHandler(async (req, res) => {
    const { exec } = require('child_process');
    const cmd = "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 feedad@172.22.10.101 'sudo /usr/local/bin/gen-coa-config.sh && sudo systemctl restart freeradius'";
    exec(cmd, (err, stdout, stderr) => {
        if (err) {
            logger.error('CoA config regeneration failed:', stderr || err.message);
            return res.status(500).json({ success: false, message: 'Gagal regenerate: ' + (stderr || err.message) });
        }
        logger.info('CoA config regenerated manually');
        res.json({ success: true, message: 'CoA config regenerated and FreeRADIUS restarted', output: stdout.trim() });
    });
}));

// POST /api/v1/radius/nas/bulk/test (Bulk test)
router.post('/nas/bulk/test', asyncHandler(async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) return res.sendValidationErrors([{ field: 'ids', message: 'Array of IDs required' }]);

    // We can run concurrently
    const results = await Promise.all(ids.map(async (id) => {
        try {
            const result = await radiusService.testConnection(id);
            const nas = await radiusService.getNasById(id); // fetching again for name info or could optimize
            return {
                id,
                shortname: nas ? nas.shortname : 'Unknown',
                nasname: nas ? nas.nasname : 'Unknown',
                test_results: result
            };
        } catch (e) {
            return { id, error: e.message };
        }
    }));

    res.json({ success: true, message: 'Bulk test completed', data: { results, total: results.length } });
}));

// POST /api/v1/radius/nas/:id/test
router.post('/nas/:id/test', asyncHandler(async (req, res) => {
    try {
        const result = await radiusService.testConnection(req.params.id);
        const nas = await radiusService.getNasById(req.params.id);
        res.json({
            success: true,
            message: 'Connection test completed',
            data: {
                nas: { shortname: nas.shortname, nasname: nas.nasname },
                test_results: result
            }
        });
    } catch (e) {
        if (e.code === 'NOT_FOUND') return res.sendNotFound('NAS Server');
        throw e;
    }
}));

// GET /api/v1/radius/nas/:id/stats
router.get('/nas/:id/stats', asyncHandler(async (req, res) => {
    const stats = await radiusService.getNasStats(req.params.id);
    if (!stats) return res.sendNotFound('NAS Server');
    res.json({ success: true, data: stats });
}));

// GET /api/v1/radius/nas/:id/snmp-detail - Get detailed SNMP information
router.get('/nas/:id/snmp-detail', asyncHandler(async (req, res) => {
    const snmpMonitorService = require('../../../services/snmp-monitor-service');

    try {
        const data = await snmpMonitorService.getDetailedInfo(req.params.id);
        res.json({ success: true, data });
    } catch (e) {
        if (e.code === 'NOT_FOUND') return res.status(404).json({ success: false, message: e.message });
        if (e.code === 'SNMP_ERROR') return res.status(500).json({ success: false, message: e.message });
        throw e;
    }
}));

// GET /api/v1/radius/nas/:id/interfaces
router.get('/nas/:id/interfaces', asyncHandler(async (req, res) => {
    const data = await radiusService.getNasInterfaces(req.params.id);
    res.json({ success: true, data });
}));

// GET /api/v1/radius/nas/:id/traffic
router.get('/nas/:id/traffic', asyncHandler(async (req, res) => {
    const data = await radiusService.getNasTraffic(req.params.id, req.query.range);
    res.json({ success: true, data });
}));

// GET /api/v1/radius/connection-status/:username
router.get('/connection-status/:username', asyncHandler(async (req, res) => {
    const { username } = req.params;
    const status = await radiusService.getUserConnectionStatus(username);
    res.json({
        success: true,
        data: { connectionStatus: status },
        meta: {
            username,
            checked_at: new Date().toISOString(),
            connection_found: !!status,
            active_sessions: status?.activeSessions || 0
        }
    });
}));

// GET /api/v1/radius/connection-status-public/:username
router.get('/connection-status-public/:username', asyncHandler(async (req, res) => {
    const { username } = req.params;
    const status = await radiusService.getUserConnectionStatus(username);
    res.json({
        success: true,
        data: { connectionStatus: status },
        meta: {
            username,
            checked_at: new Date().toISOString(),
            connection_found: !!status,
            active_sessions: status?.activeSessions || 0,
            public_endpoint: true
        }
    });
}));

// POST /api/v1/radius/orphan-cleanup - Remove RADIUS users without active service
router.post('/orphan-cleanup', asyncHandler(async (req, res) => {
    try {
        const { query } = require('../../../config/database');
        const radiusDb = require('../../../config/radius-postgres');
        
        // Get all PPPoE usernames from radcheck
        const radcheckUsers = await query(`SELECT username FROM radcheck WHERE username IS NOT NULL`);
        
        // Get all active service numbers from services
        const activeServices = await query(`
            SELECT DISTINCT s.service_number FROM services s 
            WHERE s.status IN ('active', 'suspended')
        `);
        const serviceNumbers = new Set(activeServices.rows.map(r => r.service_number));
        
        let cleaned = 0;
        for (const row of radcheckUsers.rows) {
            const baseUsername = row.username.split('@')[0];
            // Check if any active service number matches this username
            if (!serviceNumbers.has(baseUsername)) {
                await radiusDb.deleteRadiusUser(row.username);
                cleaned++;
                logger.info(`Orphan cleanup: removed ${row.username}`);
            }
        }
        
        return res.sendSuccess({ cleaned }, { message: `${cleaned} orphan users cleaned` });
    } catch (error) {
        logger.error('Orphan cleanup error:', error);
        return res.sendError('INTERNAL_ERROR', 'Gagal membersihkan orphan RADIUS');
    }
}));

module.exports = router;