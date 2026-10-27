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

const uniqueCodeGenerator = require('../../../config/unique-code');
const { getSetting } = require('../../../config/settingsManager');
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


// Format date-only value in local timezone (Asia/Jakarta) as YYYY-MM-DD
function formatLocalDate(val) {
    if (!val) return null;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Derive YYYY-MM billing period from invoice_number (INV-YYYYMM-XXXX) or due_date/created_at
function deriveInvoicePeriod(inv) {
    const match = String(inv?.invoice_number || '').match(/^INV-(\d{4})(\d{2})-/i);
    if (match) return `${match[1]}-${match[2]}`;
    const dateStr = formatLocalDate(inv?.due_date || inv?.created_at);
    return dateStr ? dateStr.slice(0, 7) : null;
}

// Resolve payment_method code (e.g. bank_xxx / ewallet_xxx) to human-readable label
function resolvePaymentMethodDisplay(paymentMethod) {
    if (!paymentMethod) return 'Transfer';
    if (paymentMethod === 'cash') return 'Tunai';
    if (paymentMethod.startsWith('bank_') || paymentMethod.startsWith('ewallet_')) {
        try {
            const raw = getSetting('payment_settings', '');
            const ps = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
            const prefix = paymentMethod.startsWith('bank_') ? 'bank_' : 'ewallet_';
            const id = paymentMethod.replace(prefix, '');
            const accounts = ps?.bank_accounts || ps?.bankAccounts || [];
            const wallets = ps?.ewallets || ps?.eWallets || [];
            const found = [...accounts, ...wallets].find(b => String(b.id) === String(id));
            if (found) {
                if (found.bankName || found.bank_name) {
                    const num = found.accountNumber || found.account_number || '';
                    return num ? `${found.bankName || found.bank_name} - ${num}` : (found.bankName || found.bank_name);
                }
                if (found.provider) {
                    const num = found.phoneNumber || found.phone_number || '';
                    return num ? `${found.provider} - ${num}` : found.provider;
                }
            }
        } catch (e) {
            // fallback below
        }
        return paymentMethod.startsWith('bank_') ? 'Transfer Bank' : 'E-Wallet';
    }
    return paymentMethod;
}

// Format an unpaid/open invoice with base_amount, unique_code, amount_with_code, service_number, period
function formatUnpaidInvoice(inv) {
    const baseAmount = Math.round(parseFloat(inv.amount) || 0);
    const uniqueCode = parseInt(inv.unique_code ?? inv.autopay_unique_code ?? 0, 10) || 0;
    const rawWithCode = inv.amount_with_code ?? inv.autopay_amount;
    const amountWithCode = rawWithCode
        ? Math.round(parseFloat(rawWithCode))
        : (uniqueCode > 0 ? baseAmount + uniqueCode : baseAmount);
    return {
        id: inv.id,
        invoice_number: inv.invoice_number,
        service_number: inv.service_number || null,
        period: deriveInvoicePeriod(inv),
        base_amount: baseAmount,
        amount: baseAmount,
        unique_code: uniqueCode,
        amount_with_code: amountWithCode,
        due_date: formatLocalDate(inv.due_date),
        status: inv.status,
    };
}

// Format a paid invoice record into last_paid_invoice structure
function formatPaidInvoice(row) {
    if (!row) return null;
    const baseAmount = Math.round(parseFloat(row.amount) || 0);
    const paidAmount = Math.round(
        parseFloat(row.p_amount ?? row.pt_amount ?? row.autopay_amount ?? row.amount_with_code ?? row.amount) || 0
    );
    const rawMethod = row.inv_payment_method || row.p_method || row.pt_method || null;
    const rawGateway = row.pt_gateway || row.inv_payment_gateway || row.p_gateway || null;

    let settledBy = 'admin';
    if (rawGateway === 'autopay' || /autopay/i.test(rawMethod || '')) {
        settledBy = 'autopay';
    } else if (
        (rawGateway && !['manual', 'autopay'].includes(String(rawGateway).toLowerCase())) ||
        /tripay|qris|va|virtual account/i.test(rawMethod || '')
    ) {
        settledBy = 'gateway';
    }

    let uniqueCode = parseInt(row.unique_code ?? row.autopay_unique_code ?? 0, 10) || 0;
    if (uniqueCode === 0 && settledBy === 'autopay' && paidAmount > baseAmount && (paidAmount - baseAmount) < 1000000) {
        uniqueCode = paidAmount - baseAmount;
    }
    const rawWithCode = row.amount_with_code ?? row.autopay_amount;
    const amountWithCode = rawWithCode
        ? Math.round(parseFloat(rawWithCode))
        : (uniqueCode > 0 ? baseAmount + uniqueCode : baseAmount);

    const paidAtRaw = row.paid_at || row.pt_paid_at || row.p_date || row.updated_at || null;
    const paidAt = paidAtRaw ? new Date(paidAtRaw).toISOString().replace(/\.\d{3}Z$/, 'Z') : null;

    return {
        id: row.id,
        invoice_number: row.invoice_number,
        service_number: row.service_number || null,
        period: deriveInvoicePeriod(row),
        base_amount: baseAmount,
        unique_code: uniqueCode,
        amount_with_code: amountWithCode,
        paid_amount: paidAmount,
        paid_at: paidAt,
        payment_method: resolvePaymentMethodDisplay(rawMethod),
        settled_by: settledBy,
    };
}

// Fetch paid invoices for a customer (latest first)
async function getPaidInvoicesForCustomer(customerId, limit = 10) {
    const result = await query(
        `SELECT i.id, i.invoice_number, i.service_number, i.amount,
                i.unique_code, i.amount_with_code, i.autopay_unique_code, i.autopay_amount,
                i.due_date, i.created_at, i.paid_at, i.updated_at,
                i.payment_method as inv_payment_method, i.payment_gateway as inv_payment_gateway,
                p.amount as p_amount, p.payment_method as p_method, p.payment_date as p_date,
                p.processed_by, p.payment_gateway as p_gateway,
                pt.gateway as pt_gateway, pt.amount as pt_amount, pt.payment_method as pt_method, pt.paid_at as pt_paid_at
         FROM invoices i
         LEFT JOIN LATERAL (
             SELECT amount, payment_method, payment_date, processed_by, payment_gateway
             FROM payments
             WHERE invoice_id = i.id AND COALESCE(is_rolled_back, false) = false
             ORDER BY created_at DESC LIMIT 1
         ) p ON true
         LEFT JOIN LATERAL (
             SELECT gateway, amount, payment_method, paid_at
             FROM payment_transactions
             WHERE invoice_id = i.id AND status = 'paid'
             ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 1
         ) pt ON true
         WHERE i.customer_id = $1 AND i.status = 'paid'
         ORDER BY COALESCE(i.paid_at, p.payment_date, i.updated_at, i.created_at) DESC, i.id DESC
         LIMIT $2`,
        [customerId, limit]
    );
    return result.rows.map(formatPaidInvoice);
}

// Determine whether a customer uses unique codes on their invoices
function determineUsesUniqueCode(unpaidInvoices, lastPaidInvoice) {
    if (Array.isArray(unpaidInvoices) && unpaidInvoices.length > 0) {
        return unpaidInvoices.some(inv => (inv.unique_code || 0) > 0);
    }
    if (lastPaidInvoice && (lastPaidInvoice.unique_code || 0) > 0) {
        return true;
    }
    return Boolean(uniqueCodeGenerator.isEnabled());
}

// Build deterministic verification result for POST /payment-proof
function buildPaymentProofVerification({
    customer,
    unpaidInvoices = [],
    lastPaidInvoice = null,
    scannedAmount = 0,
    usesUniqueCode = false,
    primaryServiceNumber = null,
}) {
    const scanned = Math.round(parseFloat(scannedAmount) || 0);
    const maxCode = uniqueCodeGenerator.getMaxCode();

    if (!customer) {
        return {
            matchedInvoice: null,
            verification: {
                status: 'customer_not_found',
                requires_unique_code_reminder: false,
                reminder_reason: null,
                matched_invoice_number: null,
                matched_service_number: null,
                expected_base_amount: null,
                expected_unique_code: null,
                expected_total_amount: null,
                scanned_amount: scanned,
                amount_diff: null,
                auto_approved: false,
            },
        };
    }

    if (unpaidInvoices.length > 0) {
        // 1. Exact match on amount_with_code (or base_amount when invoice does not use unique_code)
        let matched = unpaidInvoices.find(
            inv => inv.amount_with_code === scanned || (inv.unique_code === 0 && inv.base_amount === scanned)
        );
        if (matched) {
            return {
                matchedInvoice: matched,
                verification: {
                    status: 'exact_unpaid',
                    requires_unique_code_reminder: false,
                    reminder_reason: null,
                    matched_invoice_number: matched.invoice_number,
                    matched_service_number: matched.service_number || primaryServiceNumber || null,
                    expected_base_amount: matched.base_amount,
                    expected_unique_code: matched.unique_code,
                    expected_total_amount: matched.amount_with_code,
                    scanned_amount: scanned,
                    amount_diff: scanned - matched.amount_with_code,
                    auto_approved: false,
                },
            };
        }

        // 2. Transferred exact base_amount without unique_code
        matched = unpaidInvoices.find(inv => inv.base_amount === scanned && inv.unique_code > 0);
        if (matched) {
            return {
                matchedInvoice: matched,
                verification: {
                    status: 'base_amount_only',
                    requires_unique_code_reminder: true,
                    reminder_reason: 'transferred_base_without_unique_code',
                    matched_invoice_number: matched.invoice_number,
                    matched_service_number: matched.service_number || primaryServiceNumber || null,
                    expected_base_amount: matched.base_amount,
                    expected_unique_code: matched.unique_code,
                    expected_total_amount: matched.amount_with_code,
                    scanned_amount: scanned,
                    amount_diff: scanned - matched.amount_with_code,
                    auto_approved: false,
                },
            };
        }

        // 3. Transferred base_amount + wrong unique code (e.g. previous month's code)
        matched = unpaidInvoices.find(
            inv => scanned > inv.base_amount && (scanned - inv.base_amount) <= maxCode && scanned !== inv.amount_with_code
        );
        if (matched) {
            const needsReminder = Boolean(matched.unique_code > 0 || usesUniqueCode);
            return {
                matchedInvoice: matched,
                verification: {
                    status: 'wrong_unique_code',
                    requires_unique_code_reminder: needsReminder,
                    reminder_reason: needsReminder ? 'transferred_wrong_unique_code' : null,
                    matched_invoice_number: matched.invoice_number,
                    matched_service_number: matched.service_number || primaryServiceNumber || null,
                    expected_base_amount: matched.base_amount,
                    expected_unique_code: matched.unique_code,
                    expected_total_amount: matched.amount_with_code,
                    scanned_amount: scanned,
                    amount_diff: scanned - matched.amount_with_code,
                    auto_approved: false,
                },
            };
        }

        // 4. Amount mismatch — pick closest invoice by amount_with_code (or earliest due)
        matched = unpaidInvoices.reduce((best, inv) => {
            if (!best) return inv;
            return Math.abs(scanned - inv.amount_with_code) < Math.abs(scanned - best.amount_with_code) ? inv : best;
        }, null) || unpaidInvoices[0];
        const needsReminder = Boolean(matched.unique_code > 0 || usesUniqueCode);
        return {
            matchedInvoice: matched,
            verification: {
                status: 'amount_mismatch',
                requires_unique_code_reminder: needsReminder,
                reminder_reason: needsReminder ? 'transferred_amount_mismatch' : null,
                matched_invoice_number: matched.invoice_number,
                matched_service_number: matched.service_number || primaryServiceNumber || null,
                expected_base_amount: matched.base_amount,
                expected_unique_code: matched.unique_code,
                expected_total_amount: matched.amount_with_code,
                scanned_amount: scanned,
                amount_diff: scanned - matched.amount_with_code,
                auto_approved: false,
            },
        };
    }

    // No open/unpaid invoices: distinguish current/recent paid invoice vs no_open_invoice
    const nowLocal = formatLocalDate(new Date());
    const currentPeriod = nowLocal ? nowLocal.slice(0, 7) : '';
    const paidAtMs = lastPaidInvoice?.paid_at ? new Date(lastPaidInvoice.paid_at).getTime() : 0;
    const paidRecently = paidAtMs > 0 && (Date.now() - paidAtMs) <= 7 * 86400 * 1000;
    const isCurrentOrRecentPeriod = Boolean(
        lastPaidInvoice && (
            (lastPaidInvoice.period && currentPeriod && lastPaidInvoice.period >= currentPeriod) ||
            paidRecently
        )
    );

    if (lastPaidInvoice && isCurrentOrRecentPeriod) {
        const isAutopay = lastPaidInvoice.settled_by === 'autopay';
        const status = isAutopay ? 'already_paid_autopay' : 'already_paid_manual';
        const isRoundBase = lastPaidInvoice.unique_code > 0 && scanned === lastPaidInvoice.base_amount;
        const isWrongCode = lastPaidInvoice.unique_code > 0 && scanned !== lastPaidInvoice.amount_with_code && !isRoundBase;
        const requiresReminder = Boolean(
            usesUniqueCode && (isRoundBase || (!isAutopay && isWrongCode))
        );
        let reminderReason = null;
        if (requiresReminder) {
            reminderReason = isRoundBase ? 'transferred_base_without_unique_code' : 'transferred_wrong_unique_code';
        }
        return {
            matchedInvoice: null,
            verification: {
                status,
                requires_unique_code_reminder: requiresReminder,
                reminder_reason: reminderReason,
                matched_invoice_number: lastPaidInvoice.invoice_number,
                matched_service_number: lastPaidInvoice.service_number || primaryServiceNumber || null,
                expected_base_amount: lastPaidInvoice.base_amount,
                expected_unique_code: lastPaidInvoice.unique_code,
                expected_total_amount: lastPaidInvoice.amount_with_code,
                scanned_amount: scanned,
                amount_diff: scanned - lastPaidInvoice.amount_with_code,
                auto_approved: isAutopay,
            },
        };
    }

    // Customer has no open invoice and no current-period paid invoice (e.g. advance payment)
    const refBase = lastPaidInvoice?.base_amount || null;
    const isRoundAmount = scanned > 0 && (scanned === refBase || scanned % 1000 === 0);
    const isOldCodeAmount = Boolean(refBase && scanned > refBase && (scanned - refBase) <= maxCode);
    const requiresReminder = Boolean(usesUniqueCode && (isRoundAmount || isOldCodeAmount));
    let reminderReason = null;
    if (requiresReminder) {
        reminderReason = isRoundAmount ? 'transferred_base_without_unique_code' : 'transferred_old_unique_code';
    }

    return {
        matchedInvoice: null,
        verification: {
            status: 'no_open_invoice',
            requires_unique_code_reminder: requiresReminder,
            reminder_reason: reminderReason,
            matched_invoice_number: null,
            matched_service_number: lastPaidInvoice?.service_number || primaryServiceNumber || null,
            expected_base_amount: refBase,
            expected_unique_code: null,
            expected_total_amount: null,
            scanned_amount: scanned,
            amount_diff: null,
            auto_approved: false,
        },
    };
}

// Assemble full customer + billing + verification payload for payment-proof endpoints
async function buildCustomerProofPayload(customer, scannedAmount, { phoneIsOwner = true } = {}) {
    const [invsResult, service, paidInvoices] = await Promise.all([
        query(
            `SELECT id, invoice_number, service_number, amount, unique_code, amount_with_code,
                    autopay_unique_code, autopay_amount, due_date, created_at, status
             FROM invoices
             WHERE customer_id = $1
               AND status IN ('unpaid', 'suspended', 'overdue', 'sent', 'draft')
             ORDER BY due_date ASC, id ASC`,
            [customer.id]
        ),
        getOne(
            `SELECT s.status as service_status, s.service_number
             FROM services s WHERE s.customer_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
            [customer.id]
        ),
        getPaidInvoicesForCustomer(customer.id, 1),
    ]);

    const formattedInvoices = invsResult.rows.map(formatUnpaidInvoice);
    const lastPaidInvoice = paidInvoices[0] || null;
    const usesUniqueCode = determineUsesUniqueCode(formattedInvoices, lastPaidInvoice);
    const todayStr = formatLocalDate(new Date());
    const totalUnpaid = formattedInvoices.reduce((sum, inv) => sum + inv.base_amount, 0);
    const totalUnpaidWithCode = formattedInvoices.reduce((sum, inv) => sum + inv.amount_with_code, 0);
    const hasOverdue = formattedInvoices.some(
        inv => inv.status === 'overdue' || (inv.due_date && todayStr && inv.due_date < todayStr)
    );

    const { matchedInvoice, verification } = buildPaymentProofVerification({
        customer,
        unpaidInvoices: formattedInvoices,
        lastPaidInvoice,
        scannedAmount,
        usesUniqueCode,
        primaryServiceNumber: service?.service_number || null,
    });

    return {
        matchedInvoice,
        customerPayload: {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            phone_is_owner: Boolean(phoneIsOwner),
            service_status: service?.service_status || 'unknown',
            uses_unique_code: usesUniqueCode,
        },
        verification,
        billing: {
            total_unpaid: totalUnpaid,
            total_unpaid_with_code: totalUnpaidWithCode,
            overdue: hasOverdue,
            invoices: formattedInvoices,
            last_paid_invoice: lastPaidInvoice,
        },
    };
}
// Generate unique ticket number (SUP-YYYYMM-NNN)
async function generateTicketNumber() {
    const prefix = 'SUP';
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    const result = await query(`
        SELECT ticket_number FROM support_tickets
        WHERE ticket_number LIKE '${prefix}-${year}${month}%'
        ORDER BY ticket_number DESC LIMIT 1
    `);

    let sequence = 1;
    if (result.rows.length > 0) {
        const lastTicket = result.rows[0].ticket_number;
        const lastSequence = parseInt(lastTicket.split('-')[2]);
        sequence = lastSequence + 1;
    }

    return `${prefix}-${year}${month}-${String(sequence).padStart(3, '0')}`;
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
                    r.name as region_name, m.id as mitra_id, m.name as mitra_name
             FROM services s
             LEFT JOIN packages p ON p.id = s.package_id
             LEFT JOIN regions r ON r.id = s.region_id
             LEFT JOIN mitra m ON m.id = r.mitra_id
             WHERE s.customer_id = $1
             ORDER BY s.created_at DESC`,
            [customer.id]
        );

        // 3. Get ALL unpaid/suspended/overdue invoices + paid invoices for this customer
        const [invoices, paidInvoices] = await Promise.all([
            query(
                `SELECT id, invoice_number, amount, amount_with_code, unique_code,
                        autopay_amount, autopay_unique_code, due_date, created_at, status, service_number
                 FROM invoices
                 WHERE customer_id = $1
                   AND status IN ('unpaid', 'suspended', 'overdue', 'sent', 'draft')
                 ORDER BY due_date ASC, id ASC`,
                [customer.id]
            ),
            getPaidInvoicesForCustomer(customer.id, 10),
        ]);

        const lastPaidOverall = paidInvoices[0] || null;
        const lastPaidByService = {};
        for (const paidInv of paidInvoices) {
            const svcNum = paidInv.service_number || '__unknown__';
            if (!lastPaidByService[svcNum]) lastPaidByService[svcNum] = paidInv;
        }

        // 4. Group invoices by service_number and build per-service response
        const todayStr = formatLocalDate(new Date());
        const invoicesByService = {};
        for (const inv of invoices.rows) {
            const svcNum = inv.service_number || '__unknown__';
            if (!invoicesByService[svcNum]) invoicesByService[svcNum] = [];
            invoicesByService[svcNum].push(formatUnpaidInvoice(inv));
        }

        const services = servicesResult.rows.map(s => {
            const svcInvoices = invoicesByService[s.service_number] || [];
            const totalUnpaid = svcInvoices.reduce((sum, inv) => sum + inv.base_amount, 0);
            const totalUnpaidWithCode = svcInvoices.reduce((sum, inv) => sum + inv.amount_with_code, 0);
            const hasOverdue = svcInvoices.some(
                inv => inv.status === 'overdue' || (inv.due_date && todayStr && inv.due_date < todayStr)
            );
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
                    total_unpaid_with_code: totalUnpaidWithCode,
                    overdue: hasOverdue,
                    invoices: svcInvoices,
                    last_paid_invoice: lastPaidByService[s.service_number] || lastPaidOverall || null,
                },
            };
        });
        // 5. Get payment methods (filtered by customer's mitra + company accounts)
        const customerMitraId = servicesResult.rows[0]?.mitra_id || null;
        const paymentMethods = [];
        try {
            const { getSetting } = require('../../../config/settingsManager');
            const raw = getSetting('payment_settings', '');
            const settings = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
            const bankAccounts = settings.bank_accounts || settings.bankAccounts || [];
            const ewallets = settings.ewallets || settings.eWallets || [];

            const filterAccountForMitra = (acc) => {
                if (acc.isActive === false) return false;
                if (acc.is_company === true) return true;
                const mIds = Array.isArray(acc.mitra_ids) ? acc.mitra_ids : (acc.mitra_id ? [acc.mitra_id] : []);
                if (mIds.length === 0) return true;
                return customerMitraId && mIds.map(String).includes(String(customerMitraId));
            };

            for (const acc of bankAccounts.filter(filterAccountForMitra)) {
                paymentMethods.push({
                    bank: acc.bankName || acc.bank_name || 'Bank',
                    number: acc.accountNumber || acc.account_number || '',
                    name: acc.accountName || acc.account_name || '',
                });
            }
            for (const w of ewallets.filter(filterAccountForMitra)) {
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
        const allInvoices = invoices.rows.map(formatUnpaidInvoice);
        const totalUnpaid = allInvoices.reduce((sum, inv) => sum + inv.base_amount, 0);
        const totalUnpaidWithCode = allInvoices.reduce((sum, inv) => sum + inv.amount_with_code, 0);
        const hasOverdue = allInvoices.some(
            inv => inv.status === 'overdue' || (inv.due_date && todayStr && inv.due_date < todayStr)
        );
        const usesUniqueCode = determineUsesUniqueCode(allInvoices, lastPaidOverall);

        // Primary service = first (most recently created)
        const primary = services[0] || {};

        const response = {
            success: true,
            customer: {
                id: customer.id,
                name: customer.name,
                firstName: customer.name?.split(' ')[0] || customer.name,
                phone: customer.phone,
                phone_is_owner: true,
                service_status: primary.service_status || 'unknown',
                uses_unique_code: usesUniqueCode,
                package_name: primary.package_name || '-',
                mitra: primary.mitra || null,
                region_name: primary.region_name || null,
                address_installation: primary.address_installation || null,
            },
            billing: {
                total_unpaid: totalUnpaid,
                total_unpaid_with_code: totalUnpaidWithCode,
                overdue: hasOverdue,
                invoices: allInvoices,
                last_paid_invoice: lastPaidOverall,
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
                i.id, i.invoice_number, i.amount, i.unique_code, i.amount_with_code,
                i.autopay_unique_code, i.autopay_amount, i.due_date, i.created_at, i.status,
                c.id as customer_id, c.name as customer_name, c.phone as customer_phone,
                COALESCE(i.service_number, s.service_number) as service_number, p.name as package_name
            FROM invoices i
            JOIN customers c ON c.id = i.customer_id
            LEFT JOIN services s ON s.customer_id = c.id AND s.status IN ('active','suspended')
            LEFT JOIN packages p ON s.package_id = p.id
            WHERE i.status IN ('unpaid','suspended','overdue','sent','draft')
              AND (i.invoice_number ILIKE '%' || $1 || '%'
                OR c.name ILIKE '%' || $1 || '%'
                OR COALESCE(i.service_number, s.service_number) ILIKE '%' || $1 || '%')
            ORDER BY i.id, s.created_at DESC NULLS LAST
            LIMIT 20
        `, [q]);

        return res.json({
            success: true,
            data: result.rows.map(row => {
                const formatted = formatUnpaidInvoice(row);
                return {
                    ...formatted,
                    customer_id: row.customer_id,
                    customer_name: row.customer_name,
                    customer_phone: row.customer_phone,
                    package_name: row.package_name,
                };
            }),
        });
    } catch (error) {
        logger.error('[Chatbot] Invoice search error:', error);
        return res.json({ success: false, message: 'Terjadi kesalahan. Silakan coba lagi.' });
    }
});

/**
 * GET /customers/search
 * Search customers by name, address, phone, or service_number.
 * Used by Omnichat to lookup customer information for AI/admin queries.
 */
router.get('/customers/search', chatbotPublicAuth, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();

        if (!q || q.length < 2) {
            return res.json({ success: true, data: [], total: 0, message: 'Minimal 2 karakter' });
        }

        const result = await query(`
            SELECT DISTINCT ON (COALESCE(s.id::text, c.id::text))
                c.id as customer_id,
                c.name as customer_name,
                c.phone as customer_phone,
                c.email as customer_email,
                COALESCE(s.address_installation, c.address) as address,
                s.service_number,
                COALESCE(s.status, 'no_service') as service_status,
                p.name as package_name,
                p.price as package_price,
                s.active_date,
                s.isolir_date,
                r.name as region_name,
                m.name as mitra_name
            FROM customers c
            LEFT JOIN services s ON s.customer_id = c.id
            LEFT JOIN packages p ON s.package_id = p.id
            LEFT JOIN regions r ON s.region_id = r.id
            LEFT JOIN mitra m ON r.mitra_id = m.id
            WHERE (
                c.name ILIKE '%' || $1 || '%'
                OR c.address ILIKE '%' || $1 || '%'
                OR s.address_installation ILIKE '%' || $1 || '%'
                OR s.service_number ILIKE '%' || $1 || '%'
                OR c.phone ILIKE '%' || $1 || '%'
            )
            ORDER BY COALESCE(s.id::text, c.id::text), s.created_at DESC NULLS LAST
            LIMIT 20
        `, [q]);

        return res.json({
            success: true,
            total: result.rows.length,
            data: result.rows.map(row => ({
                customer_id: row.customer_id,
                customer_name: row.customer_name,
                customer_phone: row.customer_phone,
                customer_email: row.customer_email || null,
                address: row.address || null,
                service_number: row.service_number || null,
                service_status: row.service_status,
                package_name: row.package_name || null,
                package_price: row.package_price ? Math.round(parseFloat(row.package_price)) : null,
                active_date: row.active_date ? new Date(row.active_date).toISOString().split('T')[0] : null,
                isolir_date: row.isolir_date ? new Date(row.isolir_date).toISOString().split('T')[0] : null,
                region_name: row.region_name || null,
                mitra_name: row.mitra_name || null,
            })),
        });
    } catch (error) {
        logger.error('[Chatbot] Customer search error:', error);
        return res.json({ success: false, message: 'Terjadi kesalahan. Silakan coba lagi.' });
    }
});

/**
 * GET /connection-status/:query
 * Get real-time RADIUS connection status by customer phone, service number, pppoe_username, or customer_id.
 * Used by Omnichat to display real-time connection info (online status, IP, NAS, uptime, last_seen).
 */
router.get('/connection-status/:query', chatbotPublicAuth, async (req, res) => {
    try {
        const queryStr = (req.params.query || '').trim();

        if (!queryStr) {
            return res.json({ success: false, message: 'Query parameter is required' });
        }

        const phoneVariants = getPhoneVariants(queryStr);
        const radiusPostgres = require('../../../config/radius-postgres');

        // Lookup customer & service by name, address, phone, service_number, pppoe_username, or customer_id
        const customerResult = await query(`
            SELECT DISTINCT ON (COALESCE(s.id::text, c.id::text))
                c.id as customer_id,
                c.name as customer_name,
                c.phone as customer_phone,
                s.id as service_id,
                s.service_number,
                COALESCE(s.status, 'no_service') as service_status,
                t.pppoe_username,
                p.name as package_name,
                p.price as package_price,
                s.active_date,
                s.isolir_date
            FROM customers c
            LEFT JOIN services s ON s.customer_id = c.id
            LEFT JOIN technical_details t ON t.service_id = s.id
            LEFT JOIN packages p ON s.package_id = p.id
            WHERE (
                c.name ILIKE '%' || $2 || '%'
                OR c.address ILIKE '%' || $2 || '%'
                OR s.address_installation ILIKE '%' || $2 || '%'
                OR c.phone = ANY($1)
                OR s.service_number ILIKE '%' || $2 || '%'
                OR LOWER(t.pppoe_username) ILIKE LOWER('%' || $2 || '%')
                OR c.id = $2
            )
            ORDER BY COALESCE(s.id::text, c.id::text), s.created_at DESC NULLS LAST
            LIMIT 20
        `, [phoneVariants, queryStr]);

        if (customerResult.rows.length === 0) {
            return res.json({ success: false, message: 'Pelanggan / Layanan tidak ditemukan' });
        }

        const servicesData = await Promise.all(customerResult.rows.map(async (row) => {
            let connStatus = { online: false, status: 'offline', last_seen: null };

            if (row.pppoe_username) {
                try {
                    connStatus = await radiusPostgres.getUserConnectionStatus(row.pppoe_username);
                } catch (radiusErr) {
                    logger.warn(`[ChatbotConnStatus] Failed to fetch RADIUS status for ${row.pppoe_username}:`, radiusErr.message);
                }
            }

            return {
                customer_id: row.customer_id,
                customer_name: row.customer_name,
                customer_phone: row.customer_phone,
                service_number: row.service_number || null,
                pppoe_username: row.pppoe_username || null,
                service_status: row.service_status,
                package_name: row.package_name || null,
                package_price: row.package_price ? Math.round(parseFloat(row.package_price)) : null,
                active_date: row.active_date ? new Date(row.active_date).toISOString().split('T')[0] : null,
                isolir_date: row.isolir_date ? new Date(row.isolir_date).toISOString().split('T')[0] : null,
                connection_status: {
                    online: connStatus?.online || false,
                    status: connStatus?.status || 'offline',
                    ip_address: connStatus?.ip_address || connStatus?.framed_ip || null,
                    nas_ip: connStatus?.nas_ip || null,
                    mac_address: connStatus?.mac_address || null,
                    session_start: connStatus?.session_start ? new Date(connStatus.session_start).toISOString() : null,
                    uptime_seconds: connStatus?.uptime_seconds || (connStatus?.session_time ? parseInt(connStatus.session_time) : null),
                    last_seen: connStatus?.last_seen ? new Date(connStatus.last_seen).toISOString() : null
                }
            };
        }));

        return res.json({
            success: true,
            total: servicesData.length,
            data: servicesData
        });
    } catch (error) {
        logger.error('[Chatbot] Connection status error:', error);
        return res.json({ success: false, message: 'Terjadi kesalahan saat mengambil status koneksi.' });
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
        const description = message;

        // Generate proper ticket number
        const ticketNumber = await generateTicketNumber();

        // Create ticket
        const ticketResult = await query(
            `INSERT INTO support_tickets (ticket_number, customer_id, customer_name, customer_phone, subject, description, category, priority, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NOW(), NOW())
             RETURNING id, status, created_at`,
            [ticketNumber, customer.id, customer.name, phoneVariants[0], subject, description, 'general', 'normal']
        );

        const ticket = ticketResult.rows[0];

        // Add first message
        await query(
            `INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_name, message, created_at)
             VALUES ($1, 'user', $2, $3, NOW())`,
            [ticket.id, customer.name, message]
        );

        logger.info(`[Chatbot] Ticket ${ticketNumber} created for ${customer.name}`);

        // Send WhatsApp notification to customer
        try {
            const whatsappNotifications = require('../../../config/whatsapp-notifications');
            await whatsappNotifications.sendTicketCreatedNotification(phoneVariants[0], {
                customer_id: customer.id,
                customer_name: customer.name,
                ticket_number: ticketNumber,
                subject: subject,
                category: 'general',
                priority: 'normal',
                description: description
            });
            logger.info(`📱 Ticket created WA notification sent to ${phone}`);
        } catch (notifError) {
            logger.error(`Failed to send ticket WA notification:`, notifError.message);
        }

        // Send WhatsApp notification to Admin & Mitra
        try {
            const whatsappNotifications = require('../../../config/whatsapp-notifications');
            await whatsappNotifications.notifyNewTicket({
                ticketNumber: ticketNumber,
                customerId: customer.id,
                customerName: customer.name,
                customerPhone: phoneVariants[0],
                customerAddress: customer.address,
                subject: subject,
                category: 'general',
                priority: 'normal',
                description: description || message
            });
            logger.info(`📱 Admin & Mitra notified about chatbot ticket ${ticketNumber}`);
        } catch (adminNotifError) {
            logger.error(`Failed to send admin/mitra WA notification for chatbot ticket:`, adminNotifError.message);
        }

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

        const parsedAmount = parseFloat(scanned_amount);
        if (!scanned_amount || isNaN(parsedAmount) || parsedAmount <= 0 || !scanned_bank) {
            logger.warn(`[Chatbot] Payment proof rejected: incomplete scan data (amount: ${scanned_amount}, bank: ${scanned_bank}) from phone ${cleanPhone}`);
            return res.json({
                success: false,
                message: 'Data bukti pembayaran tidak lengkap (nominal atau bank tujuan transfer tidak terdeteksi).',
                rejected_reason: 'incomplete_scan_data',
                scanned: { amount: scanned_amount || null, bank: scanned_bank || null, date: scanned_date || null }
            });
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
                JSON.stringify({ scanned_amount, scanned_bank, scanned_date, caption, sender_phone: cleanPhone, customer_id: null }),
                scanned_bank || 'Transfer',
            ]
        );
        const txId = txResult.rows[0].id;

        // Lookup customer by phone (try both `0` and `62` prefixes)
        const customer = await getOne(
            'SELECT id, name, phone FROM customers WHERE phone = ANY($1)', [phoneVariants]
        );

        if (!customer) {
            const { verification } = buildPaymentProofVerification({
                customer: null,
                scannedAmount: parsedAmount,
            });
            return res.json({
                success: true,
                transaction_id: txId,
                match_status: 'not_found',
                customer: null,
                verification,
                billing: null,
                scanned: { amount: scanned_amount, bank: scanned_bank, date: scanned_date },
            });
        }

        const { matchedInvoice, customerPayload, verification, billing } = await buildCustomerProofPayload(
            customer,
            parsedAmount,
            { phoneIsOwner: true }
        );

        // Check if customer already has pending_verification transaction
        const existingTx = await getOne(`
            SELECT pt.id, i.invoice_number
            FROM payment_transactions pt
            JOIN invoices i ON pt.invoice_id = i.id
            WHERE i.customer_id = $1
              AND pt.status = 'pending_verification'
              AND pt.gateway = 'manual'
              AND pt.proof_of_payment IS NOT NULL
              AND pt.id != $2
            LIMIT 1
        `, [customer.id, txId]);
        if (existingTx) {
            // Delete the duplicate transaction we just created
            await query('DELETE FROM payment_transactions WHERE id = $1', [txId]);
            logger.info(`[Chatbot] Duplicate payment-proof blocked, using existing #${existingTx.id} for ${customer.name}`);
            return res.json({
                success: true,
                transaction_id: existingTx.id,
                match_status: 'found',
                existing: true,
                customer: customerPayload,
                verification,
                billing,
                scanned: { amount: scanned_amount, bank: scanned_bank, date: scanned_date },
                message: `Bukti bayar sebelumnya masih diproses (Invoice ${existingTx.invoice_number})`,
            });
        }

        // Update transaction with customer_id + link to matched (or first unpaid) invoice
        const linkedInvoiceId = matchedInvoice?.id || (billing.invoices.length > 0 ? billing.invoices[0].id : null);
        const details = { scanned_amount, scanned_bank, scanned_date, caption, sender_phone: cleanPhone, customer_id: customer.id };
        await query(
            'UPDATE payment_transactions SET manual_payment_details = $1, invoice_id = $2 WHERE id = $3',
            [JSON.stringify(details), linkedInvoiceId, txId]
        );

        logger.info(`[Chatbot] Payment proof #${txId} recorded for ${customer.name} (verification: ${verification.status})`);

        return res.json({
            success: true,
            transaction_id: txId,
            match_status: 'found',
            customer: customerPayload,
            verification,
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

        const details = typeof tx.manual_payment_details === 'string'
            ? JSON.parse(tx.manual_payment_details) : (tx.manual_payment_details || {});
        const scannedAmount = details.scanned_amount ?? tx.amount ?? 0;
        const senderVariants = details.sender_phone ? getPhoneVariants(details.sender_phone) : [];
        const phoneIsOwner = senderVariants.length > 0 ? senderVariants.includes(customer.phone) : false;

        const { matchedInvoice, customerPayload, verification, billing } = await buildCustomerProofPayload(
            customer,
            scannedAmount,
            { phoneIsOwner }
        );

        // Update manual_payment_details + link to matched (or first unpaid) invoice
        details.customer_id = customer.id;
        const linkedInvoiceId = matchedInvoice?.id || (billing.invoices.length > 0 ? billing.invoices[0].id : null);
        await query(
            'UPDATE payment_transactions SET manual_payment_details = $1, invoice_id = $2, updated_at = NOW() WHERE id = $3',
            [JSON.stringify(details), linkedInvoiceId, txId]
        );

        logger.info(`[Chatbot] Customer ${customer.id} assigned to proof #${txId} (verification: ${verification.status})`);

        return res.json({
            success: true,
            transaction_id: Number(txId),
            match_status: 'found',
            customer: customerPayload,
            verification,
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

        // Fallback to invoice amount if transaction amount is 0/null/invalid
        const finalPayAmount = parseFloat(tx.amount) > 0
            ? parseFloat(tx.amount)
            : parseFloat(invoice.amount);

        // Process payment via shared service (INSERT payments, restore service, WA notif, accounting)
        const paymentService = require('../../../services/payment-service');
        const result = await paymentService.processPaymentAfterVerification({
            transactionId: transaction_id,
            invoiceId: tx.invoice_id,
            amount: finalPayAmount,
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


        // Invalidate billing cache for customer phone variants
        for (const variant of getPhoneVariants(customer.phone)) {
            cache.delete(`billing:${variant}`);
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
        const { mitra_id, phone } = req.query;
        let customerMitraId = mitra_id || null;

        if (!customerMitraId && phone) {
            const phoneVariants = getPhoneVariants(phone);
            const mRes = await query(`
                SELECT m.id as mitra_id
                FROM customers c
                JOIN services s ON s.customer_id = c.id
                JOIN regions r ON s.region_id = r.id
                JOIN mitra m ON r.mitra_id = m.id
                WHERE c.phone = ANY($1)
                ORDER BY s.created_at DESC LIMIT 1
            `, [phoneVariants]);
            customerMitraId = mRes.rows[0]?.mitra_id || null;
        }

        const { getSetting } = require('../../../config/settingsManager');
        const raw = getSetting('payment_settings', '');
        const settings = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
        const bankAccounts = settings.bank_accounts || settings.bankAccounts || [];
        const ewallets = settings.ewallets || settings.eWallets || [];

        const filterAccountForMitra = (acc) => {
            if (acc.isActive === false) return false;
            if (acc.is_company === true) return true;
            const mIds = Array.isArray(acc.mitra_ids) ? acc.mitra_ids : (acc.mitra_id ? [acc.mitra_id] : []);
            if (mIds.length === 0) return true;
            return customerMitraId && mIds.map(String).includes(String(customerMitraId));
        };

        const accounts = [];
        for (const acc of bankAccounts.filter(filterAccountForMitra)) {
            accounts.push({
                bank: acc.bankName || acc.bank_name || 'Bank',
                number: acc.accountNumber || acc.account_number || '',
                name: acc.accountName || acc.account_name || '',
            });
        }
        for (const w of ewallets.filter(filterAccountForMitra)) {
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

        // Ambil biaya instalasi default (package_id IS NULL)
        let defaultInstallFee = 0;
        try {
            const feeResult = await getOne(
                `SELECT fee_amount FROM installation_fee_settings
                 WHERE billing_type = 'prepaid' AND package_id IS NULL AND is_active = true
                 LIMIT 1`
            );
            if (feeResult) defaultInstallFee = Math.round(parseFloat(feeResult.fee_amount));
        } catch (e) { /* use default */ }

        // Ambil paket beserta biaya instalasinya (jika ada)
        const packages = await query(`
            SELECT p.id, p.name, p.speed, p.price, f.fee_amount as specific_fee
            FROM packages p
            LEFT JOIN installation_fee_settings f 
                ON f.package_id = p.id AND f.is_active = true AND f.billing_type = 'prepaid'
            WHERE p.is_active = true 
            ORDER BY p.price ASC
        `);

        const pkgList = packages.rows.map(p => {
            const installFee = p.specific_fee !== null ? Math.round(parseFloat(p.specific_fee)) : defaultInstallFee;
            return {
                id: p.id,
                name: p.name,
                speed: p.speed || '-',
                price: Math.round(parseFloat(p.price)),
                installation_fee: installFee
            };
        });

        const response = {
            success: true,
            packages: pkgList,
            default_installation_fee: defaultInstallFee,
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
