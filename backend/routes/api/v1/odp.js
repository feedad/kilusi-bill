/**
 * ODP Management API Routes
 * RESTful API endpoints for ODP and cable route management
 */

const express = require('express');
const router = express.Router();
const odpService = require('../../../services/odp-service');
const { jwtAuth } = require('../../../middleware/jwtAuth');

// Middleware to validate request body
const validateODP = (req, res, next) => {
    const { name, code, capacity } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
            success: false,
            message: 'ODP name is required and must be a non-empty string'
        });
    }

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
        return res.status(400).json({
            success: false,
            message: 'ODP code is required and must be a non-empty string'
        });
    }

    if (capacity && (isNaN(capacity) || parseInt(capacity) < 1 || parseInt(capacity) > 128)) {
        return res.status(400).json({
            success: false,
            message: 'Capacity must be a number between 1 and 128'
        });
    }

    // Validate coordinates if provided
    if (req.body.latitude && (isNaN(req.body.latitude) || req.body.latitude < -90 || req.body.latitude > 90)) {
        return res.status(400).json({
            success: false,
            message: 'Latitude must be between -90 and 90'
        });
    }

    if (req.body.longitude && (isNaN(req.body.longitude) || req.body.longitude < -180 || req.body.longitude > 180)) {
        return res.status(400).json({
            success: false,
            message: 'Longitude must be between -180 and 180'
        });
    }

    next();
};

// ============================================
// ODP MANAGEMENT ENDPOINTS
// ============================================

/**
 * GET /api/v1/odp
 * Get all ODPs with optional filtering
 */
router.get('/', jwtAuth, async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            parent_odp_id: req.query.parent_odp_id,
            search: req.query.search
        };

        const odps = await odpService.getAllODPs(filters);

        res.json({
            success: true,
            message: 'ODPs retrieved successfully',
            data: odps,
            count: odps.length
        });
    } catch (error) {
        console.error('Error getting ODPs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve ODPs',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/odp/stats
 * Get ODP statistics
 */
router.get('/stats', jwtAuth, async (req, res) => {
    try {
        const stats = await odpService.getODPStats();

        if (!stats) {
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve ODP statistics'
            });
        }

        res.json({
            success: true,
            message: 'ODP statistics retrieved successfully',
            data: stats
        });
    } catch (error) {
        console.error('Error getting ODP stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve ODP statistics',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/odp/parents
 * Get parent ODPs for dropdown selection
 */
router.get('/parents', jwtAuth, async (req, res) => {
    try {
        const parents = await odpService.getParentODPs();

        res.json({
            success: true,
            message: 'Parent ODPs retrieved successfully',
            data: parents,
            count: parents.length
        });
    } catch (error) {
        console.error('Error getting parent ODPs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve parent ODPs',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/odp/:id
 * Get ODP by ID
 */
router.get('/:id', jwtAuth, async (req, res) => {
    try {
        const { id } = req.params;

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ODP ID'
            });
        }

        const odp = await odpService.getODPById(id);

        if (!odp) {
            return res.status(404).json({
                success: false,
                message: 'ODP not found'
            });
        }

        res.json({
            success: true,
            message: 'ODP retrieved successfully',
            data: odp
        });
    } catch (error) {
        console.error('Error getting ODP:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve ODP',
            error: error.message
        });
    }
});

/**
 * POST /api/v1/odp
 * Create new ODP
 */
router.post('/', jwtAuth, validateODP, async (req, res) => {
    try {
        const odpData = {
            name: req.body.name.trim(),
            code: req.body.code.trim(),
            address: req.body.address?.trim() || null,
            latitude: req.body.latitude ? parseFloat(req.body.latitude) : null,
            longitude: req.body.longitude ? parseFloat(req.body.longitude) : null,
            capacity: req.body.capacity ? parseInt(req.body.capacity) : 64,
            status: req.body.status || 'active',
            parent_odp_id: req.body.parent_odp_id ? parseInt(req.body.parent_odp_id) : null,
            notes: req.body.notes?.trim() || null
        };

        const odp = await odpService.createODP(odpData);

        res.status(201).json({
            success: true,
            message: 'ODP created successfully',
            data: odp
        });
    } catch (error) {
        console.error('Error creating ODP:', error);

        let statusCode = 500;
        let message = 'Failed to create ODP';

        // Handle specific validation errors
        if (error.message === 'Parent ODP not found') {
            statusCode = 400;
            message = 'Parent ODP not found';
        } else if (error.message === 'ODP code already exists') {
            statusCode = 409;
            message = 'ODP code already exists';
        } else if (error.message === 'ODP cannot be its own parent') {
            statusCode = 400;
            message = 'ODP cannot be its own parent';
        }

        res.status(statusCode).json({
            success: false,
            message,
            error: error.message
        });
    }
});

/**
 * PUT /api/v1/odp/:id
 * Update ODP
 */
router.put('/:id', jwtAuth, validateODP, async (req, res) => {
    try {
        const { id } = req.params;

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ODP ID'
            });
        }

        const odpData = {
            name: req.body.name.trim(),
            code: req.body.code.trim(),
            address: req.body.address?.trim() || null,
            latitude: req.body.latitude ? parseFloat(req.body.latitude) : null,
            longitude: req.body.longitude ? parseFloat(req.body.longitude) : null,
            capacity: req.body.capacity ? parseInt(req.body.capacity) : 64,
            status: req.body.status || 'active',
            parent_odp_id: req.body.parent_odp_id ? parseInt(req.body.parent_odp_id) : null,
            notes: req.body.notes?.trim() || null
        };

        const odp = await odpService.updateODP(id, odpData);

        res.json({
            success: true,
            message: 'ODP updated successfully',
            data: odp
        });
    } catch (error) {
        console.error('Error updating ODP:', error);

        let statusCode = 500;
        let message = 'Failed to update ODP';

        // Handle specific validation errors
        if (error.message === 'ODP not found') {
            statusCode = 404;
            message = 'ODP not found';
        } else if (error.message === 'Parent ODP not found') {
            statusCode = 400;
            message = 'Parent ODP not found';
        } else if (error.message === 'ODP code already exists') {
            statusCode = 409;
            message = 'ODP code already exists';
        } else if (error.message === 'ODP cannot be its own parent') {
            statusCode = 400;
            message = 'ODP cannot be its own parent';
        }

        res.status(statusCode).json({
            success: false,
            message,
            error: error.message
        });
    }
});

/**
 * DELETE /api/v1/odp/:id
 * Delete ODP
 */
router.delete('/:id', jwtAuth, async (req, res) => {
    try {
        const { id } = req.params;

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ODP ID'
            });
        }

        await odpService.deleteODP(id);

        res.json({
            success: true,
            message: 'ODP deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting ODP:', error);

        let statusCode = 500;
        let message = 'Failed to delete ODP';

        // Handle specific validation errors
        if (error.message === 'ODP not found') {
            statusCode = 404;
            message = 'ODP not found';
        } else if (error.message === 'Cannot delete ODP with connected customers') {
            statusCode = 400;
            message = 'Cannot delete ODP that has connected customers';
        } else if (error.message === 'Cannot delete ODP that has child ODPs') {
            statusCode = 400;
            message = 'Cannot delete ODP that has child ODPs';
        }

        res.status(statusCode).json({
            success: false,
            message,
            error: error.message
        });
    }
});

// ============================================
// CABLE ROUTES ENDPOINTS
// ============================================

/**
 * GET /api/v1/odp/:id/cable-routes
 * Get cable routes for an ODP
 */
router.get('/:id/cable-routes', jwtAuth, async (req, res) => {
    try {
        const { id } = req.params;

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ODP ID'
            });
        }

        const filters = {
            status: req.query.status
        };

        const routes = await odpService.getODPCableRoutes(id, filters);

        res.json({
            success: true,
            message: 'Cable routes retrieved successfully',
            data: routes,
            count: routes.length
        });
    } catch (error) {
        console.error('Error getting cable routes:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve cable routes',
            error: error.message
        });
    }
});

/**
 * POST /api/v1/odp/:id/cable-routes
 * Create cable route for an ODP
 */
router.post('/:id/cable-routes', jwtAuth, async (req, res) => {
    try {
        const { id } = req.params;

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ODP ID'
            });
        }

        if (!req.body.customer_id || !req.body.customer_id.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Customer ID is required'
            });
        }

        if (req.body.port_number && (isNaN(req.body.port_number) || parseInt(req.body.port_number) < 1)) {
            return res.status(400).json({
                success: false,
                message: 'Port number must be a positive integer'
            });
        }

        const routeData = {
            odp_id: parseInt(id),
            customer_id: req.body.customer_id.trim(),
            cable_length: req.body.cable_length ? parseInt(req.body.cable_length) : null,
            port_number: req.body.port_number ? parseInt(req.body.port_number) : null,
            status: req.body.status || 'connected',
            installation_date: req.body.installation_date || null,
            notes: req.body.notes?.trim() || null
        };

        const route = await odpService.createCableRoute(routeData);

        res.status(201).json({
            success: true,
            message: 'Cable route created successfully',
            data: route
        });
    } catch (error) {
        console.error('Error creating cable route:', error);

        let statusCode = 500;
        let message = 'Failed to create cable route';

        // Handle specific validation errors
        if (error.message === 'ODP not found') {
            statusCode = 404;
            message = 'ODP not found';
        } else if (error.message === 'Customer not found') {
            statusCode = 404;
            message = 'Customer not found';
        } else if (error.message === 'Cable route already exists for this ODP and customer') {
            statusCode = 409;
            message = 'Cable route already exists for this ODP and customer';
        } else if (error.message === 'Port number already in use') {
            statusCode = 409;
            message = 'Port number already in use';
        }

        res.status(statusCode).json({
            success: false,
            message,
            error: error.message
        });
    }
});

module.exports = router;