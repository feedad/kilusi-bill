const express = require('express');
const router = express.Router();
const CustomerService = require('../../../services/customer-service');
const { jwtAuth } = require('../../../middleware/jwtAuth');
const { asyncHandler } = require('../../../middleware/response');
const { logger } = require('../../../config/logger');

// GET /api/v1/customers
router.get('/', jwtAuth, asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const has_service = req.query.has_service; // 'true', 'false', or undefined
    const exclude_status = req.query.exclude_status ? req.query.exclude_status.split(',') : undefined;
    const sort_field = req.query.sort_field;
    const sort_direction = req.query.sort_direction;
    const region_id = req.query.region_id || '';
    const package_id = req.query.package_id || '';
    const router_id = req.query.router_id || '';
    const mitra_id = req.query.mitra_id || '';

    const { data, pagination } = await CustomerService.getAllCustomers({
        page, limit, search, status, has_service, exclude_status,
        sort_field, sort_direction, region_id, package_id, router_id, mitra_id
    });

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

// GET /api/v1/customers/phone/:phone
// Get customer by phone number
router.get('/phone/:phone', jwtAuth, asyncHandler(async (req, res) => {
    const { phone } = req.params;
    const { getPool } = require('../../../config/database');
    const pool = getPool();

    try {
        // Clean phone number (remove special characters)
        const cleanedPhone = phone.replace(/\D/g, '');

        // Search by phone number (try with and without 62 prefix)
        // Use REGEXP_REPLACE to remove non-digit characters for comparison
        const result = await pool.query(`
            SELECT id, name, phone, email, address
            FROM customers
            WHERE REGEXP_REPLACE(phone, '\\D', '', 'g') = $1
               OR REGEXP_REPLACE(phone, '\\D', '', 'g') = $2
            LIMIT 1
        `, [cleanedPhone, cleanedPhone.startsWith('0') ? '62' + cleanedPhone.slice(1) : cleanedPhone]);

        if (result.rows.length === 0) {
            return res.sendSuccess({
                data: null,
                message: 'Customer not found',
                phone: phone
            });
        }

        return res.sendSuccess({
            data: result.rows[0]
        });
    } catch (error) {
        logger.error('Error fetching customer by phone:', error);
        throw error;
    }
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
        // Force status to 'pending' for new registrations (ignore any 'active' from frontend defaults)
        const customerData = { ...req.body, status: 'pending' };
        const { customer, radiusCommentUpdated } = await CustomerService.createCustomer(customerData);

        return res.sendSuccess({
            customer,
            billingInfo: {
                type: customer.billing_type,
                message: 'Invoice akan dibuat saat instalasi selesai'
            }
        }, {
            customerId: customer.id,
            billingType: customer.billing_type,
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
        const { reason } = req.body || {};
        const id = req.params.id.trim();
        const deletedCustomer = await CustomerService.deleteCustomer(id);
        if (!deletedCustomer) return res.sendNotFound('Pelanggan');

        // Send rejection notification via WhatsApp
        if (deletedCustomer.phone) {
            try {
                const whatsappNotifications = require('../../../config/whatsapp-notifications');
                await whatsappNotifications.sendRegistrationRejectedNotification(
                    deletedCustomer.phone,
                    {
                        customerName: deletedCustomer.name,
                        reason: reason || 'Data tidak lengkap atau tidak memenuhi persyaratan'
                    }
                );
                logger.info(`📱 Rejection notification sent to ${deletedCustomer.phone} for customer ${deletedCustomer.name}`);
            } catch (notifError) {
                logger.error(`Failed to send rejection notification:`, notifError.message);
                // Don't fail the request if notification fails
            }
        }

        return res.sendSuccess({}, {
            customerId: req.params.id,
            customerName: deletedCustomer.name,
            rejectionReason: reason,
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
        // New services always start as 'pending' until installation is complete
        const serviceData = { ...req.body, status: 'pending' };
        const result = await CustomerService.createService(req.params.id, serviceData);

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

// POST /api/v1/customers/:id/activate
// Mark installation as complete (admin or shared with technician)
router.post('/:id/activate', jwtAuth, asyncHandler(async (req, res) => {
    try {
        const activationService = require('../../../config/activation-service');
        const result = await activationService.activateCustomer(req.params.id, req.user?.username || 'admin');

        if (result.alreadyActive) {
            return res.sendSuccess(result, {
                message: 'Pelanggan sudah aktif sebelumnya',
                alreadyActive: true
            });
        }

        // Sync to RADIUS after successful activation (customer now active)
        if (global.appEvents) {
            try {
                const customer = await CustomerService.getCustomerById(req.params.id);
                if (customer?.customer && customer.customer.pppoe_username && customer.customer.pppoe_password) {
                    global.appEvents.emit('customer:upsert', customer.customer);
                    logger.info(`RADIUS sync triggered after activation for ${req.params.id}`);
                }
            } catch (e) {
                logger.warn(`RADIUS sync after activation failed for ${req.params.id}:`, e.message);
            }
        }

        return res.sendSuccess(result, {
            customerId: req.params.id,
            billingType: result.billingType,
            invoiceCreated: !!result.invoice,
            message: 'Instalasi berhasil diselesaikan'
        });
    } catch (error) {
        logger.error('Error activating customer:', error);
        return res.sendError('ACTIVATION_FAILED', error.message);
    }
}));

// POST /api/v1/customers/:id/process - Approve waiting registration (identity → create service)
router.post('/:id/process', jwtAuth, asyncHandler(async (req, res) => {
    try {
        const { query, getOne } = require('../../../config/database');
        const CustomerService = require('../../../services/customer-service');
        const whatsappNotifications = require('../../../config/whatsapp-notifications');

        // Verify customer exists
        const customer = await getOne('SELECT id, name, phone, address, selected_package_id FROM customers WHERE id = $1', [req.params.id]);
        if (!customer) {
            return res.sendError('NOT_FOUND', 'Customer tidak ditemukan');
        }

        // Check no existing active service for this customer
        const existing = await getOne(
            'SELECT id FROM services WHERE customer_id = $1 AND status != \'waiting\' LIMIT 1',
            [req.params.id]
        );
        if (existing) {
            return res.sendError('INVALID_STATUS', 'Pelanggan sudah memiliki layanan yang aktif');
        }

        if (!customer.selected_package_id) {
            return res.sendError('VALIDATION', 'Paket layanan belum dipilih');
        }

        // Read defaults from customer_default_settings
        const defaults = await query(`
            SELECT field_name, default_value FROM customer_default_settings
            WHERE is_active = true AND field_name IN ('billing_type', 'billing_cycle', 'pppoe_suffix', 'pppoe_password')
        `);
        const defMap = {};
        defaults.rows.forEach(r => { defMap[r.field_name] = r.default_value; });

        // Clean up any waiting service (from old flow)
        await query("DELETE FROM services WHERE customer_id = $1 AND status = 'waiting'", [req.params.id]);

        // Create service with defaults
        const serviceId = await CustomerService.createService(req.params.id, {
            package_id: customer.selected_package_id,
            billing_type: defMap.billing_type || 'prepaid',
            siklus: defMap.billing_cycle || 'tetap',
            pppoe_suffix: defMap.pppoe_suffix || 'kilusi.id',
            pppoe_password: defMap.pppoe_password || '1234567',
            status: 'pending'
        });

        // Copy coordinates from customers table to new service
        if (customer.latitude || customer.longitude) {
            await query(
                'UPDATE services SET latitude = $1, longitude = $2 WHERE id = $3',
                [customer.latitude, customer.longitude, serviceId]
            );
        }

        // Create installation record
        const { technician_id, scheduled_date, notes } = req.body;
        if (technician_id || scheduled_date || notes) {
            await query(`
                INSERT INTO installations (customer_id, technician_id, scheduled_date, notes, status)
                VALUES ($1, $2, $3, $4, 'scheduled')
            `, [req.params.id, technician_id || null, scheduled_date || null, notes || null]);
        }

        // Send WA notification to technician (non-blocking)
        if (technician_id) {
            try {
                const technician = await getOne(
                    'SELECT id, username as name, phone FROM users WHERE id = $1',
                    [technician_id]
                );
                if (technician && technician.phone) {
                    const packageData = await getOne(
                        'SELECT id, name, speed, price FROM packages WHERE id = $1',
                        [customer.selected_package_id]
                    );
                    const installationJob = {
                        job_number: `INS-${customer.id}`,
                        installation_date: scheduled_date || new Date().toISOString(),
                        installation_time: scheduled_date
                            ? new Date(scheduled_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                            : 'TBD',
                        customer_name: customer.name,
                        customer_phone: customer.phone,
                        customer_address: customer.address || '',
                        package_name: packageData?.name || '',
                        notes: notes || 'Tidak ada catatan',
                        equipment_needed: 'Standard equipment',
                        priority: 'Normal',
                    };
                    await whatsappNotifications.sendInstallationJobNotification(
                        technician, installationJob, customer, packageData
                    );
                    logger.info(`Installation WA sent to technician ${technician.name} for customer ${req.params.id}`);
                }
            } catch (waErr) {
                logger.warn(`Failed to send WA to technician for ${req.params.id}:`, waErr.message);
            }
        }

        logger.info(`Customer ${req.params.id} processed: service + installation created`);

        return res.sendSuccess({
            id: req.params.id,
            status: 'pending',
            message: 'Pendaftaran disetujui. Pelanggan siap untuk instalasi.'
        });
    } catch (error) {
        logger.error('Error processing customer:', error);
        return res.sendError('PROCESS_FAILED', error.message);
    }
}));

// GET /api/v1/customers/:id/package-history
router.get('/:id/package-history', jwtAuth, asyncHandler(async (req, res) => {
    const { query } = require('../../../config/database');
    const { service_number } = req.query;
    let sql, params;
    if (service_number) {
        sql = `SELECT * FROM package_change_history WHERE customer_id = $1 AND service_number = $2 ORDER BY changed_at DESC LIMIT 50`;
        params = [req.params.id, service_number];
    } else {
        sql = `SELECT * FROM package_change_history WHERE customer_id = $1 ORDER BY changed_at DESC LIMIT 50`;
        params = [req.params.id];
    }
    const result = await query(sql, params);
    return res.sendSuccess(result.rows);
}));

module.exports = router;