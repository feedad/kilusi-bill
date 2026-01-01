const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { asyncHandler } = require('../../../middleware/response');
const radiusService = require('../../../services/radius-service');

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
    res.json({ success: true, message: 'NAS deleted successfully' });
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

module.exports = router;