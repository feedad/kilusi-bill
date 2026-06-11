const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const { logger } = require('../../../config/logger');
const { asyncHandler } = require('../../../middleware/response');
const { jwtAuth } = require('../../../middleware/jwtAuth');

// GET /api/v1/installations - Get all installations (admin)
router.get('/', jwtAuth, asyncHandler(async (req, res) => {
    const { status, technician_id, limit = 50, offset = 0 } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
        whereClause += ` AND i.status = $${paramIndex++}`;
        params.push(status);
    }

    if (technician_id) {
        whereClause += ` AND i.technician_id = $${paramIndex++}`;
        params.push(technician_id);
    }

    params.push(limit, offset);
    const limitParam = paramIndex++;
    const offsetParam = paramIndex++;

    const result = await query(`
        SELECT
            i.*,
            c.name as customer_name,
            c.phone as customer_phone,
            c.address as customer_address,
            u.name as technician_name,
            u.phone as technician_phone,
            p.name as package_name,
            p.speed as package_speed
        FROM installations i
        LEFT JOIN customers c ON i.customer_id = c.id
        LEFT JOIN users u ON i.technician_id = u.id
        LEFT JOIN services s ON s.customer_id = c.id
        LEFT JOIN packages p ON p.id = s.package_id
        ${whereClause}
        ORDER BY i.created_at DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}
    `, params);

    return res.sendSuccess(result.rows);
}));

// GET /api/v1/installations/:id - Get installation detail
router.get('/:id', jwtAuth, asyncHandler(async (req, res) => {
    const installationId = req.params.id;

    const result = await query(`
        SELECT
            i.*,
            c.name as customer_name,
            c.phone as customer_phone,
            c.address as customer_address,
            c.email as customer_email,
            u.name as technician_name,
            u.phone as technician_phone,
            u.id as technician_user_id,
            p.name as package_name,
            p.speed as package_speed
        FROM installations i
        LEFT JOIN customers c ON i.customer_id = c.id
        LEFT JOIN users u ON i.technician_id = u.id
        LEFT JOIN services s ON s.customer_id = c.id
        LEFT JOIN packages p ON p.id = s.package_id
        WHERE i.id = $1
    `, [installationId]);

    if (result.rows.length === 0) {
        return res.sendNotFound('Instalasi');
    }

    return res.sendSuccess(result.rows[0]);
}));

// POST /api/v1/installations - Create installation job (assign to technician)
router.post('/', jwtAuth, asyncHandler(async (req, res) => {
    const {
        customer_id,
        technician_id,
        scheduled_date,
        notes
    } = req.body;

    // Validation
    const validationErrors = [];
    if (!customer_id) {
        validationErrors.push({
            field: 'customer_id',
            message: 'Customer ID wajib diisi',
            value: customer_id
        });
    }
    if (!technician_id) {
        validationErrors.push({
            field: 'technician_id',
            message: 'Technician ID wajib diisi',
            value: technician_id
        });
    }

    if (validationErrors.length > 0) {
        return res.sendValidationErrors(validationErrors);
    }

    // Verify customer exists
    const customerResult = await query('SELECT id, name, phone FROM customers WHERE id = $1', [customer_id]);
    if (customerResult.rows.length === 0) {
        return res.sendNotFound('Customer');
    }

    // Verify technician exists
    const technicianResult = await query('SELECT id, name, phone FROM users WHERE id = $1 AND role = $2', [technician_id, 'technician']);
    if (technicianResult.rows.length === 0) {
        return res.sendNotFound('Teknisi');
    }

    // Get package info
    const packageResult = await query(`
        SELECT p.name, p.speed
        FROM services s
        LEFT JOIN packages p ON p.id = s.package_id
        WHERE s.customer_id = $1
    `, [customer_id]);

    const packageName = packageResult.rows[0]?.name || 'Paket Standard';
    const packageSpeed = packageResult.rows[0]?.speed || '-';

    // Create installation job
    const result = await query(`
        INSERT INTO installations (
            customer_id, technician_id, scheduled_date, notes, status
        ) VALUES ($1, $2, $3, $4, 'scheduled')
        RETURNING *
    `, [customer_id, technician_id, scheduled_date, notes]);

    const installation = result.rows[0];

    // Send notification to technician
    try {
        const whatsappNotifications = require('../../../config/whatsapp-notifications');
        await whatsappNotifications.notifyTechnicianNewTask(technician_id, {
            installationId: installation.id,
            customerName: customerResult.rows[0].name,
            customerPhone: customerResult.rows[0].phone,
            address: customerResult.rows[0].address,
            packageName: packageName,
            packageSpeed: packageSpeed,
            scheduleDate: scheduled_date ? new Date(scheduled_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : null,
            scheduleTime: scheduled_date ? new Date(scheduled_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : null
        });
        logger.info(`📱 Technician notified about installation ${installation.id}`);
    } catch (notifError) {
        logger.error(`Failed to send notification to technician:`, notifError.message);
        // Don't fail the request if notification fails
    }

    return res.sendCreated({ installation: installation }, {
        technician_notified: true
    });
}));

// PUT /api/v1/installations/:id - Update installation
router.put('/:id', jwtAuth, asyncHandler(async (req, res) => {
    const installationId = req.params.id;
    const { technician_id, scheduled_date, status, notes } = req.body;

    const validStatuses = ['scheduled', 'in_progress', 'completed', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
        return res.sendValidationErrors([{
            field: 'status',
            message: 'Status tidak valid. Gunakan: scheduled, in_progress, completed, atau cancelled',
            value: status,
            valid_options: validStatuses
        }]);
    }

    const result = await query(`
        UPDATE installations
        SET
            technician_id = COALESCE($1, technician_id),
            scheduled_date = COALESCE($2, scheduled_date),
            status = COALESCE($3, status),
            notes = COALESCE($4, notes),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING *
    `, [technician_id, scheduled_date, status, notes, installationId]);

    if (result.rows.length === 0) {
        return res.sendNotFound('Instalasi');
    }

    // If status changed to completed, update completed_date
    if (status === 'completed') {
        await query(`
            UPDATE installations
            SET completed_date = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [installationId]);
    }

    return res.sendSuccess({ installation: result.rows[0] });
}));

// GET /api/v1/installations/technician/list - Get list of technicians
router.get('/technician/list', jwtAuth, asyncHandler(async (req, res) => {
    const result = await query(`
        SELECT id, username, username as name, phone
        FROM users
        WHERE role = 'technician'
        ORDER BY username ASC
    `);

    return res.sendSuccess(result.rows);
}));

module.exports = router;
