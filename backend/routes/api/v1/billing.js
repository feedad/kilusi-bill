const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { getSetting } = require('../../../config/settingsManager');
const { query, getOne, getAll } = require('../../../config/database');
const ReferralService = require('../../../services/referral-service');
const DiscountService = require('../../../services/discount-service');
const BillingDiscountIntegration = require('../../../services/billing-discount-integration');
const { asyncHandler } = require('../../../middleware/response');

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
router.get('/invoices', asyncHandler(async (req, res) => {
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

    const pagination = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
    };

    const meta = {
        search: customer_id || status || undefined,
        status: status || undefined,
        customer_id: customer_id || undefined,
        total_records: total
    };

    return res.sendPaginated(result.rows, pagination, meta);
}));

// GET /api/v1/billing/invoices/search - Search invoices by universal search
router.get('/invoices/search', asyncHandler(async (req, res) => {
    const searchTerm = req.query.q || '';

    if (!searchTerm.trim()) {
        return res.sendSuccess([]);
    }

    // Search invoices by number, customer name, or phone
    const searchQuery = `
        SELECT DISTINCT
            i.id,
            i.invoice_number,
            i.customer_id,
            i.amount,
            i.due_date,
            i.status,
            i.created_at,
            c.name as customer_name,
            c.phone as customer_phone,
            c.email as customer_email,
            p.name as package_name,
            CASE
                WHEN LOWER(i.invoice_number) = LOWER($2) THEN 1
                WHEN LOWER(c.name) = LOWER($2) THEN 2
                ELSE 3
            END as relevance_score
        FROM invoices i
        JOIN customers c ON i.customer_id::text = c.id::text
        LEFT JOIN packages p ON i.package_id = p.id
        WHERE (
            LOWER(i.invoice_number) LIKE LOWER($1)
            OR LOWER(c.name) LIKE LOWER($1)
            OR c.phone LIKE $1
        )
        AND i.status != 'paid'
        ORDER BY
            relevance_score,
            i.created_at DESC
        LIMIT 50
    `;

    const searchPattern = `%${searchTerm.trim()}%`;
    const exactTerm = searchTerm.trim();

    const result = await query(searchQuery, [searchPattern, exactTerm]);

    logger.info(`🔍 Invoice search: "${searchTerm}" - Found ${result.rows.length} results`);

    const meta = {
        search: searchTerm,
        result_count: result.rows.length,
        search_type: 'universal',
        filters: ['invoice_number', 'customer_name', 'phone']
    };

    return res.sendSuccess(result.rows, meta);
}));

// GET /api/v1/billing/invoices/:id - Get invoice by ID
router.get('/invoices/:id', asyncHandler(async (req, res) => {
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
        return res.sendNotFound('Invoice');
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

    const invoiceWithPayments = {
        ...invoice,
        payments: paymentsResult.rows
    };

    const meta = {
        invoice_id: id,
        customer_id: invoice.customer_id,
        status: invoice.status,
        payment_count: paymentsResult.rows.length,
        has_payments: paymentsResult.rows.length > 0
    };

    return res.sendSuccess({ invoice: invoiceWithPayments }, meta);
}));

// POST /api/v1/billing/invoices - Create new invoice
router.post('/invoices', asyncHandler(async (req, res) => {
    const {
        customer_id,
        package_id,
        amount,
        due_date,
        notes
    } = req.body;

    // Validation with detailed field-level errors
    const validationErrors = [];
    if (!customer_id) {
        validationErrors.push({
            field: 'customer_id',
            message: 'Customer ID harus diisi',
            value: customer_id
        });
    }
    if (!package_id) {
        validationErrors.push({
            field: 'package_id',
            message: 'Package ID harus diisi',
            value: package_id
        });
    }
    if (!amount) {
        validationErrors.push({
            field: 'amount',
            message: 'Amount harus diisi',
            value: amount
        });
    }
    if (!due_date) {
        validationErrors.push({
            field: 'due_date',
            message: 'Due date harus diisi',
            value: due_date
        });
    }
    if (amount && parseFloat(amount) <= 0) {
        validationErrors.push({
            field: 'amount',
            message: 'Amount harus lebih dari 0',
            value: amount
        });
    }

    if (validationErrors.length > 0) {
        return res.sendValidationErrors(validationErrors);
    }

    // Check if customer exists
    const customerQuery = await query('SELECT id, name FROM customers WHERE id = $1', [customer_id]);
    if (customerQuery.rows.length === 0) {
        return res.sendNotFound('Customer');
    }

    // Check if package exists
    const packageQuery = await query('SELECT id, name FROM packages WHERE id = $1', [package_id]);
    if (packageQuery.rows.length === 0) {
        return res.sendNotFound('Package');
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

    const meta = {
        invoice_number: invoiceNumber,
        customer_id,
        package_id,
        original_amount: discountResult.originalAmount,
        total_discount: discountResult.totalDiscount,
        final_amount: discountResult.finalAmount,
        discounts_applied: discountResult.appliedDiscounts.length,
        status: 'created'
    };

    return res.sendCreated({ invoice }, meta);
}));

// POST /api/v1/billing/payments - Record payment
router.post('/payments', asyncHandler(async (req, res) => {
    const {
        invoice_id,
        amount,
        payment_method,
        payment_date,
        notes
    } = req.body;

    // Validation with detailed field-level errors
    const validationErrors = [];
    if (!invoice_id) {
        validationErrors.push({
            field: 'invoice_id',
            message: 'Invoice ID harus diisi',
            value: invoice_id
        });
    }
    if (!amount) {
        validationErrors.push({
            field: 'amount',
            message: 'Amount harus diisi',
            value: amount
        });
    }
    if (!payment_method) {
        validationErrors.push({
            field: 'payment_method',
            message: 'Payment method harus diisi',
            value: payment_method
        });
    }
    if (amount && parseFloat(amount) <= 0) {
        validationErrors.push({
            field: 'amount',
            message: 'Amount harus lebih dari 0',
            value: amount
        });
    }

    if (validationErrors.length > 0) {
        return res.sendValidationErrors(validationErrors);
    }

    // Check if invoice exists
    const invoiceQuery = await query(
        'SELECT * FROM invoices WHERE id = $1',
        [invoice_id]
    );

    if (invoiceQuery.rows.length === 0) {
        return res.sendNotFound('Invoice');
    }

    const invoice = invoiceQuery.rows[0];

    // Check if invoice is already paid
    if (invoice.status === 'paid') {
        return res.sendError('RESOURCE_CONFLICT', 'Invoice sudah dibayar', [], {
            invoice_id,
            current_status: 'paid'
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
    let invoiceStatusChanged = false;
    let customerReactivated = false;

    if (totalPaidAmount >= invoice.amount) {
        await query(
            'UPDATE invoices SET status = $1 WHERE id = $2',
            ['paid', invoice_id]
        );
        invoiceStatusChanged = true;

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
                UPDATE services
                SET status = 'active', updated_at = NOW()
                WHERE customer_id = $1
            `, [invoice.customer_id]);

            customerReactivated = true;
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

    const meta = {
        invoice_id,
        customer_id: invoice.customer_id,
        payment_id: payment.id,
        amount: parseFloat(amount),
        payment_method,
        total_paid: totalPaidAmount,
        remaining_balance: invoice.amount - totalPaidAmount,
        invoice_fully_paid: totalPaidAmount >= invoice.amount,
        invoice_status_changed: invoiceStatusChanged,
        customer_reactivated: customerReactivated
    };

    return res.sendCreated({ payment }, meta);
}));

// GET /api/v1/billing/packages - Get all packages
router.get('/packages', asyncHandler(async (req, res) => {
    const packagesQuery = `
        SELECT
            p.*,
            COUNT(c.id) as customer_count
        FROM packages p
        LEFT JOIN customers_view c ON p.id = c.package_id
        GROUP BY p.id
        ORDER BY p.price ASC
    `;

    const result = await query(packagesQuery);

    const meta = {
        total_packages: result.rows.length,
        active_packages: result.rows.filter(p => p.is_active).length,
        price_range: {
            min: Math.min(...result.rows.map(p => p.price)),
            max: Math.max(...result.rows.map(p => p.price))
        }
    };

    return res.sendSuccess({ packages: result.rows }, meta);
}));

// Bulk Payment Settings endpoints
router.get('/bulk-payment-settings', asyncHandler(async (req, res) => {
    const result = await query(`
        SELECT * FROM bulk_payment_settings
        WHERE id = 1
    `);

    let settings;
    let isDefault = false;

    if (result.rows.length === 0) {
        // Return default settings if none exist
        settings = {
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
        };
        isDefault = true;
    } else {
        settings = result.rows[0];
    }

    const meta = {
        settings_type: isDefault ? 'default' : 'custom',
        enabled: settings.enabled,
        available_discount_periods: [1, 2, 3, 6, 12],
        discount_types: ['percentage', 'free_months', 'fixed_amount']
    };

    return res.sendSuccess(settings, meta);
}));

router.put('/bulk-payment-settings', asyncHandler(async (req, res) => {
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

    const validationErrors = [];

    if (!validateType(discount_1_month_type)) {
        validationErrors.push({
            field: 'discount_1_month_type',
            message: 'Tipe diskon tidak valid. Gunakan: percentage, free_months, atau fixed_amount',
            value: discount_1_month_type
        });
    }
    if (!validateType(discount_2_months_type)) {
        validationErrors.push({
            field: 'discount_2_months_type',
            message: 'Tipe diskon tidak valid. Gunakan: percentage, free_months, atau fixed_amount',
            value: discount_2_months_type
        });
    }
    if (!validateType(discount_3_months_type)) {
        validationErrors.push({
            field: 'discount_3_months_type',
            message: 'Tipe diskon tidak valid. Gunakan: percentage, free_months, atau fixed_amount',
            value: discount_3_months_type
        });
    }
    if (!validateType(discount_6_months_type)) {
        validationErrors.push({
            field: 'discount_6_months_type',
            message: 'Tipe diskon tidak valid. Gunakan: percentage, free_months, atau fixed_amount',
            value: discount_6_months_type
        });
    }
    if (!validateType(discount_12_months_type)) {
        validationErrors.push({
            field: 'discount_12_months_type',
            message: 'Tipe diskon tidak valid. Gunakan: percentage, free_months, atau fixed_amount',
            value: discount_12_months_type
        });
    }

    if (validationErrors.length > 0) {
        return res.sendValidationErrors(validationErrors);
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

    let settings;
    let wasCreated = false;

    if (updateResult.rows.length > 0) {
        settings = updateResult.rows[0];
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

        settings = insertResult.rows[0];
        wasCreated = true;
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

    const meta = {
        operation: wasCreated ? 'created' : 'updated',
        enabled: settings.enabled,
        affected_periods: [1, 2, 3, 6, 12],
        settings_applied: true
    };

    return res.sendSuccess(settings, meta);
}));

// Customer endpoints for billing
router.get('/my-invoices', asyncHandler(async (req, res) => {
    // Get phone number from customer token or session
    const customerPhone = req.headers['x-customer-phone'] ||
                        req.query.phone ||
                        req.session?.customerPhone;

    if (!customerPhone) {
        return res.sendSuccess([]);
    }

    // Find customer by phone number
    const customerQuery = await query(`
        SELECT id, name FROM customers WHERE phone = $1 LIMIT 1
    `, [customerPhone]);

    if (customerQuery.rows.length === 0) {
        return res.sendSuccess([]);
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

    const meta = {
        customer_phone: customerPhone,
        customer_id: customerId,
        invoice_count: invoicesResult.rows.length,
        has_unpaid: invoicesResult.rows.some(inv => inv.status === 'unpaid')
    };

    return res.sendSuccess(invoicesResult.rows, meta);
}));

router.get('/my-payments', asyncHandler(async (req, res) => {
    // Get phone number from customer token or session
    const customerPhone = req.headers['x-customer-phone'] ||
                        req.query.phone ||
                        req.session?.customerPhone;

    if (!customerPhone) {
        return res.sendSuccess([]);
    }

    // Find customer by phone number
    const customerQuery = await query(`
        SELECT id, name FROM customers WHERE phone = $1 LIMIT 1
    `, [customerPhone]);

    if (customerQuery.rows.length === 0) {
        return res.sendSuccess([]);
    }

    const customerId = customerQuery.rows[0].id;

    // Get payments for this customer
    const paymentsQuery = `
        SELECT
            p.*,
            i.invoice_number,
            i.due_date,
            c.name as customer_name
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        JOIN customers c ON i.customer_id = c.id
        WHERE i.customer_id = $1
        ORDER BY p.payment_date DESC
    `;

    const paymentsResult = await query(paymentsQuery, [customerId]);

    const meta = {
        customer_phone: customerPhone,
        customer_id: customerId,
        payment_count: paymentsResult.rows.length,
        total_paid: paymentsResult.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0)
    };

    return res.sendSuccess(paymentsResult.rows, meta);
}));

// Calculate bulk payment with dynamic discount logic
router.post('/calculate-bulk-payment', asyncHandler(async (req, res) => {
    const { months, packagePrice } = req.body;
    const numMonths = parseInt(months);
    const numPackagePrice = parseFloat(packagePrice);

    // Validation with detailed field-level errors
    const validationErrors = [];
    if (!numMonths || numMonths <= 0) {
        validationErrors.push({
            field: 'months',
            message: 'Jumlah bulan harus lebih dari 0',
            value: months
        });
    }
    if (!numPackagePrice || numPackagePrice <= 0) {
        validationErrors.push({
            field: 'packagePrice',
            message: 'Harga paket harus lebih dari 0',
            value: packagePrice
        });
    }

    if (validationErrors.length > 0) {
        return res.sendValidationErrors(validationErrors);
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
        const noDiscountData = {
            months: numMonths,
            originalTotal: numPackagePrice * numMonths,
            discount: 0,
            discountType: 'none',
            discountDisplay: 'Tidak ada diskon',
            finalTotal: numPackagePrice * numMonths,
            totalMonthsPaid: numMonths,
            effectiveMonths: numMonths
        };

        const meta = {
            calculation_type: 'no_discount',
            settings_enabled: false,
            calculation_performed: true
        };

        return res.sendSuccess(noDiscountData, meta);
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

    const calculationData = {
        months: numMonths,
        originalTotal,
        discount: discountAmount,
        discountType: selectedDiscount.type,
        discountDisplay,
        finalTotal,
        totalMonthsPaid,
        effectiveMonths,
        perMonthEffective: finalTotal / numMonths
    };

    const meta = {
        calculation_type: 'with_discount',
        settings_enabled: true,
        discount_applied: discountAmount > 0,
        discount_percentage: selectedDiscount.type === 'percentage' ? selectedDiscount.value : null,
        savings_percentage: ((discountAmount / originalTotal) * 100).toFixed(2)
    };

    return res.sendSuccess(calculationData, meta);
}));


module.exports = router;