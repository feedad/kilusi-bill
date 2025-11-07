const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');
const { getActivePPPoEConnections } = require('../../../config/mikrotik');

// GET /api/v1/customers - Get all customers with pagination and search
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        let queryParams = [];

        if (search) {
            whereClause += ` AND (c.name ILIKE $${queryParams.length + 1} OR c.phone ILIKE $${queryParams.length + 1} OR c.email ILIKE $${queryParams.length + 1} OR c.pppoe_username ILIKE $${queryParams.length + 1} OR c.customer_id ILIKE $${queryParams.length + 1})`;
            queryParams.push(`%${search}%`);
        }

        if (status) {
            whereClause += ` AND c.status = $${queryParams.length + 1}`;
            queryParams.push(status);
        }

        // Count query
        const countQuery = `
            SELECT COUNT(*) as total
            FROM customers c
            ${whereClause}
        `;

        const countResult = await query(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Data query
        const dataQuery = `
            SELECT
                c.id,
                c.customer_id,
                c.name,
                c.phone,
                c.nik,
                c.address,
                c.pppoe_username,
                c.pppoe_password,
                c.status,
                c.created_at,
                c.updated_at,
                c.install_date,
                c.active_date,
                c.isolir_date,
                -- Package information
                p.name as package_name,
                p.price as package_price,
                p.speed as package_speed,
                -- Billing status
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM invoices inv
                        WHERE inv.customer_id = c.id
                        AND inv.status = 'unpaid'
                        AND inv.due_date < CURRENT_DATE
                    ) THEN 'overdue'
                    WHEN EXISTS (
                        SELECT 1 FROM invoices inv
                        WHERE inv.customer_id = c.id
                        AND inv.status = 'unpaid'
                        AND inv.due_date >= CURRENT_DATE
                    ) THEN 'pending'
                    ELSE 'paid'
                END as billing_status,
                -- Last invoice date
                (SELECT MAX(created_at) FROM invoices WHERE customer_id = c.id) as last_invoice_date,
                -- Online status (default to false since customer_sessions table doesn't exist)
                false as is_online
            FROM customers c
            LEFT JOIN packages p ON c.package_id = p.id
            ${whereClause}
            ORDER BY c.created_at DESC
            LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
        `;

        queryParams.push(limit, offset);
        const result = await query(dataQuery, queryParams);

        res.json({
            success: true,
            data: {
                customers: result.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching customers:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data pelanggan'
        });
    }
});

// GET /api/v1/customers/:id - Get customer by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT
                c.*,
                p.name as package_name,
                p.price as package_price,
                p.speed as package_speed,
                p.description as package_description
            FROM customers c
            LEFT JOIN packages p ON c.package_id = p.id
            WHERE c.id = $1
        `;

        const result = await query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pelanggan tidak ditemukan'
            });
        }

        const customer = result.rows[0];

        // Get customer invoices
        const invoicesQuery = `
            SELECT
                id,
                invoice_number,
                amount,
                status,
                due_date,
                created_at,
                paid_at
            FROM invoices
            WHERE customer_id = $1
            ORDER BY created_at DESC
            LIMIT 12
        `;

        const invoicesResult = await query(invoicesQuery, [id]);

        // Get customer sessions (if exists)
        const sessionsQuery = `
            SELECT
                id,
                session_id,
                username,
                ip_address,
                mac_address,
                start_time,
                stop_time,
                active,
                data_used,
                session_time
            FROM customer_sessions
            WHERE username = $1
            ORDER BY start_time DESC
            LIMIT 10
        `;

        const sessionsResult = await query(sessionsQuery, [customer.pppoe_username]);

        res.json({
            success: true,
            data: {
                customer: {
                    ...customer,
                    invoices: invoicesResult.rows,
                    sessions: sessionsResult.rows
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching customer:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data pelanggan'
        });
    }
});

// POST /api/v1/customers - Create new customer
router.post('/', async (req, res) => {
    try {
        const {
            name,
            phone,
            email,
            address,
            package_id,
            pppoe_username,
            pppoe_password,
            status = 'active'
        } = req.body;

        // Validation
        if (!name || !phone || !package_id) {
            return res.status(400).json({
                success: false,
                message: 'Nama, nomor telepon, dan paket harus diisi'
            });
        }

        // Check if phone already exists
        const existingPhone = await query(
            'SELECT id FROM customers WHERE phone = $1',
            [phone]
        );

        if (existingPhone.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Nomor telepon sudah terdaftar'
            });
        }

        // Check if PPPoE username already exists
        if (pppoe_username) {
            const existingUsername = await query(
                'SELECT id FROM customers WHERE pppoe_username = $1',
                [pppoe_username]
            );

            if (existingUsername.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Username PPPoE sudah terdaftar'
                });
            }
        }

        // Insert customer
        const result = await query(`
            INSERT INTO customers (
                name, phone, email, address, package_id,
                pppoe_username, pppoe_password, status, created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP
            ) RETURNING *
        `, [name, phone, email, address, package_id, pppoe_username, pppoe_password, status]);

        const customer = result.rows[0];

        // Emit event for RADIUS sync
        if (global.appEvents && pppoe_username && pppoe_password) {
            global.appEvents.emit('customer:upsert', customer);
        }

        res.status(201).json({
            success: true,
            data: { customer },
            message: 'Pelanggan berhasil ditambahkan'
        });

    } catch (error) {
        logger.error('Error creating customer:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menambah pelanggan'
        });
    }
});

// PUT /api/v1/customers/:id - Update customer
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            phone,
            email,
            address,
            package_id,
            pppoe_username,
            pppoe_password,
            status
        } = req.body;

        // Check if customer exists
        const existingCustomer = await query(
            'SELECT * FROM customers WHERE id = $1',
            [id]
        );

        if (existingCustomer.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pelanggan tidak ditemukan'
            });
        }

        // Check if phone already exists (excluding current customer)
        if (phone && phone !== existingCustomer.rows[0].phone) {
            const existingPhone = await query(
                'SELECT id FROM customers WHERE phone = $1 AND id != $2',
                [phone, id]
            );

            if (existingPhone.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Nomor telepon sudah terdaftar'
                });
            }
        }

        // Check if PPPoE username already exists (excluding current customer)
        if (pppoe_username && pppoe_username !== existingCustomer.rows[0].pppoe_username) {
            const existingUsername = await query(
                'SELECT id FROM customers WHERE pppoe_username = $1 AND id != $2',
                [pppoe_username, id]
            );

            if (existingUsername.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Username PPPoE sudah terdaftar'
                });
            }
        }

        // Update customer
        const result = await query(`
            UPDATE customers SET
                name = COALESCE($1, name),
                phone = COALESCE($2, phone),
                email = COALESCE($3, email),
                address = COALESCE($4, address),
                package_id = COALESCE($5, package_id),
                pppoe_username = COALESCE($6, pppoe_username),
                pppoe_password = COALESCE($7, pppoe_password),
                status = COALESCE($8, status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $9
            RETURNING *
        `, [name, phone, email, address, package_id, pppoe_username, pppoe_password, status, id]);

        const customer = result.rows[0];

        // Emit event for RADIUS sync
        if (global.appEvents && customer.pppoe_username && customer.pppoe_password) {
            global.appEvents.emit('customer:upsert', customer);
        }

        res.json({
            success: true,
            data: { customer },
            message: 'Pelanggan berhasil diperbarui'
        });

    } catch (error) {
        logger.error('Error updating customer:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui pelanggan'
        });
    }
});

// DELETE /api/v1/customers/:id - Soft delete customer
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if customer exists
        const existingCustomer = await query(
            'SELECT * FROM customers WHERE id = $1',
            [id]
        );

        if (existingCustomer.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pelanggan tidak ditemukan'
            });
        }

        // Check for dependencies before deleting
        const invoiceCheck = await query(
            'SELECT COUNT(*) as count FROM invoices WHERE customer_id = $1',
            [id]
        );

        if (parseInt(invoiceCheck.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                message: 'Tidak dapat menghapus pelanggan yang masih memiliki invoice'
            });
        }

        // Hard delete customer
        await query(
            'DELETE FROM customers WHERE id = $1',
            [id]
        );

        res.json({
            success: true,
            message: 'Pelanggan berhasil dihapus'
        });

    } catch (error) {
        logger.error('Error deleting customer:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menghapus pelanggan'
        });
    }
});

module.exports = router;