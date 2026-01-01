/**
 * Development ODP API Routes - No Authentication Required
 * For development purposes only
 */

const express = require('express');
const router = express.Router();
const odpService = require('/home/feedad/Project/kilusi-bill/backend/services/odp-service');

// ============================================
// ODP MANAGEMENT ENDPOINTS (NO AUTH)
// ============================================

/**
 * GET /api/v1/dev-odp
 * Get all ODPs - NO AUTH REQUIRED
 */
router.get('/', async (req, res) => {
    try {
        console.log('🚀 Dev ODP API: Getting all ODPs (no auth)');
        const filters = {
            status: req.query.status,
            parent_odp_id: req.query.parent_odp_id,
            search: req.query.search
        };

        const odps = await odpService.getAllODPs(filters);
        console.log(`✅ Dev ODP API: Found ${odps.length} ODPs`);

        res.json({
            success: true,
            message: 'ODPs retrieved successfully (dev mode)',
            data: odps,
            count: odps.length
        });
    } catch (error) {
        console.error('❌ Dev ODP API Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve ODPs',
            error: error.message
        });
    }
});

/**
 * POST /api/v1/dev-odp
 * Create new ODP - NO AUTH REQUIRED
 */
router.post('/', async (req, res) => {
    try {
        console.log('🚀 Dev ODP API: Creating new ODP (no auth)');
        console.log('📝 Request body:', req.body);

        const { name, code, address, latitude, longitude, capacity, status, parent_odp_id, notes } = req.body;

        // Basic validation
        if (!name || !code) {
            return res.status(400).json({
                success: false,
                message: 'Name and code are required'
            });
        }

        const odpData = {
            name: name.trim(),
            code: code.trim(),
            address: address?.trim() || null,
            latitude: latitude ? parseFloat(latitude) : null,
            longitude: longitude ? parseFloat(longitude) : null,
            capacity: capacity ? parseInt(capacity) : 64,
            status: status || 'active',
            parent_odp_id: parent_odp_id ? parseInt(parent_odp_id) : null,
            notes: notes?.trim() || null
        };

        const odp = await odpService.createODP(odpData);
        console.log(`✅ Dev ODP API: Created ODP "${odp.name}" (ID: ${odp.id})`);

        res.status(201).json({
            success: true,
            message: 'ODP created successfully (dev mode)',
            data: odp
        });
    } catch (error) {
        console.error('❌ Dev ODP API Error:', error.message);

        let statusCode = 500;
        let message = 'Failed to create ODP';

        if (error.message === 'ODP code already exists') {
            statusCode = 409;
            message = 'ODP code already exists';
        } else if (error.message === 'Parent ODP not found') {
            statusCode = 400;
            message = 'Parent ODP not found';
        }

        res.status(statusCode).json({
            success: false,
            message,
            error: error.message
        });
    }
});

/**
 * GET /api/v1/dev-odp/stats
 * Get ODP statistics - NO AUTH REQUIRED
 */
router.get('/stats', async (req, res) => {
    try {
        console.log('🚀 Dev ODP API: Getting stats (no auth)');
        const stats = await odpService.getODPStats();

        if (!stats) {
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve ODP statistics'
            });
        }

        console.log('✅ Dev ODP API: Stats retrieved');
        res.json({
            success: true,
            message: 'ODP statistics retrieved successfully (dev mode)',
            data: stats
        });
    } catch (error) {
        console.error('❌ Dev ODP API Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve ODP statistics',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/dev-odp/parents
 * Get parent ODPs - NO AUTH REQUIRED
 */
router.get('/parents', async (req, res) => {
    try {
        console.log('🚀 Dev ODP API: Getting parent ODPs (no auth)');
        const parents = await odpService.getParentODPs();

        res.json({
            success: true,
            message: 'Parent ODPs retrieved successfully (dev mode)',
            data: parents,
            count: parents.length
        });
    } catch (error) {
        console.error('❌ Dev ODP API Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve parent ODPs',
            error: error.message
        });
    }
});

module.exports = router;