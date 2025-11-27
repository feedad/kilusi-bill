const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const { logger } = require('../../../config/logger');
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
router.get('/tickets', async (req, res) => {
    try {
        const { status, category, customer_id, limit = 50, offset = 0 } = req.query;

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

        // Add limit and offset to params
        params.push(limit, offset);

        const result = await query(`
            SELECT DISTINCT ON (st.id)
                st.*,
                c.name as customer_name,
                c.phone as customer_phone,
                c.customer_id as customer_code,
                stm.sender_name as last_sender,
                stm.message as last_message,
                stm.created_at as last_message_at
            FROM support_tickets st
            LEFT JOIN customers c ON st.customer_id = c.id
            LEFT JOIN support_ticket_messages stm ON st.id = stm.ticket_id
            ${whereClause}
            ORDER BY st.id, stm.created_at DESC, st.updated_at DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `, params);

        // Get total count
        const countParams = params.slice(0, -2); // Remove limit and offset
        const countResult = await query(`
            SELECT COUNT(*) as total FROM support_tickets st
            LEFT JOIN customers c ON st.customer_id = c.id
            ${whereClause}
        `, countParams);

        res.json({
            success: true,
            data: {
                tickets: result.rows,
                total: parseInt(countResult.rows[0].total),
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        logger.error('Error fetching support tickets:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data tiket'
        });
    }
});

// GET /api/v1/support/tickets/:id - Get ticket details with messages
router.get('/tickets/:id', async (req, res) => {
    try {
        const ticketId = req.params.id;

        // Get ticket details
        const ticketResult = await query(`
            SELECT
                st.*,
                c.name as customer_name,
                c.phone as customer_phone,
                c.customer_id as customer_code,
                c.email as customer_email,
                c.address as customer_address,
                c.package_id
            FROM support_tickets st
            LEFT JOIN customers c ON st.customer_id = c.id
            WHERE st.id = $1
        `, [ticketId]);

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tiket tidak ditemukan'
            });
        }

        // Get ticket messages
        const messagesResult = await query(`
            SELECT * FROM support_ticket_messages
            WHERE ticket_id = $1
            ORDER BY created_at ASC
        `, [ticketId]);

        res.json({
            success: true,
            data: {
                ticket: ticketResult.rows[0],
                messages: messagesResult.rows
            }
        });
    } catch (error) {
        logger.error('Error fetching ticket details:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil detail tiket'
        });
    }
});


// POST /api/v1/support/tickets - Create new ticket with attachments
router.post('/tickets', upload.array('attachments', 5), async (req, res) => {
    try {
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

        if (!subject || !description) {
            return res.status(400).json({
                success: false,
                message: 'Subject dan description wajib diisi'
            });
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

        res.status(201).json({
            success: true,
            message: 'Tiket berhasil dibuat',
            data: ticket
        });
    } catch (error) {
        logger.error('Error creating support ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat membuat tiket'
        });
    }
});

// POST /api/v1/support/tickets/:id/messages - Add message to ticket with attachments
router.post('/tickets/:id/messages', upload.array('attachments', 5), async (req, res) => {
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
router.put('/tickets/:id', async (req, res) => {
    try {
        const ticketId = req.params.id;
        const { status, assigned_agent, resolution_time } = req.body;

        const validStatuses = ['open', 'in_progress', 'pending', 'resolved', 'closed'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status tidak valid'
            });
        }

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

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tiket tidak ditemukan'
            });
        }

        res.json({
            success: true,
            message: 'Tiket berhasil diperbarui',
            data: result.rows[0]
        });
    } catch (error) {
        logger.error('Error updating support ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui tiket'
        });
    }
});

// GET /api/v1/support/stats - Get support statistics
router.get('/stats', async (req, res) => {
    try {
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

        res.json({
            success: true,
            data: {
                stats: result.rows[0],
                categories: categoryResult.rows
            }
        });
    } catch (error) {
        logger.error('Error fetching support stats:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil statistik'
        });
    }
});

module.exports = router;