const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { getSetting } = require('../../../config/settingsManager');
const { query, getOne, getAll } = require('../../../config/database');
const ReferralService = require('../../../services/referral-service');
const DiscountService = require('../../../services/discount-service');
const BillingDiscountIntegration = require('../../../services/billing-discount-integration');

// Helper function to create accounting transaction
const createAccountingTransaction = async (type, amount, description, referenceType = null, referenceId = null) => {
    try {
        // Get default category for this transaction type
        const categoryQuery = await query(`
            SELECT id FROM accounting_categories
            WHERE type = $1 AND is_active = true
            ORDER BY name LIMIT 1
        `, [type]);

        if (categoryQuery.rows.length === 0) {
            logger.warn(`No active category found for ${type} transactions`);
            return;
        }

        const categoryId = categoryQuery.rows[0].id;

        await query(`
            INSERT INTO accounting_transactions (
                category_id, type, amount, description,
                reference_type, reference_id, date, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, CURRENT_TIMESTAMP)
        `, [categoryId, type, amount, description, referenceType, referenceId]);

        logger.info(`✅ Accounting transaction created: ${type} ${amount} - ${description}`);
    } catch (error) {
        logger.error('Error creating accounting transaction:', error);
    }
};

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

        // Calculate all discounts (referral + compensation)
        const discountResult = await BillingDiscountIntegration.calculateInvoiceDiscounts(
            customer_id,
            parseFloat(amount),
            { package_id, due_date, invoiceNumber }
        );

        logger.info(`Invoice ${invoiceNumber} discounts applied:`, {
            originalAmount: discountResult.originalAmount,
            totalDiscount: discountResult.totalDiscount,
            finalAmount: discountResult.finalAmount,
            appliedDiscounts: discountResult.appliedDiscounts.length
        });

        // Insert invoice with discounts
        const result = await query(`
            INSERT INTO invoices (
                customer_id, package_id, invoice_number, amount,
                due_date, notes, status, created_at,
                discount_amount, final_amount, discount_notes
            ) VALUES (
                $1, $2, $3, $4, $5, $6, 'unpaid', CURRENT_TIMESTAMP,
                $7, $8, $9
            ) RETURNING *
        `, [
            customer_id,
            package_id,
            invoiceNumber,
            discountResult.originalAmount,
            due_date,
            notes,
            discountResult.totalDiscount,
            discountResult.finalAmount,
            BillingDiscountIntegration.formatDiscountNotes(discountResult.appliedDiscounts)
        ]);

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

        // Create accounting transaction for revenue
        const customerQuery = await query('SELECT name FROM customers WHERE id = $1', [invoice.customer_id]);
        const customerName = customerQuery.rows[0]?.name || 'Unknown Customer';

        await createAccountingTransaction(
            'revenue',
            parseFloat(amount),
            `Pembayaran tagihan #${invoice_id} dari ${customerName} (${payment_method})`,
            'invoice',
            invoice_id
        );

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

// Bulk Payment Settings endpoints
router.get('/bulk-payment-settings', async (req, res) => {
    try {
        const result = await query(`
            SELECT * FROM bulk_payment_settings
            WHERE id = 1
        `);

        if (result.rows.length === 0) {
            // Return default settings if none exist
            res.json({
                success: true,
                data: {
                    enabled: true,
                    discount_1_month_type: 'percentage',
                    discount_1_month_value: 0,
                    discount_2_months_type: 'percentage',
                    discount_2_months_value: 0,
                    discount_3_months_type: 'percentage',
                    discount_3_months_value: 5,
                    discount_6_months_type: 'percentage',
                    discount_6_months_value: 10,
                    discount_12_months_type: 'percentage',
                    discount_12_months_value: 15
                }
            });
        } else {
            res.json({
                success: true,
                data: result.rows[0]
            });
        }
    } catch (error) {
        logger.error('Error fetching bulk payment settings:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil pengaturan diskon'
        });
    }
});

router.put('/bulk-payment-settings', async (req, res) => {
    try {
        const {
            enabled,
            discount_1_month_type,
            discount_1_month_value,
            discount_2_months_type,
            discount_2_months_value,
            discount_3_months_type,
            discount_3_months_value,
            discount_6_months_type,
            discount_6_months_value,
            discount_12_months_type,
            discount_12_months_value
        } = req.body;

        // Validate discount types
        const validTypes = ['percentage', 'free_months', 'fixed_amount'];
        const validateType = (type) => validTypes.includes(type);

        if (!validateType(discount_1_month_type) || !validateType(discount_2_months_type) ||
            !validateType(discount_3_months_type) || !validateType(discount_6_months_type) ||
            !validateType(discount_12_months_type)) {
            return res.status(400).json({
                success: false,
                message: 'Tipe diskon tidak valid. Gunakan: percentage, free_months, atau fixed_amount'
            });
        }

        // First, try to update existing settings
        const updateResult = await query(`
            UPDATE bulk_payment_settings
            SET enabled = $1,
                discount_1_month_type = $2,
                discount_1_month_value = $3,
                discount_2_months_type = $4,
                discount_2_months_value = $5,
                discount_3_months_type = $6,
                discount_3_months_value = $7,
                discount_6_months_type = $8,
                discount_6_months_value = $9,
                discount_12_months_type = $10,
                discount_12_months_value = $11,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            RETURNING *
        `, [
            enabled,
            discount_1_month_type,
            discount_1_month_value,
            discount_2_months_type,
            discount_2_months_value,
            discount_3_months_type,
            discount_3_months_value,
            discount_6_months_type,
            discount_6_months_value,
            discount_12_months_type,
            discount_12_months_value
        ]);

        if (updateResult.rows.length > 0) {
            res.json({
                success: true,
                message: 'Pengaturan diskon pembayaran di muka berhasil diperbarui',
                data: updateResult.rows[0]
            });
        } else {
            // Insert new settings if none exist
            const insertResult = await query(`
                INSERT INTO bulk_payment_settings (
                    id, enabled, discount_1_month_type, discount_1_month_value,
                    discount_2_months_type, discount_2_months_value,
                    discount_3_months_type, discount_3_months_value,
                    discount_6_months_type, discount_6_months_value,
                    discount_12_months_type, discount_12_months_value,
                    created_at, updated_at
                ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING *
            `, [
                enabled,
                discount_1_month_type,
                discount_1_month_value,
                discount_2_months_type,
                discount_2_months_value,
                discount_3_months_type,
                discount_3_months_value,
                discount_6_months_type,
                discount_6_months_value,
                discount_12_months_type,
                discount_12_months_value
            ]);

            res.json({
                success: true,
                message: 'Pengaturan diskon pembayaran di muka berhasil dibuat',
                data: insertResult.rows[0]
            });
        }

        logger.info('Bulk payment settings updated by admin', {
            enabled,
            discount_1_month_type,
            discount_1_month_value,
            discount_2_months_type,
            discount_2_months_value,
            discount_3_months_type,
            discount_3_months_value,
            discount_6_months_type,
            discount_6_months_value,
            discount_12_months_type,
            discount_12_months_value
        });

    } catch (error) {
        logger.error('Error updating bulk payment settings:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui pengaturan diskon'
        });
    }
});

// Customer endpoints for billing
router.get('/my-invoices', async (req, res) => {
    try {
        // Get phone number from customer token or session
        const customerPhone = req.headers['x-customer-phone'] ||
                            req.query.phone ||
                            req.session?.customerPhone;

        if (!customerPhone) {
            return res.json({
                success: true,
                data: []
            });
        }

        // Find customer by phone number
        const customerQuery = await query(`
            SELECT id FROM customers WHERE phone = $1 LIMIT 1
        `, [customerPhone]);

        if (customerQuery.rows.length === 0) {
            return res.json({
                success: true,
                data: []
            });
        }

        const customerId = customerQuery.rows[0].id;

        // Get invoices for this customer
        const invoicesQuery = `
            SELECT
                i.*,
                p.name as package_name,
                p.price as package_price
            FROM invoices i
            LEFT JOIN packages p ON i.package_id = p.id
            WHERE i.customer_id = $1
            ORDER BY i.created_at DESC
        `;

        const invoicesResult = await query(invoicesQuery, [customerId]);

        res.json({
            success: true,
            data: invoicesResult.rows
        });
    } catch (error) {
        logger.error('Error fetching customer invoices:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data invoice'
        });
    }
});

router.get('/my-payments', async (req, res) => {
    try {
        // For now, return empty array - to be implemented with customer authentication
        res.json({
            success: true,
            data: []
        });
    } catch (error) {
        logger.error('Error fetching customer payments:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data pembayaran'
        });
    }
});

// Calculate bulk payment with dynamic discount logic
router.post('/calculate-bulk-payment', async (req, res) => {
    try {
        const { months, packagePrice } = req.body;
        const numMonths = parseInt(months);
        const numPackagePrice = parseFloat(packagePrice);

        if (!numMonths || !numPackagePrice || numMonths <= 0 || numPackagePrice <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Parameter tidak valid'
            });
        }

        // Get current bulk payment settings
        const settingsResult = await query(`
            SELECT * FROM bulk_payment_settings WHERE id = 1
        `);

        let settings = {
            enabled: true,
            discount_1_month_type: 'percentage',
            discount_1_month_value: 0,
            discount_2_months_type: 'percentage',
            discount_2_months_value: 0,
            discount_3_months_type: 'percentage',
            discount_3_months_value: 10,
            discount_6_months_type: 'free_months',
            discount_6_months_value: 1,
            discount_12_months_type: 'free_months',
            discount_12_months_value: 2
        };

        if (settingsResult.rows.length > 0) {
            settings = settingsResult.rows[0];
        }

        if (!settings.enabled) {
            return res.json({
                success: true,
                data: {
                    months: numMonths,
                    originalTotal: numPackagePrice * numMonths,
                    discount: 0,
                    discountType: 'none',
                    discountDisplay: 'Tidak ada diskon',
                    finalTotal: numPackagePrice * numMonths,
                    totalMonthsPaid: numMonths,
                    effectiveMonths: numMonths
                }
            });
        }

        let discountAmount = 0;
        let discountType = 'percentage';
        let discountDisplay = '';
        let totalMonthsPaid = numMonths;

        // Get the appropriate discount type and value for the selected months
        const discountConfig = {
            1: { type: settings.discount_1_month_type, value: parseInt(settings.discount_1_month_value) },
            2: { type: settings.discount_2_months_type, value: parseInt(settings.discount_2_months_value) },
            3: { type: settings.discount_3_months_type, value: parseInt(settings.discount_3_months_value) },
            6: { type: settings.discount_6_months_type, value: parseInt(settings.discount_6_months_value) },
            12: { type: settings.discount_12_months_type, value: parseInt(settings.discount_12_months_value) }
        };

        const selectedDiscount = discountConfig[numMonths] || { type: 'percentage', value: 0 };
        discountType = selectedDiscount.type;

        switch (selectedDiscount.type) {
            case 'percentage':
                discountAmount = (numPackagePrice * numMonths) * (selectedDiscount.value / 100);
                discountDisplay = `Diskon ${selectedDiscount.value}%`;
                break;
            case 'free_months':
                discountAmount = numPackagePrice * selectedDiscount.value;
                discountDisplay = `Gratis ${selectedDiscount.value} bulan`;
                totalMonthsPaid = numMonths;
                break;
            case 'fixed_amount':
                discountAmount = selectedDiscount.value;
                discountDisplay = `Diskon Rp ${selectedDiscount.value.toLocaleString('id-ID')}`;
                break;
        }

        const originalTotal = numPackagePrice * numMonths;
        const finalTotal = originalTotal - discountAmount;
        const effectiveMonths = selectedDiscount.type === 'free_months' ?
            (numMonths + selectedDiscount.value) : numMonths;

        res.json({
            success: true,
            data: {
                months: numMonths,
                originalTotal,
                discount: discountAmount,
                discountType: selectedDiscount.type,
                discountDisplay,
                finalTotal,
                totalMonthsPaid,
                effectiveMonths,
                perMonthEffective: finalTotal / numMonths
            }
        });

    } catch (error) {
        logger.error('Error calculating bulk payment:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menghitung pembayaran di muka'
        });
    }
});

module.exports = router;