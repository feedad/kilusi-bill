const express = require('express');
const router = express.Router();
const CustomerService = require('../../../services/customer-service');
const { jwtAuth } = require('../../../middleware/jwtAuth');
const { asyncHandler } = require('../../../middleware/response');
const { logger } = require('../../../config/logger');

// POST /api/v1/services
// Create new service for an existing customer
router.post('/', jwtAuth, asyncHandler(async (req, res) => {
    const { customer_id } = req.body;

    if (!customer_id) {
        return res.sendError('VALIDATION_ERROR', 'Customer ID is required');
    }

    try {
        // Verify customer exists
        const { query } = require('../../../config/database');
        const checkRes = await query('SELECT id FROM customers WHERE id = $1', [customer_id]);
        if (checkRes.rows.length === 0) {
            return res.sendNotFound('Pelanggan');
        }

        const result = await CustomerService.createService(customer_id, req.body);

        return res.sendSuccess({ 
            serviceId: result.serviceId,
            pppoe_username: result.pppoe_username 
        }, {
            customerId: customer_id,
            message: 'Layanan berhasil ditambahkan'
        }, 201);

    } catch (error) {
        if (error.code === 'RESOURCE_CONFLICT') {
            return res.sendError(error.code, error.message, [{ field: error.field, message: error.message, value: req.body[error.field] }], {}, 409);
        }
        throw error;
    }
}));

module.exports = router;
