/**
 * Chatbot API Routes
 * GET  /api/v1/chatbot/billing/:phone       — Customer billing summary
 * GET  /api/v1/chatbot/invoices/search      — Search unpaid invoices by name/service/invoice
 * POST /api/v1/chatbot/support               — Create support ticket
 * POST /api/v1/chatbot/payment-proof         — Record payment proof from WA
 * POST /api/v1/chatbot/payment-proof/:id/assign-customer — Assign customer to proof
 * POST /api/v1/chatbot/approve-payment       — Admin approve → process payment
 * GET  /api/v1/chatbot/admin-users           — List admin users for Omnichat
 * GET  /api/v1/chatbot/bank-accounts         — Bank accounts for AI payment matching
 * GET  /api/v1/chatbot/packages              — Active packages & pricing
 * GET  /api/v1/chatbot/coverage              — Area coverage check
 * GET  /api/v1/chatbot/company               — Company info & registration URLs
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

// Generate phone variants for lookup (handle both `0` and `62` prefix)
function getPhoneVariants(raw) {
    const cleaned = (raw || '').replace(/\D/g, '');
    const variants = [cleaned];
    if (cleaned.startsWith('0')) variants.push('62' + cleaned.slice(1));
    else if (cleaned.startsWith('62')) variants.push('0' + cleaned.slice(2));
    return [...new Set(variants)];
}

/**
 * GET /billing/:phone
 * Return billing summary for chatbot
 */
router.get('/billing/:phone', chatbotAuth, async (req, res) => {
    try {
        const phoneVariants = getPhoneVariants(req.params.phone);
        const phone = phoneVariants[0];

        if (!phone || phone.length < 8) {
            return res.json({ success: false, message: 'Invalid phone number' });
        }

        // Check cache
        const cacheKey = `billing:${phone}`;
        const cached = getCached(cacheKey, 60000); // 1 minute TTL for billing
        if (cached) {
            return res.json(cached);
        }

        // 1. Lookup customer by phone (try both `0` and `62` prefixes)
        const customer = await getOne(
            'SELECT id, name, phone FROM customers WHERE phone = ANY($1)',
            [phoneVariants]
        );

        if (!customer) {
            return res.json({ success: false, message: 'Nomor tidak terdaftar' });
        }

        // 2. Get ALL services for this customer
        const servicesResult = await query(
            `SELECT s.id as service_id, s.service_number, s.status as service_status,
                    s.address_installation, s.siklus, s.billing_type,
                    p.name as package_name, p.speed as package_speed,
                    r.name as region_name, m.name as mitra_name
             FROM services s
             LEFT JOIN packages p ON s.package_id = p.id
             LEFT JOIN regions r ON s.region_id = r.id
             LEFT JOIN mitra m ON m.id = r.mitra_id
             WHERE s.customer_id = $1
             ORDER BY s.created_at DESC`,
            [customer.id]
        );

        // 3. Get ALL unpaid/suspended/overdue invoices with service_number
        const invoices = await query(
            `SELECT invoice_number, amount, amount_with_code, unique_code,
                    due_date, status, service_number
             FROM invoices
             WHERE customer_id = $1
               AND status IN ('unpaid', 'suspended', 'overdue', 'sent', 'draft')
             ORDER BY due_date ASC`,
            [customer.id]
        );

        // 4. Group invoices by service_number and build per-service response
        const invoicesByService = {};
        for (const inv of invoices.rows) {
            const svcNum = inv.service_number || '__unknown__';
            if (!invoicesByService[svcNum]) invoicesByService[svcNum] = [];
            invoicesByService[svcNum].push({
                invoice_number: inv.invoice_number,
                amount: Math.round(parseFloat(inv.amount)),
                amount_with_code: inv.amount_with_code ? Math.round(inv.amount_with_code) : null,
                unique_code: inv.unique_code || 0,
                due_date: inv.due_date ? new Date(inv.due_date).toISOString().split('T')[0] : null,
                status: inv.status,
            });
        }

        const services = servicesResult.rows.map(s => {
            const svcInvoices = invoicesByService[s.service_number] || [];
            const totalUnpaid = svcInvoices.reduce((sum, inv) => sum + inv.amount, 0);
            const hasOverdue = svcInvoices.some(inv => inv.due_date && new Date(inv.due_date) < new Date());
            return {
                service_number: s.service_number,
                service_status: s.service_status,
                package_name: s.package_name || '-',
                package_speed: s.package_speed || null,
                mitra: s.mitra_name || null,
                region_name: s.region_name || null,
                address_installation: s.address_installation || null,
                billing: {
                    total_unpaid: totalUnpaid,
                    overdue: hasOverdue,
                    invoices: svcInvoices,
                },
            };
        });

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
                    const CustomerTokenService = require('../../../services/customer-token-service');
                    const newToken = await CustomerTokenService.regenerateToken(customer.id, '365d');
                    portalLink = `https://portal.kilusi.id/customer/login/${newToken.token}`;
                }
            }
        } catch (e) {
            logger.warn('[Chatbot] Portal link generation failed:', e.message);
            portalLink = 'https://portal.kilusi.id/customer';
        }

        // 7. Compute customer-level totals across all services
        const allInvoices = services.flatMap(s => s.billing.invoices);
        const totalUnpaid = allInvoices.reduce((sum, inv) => sum + inv.amount, 0);
        const hasOverdue = allInvoices.some(inv => inv.due_date && new Date(inv.due_date) < new Date());

        // Primary service = first (most recently created)
        const primary = services[0] || {};

        const response = {
            success: true,
            customer: {
                id: customer.id,
                name: customer.name,
                firstName: customer.name?.split(' ')[0] || customer.name,
                phone: customer.phone,
                service_status: primary.service_status || 'unknown',
                package_name: primary.package_name || '-',
                mitra: primary.mitra || null,
                region_name: primary.region_name || null,
                address_installation: primary.address_installation || null,
            },
            billing: {
                total_unpaid: totalUnpaid,
                overdue: hasOverdue,
                invoices: allInvoices,
            },
            services,
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
 * GET /invoices/search
 * Search unpaid invoices by customer name, service number, or invoice number.
 * Used by Omnichat admin to match payment proofs when phone number doesn't match.
 */
router.get('/invoices/search', chatbotPublicAuth, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();

        if (!q || q.length < 2) {
            return res.json({ success: true, data: [], message: 'Minimal 2 karakter' });
        }

        const result = await query(`
            SELECT DISTINCT ON (i.id)
                i.invoice_number, i.amount, i.due_date, i.status,
                c.id as customer_id, c.name as customer_name, c.phone as customer_phone,
                s.service_number, p.name as package_name
            FROM invoices i
            JOIN customers c ON c.id = i.customer_id
            LEFT JOIN services s ON s.customer_id = c.id AND s.status IN ('active','suspended')
            LEFT JOIN packages p ON s.package_id = p.id
            WHERE i.status IN ('unpaid','suspended','overdue','sent','draft')
              AND (i.invoice_number ILIKE '%' || $1 || '%'
                OR c.name ILIKE '%' || $1 || '%'
                OR s.service_number ILIKE '%' || $1 || '%')
            ORDER BY i.id, s.created_at DESC NULLS LAST
            LIMIT 20
        `, [q]);

        return res.json({
            success: true,
            data: result.rows.map(row => ({
                invoice_number: row.invoice_number,
                amount: Math.round(parseFloat(row.amount)),
                due_date: row.due_date ? new Date(row.due_date).toISOString().split('T')[0] : null,
                status: row.status,
                customer_id: row.customer_id,
                customer_name: row.customer_name,
                customer_phone: row.customer_phone,
                service_number: row.service_number,
                package_name: row.package_name,
            })),
        });
    } catch (error) {
        logger.error('[Chatbot] Invoice search error:', error);
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

        const phoneVariants = getPhoneVariants(phone);

        // Lookup customer
        const customer = await getOne(
            'SELECT id, name FROM customers WHERE phone = ANY($1)',
            [phoneVariants]
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
            [customer.id, customer.name, phoneVariants[0], subject]
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
        const phoneVariants = getPhoneVariants(phone);
        const cleanPhone = phoneVariants[0];

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

        // Lookup customer by phone (try both `0` and `62` prefixes)
        const customer = await getOne(
            'SELECT id, name, phone FROM customers WHERE phone = ANY($1)', [phoneVariants]
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

        // Check if customer already has pending_verification transaction
        const existingTx = await getOne(`
            SELECT pt.id, i.invoice_number
            FROM payment_transactions pt
            JOIN invoices i ON pt.invoice_id = i.id
            WHERE i.customer_id = $1
              AND pt.status = 'pending_verification'
              AND pt.gateway = 'manual'
              AND pt.proof_of_payment IS NOT NULL
            LIMIT 1
        `, [customer.id]);
        if (existingTx) {
            // Return existing transaction instead of creating duplicate
            const invs = await query(
                `SELECT id, invoice_number, amount, due_date, status
                 FROM invoices WHERE customer_id = $1
                   AND status IN ('unpaid','suspended','sent','draft')
                 ORDER BY due_date ASC`,
                [customer.id]
            );
            const billing = {
                total_unpaid: invs.rows.reduce((s, i) => s + parseFloat(i.amount), 0),
                invoices: invs.rows.map(i => ({
                    id: i.id,
                    invoice_number: i.invoice_number,
                    amount: Math.round(parseFloat(i.amount)),
                    due_date: i.due_date ? new Date(i.due_date).toISOString().split('T')[0] : null,
                })),
            };
            const svc = await getOne(
                `SELECT status as service_status FROM services WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1`,
                [customer.id]
            );
            // Delete the duplicate transaction we just created
            await query('DELETE FROM payment_transactions WHERE id = $1', [txId]);
            logger.info(`[Chatbot] Duplicate payment-proof blocked, using existing #${existingTx.id} for ${customer.name}`);
            return res.json({
                success: true,
                transaction_id: existingTx.id,
                match_status: 'found',
                existing: true,
                customer: {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                    service_status: svc?.service_status || 'unknown',
                },
                billing,
                message: `Bukti bayar sebelumnya masih diproses (Invoice ${existingTx.invoice_number})`,
            });
        }

        // Get unpaid invoices (need for invoice_id + billing response)
        const invoices = await query(
            `SELECT id, invoice_number, amount, due_date, status
             FROM invoices WHERE customer_id = $1
               AND status IN ('unpaid','suspended','sent','draft')
             ORDER BY due_date ASC`,
            [customer.id]
        );

        // Get service status
        const service = await getOne(
            `SELECT s.status as service_status
             FROM services s WHERE s.customer_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
            [customer.id]
        );

        // Update transaction with customer_id + link to first unpaid invoice
        const firstInvoiceId = invoices.rows.length > 0 ? invoices.rows[0].id : null;
        const details = { scanned_amount, scanned_bank, scanned_date, caption, customer_id: customer.id };
        await query(
            'UPDATE payment_transactions SET manual_payment_details = $1, invoice_id = $2 WHERE id = $3',
            [JSON.stringify(details), firstInvoiceId, txId]
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

        // Get service status + unpaid invoices (need for invoice_id + billing response)
        const service = await getOne(
            `SELECT s.status as service_status
             FROM services s WHERE s.customer_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
            [customer.id]
        );

        const invoices = await query(
            `SELECT id, invoice_number, amount, due_date, status
             FROM invoices WHERE customer_id = $1
               AND status IN ('unpaid','suspended','sent','draft')
             ORDER BY due_date ASC`,
            [customer.id]
        );

        // Update manual_payment_details + link to first unpaid invoice
        const details = typeof tx.manual_payment_details === 'string'
            ? JSON.parse(tx.manual_payment_details) : (tx.manual_payment_details || {});
        details.customer_id = customer.id;
        const firstInvoiceId = invoices.rows.length > 0 ? invoices.rows[0].id : null;
        await query(
            'UPDATE payment_transactions SET manual_payment_details = $1, invoice_id = $2, updated_at = NOW() WHERE id = $3',
            [JSON.stringify(details), firstInvoiceId, txId]
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
        if (!tx) {
            logger.warn(`[Chatbot] Approve #${transaction_id} failed: transaction not found`);
            return res.json({ success: false, message: 'Transaksi tidak ditemukan' });
        }
        if (tx.status !== 'pending_verification') {
            logger.warn(`[Chatbot] Approve #${transaction_id} failed: status is ${tx.status} (expected pending_verification)`);
            return res.json({ success: false, message: 'Transaksi sudah diproses sebelumnya' });
        }
        if (tx.gateway !== 'manual') {
            logger.warn(`[Chatbot] Approve #${transaction_id} failed: gateway is ${tx.gateway} (expected manual)`);
            return res.json({ success: false, message: 'Hanya transaksi manual yang bisa disetujui' });
        }

        // 2. Get customer_id from details
        const details = typeof tx.manual_payment_details === 'string'
            ? JSON.parse(tx.manual_payment_details) : (tx.manual_payment_details || {});
        const customerId = details?.customer_id;

        if (!customerId) {
            logger.warn(`[Chatbot] Approve #${transaction_id} failed: no customer_id in manual_payment_details`);
            return res.json({ success: false, message: 'Customer belum di-assign ke transaksi ini' });
        }

        const customer = await getOne('SELECT id, name, phone FROM customers WHERE id = $1', [customerId]);
        if (!customer) {
            logger.warn(`[Chatbot] Approve #${transaction_id} failed: customer ${customerId} not found`);
            return res.json({ success: false, message: 'Customer tidak ditemukan' });
        }

        // 3. Get invoice linked to transaction (set during payment-proof or assign-customer)
        if (!tx.invoice_id) {
            logger.warn(`[Chatbot] Approve #${transaction_id} failed: no invoice_id linked`);
            return res.json({ success: false, message: 'Invoice belum di-link ke transaksi ini' });
        }

        const invoice = await getOne(
            'SELECT id, invoice_number, amount, status FROM invoices WHERE id = $1',
            [tx.invoice_id]
        );
        if (!invoice) {
            logger.warn(`[Chatbot] Approve #${transaction_id} failed: invoice ${tx.invoice_id} not found, marking failed`);
            await query(
                `UPDATE payment_transactions SET status = 'failed', verification_notes = 'Invoice not found', updated_at = NOW() WHERE id = $1`,
                [transaction_id]
            );
            return res.json({ success: false, message: 'Invoice tidak ditemukan' });
        }

        // Lookup admin username for notes
        const adminUser = verified_by
            ? await getOne('SELECT username FROM users WHERE id = $1', [verified_by])
            : null;
        const adminName = adminUser?.username || verified_by || 'unknown';

        // Process payment via shared service (INSERT payments, restore service, WA notif, accounting)
        const paymentService = require('../../../services/payment-service');
        const result = await paymentService.processPaymentAfterVerification({
            transactionId: transaction_id,
            invoiceId: tx.invoice_id,
            amount: tx.amount,
            paymentMethod: tx.payment_method || 'Transfer',
            paymentDate: new Date(),
            customerId: customerId,
            customerName: customer.name,
            customerPhone: customer.phone,
            processedBy: adminName,
            verifiedBy: verified_by || null,
        });

        // Handle skipped (invoice already paid by another transaction)
        const { notifyOmnichat } = require('../../../services/payment-service');
        if (result.skipped) {
            notifyOmnichat({
                transaction_id,
                customer_phone: customer.phone,
                status: 'cancelled',
            }).catch(e => logger.warn('[Chatbot] Omnichat notify failed:', e.message));
            logger.warn(`[Chatbot] Payment #${transaction_id} skipped — invoice already paid`);
            return res.json({
                success: true,
                payment_processed: false,
                skipped: true,
                message: 'Invoice sudah dibayar oleh transaksi lain.',
            });
        }

        // 5. Notify Omnichat (non-blocking)
        notifyOmnichat({
            transaction_id,
            customer_phone: customer.phone,
            status: 'approved',
        }).catch(e => logger.warn('[Chatbot] Omnichat notify failed:', e.message));

        logger.info(`[Chatbot] Payment #${transaction_id} approved for ${customer.name}`);

        return res.json({
            success: true,
            payment_processed: true,
            service_restored: result.serviceRestored,
            invoices_paid: 1,
            message: 'Pembayaran disetujui. Layanan dipulihkan.',
        });
    } catch (error) {
        logger.error('[Chatbot] Approve payment error:', error);
        return res.json({ success: false, message: 'Gagal memproses persetujuan.' });
    }
});

/**
 * POST /reject-payment
 * Admin rejects a payment proof from Omnichat card.
 * Body: { transaction_id, rejected_by }
 */
router.post('/reject-payment', chatbotAuth, async (req, res) => {
    try {
        const { transaction_id, rejected_by } = req.body;

        if (!transaction_id) {
            return res.json({ success: false, message: 'transaction_id is required' });
        }

        // 1. Validate transaction
        const tx = await getOne(
            `SELECT pt.*,
                    CASE
                        WHEN pt.invoice_id IS NOT NULL THEN c.phone
                        ELSE COALESCE(pt.manual_payment_details->>'customer_phone', '')
                    END as customer_phone
             FROM payment_transactions pt
             LEFT JOIN invoices i ON pt.invoice_id = i.id
             LEFT JOIN customers c ON i.customer_id = c.id
             WHERE pt.id = $1`, [transaction_id]
        );
        if (!tx) {
            logger.warn(`[Chatbot] Reject #${transaction_id} failed: transaction not found`);
            return res.json({ success: false, message: 'Transaksi tidak ditemukan' });
        }
        if (tx.status !== 'pending_verification') {
            return res.json({ success: false, message: 'Transaksi sudah diproses sebelumnya' });
        }
        if (tx.gateway !== 'manual') {
            return res.json({ success: false, message: 'Hanya transaksi manual yang bisa ditolak' });
        }

        // 2. Update transaction status
        await query(`
            UPDATE payment_transactions
            SET status = 'failed',
                verified_by = $1,
                verified_at = NOW(),
                verification_notes = 'Rejected from Omnichat',
                updated_at = NOW()
            WHERE id = $2
        `, [rejected_by || null, transaction_id]);

        logger.info(`[Chatbot] Payment #${transaction_id} rejected from Omnichat`);

        // 3. Notify Omnichat (non-blocking)
        const { notifyOmnichat } = require('../../../services/payment-service');
        notifyOmnichat({
            transaction_id,
            customer_phone: tx.customer_phone,
            status: 'rejected',
        }).catch(e => logger.warn('[Chatbot] Omnichat notify failed:', e.message));

        return res.json({
            success: true,
            transaction_id,
            status: 'rejected',
            message: 'Pembayaran ditolak.',
        });
    } catch (error) {
        logger.error('[Chatbot] Reject payment error:', error);
        return res.json({ success: false, message: 'Gagal memproses penolakan.' });
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

        const phoneVariants = getPhoneVariants(phone);

        // Find customer by phone
        const custResult = await query(
            'SELECT id, name FROM customers WHERE phone = ANY($1) LIMIT 1',
            [phoneVariants]
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

/**
 * GET /customers/lookup?phone=xxx
 * Search customer by phone number.
 * Returns billing summary (service_status, total_unpaid, latest_invoice).
 */
router.get('/customers/lookup', chatbotPublicAuth, async (req, res) => {
    try {
        const phoneVariants = getPhoneVariants(req.query.phone);
        if (!phoneVariants[0]) {
            return res.json({ success: true, data: [] });
        }

        const customer = await getOne(`
            SELECT c.id, c.name, c.phone, s.status as service_status
            FROM customers c
            LEFT JOIN services s ON s.customer_id = c.id AND s.status IN ('active','suspended')
            WHERE c.phone = ANY($1)
            ORDER BY s.created_at DESC LIMIT 1
        `, [phoneVariants]);

        if (!customer) {
            return res.json({ success: true, data: [] });
        }

        // Get unpaid invoices summary
        const invRows = await query(`
            SELECT invoice_number, amount, due_date
            FROM invoices WHERE customer_id = $1
              AND status IN ('unpaid','suspended','sent','draft')
            ORDER BY due_date ASC
        `, [customer.id]);

        let totalUnpaid = 0;
        let latestInvoice = null;
        if (invRows.rows.length > 0) {
            totalUnpaid = invRows.rows.reduce((s, r) => s + parseFloat(r.amount), 0);
            const first = invRows.rows[0];
            latestInvoice = {
                invoice_number: first.invoice_number,
                amount: Math.round(parseFloat(first.amount)),
                due_date: first.due_date ? new Date(first.due_date).toISOString().split('T')[0] : null,
            };
        }

        return res.json({
            success: true,
            data: [{
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                service_status: customer.service_status || 'unknown',
                total_unpaid: totalUnpaid,
                latest_invoice: latestInvoice,
            }],
        });
    } catch (error) {
        logger.error('[Chatbot] Customer lookup error:', error);
        return res.json({ success: false, message: 'Gagal mencari pelanggan.' });
    }
});

/**
 * GET /customers/:id
 * Get customer by ID with billing summary.
 */
router.get('/customers/:id', chatbotPublicAuth, async (req, res) => {
    try {
        const customer = await getOne(`
            SELECT c.id, c.name, c.phone, s.status as service_status
            FROM customers c
            LEFT JOIN services s ON s.customer_id = c.id AND s.status IN ('active','suspended')
            WHERE c.id = $1
            ORDER BY s.created_at DESC LIMIT 1
        `, [req.params.id]);

        if (!customer) {
            return res.json({ success: false, message: 'Customer tidak ditemukan' });
        }

        // Get unpaid invoices summary
        const invRows = await query(`
            SELECT invoice_number, amount, due_date
            FROM invoices WHERE customer_id = $1
              AND status IN ('unpaid','suspended','sent','draft')
            ORDER BY due_date ASC
        `, [customer.id]);

        let totalUnpaid = 0;
        let latestInvoice = null;
        if (invRows.rows.length > 0) {
            totalUnpaid = invRows.rows.reduce((s, r) => s + parseFloat(r.amount), 0);
            const first = invRows.rows[0];
            latestInvoice = {
                invoice_number: first.invoice_number,
                amount: Math.round(parseFloat(first.amount)),
                due_date: first.due_date ? new Date(first.due_date).toISOString().split('T')[0] : null,
            };
        }

        return res.json({
            success: true,
            data: {
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                service_status: customer.service_status || 'unknown',
                total_unpaid: totalUnpaid,
                latest_invoice: latestInvoice,
            },
        });
    } catch (error) {
        logger.error('[Chatbot] Customer by ID error:', error);
        return res.json({ success: false, message: 'Gagal memuat data pelanggan.' });
    }
});

module.exports = router;
