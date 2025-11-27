const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');
const CustomerTokenService = require('../../../services/customer-token-service');
const jwt = require('jsonwebtoken');

// Helper function to validate Bearer token and get customer
async function getCustomerFromBearerToken(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);

    // Try as login token first
    try {
        const tokenValidation = await CustomerTokenService.validateToken(token);
        if (tokenValidation.valid) {
            return tokenValidation.customer;
        }
    } catch (tokenError) {
        console.log('Login token validation failed:', tokenError.message);
    }

    // Try as regular JWT token from OTP authentication
    try {
        const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'your-customer-jwt-secret-key-change-in-production';
        const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);

        if (decoded.type === 'customer' && decoded.customerId) {
            const db = require('../../../config/database');
            const customerQuery = 'SELECT * FROM customers WHERE id = $1';
            const customerResult = await db.query(customerQuery, [decoded.customerId]);

            if (customerResult.rows.length > 0) {
                return customerResult.rows[0];
            }
        }
    } catch (jwtError) {
        console.log('JWT validation failed:', jwtError.message);
    }

    return null;
}

// GET /api/v1/customer-billing/my-invoices - Get invoices for authenticated customer
router.get('/my-invoices', async (req, res) => {
    try {
        // Try to get customer from Bearer token first
        const authHeader = req.headers.authorization;
        let customer = await getCustomerFromBearerToken(authHeader);
        let customerPhone = customer?.phone;

        // Fallback to old methods if Bearer token fails
        if (!customerPhone) {
            customerPhone = req.headers['x-customer-phone'] ||
                           req.query.phone ||
                           req.session?.customerPhone;
        }

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

// GET /api/v1/customer-billing/my-payments - Get payments for authenticated customer
router.get('/my-payments', async (req, res) => {
    try {
        // Try to get customer from Bearer token first
        const authHeader = req.headers.authorization;
        let customer = await getCustomerFromBearerToken(authHeader);
        let customerPhone = customer?.phone;

        // Fallback to old methods if Bearer token fails
        if (!customerPhone) {
            customerPhone = req.headers['x-customer-phone'] ||
                           req.query.phone ||
                           req.session?.customerPhone;
        }

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

        // Get payments for this customer (unique by invoice)
        const paymentsQuery = `
            SELECT DISTINCT ON (p.invoice_id)
                p.*,
                i.invoice_number,
                i.due_date
            FROM payments p
            JOIN invoices i ON p.invoice_id = i.id
            WHERE i.customer_id = $1
            ORDER BY p.invoice_id, p.created_at DESC
        `;

        const paymentsResult = await query(paymentsQuery, [customerId]);

        res.json({
            success: true,
            data: paymentsResult.rows
        });
    } catch (error) {
        logger.error('Error fetching customer payments:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data pembayaran'
        });
    }
});

// GET /api/v1/customer-billing/bulk-payment-settings - Get bulk payment settings
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

// POST /api/v1/customer-billing/calculate-bulk-payment - Calculate bulk payment with dynamic discount logic
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

// GET /api/v1/customer-billing/invoices/:id - Get specific invoice for authenticated customer
router.get('/invoices/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log('🔍 Invoice detail request - Auth header:', req.headers.authorization ? 'Present' : 'Missing');
        console.log('🔍 Invoice detail request - ID:', id);

        // Try to get customer from Bearer token first
        const authHeader = req.headers.authorization;
        let customer = await getCustomerFromBearerToken(authHeader);
        let customerPhone = customer?.phone;

        console.log('🔍 Invoice detail - Customer from token:', customer ? customer.name : 'None');
        console.log('🔍 Invoice detail - Customer phone:', customerPhone);

        // Fallback to old methods if Bearer token fails
        if (!customerPhone) {
            customerPhone = req.headers['x-customer-phone'] ||
                           req.query.phone ||
                           req.session?.customerPhone;
            console.log('🔍 Invoice detail - Fallback phone:', customerPhone);
        }

        if (!customerPhone) {
            console.log('🔍 Invoice detail - No customer found, returning 401');
            return res.status(401).json({
                success: false,
                message: 'Unauthorized - Customer authentication required'
            });
        }

        // Find customer by phone number
        const customerQuery = await query(`
            SELECT id FROM customers WHERE phone = $1 LIMIT 1
        `, [customerPhone]);

        if (customerQuery.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Customer not found'
            });
        }

        const customerId = customerQuery.rows[0].id;

        // Get invoice with customer verification
        const invoiceQuery = `
            SELECT
                i.*,
                c.name as customer_name,
                c.phone as customer_phone,
                c.email as customer_email,
                c.address as customer_address,
                p.name as package_name,
                p.price as package_price,
                p.description as package_description
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            LEFT JOIN packages p ON i.package_id = p.id
            WHERE i.id = $1 AND i.customer_id = $2
        `;

        const invoiceResult = await query(invoiceQuery, [id, customerId]);

        if (invoiceResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Invoice tidak ditemukan atau tidak diizinkan'
            });
        }

        // Get payments for this invoice
        const paymentsQuery = `
            SELECT * FROM payments
            WHERE invoice_id = $1
            ORDER BY created_at DESC
        `;

        const paymentsResult = await query(paymentsQuery, [id]);

        const invoice = invoiceResult.rows[0];
        const payments = paymentsResult.rows;

        // Format response
        const response = {
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            amount: parseFloat(invoice.amount) || 0,
            tax: parseFloat(invoice.tax) || 0,
            discount: parseFloat(invoice.discount) || 0,
            total_amount: parseFloat(invoice.total_amount) || parseFloat(invoice.amount) || 0,
            status: invoice.status,
            due_date: invoice.due_date,
            created_at: invoice.created_at,
            paid_at: invoice.paid_at,
            description: invoice.description || `Tagihan ${invoice.package_name || 'Layanan Internet'}`,
            customer: {
                name: invoice.customer_name,
                phone: invoice.customer_phone,
                email: invoice.customer_email,
                address: invoice.customer_address || ''
            },
            package: {
                name: invoice.package_name || 'Layanan Internet',
                price: parseFloat(invoice.package_price) || 0,
                description: invoice.package_description || ''
            },
            payment_method: payments.length > 0 ? payments[0].payment_method : null,
            payments: payments.map(payment => ({
                id: payment.id,
                amount: parseFloat(payment.amount) || 0,
                payment_date: payment.payment_date,
                method: payment.payment_method,
                reference_number: payment.reference_number,
                notes: payment.notes
            })),
            items: [
                {
                    description: invoice.description || `Berlangganan ${invoice.package_name || 'Layanan Internet'}`,
                    quantity: 1,
                    unit_price: parseFloat(invoice.package_price) || parseFloat(invoice.amount) || 0,
                    total: parseFloat(invoice.amount) || 0
                }
            ],
            notes: invoice.status === 'unpaid'
                ? `Mohon melakukan pembayaran sebelum tanggal jatuh tempo untuk menghindari gangguan layanan. Terima kasih atas kepercayaan Anda.`
                : null,
            payment_details: invoice.status === 'unpaid' ? {
                method: 'Transfer Bank',
                bank_name: 'BCA',
                account_number: '1234567890',
                account_name: 'PT Kilusi Digital Network'
            } : null
        };

        res.json({
            success: true,
            data: response
        });

    } catch (error) {
        logger.error('Error fetching customer invoice detail:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil detail invoice'
        });
    }
});

module.exports = router;