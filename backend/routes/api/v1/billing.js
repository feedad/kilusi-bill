const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { getSetting } = require('../../../config/settingsManager');
const { query, getOne, getAll } = require('../../../config/database');

// GET /api/v1/billing/invoices - Get invoices with pagination
router.get('/invoices', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const status = req.query.status || '';
        const customer_id = req.query.customer_id || '';
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        let queryParams = [];

        if (status) {
            whereClause += ` AND i.status = $${queryParams.length + 1}`;
            queryParams.push(status);
        }

        if (customer_id) {
            whereClause += ` AND i.customer_id = $${queryParams.length + 1}`;
            queryParams.push(customer_id);
        }

        // Count query
        const countQuery = `
            SELECT COUNT(*) as total
            FROM invoices i
            ${whereClause}
        `;

        const countResult = await query(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Data query
        const dataQuery = `
            SELECT
                i.*,
                c.name as customer_name,
                c.phone as customer_phone,
                p.name as package_name,
                p.price as package_price
            FROM invoices i
            JOIN customers c ON i.customer_id::text = c.id::text
            LEFT JOIN packages p ON i.package_id = p.id
            ${whereClause}
            ORDER BY i.created_at DESC
            LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
        `;

        queryParams.push(limit, offset);
        const result = await query(dataQuery, queryParams);

        res.json({
            success: true,
            data: {
                invoices: result.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching invoices:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data invoice'
        });
    }
});

// GET /api/v1/billing/invoices/:id - Get invoice by ID
router.get('/invoices/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const invoiceQuery = `
            SELECT
                i.*,
                c.name as customer_name,
                c.phone as customer_phone,
                c.address as customer_address,
                p.name as package_name,
                p.price as package_price,
                p.description as package_description
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            LEFT JOIN packages p ON i.package_id = p.id
            WHERE i.id = $1
        `;

        const result = await query(invoiceQuery, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Invoice tidak ditemukan'
            });
        }

        const invoice = result.rows[0];

        // Get payments for this invoice
        const paymentsQuery = `
            SELECT
                id,
                amount,
                payment_method,
                payment_date,
                notes,
                created_at
            FROM payments
            WHERE invoice_id = $1
            ORDER BY created_at DESC
        `;

        const paymentsResult = await query(paymentsQuery, [id]);

        res.json({
            success: true,
            data: {
                invoice: {
                    ...invoice,
                    payments: paymentsResult.rows
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching invoice:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data invoice'
        });
    }
});

// POST /api/v1/billing/invoices - Create new invoice
router.post('/invoices', async (req, res) => {
    try {
        const {
            customer_id,
            package_id,
            amount,
            due_date,
            notes
        } = req.body;

        // Validation
        if (!customer_id || !package_id || !amount || !due_date) {
            return res.status(400).json({
                success: false,
                message: 'Customer, package, amount, dan due date harus diisi'
            });
        }

        // Generate invoice number
        const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // Insert invoice
        const result = await query(`
            INSERT INTO invoices (
                customer_id, package_id, invoice_number, amount,
                due_date, notes, status, created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, 'unpaid', CURRENT_TIMESTAMP
            ) RETURNING *
        `, [customer_id, package_id, invoiceNumber, amount, due_date, notes]);

        const invoice = result.rows[0];

        res.status(201).json({
            success: true,
            data: { invoice },
            message: 'Invoice berhasil dibuat'
        });

    } catch (error) {
        logger.error('Error creating invoice:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat membuat invoice'
        });
    }
});

// POST /api/v1/billing/payments - Record payment
router.post('/payments', async (req, res) => {
    try {
        const {
            invoice_id,
            amount,
            payment_method,
            payment_date,
            notes
        } = req.body;

        // Validation
        if (!invoice_id || !amount || !payment_method) {
            return res.status(400).json({
                success: false,
                message: 'Invoice, amount, dan payment method harus diisi'
            });
        }

        // Check if invoice exists
        const invoiceQuery = await query(
            'SELECT * FROM invoices WHERE id = $1',
            [invoice_id]
        );

        if (invoiceQuery.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Invoice tidak ditemukan'
            });
        }

        const invoice = invoiceQuery.rows[0];

        // Check if invoice is already paid
        if (invoice.status === 'paid') {
            return res.status(400).json({
                success: false,
                message: 'Invoice sudah dibayar'
            });
        }

        // Insert payment
        const paymentResult = await query(`
            INSERT INTO payments (
                invoice_id, amount, payment_method, payment_date,
                notes, created_at
            ) VALUES (
                $1, $2, $3, $4, $5, CURRENT_TIMESTAMP
            ) RETURNING *
        `, [invoice_id, amount, payment_method, payment_date || new Date(), notes]);

        // Update invoice status
        const totalPaid = await query(`
            SELECT COALESCE(SUM(amount), 0) as total_paid
            FROM payments
            WHERE invoice_id = $1
        `, [invoice_id]);

        const totalPaidAmount = parseFloat(totalPaid.rows[0].total_paid);

        if (totalPaidAmount >= invoice.amount) {
            await query(
                'UPDATE invoices SET status = $1 WHERE id = $2',
                ['paid', invoice_id]
            );

            // Check if customer has any other unpaid invoices and update status if all paid
            const unpaidInvoicesCheck = await query(`
                SELECT COUNT(*) as unpaid_count
                FROM invoices
                WHERE customer_id = $1 AND status = 'unpaid'
            `, [invoice.customer_id]);

            const unpaidCount = parseInt(unpaidInvoicesCheck.rows[0].unpaid_count);

            if (unpaidCount === 0) {
                // All invoices paid, update customer status to active and clear isolation
                await query(`
                    UPDATE customers
                    SET status = 'active', isolir_status = 'normal', updated_at = NOW()
                    WHERE id = $1
                `, [invoice.customer_id]);

                logger.info(`✅ Customer ${invoice.customer_id} reactivated - all invoices paid`);
            } else {
                logger.info(`ℹ️ Customer ${invoice.customer_id} still has ${unpaidCount} unpaid invoices`);
            }
        }

        const payment = paymentResult.rows[0];

        res.status(201).json({
            success: true,
            data: { payment },
            message: 'Pembayaran berhasil dicatat'
        });

    } catch (error) {
        logger.error('Error recording payment:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mencatat pembayaran'
        });
    }
});

// GET /api/v1/billing/packages - Get all packages
router.get('/packages', async (req, res) => {
    try {
        const packagesQuery = `
            SELECT
                p.*,
                COUNT(c.id) as customer_count
            FROM packages p
            LEFT JOIN customers c ON p.id = c.package_id
            GROUP BY p.id
            ORDER BY p.price ASC
        `;

        const result = await query(packagesQuery);

        res.json({
            success: true,
            data: { packages: result.rows }
        });

    } catch (error) {
        logger.error('Error fetching packages:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data paket'
        });
    }
});

module.exports = router;