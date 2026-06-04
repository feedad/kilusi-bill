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
                p.price as package_price,
                CASE
                    WHEN i.due_date < CURRENT_DATE AND i.status = 'unpaid' THEN 'overdue'
                    ELSE i.status
                END as display_status,
                CASE
                    WHEN i.status IN ('unpaid', 'overdue', 'suspended') THEN true
                    ELSE false
                END as can_pay
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
                discountAmount = Math.round((numPackagePrice * numMonths) * (selectedDiscount.value / 100));
                discountDisplay = `Diskon ${selectedDiscount.value}%`;
                break;
            case 'free_months':
                discountAmount = Math.round(numPackagePrice * selectedDiscount.value);
                discountDisplay = `Gratis ${selectedDiscount.value} bulan`;
                totalMonthsPaid = numMonths;
                break;
            case 'fixed_amount':
                discountAmount = Math.round(selectedDiscount.value);
                discountDisplay = `Diskon Rp ${selectedDiscount.value.toLocaleString('id-ID')}`;
                break;
        }

        const originalTotal = Math.round(numPackagePrice * numMonths);
        const finalTotal = Math.round(originalTotal - discountAmount);
        const effectiveMonths = selectedDiscount.type === 'free_months' ?
            (numMonths + selectedDiscount.value) : numMonths;

        // Round to 2 decimal places for per-month calculation
        const perMonthEffective = Math.round((finalTotal / numMonths) * 100) / 100;

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
                perMonthEffective
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
                p.description as package_description,
                CASE
                    WHEN i.due_date < CURRENT_DATE AND i.status = 'unpaid' THEN 'overdue'
                    ELSE i.status
                END as display_status,
                CASE
                    WHEN i.status IN ('unpaid', 'overdue', 'suspended') THEN true
                    ELSE false
                END as can_pay
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

        // Get payment transactions for this invoice (from both tables)
        // Join with users to get admin name for verified_by
        const transactionsQuery = `
            SELECT pt.*, u.username as verified_by_name
            FROM payment_transactions pt
            LEFT JOIN users u ON pt.verified_by = u.id
            WHERE pt.invoice_id = $1
            ORDER BY pt.created_at DESC
        `;

        const transactionsResult = await query(transactionsQuery, [id]);

        // Also check legacy payments table (for admin-processed payments)
        const paymentsQuery = `
            SELECT p.*, u.username as admin_name
            FROM payments p
            LEFT JOIN users u ON p.processed_by = u.username
            WHERE p.invoice_id = $1
            ORDER BY p.created_at DESC
        `;

        const paymentsResult = await query(paymentsQuery, [id]);

        const invoice = invoiceResult.rows[0];
        const transactions = transactionsResult.rows;
        const payments = paymentsResult.rows;

        // Get service info for masa aktif display
        let serviceInfo = null;
        try {
            serviceInfo = await query(
                `SELECT active_date, isolir_date, status
                 FROM services WHERE customer_id = $1
                 ORDER BY created_at DESC LIMIT 1`,
                [customerId]
            );
            serviceInfo = serviceInfo.rows[0] || null;
        } catch (e) { /* ignore */ }

 // Format payment method for display (from payment_transactions)
        const paymentSettings = await (async () => {
            const { getSetting } = require('../../../config/settingsManager');
            let ps = await getSetting('payment_settings');
            if (typeof ps === 'string') { try { ps = JSON.parse(ps); } catch (e) {} }
            return ps;
        })();

        const resolveMethod = (method) => {
            if (!method || method === 'cash') return 'Tunai';
            if (method.startsWith('bank_') || method.startsWith('ewallet_')) {
                const prefix = method.startsWith('bank_') ? 'bank_' : 'ewallet_';
                const id = method.replace(prefix, '');
                const accounts = paymentSettings?.bank_accounts || paymentSettings?.bankAccounts || [];
                const wallets = paymentSettings?.ewallets || paymentSettings?.eWallets || [];
                const all = [...accounts, ...wallets];
                const found = all.find(b => String(b.id) === String(id));
                if (found) {
                    if (found.bankName || found.bank_name) return `${found.bankName || found.bank_name} - ${found.accountNumber || found.account_number || ''}`;
                    if (found.provider) return `${found.provider}${found.phoneNumber ? ` - ${found.phoneNumber}` : ''}`;
                }
                return method.startsWith('bank_') ? 'Transfer Bank' : 'E-Wallet';
            }
            return null; // not a bank/ewallet ID, let caller handle it
        };

        const formatPaymentMethod = (transaction) => {
            if (!transaction) return null;

            const method = transaction.payment_method;
            const gateway = transaction.gateway;

            // For Tripay payments, show method name (e.g., "QRIS", "BCA Virtual Account")
            if (gateway === 'tripay' || gateway === 'Tripay') {
                // Tripay methods are like "QRIS", "BCAVA", "MYBVA", etc.
                // Make them more readable
                const methodDisplayNames = {
                    'QRIS': 'QRIS',
                    'QRISC': 'QRIS',
                    'BCAVA': 'BCA Virtual Account',
                    'MYBVA': 'Maybank Virtual Account',
                    'MDVA': 'Mandiri Bill Payment',
                    'BRIVA': 'BRI Virtual Account',
                    'BNIVA': 'BNI Virtual Account',
                    'PERMATAVA': 'Permata Virtual Account',
                    'CIMBVA': 'CIMB Virtual Account',
                    'SAMOLERETA': 'BCA Bank Transfer',
                    'GOPAY': 'GoPay',
                    'OVO': 'OVO',
                    'DANA': 'DANA',
                    'SHOPEEPAY': 'ShopeePay'
                };
                return methodDisplayNames[method] || method || 'Tripay Payment';
            }

            // For manual payments from settings
            if (gateway === 'manual') {
                if (transaction.manual_payment_details) {
                    try {
                        const details = JSON.parse(transaction.manual_payment_details);
                        if (details.type === 'bank') {
                            return `${details.bankName} - ${details.accountNumber}`;
                        } else if (details.type === 'ewallet') {
                            return `${details.provider} - ${details.phoneNumber}`;
                        } else if (details.type === 'cash') {
                            return 'Tunai';
                        }
                    } catch (e) {
                        // If parsing fails, return method as-is
                    }
                }
                return method || 'Transfer Manual';
            }

            // Default: try to resolve bank_/ewallet_, fallback to raw method
            return resolveMethod(method) || method || gateway || 'Payment';
        };

        // Format payment method from legacy payments table
        const formatLegacyPaymentMethod = (payment) => {
            if (!payment) return null;
            const method = payment.payment_method;

            // Map payment method codes to readable names
            const methodNames = {
                'cash': 'Tunai',
                'transfer': 'Transfer Bank',
                'ewallet': 'E-Wallet',
                'credit': 'Kartu Kredit',
                'other': 'Lainnya'
            };

            return methodNames[method] || method || 'Transfer';
        };

        // Get payment method from the latest successful/pending transaction
        // Prioritize payment_transactions, fallback to payments
        const latestTransaction = transactions.find(t => t.status === 'paid') || transactions.find(t => t.status === 'pending') || transactions[0];
        const latestPayment = payments.find(p => p.status === 'success') || payments.find(p => p.status === 'completed') || payments[0];

        // Determine which source to use for payment method
        let paymentMethodDisplay = null;
        let paymentSource = null; // 'tripay' | 'manual' | 'admin'
        let adminName = null;

        if (latestTransaction) {
            paymentMethodDisplay = formatPaymentMethod(latestTransaction);
            paymentSource = latestTransaction.gateway === 'manual' ? 'manual' : latestTransaction.gateway;
            // If payment is paid and has verified_by_name, use it
            if (latestTransaction.status === 'paid' && latestTransaction.verified_by_name) {
                adminName = latestTransaction.verified_by_name;
            }
        } else if (latestPayment) {
            paymentMethodDisplay = formatLegacyPaymentMethod(latestPayment);
            paymentSource = 'admin';
            adminName = latestPayment.admin_name;
        }

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
            payment_method: paymentMethodDisplay,
            payment_gateway: latestTransaction?.gateway || null,
            payment_source: paymentSource,
            processed_by: adminName,
            payments: [
                // Payment from payment_transactions
                ...transactions.map(transaction => ({
                    id: transaction.id,
                    amount: parseFloat(transaction.amount) || 0,
                    fee_amount: parseFloat(transaction.fee_amount) || 0,
                    net_amount: parseFloat(transaction.net_amount) || 0,
                    payment_date: transaction.paid_at,
                    created_at: transaction.created_at,
                    method: formatPaymentMethod(transaction),
                    gateway: transaction.gateway,
                    status: transaction.status,
                    reference_number: transaction.gateway_reference || transaction.gateway_transaction_id,
                    notes: (() => {
                        if (!transaction.customer_data) return '';
                        try {
                            const d = typeof transaction.customer_data === 'string'
                                ? JSON.parse(transaction.customer_data)
                                : transaction.customer_data;
                            return d?.notes || '';
                        } catch (e) { return ''; }
                    })(),
                    source: transaction.gateway === 'manual' ? 'manual' : transaction.gateway,
                    verified_by_name: transaction.verified_by_name || null
                })),
                // Legacy payments from admin
                ...payments.map(payment => ({
                    id: payment.id,
                    amount: parseFloat(payment.amount) || 0,
                    payment_date: payment.payment_date,
                    created_at: payment.created_at,
                    method: formatLegacyPaymentMethod(payment),
                    status: payment.status,
                    reference_number: payment.reference_number,
                    notes: payment.notes || '',
                    source: 'admin',
                    admin_name: payment.admin_name
                }))
            ],
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
            payment_details: paymentMethodDisplay ? {
                method: paymentMethodDisplay,
                source: paymentSource,
                processed_by: adminName
            } : null
        };

        // Get company info for "Diterbitkan oleh" section
        let company = { name: '', address: '', phone: '', email: '' };
        try {
            const { getSetting } = require('../../../config/settingsManager');
            const raw = getSetting('company', '{}');
            const comp = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
            company = {
                name: comp.name || comp.company_name || '',
                address: comp.address || '',
                phone: comp.phone || '',
                email: comp.email || '',
            };
        } catch (e) { /* use empty */ }

        res.json({
            success: true,
            data: {
                ...response,
                company,
                service: serviceInfo ? {
                    active_date: serviceInfo.active_date,
                    isolir_date: serviceInfo.isolir_date,
                    status: serviceInfo.status,
                } : null,
            }
        });

    } catch (error) {
        logger.error('Error fetching customer invoice detail:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil detail invoice'
        });
    }
});

// GET /api/v1/customer-billing/invoices/:id/qris — QRIS payment data for portal modal
router.get('/invoices/:id/qris', async (req, res) => {
    try {
        const { id } = req.params;
        const { getQRISDataUrl } = require('../../../config/qris-generator');
        const data = await getQRISDataUrl(id);
        res.json({ success: true, data });
    } catch (error) {
        logger.error('Error generating QRIS for invoice:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal generate QRIS'
        });
    }
});

module.exports = router;