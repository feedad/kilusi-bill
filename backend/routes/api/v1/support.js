const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const { logger } = require('../../../config/logger');
const { asyncHandler } = require('../../../middleware/response');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/support-attachments';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Allowed file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, PDF, DOC, DOCX, and TXT files are allowed.'));
    }
  }
});

// Generate unique ticket number
async function generateTicketNumber() {
    const prefix = 'SUP';
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    // Get latest ticket number for this month
    const result = await query(`
        SELECT ticket_number FROM support_tickets
        WHERE ticket_number LIKE '${prefix}-${year}${month}%'
        ORDER BY ticket_number DESC
        LIMIT 1
    `);

    let sequence = 1;
    if (result.rows.length > 0) {
        const lastTicket = result.rows[0].ticket_number;
        const lastSequence = parseInt(lastTicket.split('-')[2]);
        sequence = lastSequence + 1;
    }

    return `${prefix}-${year}${month}-${String(sequence).padStart(3, '0')}`;
}

// GET /api/v1/support/tickets - Get all tickets (for admin)
router.get('/tickets', asyncHandler(async (req, res) => {
    const { status, category, customer_id, limit = 50, offset = 0 } = req.query;
    const page = Math.floor(offset / limit) + 1;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (customer_id) {
        whereClause += ` AND st.customer_id = $${paramIndex++}`;
        params.push(customer_id);
    }

    if (status && status !== 'all') {
        whereClause += ` AND st.status = $${paramIndex++}`;
        params.push(status);
    }

    if (category && category !== 'all') {
        whereClause += ` AND st.category = $${paramIndex++}`;
        params.push(category);
    }

    // Get total count
    const countParams = [...params];
    const countResult = await query(`
        SELECT COUNT(*) as total FROM support_tickets st
        LEFT JOIN customers_view c ON st.customer_id = c.id
        ${whereClause}
    `, countParams);

    const total = parseInt(countResult.rows[0].total);

    // Add limit and offset to params
    params.push(limit, offset);
    const limitParam = paramIndex++;
    const offsetParam = paramIndex++;

    const result = await query(`
        SELECT DISTINCT ON (st.id)
            st.*,
            c.name as customer_name,
            c.phone as customer_phone,
            c.username as customer_code,
            stm.sender_name as last_sender,
            stm.message as last_message,
            stm.created_at as last_message_at
        FROM support_tickets st
        LEFT JOIN customers_view c ON st.customer_id = c.id
        LEFT JOIN support_ticket_messages stm ON st.id = stm.ticket_id
        ${whereClause}
        ORDER BY st.id, stm.created_at DESC, st.updated_at DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}
    `, params);

    const pagination = {
        page,
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: offset + limit < total,
        hasPrev: offset > 0
    };

    const meta = {
        status: status || undefined,
        category: category || undefined,
        customer_id: customer_id || undefined,
        filters_applied: {
            status: !!status,
            category: !!category,
            customer_id: !!customer_id
        }
    };

    return res.sendPaginated(result.rows, pagination, meta);
}));

// GET /api/v1/support/tickets/:id - Get ticket details with messages
router.get('/tickets/:id', asyncHandler(async (req, res) => {
    const ticketId = req.params.id;

    // Get ticket details
    const ticketResult = await query(`
        SELECT
            st.*,
            c.name as customer_name,
            c.phone as customer_phone,
            c.username as customer_code,
            c.email as customer_email,
            c.address as customer_address,
            c.package_id
        FROM support_tickets st
        LEFT JOIN customers_view c ON st.customer_id = c.id
        WHERE st.id = $1
    `, [ticketId]);

    if (ticketResult.rows.length === 0) {
        return res.sendNotFound('Tiket');
    }

    // Get ticket messages
    const messagesResult = await query(`
        SELECT * FROM support_ticket_messages
        WHERE ticket_id = $1
        ORDER BY created_at ASC
    `, [ticketId]);

    const meta = {
        ticket_id: ticketId,
        messages_count: messagesResult.rows.length,
        has_customer_info: !!ticketResult.rows[0].customer_name
    };

    return res.sendSuccess({
        ticket: ticketResult.rows[0],
        messages: messagesResult.rows
    }, meta);
}));


// POST /api/v1/support/tickets - Create new ticket with attachments
router.post('/tickets', upload.array('attachments', 5), asyncHandler(async (req, res) => {
    const {
        customer_id,
        customer_name,
        customer_phone,
        customer_email,
        customer_address,
        customer_code,
        subject,
        description,
        category = 'general',
        priority = 'medium',
        initial_message
    } = req.body;

    // Validation
    const validationErrors = [];
    if (!subject) {
        validationErrors.push({
            field: 'subject',
            message: 'Subject wajib diisi',
            value: subject
        });
    }
    if (!description) {
        validationErrors.push({
            field: 'description',
            message: 'Description wajib diisi',
            value: description
        });
    }

    if (validationErrors.length > 0) {
        return res.sendValidationErrors(validationErrors);
    }

    const ticketNumber = await generateTicketNumber();

    const result = await query(`
        INSERT INTO support_tickets (
            ticket_number, customer_id, customer_name, customer_phone, customer_email,
            customer_address, customer_code, subject, description,
            category, priority, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open')
        RETURNING *
    `, [ticketNumber, customer_id || null, customer_name || null, customer_phone || null, customer_email || null, customer_address || null, customer_code || null, subject, description, category, priority]);

    const ticket = result.rows[0];

    // Process uploaded files
    let attachments = [];
    if (req.files && req.files.length > 0) {
        attachments = req.files.map(file => ({
            name: file.originalname,
            url: `/uploads/support-attachments/${file.filename}`,
            size: file.size
        }));
    }

    // Add initial message if provided
    if (initial_message) {
        const attachmentsJson = attachments.length > 0 ? JSON.stringify(attachments) : null;
        await query(`
            INSERT INTO support_ticket_messages (
                ticket_id, sender_type, sender_name, message, attachments
            ) VALUES ($1, 'customer', $2, $3, $4)
        `, [ticket.id, req.user?.name || 'Customer', initial_message, attachmentsJson]);
    }

    const meta = {
        ticket_number: ticketNumber,
        category,
        priority,
        attachments_count: attachments.length,
        has_initial_message: !!initial_message
    };

    return res.sendCreated({ ticket }, meta);
}));

// POST /api/v1/support/tickets/:id/messages - Add message to ticket with attachments
router.post('/tickets/:id/messages', upload.array('attachments', 5), asyncHandler(async (req, res) => {
    const ticketId = req.params.id;
    const { message, sender_type = 'customer', sender_name } = req.body;

    // Validation
    if (!message) {
        return res.sendValidationErrors([{
            field: 'message',
            message: 'Message wajib diisi',
            value: message
        }]);
    }

    // Check if ticket exists
    const ticketResult = await query(`
        SELECT id FROM support_tickets WHERE id = $1
    `, [ticketId]);

    if (ticketResult.rows.length === 0) {
        return res.sendNotFound('Tiket');
    }

    // Process uploaded files
    let attachments = [];
    if (req.files && req.files.length > 0) {
        attachments = req.files.map(file => ({
            name: file.originalname,
            url: `/uploads/support-attachments/${file.filename}`,
            size: file.size
        }));
    }

    const attachmentsJson = attachments.length > 0 ? JSON.stringify(attachments) : null;
    const result = await query(`
        INSERT INTO support_ticket_messages (
            ticket_id, sender_type, sender_name, message, attachments
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
    `, [ticketId, sender_type, sender_name || 'Customer', message, attachmentsJson]);

    // Update ticket updated_at
    await query(`
        UPDATE support_tickets
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
    `, [ticketId]);

    const meta = {
        ticket_id: ticketId,
        sender_type,
        attachments_count: attachments.length,
        message_added_at: new Date().toISOString()
    };

    return res.sendCreated({ message: result.rows[0] }, meta);
}));

// GET /api/v1/support/attachments/:filename - Serve attachment files
router.get('/attachments/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join('uploads/support-attachments', filename);

    if (fs.existsSync(filePath)) {
        res.sendFile(path.resolve(filePath));
    } else {
        res.status(404).json({
            success: false,
            message: 'File tidak ditemukan'
        });
    }
});

// POST /api/v1/support/tickets/:id/messages - Add message to ticket
router.post('/tickets/:id/messages', async (req, res) => {
    try {
        const ticketId = req.params.id;
        const { message, sender_type = 'customer', sender_name } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Message wajib diisi'
            });
        }

        // Check if ticket exists
        const ticketResult = await query(`
            SELECT id FROM support_tickets WHERE id = $1
        `, [ticketId]);

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tiket tidak ditemukan'
            });
        }

        const result = await query(`
            INSERT INTO support_ticket_messages (
                ticket_id, sender_type, sender_name, message
            ) VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [ticketId, sender_type, sender_name || 'Customer', message]);

        // Update ticket updated_at
        await query(`
            UPDATE support_tickets
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [ticketId]);

        res.status(201).json({
            success: true,
            message: 'Pesan berhasil ditambahkan',
            data: result.rows[0]
        });
    } catch (error) {
        logger.error('Error adding message to ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menambah pesan'
        });
    }
});

// PUT /api/v1/support/tickets/:id - Update ticket status
router.put('/tickets/:id', asyncHandler(async (req, res) => {
    const ticketId = req.params.id;
    const { status, assigned_agent, resolution_time } = req.body;

    const validStatuses = ['open', 'in_progress', 'pending', 'resolved', 'closed'];
    if (status && !validStatuses.includes(status)) {
        return res.sendValidationErrors([{
            field: 'status',
            message: 'Status tidak valid. Gunakan: open, in_progress, pending, resolved, atau closed',
            value: status,
            valid_options: validStatuses
        }]);
    }

    // Check if ticket exists
    const existingTicket = await query(`
        SELECT id, status as current_status FROM support_tickets WHERE id = $1
    `, [ticketId]);

    if (existingTicket.rows.length === 0) {
        return res.sendNotFound('Tiket');
    }

    const currentTicket = existingTicket.rows[0];

    const result = await query(`
        UPDATE support_tickets
        SET
            status = COALESCE($1, status),
            assigned_agent = COALESCE($2, assigned_agent),
            resolution_time = COALESCE($3, resolution_time),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
    `, [status, assigned_agent, resolution_time, ticketId]);

    const meta = {
        ticket_id: ticketId,
        fields_updated: {
            status: status !== currentTicket.status,
            assigned_agent: assigned_agent !== undefined,
            resolution_time: resolution_time !== undefined
        },
        previous_status: currentTicket.status,
        new_status: result.rows[0].status
    };

    return res.sendSuccess({ ticket: result.rows[0] }, meta);
}));

// GET /api/v1/support/stats - Get support statistics
router.get('/stats', asyncHandler(async (req, res) => {
    const result = await query(`
        SELECT
            COUNT(*) as total_tickets,
            COUNT(CASE WHEN status = 'open' THEN 1 END) as open_tickets,
            COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_tickets,
            COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_tickets,
            COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_tickets,
            AVG(CASE WHEN resolution_time IS NOT NULL THEN resolution_time END) as avg_resolution_time
        FROM support_tickets
    `);

    const categoryResult = await query(`
        SELECT
            category,
            COUNT(*) as count
        FROM support_tickets
        GROUP BY category
    `);

    const stats = result.rows[0];
    const categories = categoryResult.rows;

    const meta = {
        generated_at: new Date().toISOString(),
        categories_count: categories.length,
        active_tickets: stats.open_tickets + stats.in_progress_tickets,
        completed_tickets: stats.resolved_tickets + stats.closed_tickets
    };

    return res.sendSuccess({
        stats,
        categories,
        computed_metrics: {
            resolution_rate: stats.total_tickets > 0 ? ((stats.resolved_tickets + stats.closed_tickets) / stats.total_tickets * 100).toFixed(2) : 0,
            active_rate: stats.total_tickets > 0 ? ((stats.open_tickets + stats.in_progress_tickets) / stats.total_tickets * 100).toFixed(2) : 0
        }
    }, meta);
}));

module.exports = router;