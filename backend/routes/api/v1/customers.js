const express = require('express');
const router = express.Router();
const CustomerService = require('../../../services/customer-service');
const { jwtAuth } = require('../../../middleware/jwtAuth');
const { asyncHandler } = require('../../../middleware/response');

// GET /api/v1/customers
router.get('/', jwtAuth, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const has_service = req.query.has_service; // 'true', 'false', or undefined

    const { data, pagination } = await CustomerService.getAllCustomers({ page, limit, search, status, has_service });

    return res.sendPaginated(data, pagination, {
        search: search || undefined,
        status: status || undefined,
        has_service: has_service || undefined,
        totalFiltered: pagination.total
    });
}));

// GET /api/v1/customers/next-sequence
router.get('/next-sequence', jwtAuth, asyncHandler(async (req, res) => {
    const nextSeq = await CustomerService.getNextSequence();
    return res.sendSuccess(nextSeq, {
        totalCustomers: nextSeq.totalCustomers,
        nextId: nextSeq.nextId
    });
}));

// GET /api/v1/customers/:id
router.get('/:id', jwtAuth, asyncHandler(async (req, res) => {
    const result = await CustomerService.getCustomerById(req.params.id);
    if (!result) return res.sendNotFound('Pelanggan');

    return res.sendSuccess({ customer: result.customer }, {
        customerId: req.params.id,
        invoicesCount: result.stats.invoicesCount,
        sessionsCount: result.stats.sessionsCount,
        hasConnectionStatus: !!result.customer.connection_status
    });
}));

// POST /api/v1/customers/identity
// Create customer identity only (no service)
router.post('/identity', jwtAuth, asyncHandler(async (req, res) => {
    try {
        const customer = await CustomerService.createIdentity(req.body);
        
        return res.sendSuccess({ customer }, {
            customerId: customer.id,
            message: 'Identitas pelanggan berhasil dibuat'
        }, 201);
    } catch (error) {
        if (error.code === 'RESOURCE_CONFLICT') {
            return res.sendError(error.code, error.message, [{ field: error.field, message: error.message, value: req.body[error.field] }], {}, 409);
        }
        throw error;
    }
}));

// POST /api/v1/customers
router.post('/', jwtAuth, asyncHandler(async (req, res) => {
    try {
        const { customer, invoiceResult, radiusCommentUpdated } = await CustomerService.createCustomer(req.body);

        // Emit event (keep it compatible with previous implementation)
        if (global.appEvents && customer.pppoe_username && customer.pppoe_password) {
            global.appEvents.emit('customer:upsert', customer);
        }

        return res.sendSuccess({
            customer,
            invoice: invoiceResult.invoice,
            billingInfo: {
                type: customer.billing_type,
                message: invoiceResult.message
            }
        }, {
            customerId: customer.id,
            billingType: customer.billing_type,
            invoiceCreated: !!invoiceResult.invoice,
            radiusSynced: !!(global.appEvents && customer.pppoe_username && customer.pppoe_password),
            radiusCommentUpdated
        }, 201);
    } catch (error) {
        if (error.code === 'RESOURCE_CONFLICT') {
            return res.sendError(error.code, error.message, [{ field: error.field, message: error.message, value: req.body[error.field] }], {}, 409);
        }
        throw error;
    }
}));

// PUT /api/v1/customers/:id
router.put('/:id', jwtAuth, asyncHandler(async (req, res) => {
    try {
        const result = await CustomerService.updateCustomer(req.params.id, req.body);
        if (!result) return res.sendNotFound('Pelanggan');

        const { customer, changes } = result;

        if (global.appEvents && customer.pppoe_username && customer.pppoe_password) {
            global.appEvents.emit('customer:upsert', customer);
        }

        return res.sendSuccess({ customer }, {
            customerId: req.params.id,
            radiusSynced: !!(global.appEvents && customer.pppoe_username && customer.pppoe_password),
            radiusCommentUpdated: changes.radiusCommentUpdated
        });
    } catch (error) {
        if (error.code === 'RESOURCE_CONFLICT') {
            return res.sendError(error.code, error.message, [{ field: error.field, message: error.message, value: req.body[error.field] }], {}, 409);
        }
        throw error;
    }
}));

// DELETE /api/v1/customers/:id
router.delete('/:id', jwtAuth, asyncHandler(async (req, res) => {
    try {
        const deletedCustomer = await CustomerService.deleteCustomer(req.params.id);
        if (!deletedCustomer) return res.sendNotFound('Pelanggan');

        return res.sendSuccess({}, {
            customerId: req.params.id,
            customerName: deletedCustomer.name,
            deletedAt: new Date().toISOString()
        });
    } catch (error) {
        if (error.code === 'RESOURCE_CONFLICT') {
            return res.sendError(error.code, error.message, [{ field: 'dependency', message: error.message, count: error.count }], {}, 409);
        }
        throw error;
    }
}));

// POST /api/v1/customers/:id/services
// Add new service to existing customer
router.post('/:id/services', jwtAuth, asyncHandler(async (req, res) => {
    try {
        const result = await CustomerService.createService(req.params.id, req.body);
        
        return res.sendSuccess(result, {
            customerId: req.params.id,
            serviceId: result.serviceId,
            message: 'Layanan baru berhasil ditambahkan'
        }, 201);
    } catch (error) {
        if (error.code === 'RESOURCE_CONFLICT') {
            return res.sendError(error.code, error.message, [{ field: error.field, message: error.message, value: req.body[error.field] }], {}, 409);
        }
        throw error;
    }
}));

module.exports = router;