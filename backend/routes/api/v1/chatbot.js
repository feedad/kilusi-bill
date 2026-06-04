/**
 * Chatbot API Routes
 * GET  /api/v1/chatbot/billing/:phone     — Customer billing summary
 * POST /api/v1/chatbot/support             — Create support ticket
 * POST /api/v1/chatbot/payment-proof       — Record payment proof from WA
 * POST /api/v1/chatbot/payment-proof/:id/assign-customer — Assign customer to proof
 * POST /api/v1/chatbot/approve-payment     — Admin approve → process payment
 * GET  /api/v1/chatbot/admin-users         — List admin users for Omnichat
 * GET  /api/v1/chatbot/bank-accounts       — Bank accounts for AI payment matching
 * GET  /api/v1/chatbot/packages            — Active packages & pricing
 * GET  /api/v1/chatbot/coverage            — Area coverage check
 * GET  /api/v1/chatbot/company             — Company info & registration URLs
 */
const express = require('express');
const router = express.Router();
const { chatbotAuth, chatbotPublicAuth } = require('../../../middleware/chatbotAuth');
const { query, getOne } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// In-memory cache
const cache = new Map();
function getCached(key, ttl = 300000) {
    const entry = cache.get(key);
    if (entry && entry.exp > Date.now()) return entry.data;
    return null;
}
function setCache(key, data, ttl = 300000) {
    cache.set(key, { data, exp: Date.now() + ttl });
}

/**
 * GET /billing/:phone
 * Return billing summary for chatbot
 */
router.get('/billing/:phone', chatbotAuth, async (req, res) => {
    try {
        const phone = req.params.phone?.replace(/\D/g, '');

        if (!phone || phone.length < 8) {
            return res.json({ success: false, message: 'Invalid phone number' });
        }

        // Check cache
        const cacheKey = `billing:${phone}`;
        const cached = getCached(cacheKey, 60000); // 1 minute TTL for billing
        if (cached) {
            return res.json(cached);
        }

        // 1. Lookup customer by phone
        const customer = await getOne(
            'SELECT id, name, phone FROM customers WHERE phone = $1',
            [phone]
        );

        if (!customer) {
            return res.json({ success: false, message: 'Nomor tidak terdaftar' });
        }

        // 2. Get service status
        const service = await getOne(
            `SELECT s.status as service_status, p.name as package_name
             FROM services s
             LEFT JOIN packages p ON s.package_id = p.id
             WHERE s.customer_id = $1
             ORDER BY s.created_at DESC LIMIT 1`,
            [customer.id]
        );

        // 3. Get unpaid/suspended/overdue invoices
        const invoices = await query(
            `SELECT invoice_number, amount, amount_with_code, unique_code,
                    due_date, status
             FROM invoices
             WHERE customer_id = $1
               AND status IN ('unpaid', 'suspended', 'overdue', 'sent', 'draft')
             ORDER BY due_date ASC`,
            [customer.id]
        );

        // 4. Calculate totals
        const invoiceList = invoices.rows.map(inv => ({
            invoice_number: inv.invoice_number,
            amount: Math.round(parseFloat(inv.amount)),
            amount_with_code: inv.amount_with_code ? Math.round(inv.amount_with_code) : null,
            unique_code: inv.unique_code || 0,
            due_date: inv.due_date ? new Date(inv.due_date).toISOString().split('T')[0] : null,
            status: inv.status,
        }));

        const totalUnpaid = invoiceList.reduce((sum, inv) => sum + inv.amount, 0);
        const hasOverdue = invoiceList.some(inv => inv.due_date && new Date(inv.due_date) < new Date());

        // 5. Get payment methods
        const paymentMethods = [];
        try {
            const { getSetting } = require('../../../config/settingsManager');
            const raw = getSetting('payment_settings', '');
            const settings = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
            const bankAccounts = settings.bank_accounts || settings.bankAccounts || [];
            const ewallets = settings.ewallets || settings.eWallets || [];

            for (const acc of bankAccounts) {
                if (acc.isActive === false) continue;
                paymentMethods.push({
                    bank: acc.bankName || acc.bank_name || 'Bank',
                    number: acc.accountNumber || acc.account_number || '',
                    name: acc.accountName || acc.account_name || '',
                });
            }
            for (const w of ewallets) {
                if (w.isActive === false) continue;
                paymentMethods.push({
                    bank: w.provider || 'E-Wallet',
                    number: w.phoneNumber || w.phone_number || '',
                    name: w.accountName || w.account_name || '',
                });
            }
        } catch (e) {
            logger.warn('[Chatbot] Could not load payment methods:', e.message);
        }

        // 6. Get portal link with token
        let portalLink = '';
        try {
            const tokenResult = await getOne(
                'SELECT portal_access_token, token_expires_at FROM customers WHERE id = $1',
                [customer.id]
            );
            if (tokenResult?.portal_access_token) {
                const expiresAt = tokenResult.token_expires_at ? new Date(tokenResult.token_expires_at) : null;
                if (!expiresAt || expiresAt > new Date()) {
                    portalLink = `https://portal.kilusi.id/customer/login/${tokenResult.portal_access_token}`;
                } else {
                    // Token expired — regenerate
                    const CustomerTokenService = require('../../../services/customer-token-service');
                    const newToken = await CustomerTokenService.regenerateToken(customer.id, '365d');
                    portalLink = `https://portal.kilusi.id/customer/login/${newToken.token}`;
                }
            }
        } catch (e) {
            logger.warn('[Chatbot] Portal link generation failed:', e.message);
            portalLink = 'https://portal.kilusi.id/customer';
        }

        const response = {
            success: true,
            customer: {
                name: customer.name,
                firstName: customer.name?.split(' ')[0] || customer.name,
                phone: customer.phone,
                service_status: service?.service_status || 'unknown',
                package_name: service?.package_name || '-',
            },
            billing: {
                total_unpaid: totalUnpaid,
                overdue: hasOverdue,
                invoices: invoiceList,
            },
            payment_methods: paymentMethods,
            portal_link: portalLink,
        };

        // Cache response
        setCache(cacheKey, response, 60000);

        return res.json(response);
    } catch (error) {
        logger.error('[Chatbot] Billing query error:', error);
        return res.json({ success: false, message: 'Terjadi kesalahan. Silakan coba lagi.' });
    }
});

/**
 * POST /support
 * Create support ticket from WhatsApp
 */
router.post('/support', chatbotAuth, async (req, res) => {
    try {
        const { phone, message } = req.body;

        if (!phone || !message) {
            return res.json({ success: false, message: 'Phone and message are required' });
        }

        const cleanPhone = phone.replace(/\D/g, '');

        // Lookup customer
        const customer = await getOne(
            'SELECT id, name FROM customers WHERE phone = $1',
            [cleanPhone]
        );

        if (!customer) {
            return res.json({ success: false, message: 'Nomor tidak terdaftar' });
        }

        // Subject = first 100 chars of message
        const subject = message.substring(0, 100);

        // Create ticket
        const ticketResult = await query(
            `INSERT INTO support_tickets (customer_id, customer_name, customer_phone, subject, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'open', NOW(), NOW())
             RETURNING id, status, created_at`,
            [customer.id, customer.name, cleanPhone, subject]
        );

        const ticket = ticketResult.rows[0];

        // Add first message
        await query(
            `INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_name, message, created_at)
             VALUES ($1, 'user', $2, $3, NOW())`,
            [ticket.id, customer.name, message]
        );

        const ticketNumber = `#${ticket.id}`;

        logger.info(`[Chatbot] Ticket ${ticketNumber} created for ${customer.name}`);

        return res.json({
            success: true,
            ticket: {
                id: ticket.id,
                number: ticketNumber,
                status: ticket.status,
                created_at: ticket.created_at?.toISOString() || new Date().toISOString(),
            },
            message: `Tiket support ${ticketNumber} berhasil dibuat`,
        });
    } catch (error) {
        logger.error('[Chatbot] Support ticket error:', error);
        return res.json({ success: false, message: 'Gagal membuat tiket. Silakan coba lagi.' });
    }
});

// ────────────────────────────────────────────────────────────
// PAYMENT PROOF ENDPOINTS
// ────────────────────────────────────────────────────────────

/**
 * POST /payment-proof
 * Record payment proof from WhatsApp, return billing data for admin review.
 * Creates a pending_verification transaction in payment_transactions.
 */
router.post('/payment-proof', chatbotAuth, async (req, res) => {
    try {
        const { phone, image_url, scanned_amount, scanned_bank, scanned_date, caption } = req.body;
        const cleanPhone = phone?.replace(/\D/g, '');

        if (!cleanPhone || !image_url) {
            return res.json({ success: false, message: 'Phone and image_url are required' });
        }

        // Create transaction first (record everything)
        const txResult = await query(
            `INSERT INTO payment_transactions (
                gateway, status, amount, net_amount, fee_amount,
                is_manual_payment, proof_of_payment, manual_payment_details,
                payment_method, created_at
             ) VALUES ('manual', 'pending_verification', $1, $1, 0, true, $2, $3, $4, NOW())
             RETURNING id`,
            [
                scanned_amount || 0,
                image_url,
                JSON.stringify({ scanned_amount, scanned_bank, scanned_date, caption, customer_id: null }),
                scanned_bank || 'Transfer',
            ]
        );
        const txId = txResult.rows[0].id;

        // Lookup customer by phone
        const customer = await getOne(
            'SELECT id, name, phone FROM customers WHERE phone = $1', [cleanPhone]
        );

        if (!customer) {
            return res.json({
                success: true,
                transaction_id: txId,
                match_status: 'not_found',
                customer: null,
                billing: null,
            });
        }

        // Customer found — update transaction with customer_id
        const details = { scanned_amount, scanned_bank, scanned_date, caption, customer_id: customer.id };
        await query(
            'UPDATE payment_transactions SET manual_payment_details = $1 WHERE id = $2',
            [JSON.stringify(details), txId]
        );

        // Get service status
        const service = await getOne(
            `SELECT s.status as service_status
             FROM services s WHERE s.customer_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
            [customer.id]
        );

        // Get unpaid invoices
        const invoices = await query(
            `SELECT id, invoice_number, amount, due_date, status
             FROM invoices WHERE customer_id = $1
               AND status IN ('unpaid','suspended','sent','draft')
             ORDER BY due_date ASC`,
            [customer.id]
        );

        const billing = {
            total_unpaid: invoices.rows.reduce((s, i) => s + parseFloat(i.amount), 0),
            invoices: invoices.rows.map(i => ({
                id: i.id,
                invoice_number: i.invoice_number,
                amount: Math.round(parseFloat(i.amount)),
                due_date: i.due_date ? new Date(i.due_date).toISOString().split('T')[0] : null,
            })),
        };

        logger.info(`[Chatbot] Payment proof #${txId} recorded for ${customer.name}`);

        return res.json({
            success: true,
            transaction_id: txId,
            match_status: 'found',
            customer: {
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                service_status: service?.service_status || 'unknown',
            },
            billing,
            scanned: { amount: scanned_amount, bank: scanned_bank, date: scanned_date },
        });
    } catch (error) {
        logger.error('[Chatbot] Payment proof error:', error);
        return res.json({ success: false, message: 'Gagal memproses bukti pembayaran.' });
    }
});

/**
 * POST /payment-proof/:id/assign-customer
 * Admin assigns a customer to a pending payment proof transaction.
 * Used when the original phone number was not registered.
 */
router.post('/payment-proof/:id/assign-customer', chatbotAuth, async (req, res) => {
    try {
        const { customer_id } = req.body;
        const txId = req.params.id;

        if (!customer_id) {
            return res.json({ success: false, message: 'customer_id is required' });
        }

        // Validate transaction
        const tx = await getOne(
            `SELECT * FROM payment_transactions WHERE id = $1`, [txId]
        );
        if (!tx) return res.json({ success: false, message: 'Transaksi tidak ditemukan' });
        if (tx.status !== 'pending_verification') {
            return res.json({ success: false, message: 'Transaksi sudah diproses sebelumnya' });
        }

        // Lookup customer
        const customer = await getOne(
            'SELECT id, name, phone FROM customers WHERE id = $1', [customer_id]
        );
        if (!customer) return res.json({ success: false, message: 'Customer tidak ditemukan' });

        // Update manual_payment_details
        const details = typeof tx.manual_payment_details === 'string'
            ? JSON.parse(tx.manual_payment_details) : (tx.manual_payment_details || {});
        details.customer_id = customer.id;
        await query(
            'UPDATE payment_transactions SET manual_payment_details = $1, updated_at = NOW() WHERE id = $2',
            [JSON.stringify(details), txId]
        );

        // Get service status
        const service = await getOne(
            `SELECT s.status as service_status
             FROM services s WHERE s.customer_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
            [customer.id]
        );

        // Get unpaid invoices
        const invoices = await query(
            `SELECT id, invoice_number, amount, due_date, status
             FROM invoices WHERE customer_id = $1
               AND status IN ('unpaid','suspended','sent','draft')
             ORDER BY due_date ASC`,
            [customer.id]
        );

        const billing = {
            total_unpaid: invoices.rows.reduce((s, i) => s + parseFloat(i.amount), 0),
            invoices: invoices.rows.map(i => ({
                id: i.id,
                invoice_number: i.invoice_number,
                amount: Math.round(parseFloat(i.amount)),
                due_date: i.due_date ? new Date(i.due_date).toISOString().split('T')[0] : null,
            })),
        };

        logger.info(`[Chatbot] Customer ${customer.id} assigned to proof #${txId}`);

        return res.json({
            success: true,
            transaction_id: Number(txId),
            match_status: 'found',
            customer: {
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                service_status: service?.service_status || 'unknown',
            },
            billing,
        });
    } catch (error) {
        logger.error('[Chatbot] Assign customer error:', error);
        return res.json({ success: false, message: 'Gagal mengassign pelanggan.' });
    }
});

/**
 * POST /approve-payment
 * Admin approves payment → pay invoices + restore service + notify.
 * verified_by = INTEGER (FK to users.id), set by Omnichat from admin profile.
 */
router.post('/approve-payment', chatbotAuth, async (req, res) => {
    try {
        const { transaction_id, verified_by } = req.body;

        if (!transaction_id) {
            return res.json({ success: false, message: 'transaction_id is required' });
        }

        // 1. Validate transaction
        const tx = await getOne(
            `SELECT * FROM payment_transactions WHERE id = $1`, [transaction_id]
        );
        if (!tx) return res.json({ success: false, message: 'Transaksi tidak ditemukan' });
        if (tx.status !== 'pending_verification') {
            return res.json({ success: false, message: 'Transaksi sudah diproses sebelumnya' });
        }
        if (tx.gateway !== 'manual') {
            return res.json({ success: false, message: 'Hanya transaksi manual yang bisa disetujui' });
        }

        // 2. Get customer_id from details
        const details = typeof tx.manual_payment_details === 'string'
            ? JSON.parse(tx.manual_payment_details) : (tx.manual_payment_details || {});
        const customerId = details?.customer_id;

        if (!customerId) {
            return res.json({ success: false, message: 'Customer belum di-assign ke transaksi ini' });
        }

        const customer = await getOne('SELECT id, name, phone FROM customers WHERE id = $1', [customerId]);
        if (!customer) return res.json({ success: false, message: 'Customer tidak ditemukan' });

        // 3. Get unpaid invoices
        const unpaidInvoices = await query(
            `SELECT * FROM invoices WHERE customer_id = $1
              AND status IN ('unpaid','suspended','sent','draft')
             ORDER BY due_date ASC`,
            [customerId]
        );

        if (unpaidInvoices.rows.length === 0) {
            await query(
                `UPDATE payment_transactions SET status = 'failed', verification_notes = 'No unpaid invoices', updated_at = NOW() WHERE id = $1`,
                [transaction_id]
            );
            return res.json({ success: false, message: 'Tidak ada tagihan yang belum dibayar' });
        }

        const firstInvoice = unpaidInvoices.rows[0];
        const payDate = new Date();
        const methodLabel = tx.payment_method || 'Transfer';

        // 4. Mark all unpaid invoices as paid
        for (const inv of unpaidInvoices.rows) {
            await query(
                `UPDATE invoices SET status = 'paid', paid_at = $1, payment_method = $2, updated_at = NOW() WHERE id = $3`,
                [payDate, methodLabel, inv.id]
            );
        }

        // 5. Link transaction to first invoice (for notification lookup)
        await query('UPDATE payment_transactions SET invoice_id = $1 WHERE id = $2', [firstInvoice.id, transaction_id]);

        // 6. Update service dates
        let updatedDates = null;
        try {
            const BillingCycleService = require('../../../config/billing-cycle-service');
            updatedDates = await BillingCycleService.updateServiceDatesAfterPayment(firstInvoice.id, payDate);
        } catch (e) { logger.warn('[Chatbot] updateServiceDatesAfterPayment failed:', e.message); }

        // 7. Restore service if suspended
        let serviceRestored = false;
        try {
            const serviceData = await getOne(`
                SELECT s.id as service_id, s.service_number, s.status, c.name, p.group as package_group, p.pppoe_profile
                FROM services s JOIN customers c ON c.id = s.customer_id
                LEFT JOIN packages p ON p.id = s.package_id
                WHERE s.customer_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
                [customerId]
            );

            if (serviceData && serviceData.status !== 'active') {
                const serviceSuspension = require('../../../config/serviceSuspension');
                await serviceSuspension.restoreServiceByServiceId(
                    serviceData.service_id,
                    { name: serviceData.name, service_number: serviceData.service_number, package_group: serviceData.package_group, pppoe_profile: serviceData.pppoe_profile },
                    'Payment approved via Omnichat'
                );
                await query('UPDATE services SET status = \'active\', updated_at = NOW() WHERE id = $1', [serviceData.service_id]);
                serviceRestored = true;
                logger.info(`[Chatbot] Service restored for ${customer.name}`);
            }
        } catch (e) { logger.warn('[Chatbot] Service restore failed:', e.message); }

        // 8. Update transaction → paid
        await query(
            `UPDATE payment_transactions SET status = 'paid', verified_by = $1, verified_at = NOW(), paid_at = NOW(), updated_at = NOW() WHERE id = $2`,
            [verified_by || null, transaction_id]
        );

        // 9. WhatsApp notification
        try {
            const whatsappNotifications = require('../../../config/whatsapp-notifications');
            await whatsappNotifications.sendPaymentReceivedNotification(transaction_id, {
                dueDate: updatedDates?.newIsolirDate,
            });
            logger.info(`[Chatbot] Payment notification sent to ${customer.name}`);
        } catch (e) { logger.warn('[Chatbot] Payment notification failed:', e.message); }

        // 10. Accounting transaction
        try {
            const { query: dbQuery } = require('../../../config/database');
            const methodDisplay = methodLabel.startsWith('bank_')
                ? methodLabel : `Transfer - ${methodLabel}`;
            await dbQuery(
                `INSERT INTO accounting_transactions (type, amount, description, reference_type, reference_id, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                ['revenue', parseFloat(tx.amount),
                 `Pembayaran via WA — ${customer.name} (${methodDisplay})`,
                 'payment', transaction_id]
            );
        } catch (e) { logger.warn('[Chatbot] Accounting failed:', e.message); }

        logger.info(`[Chatbot] Payment #${transaction_id} approved for ${customer.name}`);

        return res.json({
            success: true,
            payment_processed: true,
            service_restored: serviceRestored,
            invoices_paid: unpaidInvoices.rows.length,
            message: 'Pembayaran disetujui. Layanan dipulihkan.',
        });
    } catch (error) {
        logger.error('[Chatbot] Approve payment error:', error);
        return res.json({ success: false, message: 'Gagal memproses persetujuan.' });
    }
});

/**
 * GET /admin-users
 * List admin users for Omnichat profile dropdown (verified_by reference).
 */
router.get('/admin-users', chatbotPublicAuth, async (req, res) => {
    try {
        const result = await query(
            `SELECT id, username, role FROM users
             WHERE role IN ('admin','administrator','superadmin')
             ORDER BY username`
        );
        return res.json({ success: true, users: result.rows });
    } catch (error) {
        logger.error('[Chatbot] Admin users error:', error);
        return res.json({ success: false, message: 'Gagal memuat data admin.' });
    }
});

/**
 * GET /bank-accounts
 * Return bank accounts + e-wallets for AI payment proof matching.
 * Omnichat uses this to inject destination accounts into Groq vision prompt.
 */
router.get('/bank-accounts', chatbotPublicAuth, async (req, res) => {
    try {
        const { getSetting } = require('../../../config/settingsManager');
        const raw = getSetting('payment_settings', '');
        const settings = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
        const bankAccounts = settings.bank_accounts || settings.bankAccounts || [];
        const ewallets = settings.ewallets || settings.eWallets || [];

        const accounts = [];
        for (const acc of bankAccounts) {
            if (acc.isActive === false) continue;
            accounts.push({
                bank: acc.bankName || acc.bank_name || 'Bank',
                number: acc.accountNumber || acc.account_number || '',
                name: acc.accountName || acc.account_name || '',
            });
        }
        for (const w of ewallets) {
            if (w.isActive === false) continue;
            accounts.push({
                bank: w.provider || 'E-Wallet',
                number: w.phoneNumber || w.phone_number || '',
                name: w.accountName || w.account_name || '',
            });
        }

        return res.json({ success: true, accounts });
    } catch (error) {
        logger.error('[Chatbot] Bank accounts error:', error);
        return res.json({ success: false, message: 'Gagal memuat data rekening.' });
    }
});

// ────────────────────────────────────────
// PUBLIC ENDPOINTS (no phone auth needed)
// ────────────────────────────────────────

/**
 * GET /packages
 * Return active packages, pricing, and registration link
 */
router.get('/packages', chatbotPublicAuth, async (req, res) => {
    try {
        const cacheKey = 'chatbot:packages';
        const cached = getCached(cacheKey, 300000); // 5 min
        if (cached) return res.json(cached);

        const packages = await query(
            `SELECT id, name, speed, price FROM packages WHERE is_active = true ORDER BY price ASC`
        );

        const pkgList = packages.rows.map(p => ({
            id: p.id,
            name: p.name,
            speed: p.speed || '-',
            price: Math.round(parseFloat(p.price)),
        }));

        // Get installation fee
        let installFee = 50000;
        try {
            const feeResult = await getOne(
                `SELECT fee_amount FROM installation_fee_settings
                 WHERE billing_type = 'prepaid' AND package_id IS NULL AND is_active = true
                 LIMIT 1`
            );
            if (feeResult) installFee = Math.round(parseFloat(feeResult.fee_amount));
        } catch (e) { /* use default */ }

        const response = {
            success: true,
            packages: pkgList,
            installation_fee: installFee,
            billing_type: 'prepaid',
            registration_url: 'https://kilusi.id/customer/register',
        };

        setCache(cacheKey, response, 300000);
        return res.json(response);
    } catch (error) {
        logger.error('[Chatbot] Packages error:', error);
        return res.json({ success: false, message: 'Gagal memuat data paket.' });
    }
});

/**
 * GET /coverage?area=xxx
 * Self-learning coverage check — learns from customer address data
 * 3-tier search: customer addresses → region names → district/regency
 */
router.get('/coverage', chatbotPublicAuth, async (req, res) => {
    try {
        const area = (req.query.area || '').toLowerCase().trim();

        if (!area) {
            // No query — return all regions
            const allRegionsResult = await query(
                `SELECT name FROM regions WHERE disabled_at IS NULL ORDER BY name`
            );
            return res.json({
                success: true,
                area_queried: null,
                available: true,
                matched_region: 'Semua area',
                all_regions: allRegionsResult.rows.map(r => r.name),
                map_url: 'https://kilusi.id/#coverage',
            });
        }

        // ── Tier 1: Search CUSTOMER ADDRESSES (self-learning) ──
        const normalizedArea = area.replace(/\s+/g, '');
        const customerMatches = await query(
            `SELECT r.name as region, COUNT(DISTINCT c.id)::int as customer_count
             FROM customers c
             JOIN services s ON c.id::text = s.customer_id::text
             JOIN regions r ON r.id = s.region_id AND r.disabled_at IS NULL
             WHERE (REPLACE(c.address, ' ', '') ILIKE $1
                 OR REPLACE(s.address_installation, ' ', '') ILIKE $1)
             GROUP BY r.name
             ORDER BY customer_count DESC
             LIMIT 5`,
            [`%${normalizedArea}%`]
        );

        if (customerMatches.rows.length > 0) {
            const top = customerMatches.rows[0];
            const confidence = top.customer_count >= 5 ? 'high'
                : top.customer_count >= 2 ? 'medium' : 'low';

            return res.json({
                success: true,
                area_queried: area,
                available: true,
                confidence,
                learnt_from_customer_data: true,
                matched_region: top.region,
                matching_regions: customerMatches.rows,
                total_customers_matched: customerMatches.rows.reduce((s, r) => s + r.customer_count, 0),
                map_url: 'https://kilusi.id/#coverage',
            });
        }

        // ── Tier 2: Search REGION NAMES ──
        const regionMatches = await query(
            `SELECT name, district, regency FROM regions
             WHERE disabled_at IS NULL
               AND (REPLACE(name, ' ', '') ILIKE $1
                 OR REPLACE(district, ' ', '') ILIKE $1
                 OR REPLACE(regency, ' ', '') ILIKE $1)
             ORDER BY name
             LIMIT 10`,
            [`%${normalizedArea}%`]
        );

        if (regionMatches.rows.length > 0) {
            const allRegionsResult = await query(
                `SELECT name FROM regions WHERE disabled_at IS NULL ORDER BY name`
            );
            return res.json({
                success: true,
                area_queried: area,
                available: true,
                confidence: 'low',
                learnt_from_customer_data: false,
                matched_region: regionMatches.rows[0].name,
                matching_regions: regionMatches.rows.map(r => ({
                    region: r.name,
                    district: r.district || null,
                    regency: r.regency || null,
                    customer_count: 0,
                })),
                note: 'Area ini terdaftar di sistem tapi belum ada data pelanggan. Hubungi admin untuk konfirmasi.',
                all_regions: allRegionsResult.rows.map(r => r.name),
                map_url: 'https://kilusi.id/#coverage',
            });
        }

        // ── Tier 3: Not found ──
        const allRegionsResult = await query(
            `SELECT name FROM regions WHERE disabled_at IS NULL ORDER BY name`
        );
        return res.json({
            success: true,
            area_queried: area,
            available: false,
            confidence: 'none',
            all_regions: allRegionsResult.rows.map(r => r.name),
            map_url: 'https://kilusi.id/#coverage',
        });

    } catch (error) {
        logger.error('[Chatbot] Coverage error:', error);
        return res.json({ success: false, message: 'Gagal memuat data area.' });
    }
});

/**
 * GET /company
 * Return company info, registration URL, map URL
 */
router.get('/company', chatbotPublicAuth, async (req, res) => {
    try {
        const cacheKey = 'chatbot:company';
        const cached = getCached(cacheKey, 600000); // 10 min
        if (cached) return res.json(cached);

        const { getSetting } = require('../../../config/settingsManager');
        const raw = getSetting('company', '{}');
        const company = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});

        const response = {
            success: true,
            company: {
                name: company?.name || 'KITA SELALU TERKONEKSI',
                address: company?.address || 'Jl. Janaloka 1 No.13, Dangdeur, Subang',
                phone: company?.phone || '0811225323',
                hours: 'Senin-Sabtu, 08:00-17:00 WIB',
                website: company?.website || 'https://kilusi.id',
                registration_url: 'https://kilusi.id/customer/register',
                map_url: 'https://kilusi.id/#coverage',
            },
        };

        setCache(cacheKey, response, 600000);
        return res.json(response);
    } catch (error) {
        logger.error('[Chatbot] Company error:', error);
        return res.json({ success: false, message: 'Gagal memuat info perusahaan.' });
    }
});

// POST /api/v1/chatbot/send-invoice — trigger invoice notification from Omnichat
router.post('/send-invoice', chatbotAuth, async (req, res) => {
    try {
        const { phone, invoice_id } = req.body;
        if (!phone || !invoice_id) {
            return res.status(400).json({ success: false, message: 'phone dan invoice_id diperlukan' });
        }

        // Find customer by phone
        const custResult = await query(
            'SELECT id, name FROM customers WHERE phone = $1 LIMIT 1',
            [phone]
        );
        if (custResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan' });
        }
        const customer = custResult.rows[0];

        // Find unpaid invoice belonging to this customer
        const invResult = await query(
            `SELECT id, invoice_number, status FROM invoices
             WHERE id = $1 AND customer_id = $2
               AND status NOT IN ('paid', 'cancelled')`,
            [invoice_id, customer.id]
        );
        if (invResult.rows.length === 0) {
            // Check if invoice exists but is already paid
            const paidCheck = await query(
                `SELECT id, invoice_number, status FROM invoices WHERE id = $1 AND customer_id = $2`,
                [invoice_id, customer.id]
            );
            if (paidCheck.rows.length > 0) {
                return res.json({ success: false, message: `Invoice ${paidCheck.rows[0].invoice_number} sudah dibayar` });
            }
            return res.status(404).json({ success: false, message: 'Invoice tidak ditemukan untuk pelanggan ini' });
        }
        const invoice = invResult.rows[0];

        // Send notification
        const whatsappNotifications = require('../../../config/whatsapp-notifications');
        await whatsappNotifications.sendInvoiceCreatedNotificationWithDetails(customer.id, invoice.id);

        logger.info(`[Chatbot] Invoice ${invoice.invoice_number} sent to ${customer.name} via Omnichat trigger`);
        res.json({ success: true, message: `Notifikasi tagihan ${invoice.invoice_number} terkirim ke ${customer.name}` });
    } catch (error) {
        logger.error('[Chatbot] Error sending invoice:', error);
        res.status(500).json({ success: false, message: 'Gagal mengirim notifikasi' });
    }
});

module.exports = router;
