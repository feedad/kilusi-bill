const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { getSetting } = require('../../../config/settingsManager');
const { query, getOne, getAll, transaction } = require('../../../config/database');
const ReferralService = require('../../../services/referral-service');
const DiscountService = require('../../../services/discount-service');
const BillingDiscountIntegration = require('../../../services/billing-discount-integration');
const { asyncHandler } = require('../../../middleware/response');
const serviceSuspension = require('../../../config/serviceSuspension');
const { generateInvoiceNumber } = require('../../../config/billing');

function categorizePaymentMethod(rawMethod, gateway) {
    if (!rawMethod || rawMethod.trim() === '') return { method: '-', channel: '-' };

    if (gateway === 'tripay') return { method: 'Tripay', channel: rawMethod };

    const m = rawMethod.toUpperCase().trim();

    // Legacy shorthand methods from manual payments
    if (m === 'CASH' || m === 'TUNAI') return { method: 'Tunai', channel: '-' };
    if (m === 'TRANSFER' || m === 'BANK_TRANSFER') return { method: 'Transfer Bank', channel: '-' };
    if (m === 'OTHER' || m === 'LAINNYA') return { method: 'Lainnya', channel: '-' };
    if (m.startsWith('BANK_')) return { method: 'Manual', channel: rawMethod };
    if (m.startsWith('E-WALLET') || m.startsWith('EWALLET')) {
        const channel = rawMethod.replace(/E-WALLET\s*[\(\(]?\s*/i, '').replace(/[\)\)]/, '').trim();
        return { method: 'E-Wallet', channel: channel || rawMethod };
    }
    if (m.startsWith('TRANSFER BANK')) {
        const channel = rawMethod.replace(/TRANSFER BANK\s*/i, '').trim();
        return { method: 'Transfer Bank', channel: channel || rawMethod };
    }
    if (m === 'QRIS') return { method: 'QRIS', channel: 'QRIS' };
    if (m === 'BRIVA') return { method: 'Transfer Bank', channel: 'BRI VA' };
    if (m === 'ALFAMART' || m === 'INDOMARET') return { method: 'Retail', channel: rawMethod };

    if (gateway === 'admin' || gateway === 'manual') return { method: 'Manual', channel: rawMethod };
    return { method: rawMethod, channel: '-' };
}
const BillingCycleService = require('../../../config/billing-cycle-service');

// Helper: load payment_settings once and cache for this request chain
async function loadPaymentSettings() {
    let ps = await getSetting('payment_settings');
    if (typeof ps === 'string') { try { ps = JSON.parse(ps); } catch (e) {} }
    if (!ps) {
        let fallback = await getSetting('paymentGateway');
        if (typeof fallback === 'string') { try { fallback = JSON.parse(fallback); } catch (e) {} }
        ps = fallback;
    }
    return ps;
}

function resolvePaymentMethodLabel(paymentMethod, paymentSettings) {
    if (!paymentMethod) return '-';
    if (paymentMethod === 'cash') return 'Tunai';

    // bank_xxx or ewallet_xxx
    if (paymentMethod.startsWith('bank_') || paymentMethod.startsWith('ewallet_')) {
        const prefix = paymentMethod.startsWith('bank_') ? 'bank_' : 'ewallet_';
        const id = paymentMethod.replace(prefix, '');
        const accounts = paymentSettings?.bank_accounts || paymentSettings?.bankAccounts || [];
        const wallets = paymentSettings?.ewallets || paymentSettings?.eWallets || [];
        const all = [...accounts, ...wallets];
        const found = all.find(b => String(b.id) === String(id));
        if (found) {
            if (found.bankName || found.bank_name) {
                return `${found.bankName || found.bank_name} - ${found.accountNumber || found.account_number || ''}`;
            }
            if (found.provider) {
                return `${found.provider}${found.phoneNumber ? ` - ${found.phoneNumber}` : ''}`;
            }
        }
        return paymentMethod.startsWith('bank_') ? 'Transfer Bank' : 'E-Wallet';
    }

    return paymentMethod;
}

// Helper function to format payment method for display
const formatPaymentMethod = async (paymentMethod) => {
    const ps = await loadPaymentSettings();
    return resolvePaymentMethodLabel(paymentMethod, ps);
};

/**
 * Update service active_date and isolir_date after payment
 * This should be called whenever an invoice is marked as paid
 */


// Helper function to create accounting transaction
const { createAccountingTransaction } = require('../../../config/accounting');

// GET /api/v1/billing/invoices - Get invoices with pagination
router.get('/invoices', asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status || '';
    const customer_id = req.query.customer_id || '';
    const search = req.query.search || '';
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

    // Search by invoice_number, customer name, phone, or service_number
    if (search && search.trim()) {
        whereClause += ` AND (
            LOWER(i.invoice_number) LIKE LOWER($${queryParams.length + 1})
            OR LOWER(c.name) LIKE LOWER($${queryParams.length + 1})
            OR LOWER(c.phone) LIKE LOWER($${queryParams.length + 1})
            OR LOWER(i.service_number) LIKE LOWER($${queryParams.length + 1})
        )`;
        queryParams.push(`%${search.trim()}%`);
    }

    // Count query - need to include JOIN for search
    const countQuery = `
        SELECT COUNT(*) as total
        FROM invoices i
        JOIN customers c ON i.customer_id::text = c.id::text
        ${whereClause}
    `;

    const countResult = await query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Data query - include payment source and processed by
    const dataQuery = `
        SELECT
            i.*,
            c.name as customer_name,
            c.phone as customer_phone,
            pkg.name as package_name,
            pkg.price as package_price,
            COALESCE(
                pt_latest.gateway,
                CASE WHEN pay_legacy.id IS NOT NULL THEN 'admin' ELSE NULL END
            ) as payment_source,
            CASE
                WHEN pt_latest.gateway IN ('tripay', 'autopay') THEN 'System'
                WHEN u_latest.username IS NOT NULL THEN u_latest.username
                WHEN pay_legacy.id IS NOT NULL THEN 'Admin'
                ELSE NULL
            END as processed_by,
            COALESCE(pt_latest.paid_at, pay_legacy.payment_date, i.paid_at) as actual_paid_at,
            COALESCE(pt_latest.payment_method, pay_legacy.payment_method, i.payment_method) as payment_method_display,
            s.status as service_status,
            s.isolir_date,
            bs.suspension_time
        FROM invoices i
        JOIN customers c ON i.customer_id::text = c.id::text
        LEFT JOIN packages pkg ON i.package_id = pkg.id
        LEFT JOIN services s ON i.service_number = s.service_number
        LEFT JOIN billing_settings bs ON true
        LEFT JOIN LATERAL (
            SELECT pt.gateway, pt.verified_by, pt.paid_at, pt.payment_method
            FROM payment_transactions pt
            WHERE pt.invoice_id = i.id AND pt.status = 'paid'
            ORDER BY pt.paid_at DESC NULLS LAST, pt.created_at DESC
            LIMIT 1
        ) pt_latest ON true
        LEFT JOIN users u_latest ON pt_latest.verified_by = u_latest.id
        LEFT JOIN LATERAL (
            SELECT pay.id, pay.payment_date, pay.payment_method
            FROM payments pay
            WHERE pay.invoice_id = i.id
            ORDER BY pay.created_at DESC
            LIMIT 1
        ) pay_legacy ON true
        ${whereClause}
        ORDER BY i.created_at DESC
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    queryParams.push(limit, offset);
    const result = await query(dataQuery, queryParams);

    // Enrich each invoice with categorized payment method
    const enrichedRows = result.rows.map(row => {
        const { method, channel } = categorizePaymentMethod(
            row.payment_method_display || row.payment_method,
            row.payment_source
        );
        return {
            ...row,
            payment_method_category: method,
            payment_channel: channel
        };
    });

    const pagination = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
    };

    const meta = {
        search: search || undefined,
        status: status || undefined,
        customer_id: customer_id || undefined,
        total_records: total
    };

    return res.sendPaginated(enrichedRows, pagination, meta);
}));

// GET /api/v1/billing/invoices/stats - Get invoice statistics
router.get('/invoices/stats', asyncHandler(async (req, res) => {
    const { month, year, start_date, end_date } = req.query;

    // For status counts, use created_at (when invoice was created)
    // For revenue, use paid_at (when payment was actually received)
    let statusDateFilter = '';
    let revenueDateFilter = '';
    let params = [];

    if (start_date && end_date) {
        statusDateFilter = ' AND created_at >= $1 AND created_at <= $2';
        revenueDateFilter = ' AND (paid_at >= $1 OR payment_date >= $1) AND (paid_at <= $2 OR payment_date <= $2)';
        params = [start_date, end_date];
    } else if (month && year) {
        statusDateFilter = ' AND EXTRACT(MONTH FROM created_at) = $1 AND EXTRACT(YEAR FROM created_at) = $2';
        revenueDateFilter = ' AND EXTRACT(MONTH FROM COALESCE(paid_at, payment_date)) = $1 AND EXTRACT(YEAR FROM COALESCE(paid_at, payment_date)) = $2';
        params = [parseInt(month), parseInt(year)];
    } else if (year) {
        statusDateFilter = ' AND EXTRACT(YEAR FROM created_at) = $1';
        revenueDateFilter = ' AND EXTRACT(YEAR FROM COALESCE(paid_at, payment_date)) = $1';
        params = [parseInt(year)];
    }

    const statsQuery = params.length > 0 ? `
        SELECT
            COUNT(*) FILTER (WHERE status = 'draft' ${statusDateFilter.replace(/\$\d+/g, (m) => `$${parseInt(m.slice(1)) + params.length}`)}) as draft_count,
            COUNT(*) FILTER (WHERE status = 'sent' ${statusDateFilter.replace(/\$\$\d+/g, (m) => `$${parseInt(m.slice(2)) + params.length}`)}) as sent_count,
            COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
            COUNT(*) FILTER (WHERE status = 'unpaid' ${statusDateFilter.replace(/\$\d+/g, (m) => `$${parseInt(m.slice(1)) + params.length * 2}`)}) as unpaid_count,
            COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count,
            COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
            COALESCE(SUM(amount) FILTER (WHERE status = 'paid' ${revenueDateFilter}), 0) as total_revenue,
            COALESCE(SUM(amount) FILTER (WHERE status = 'unpaid'), 0) as pending_revenue,
            COALESCE(SUM(payment_fee_amount) FILTER (WHERE status = 'paid' ${revenueDateFilter}), 0) as total_admin_fee,
            COALESCE(SUM(amount) FILTER (WHERE status = 'paid' ${revenueDateFilter}), 0) as net_revenue
        FROM invoices
    ` : `
        SELECT
            COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
            COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
            COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
            COUNT(*) FILTER (WHERE status = 'unpaid') as unpaid_count,
            COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count,
            COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
            COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as total_revenue,
            COALESCE(SUM(amount) FILTER (WHERE status = 'unpaid'), 0) as pending_revenue,
            COALESCE(SUM(payment_fee_amount) FILTER (WHERE status = 'paid'), 0) as total_admin_fee,
            COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as net_revenue
        FROM invoices
    `;

    // Simple approach: separate queries for status counts and revenue
    let result;
    if (params.length > 0) {
        // Status counts filtered by created_at, revenue filtered by payment date
        const statusQuery = `
            SELECT
                COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
                COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
                COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
                COUNT(*) FILTER (WHERE status = 'unpaid') as unpaid_count,
                COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count,
                COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
                COALESCE(SUM(amount) FILTER (WHERE status = 'unpaid'), 0) as pending_revenue
            FROM invoices
            WHERE 1=1 ${statusDateFilter}
        `;
        const revenueQuery = `
            SELECT
                -- Total base revenue (what Kilusi set as price, always received regardless of fee bearer)
                COALESCE(SUM(amount), 0) as total_revenue,
                -- Total admin fees (from payment_transactions)
                COALESCE(SUM(payment_fee_amount), 0) as total_admin_fee,
                -- Net received: if fee_bearer=customer, we receive full amount; if merchant, we receive amount-fee
                COALESCE(SUM(CASE WHEN fee_bearer = 'merchant' THEN amount - COALESCE(payment_fee_amount, 0) ELSE amount END), 0) as net_revenue,
                -- Total customer paid: if fee_bearer=customer, amount+fee; if merchant, just amount
                COALESCE(SUM(CASE WHEN fee_bearer = 'merchant' THEN amount ELSE amount + COALESCE(payment_fee_amount, 0) END), 0) as total_customer_paid
            FROM invoices
            WHERE status = 'paid' ${revenueDateFilter}
        `;

        const statusResult = await query(statusQuery, params);
        const revenueResult = await query(revenueQuery, params);
        result = {
            ...statusResult.rows[0],
            ...revenueResult.rows[0]
        };
    } else {
        const allQuery = `
            SELECT
                COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
                COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
                COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
                COUNT(*) FILTER (WHERE status = 'unpaid') as unpaid_count,
                COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count,
                COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
                COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as total_revenue,
                COALESCE(SUM(amount) FILTER (WHERE status = 'unpaid'), 0) as pending_revenue,
COALESCE(SUM(payment_fee_amount) FILTER (WHERE status = 'paid'), 0) as total_admin_fee,
            COALESCE(SUM(CASE WHEN fee_bearer = 'merchant' THEN amount - COALESCE(payment_fee_amount, 0) ELSE amount END) FILTER (WHERE status = 'paid'), 0) as net_revenue,
            COALESCE(SUM(CASE WHEN fee_bearer = 'merchant' THEN amount ELSE amount + COALESCE(payment_fee_amount, 0) END) FILTER (WHERE status = 'paid'), 0) as total_customer_paid
            FROM invoices
        `;
        const allResult = await query(allQuery);
        result = allResult.rows[0];
    }

    // Get fee breakdown by payment method in the period
    let feeQuery, feeParams;
    if (start_date && end_date) {
        feeQuery = `SELECT payment_method, COUNT(*) as count, SUM(fee_amount) as total_fee
            FROM payment_transactions WHERE fee_amount > 0 AND created_at >= $1 AND created_at <= $2
            GROUP BY payment_method ORDER BY total_fee DESC`;
        feeParams = [start_date, end_date];
    } else if (month && year) {
        feeQuery = `SELECT payment_method, COUNT(*) as count, SUM(fee_amount) as total_fee
            FROM payment_transactions WHERE fee_amount > 0 AND EXTRACT(MONTH FROM created_at) = $1 AND EXTRACT(YEAR FROM created_at) = $2
            GROUP BY payment_method ORDER BY total_fee DESC`;
        feeParams = [parseInt(month), parseInt(year)];
    } else if (year) {
        feeQuery = `SELECT payment_method, COUNT(*) as count, SUM(fee_amount) as total_fee
            FROM payment_transactions WHERE fee_amount > 0 AND EXTRACT(YEAR FROM created_at) = $1
            GROUP BY payment_method ORDER BY total_fee DESC`;
        feeParams = [parseInt(year)];
    } else {
        feeQuery = `SELECT payment_method, COUNT(*) as count, SUM(fee_amount) as total_fee
            FROM payment_transactions WHERE fee_amount > 0
            GROUP BY payment_method ORDER BY total_fee DESC`;
        feeParams = [];
    }

    const feeResult = await query(feeQuery, feeParams);

    return res.sendSuccess({
        draftCount: parseInt(result.draft_count) || 0,
        sentCount: parseInt(result.sent_count) || 0,
        paidCount: parseInt(result.paid_count) || 0,
        unpaidCount: parseInt(result.unpaid_count) || 0,
        overdueCount: parseInt(result.overdue_count) || 0,
        cancelledCount: parseInt(result.cancelled_count) || 0,
        totalRevenue: parseFloat(result.total_revenue) || 0,
        pendingRevenue: parseFloat(result.pending_revenue) || 0,
        totalAdminFee: parseFloat(result.total_admin_fee) || 0,
        netRevenue: parseFloat(result.net_revenue) || 0,
        totalCustomerPaid: parseFloat(result.total_customer_paid) || 0,
        adminFeeByMethod: feeResult.rows.map(r => ({
            payment_method: r.payment_method,
            count: parseInt(r.count) || 0,
            total_fee: parseFloat(r.total_fee) || 0
        }))
    });
}));

// GET /api/v1/billing/invoices/search - Search invoices by universal search
router.get('/invoices/search', asyncHandler(async (req, res) => {
    const searchTerm = req.query.q || '';

    if (!searchTerm.trim()) {
        return res.sendSuccess([]);
    }

    // Search invoices by number, customer name, phone, or service_number
    const searchQuery = `
        SELECT DISTINCT
            i.id,
            i.invoice_number,
            i.customer_id,
            i.service_number,
            i.amount,
            i.due_date,
            i.status,
            i.created_at,
            c.name as customer_name,
            c.phone as customer_phone,
            c.email as customer_email,
            pkg.name as package_name,
            COALESCE(
                pt_latest.gateway,
                CASE WHEN pay_legacy.id IS NOT NULL THEN 'admin' ELSE NULL END
            ) as payment_source,
            u_latest.username as processed_by,
            COALESCE(pt_latest.paid_at, pay_legacy.payment_date, i.paid_at) as actual_paid_at,
            CASE
                WHEN LOWER(i.invoice_number) = LOWER($2) THEN 1
                WHEN LOWER(c.name) = LOWER($2) THEN 2
                ELSE 3
            END as relevance_score
        FROM invoices i
        JOIN customers c ON i.customer_id::text = c.id::text
        LEFT JOIN packages pkg ON i.package_id = pkg.id
        LEFT JOIN LATERAL (
            SELECT pt.gateway, pt.verified_by, pt.paid_at
            FROM payment_transactions pt
            WHERE pt.invoice_id = i.id AND pt.status = 'paid'
            ORDER BY pt.paid_at DESC NULLS LAST, pt.created_at DESC
            LIMIT 1
        ) pt_latest ON true
        LEFT JOIN users u_latest ON pt_latest.verified_by = u_latest.id
        LEFT JOIN LATERAL (
            SELECT pay.id, pay.payment_date
            FROM payments pay
            WHERE pay.invoice_id = i.id
            ORDER BY pay.created_at DESC
            LIMIT 1
        ) pay_legacy ON true
        WHERE (
            LOWER(i.invoice_number) LIKE LOWER($1)
            OR LOWER(c.name) LIKE LOWER($1)
            OR c.phone LIKE $1
            OR LOWER(i.service_number) LIKE LOWER($1)
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
        filters: ['invoice_number', 'customer_name', 'phone', 'service_number']
    };

    return res.sendSuccess(result.rows, meta);
}));

// GET /api/v1/billing/invoices/:id - Get invoice by ID
// UNPAID & PAID INVOICE ENDPOINTS (NEW)
// ============================================

// GET /api/v1/billing/invoices/unpaid - Get unpaid invoices (draft, sent, unpaid, overdue)
router.get('/invoices/unpaid', asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const month = req.query.month || '';
    const year = req.query.year || '';
    const offset = (page - 1) * limit;

    let whereClause = "WHERE i.status IN ('draft', 'sent', 'unpaid', 'overdue', 'suspended')";
    let queryParams = [];

    if (search && search.trim()) {
        whereClause += ` AND (
            LOWER(i.invoice_number) LIKE LOWER($${queryParams.length + 1})
            OR LOWER(c.name) LIKE LOWER($${queryParams.length + 1})
            OR LOWER(c.phone) LIKE LOWER($${queryParams.length + 1})
            OR LOWER(i.service_number) LIKE LOWER($${queryParams.length + 1})
        )`;
        queryParams.push(`%${search.trim()}%`);
    }

    if (month && year) {
        whereClause += ` AND EXTRACT(MONTH FROM i.created_at) = $${queryParams.length + 1} AND EXTRACT(YEAR FROM i.created_at) = $${queryParams.length + 2}`;
        queryParams.push(month, year);
    }

    const countQuery = `SELECT COUNT(*) as total FROM invoices i JOIN customers c ON i.customer_id::text = c.id::text ${whereClause}`;
    const countResult = await query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    const dataQuery = `
        SELECT i.*, c.name as customer_name, c.phone as customer_phone,
               pkg.name as package_name, pkg.price as package_price,
               s.area, r.name as region_name, m.name as mitra,
               i.unique_code, i.amount_with_code,
               CASE WHEN i.invoice_number LIKE 'BULK-%' THEN 'MANUAL' ELSE 'OTOMATIS' END as kategori,
               i.discount as diskon, i.tax as ppn,
                COALESCE(i.total_amount, i.amount) as total,
                 s.status as service_status,
                 s.isolir_date,
                 bs.suspension_time
        FROM invoices i
        JOIN customers c ON i.customer_id::text = c.id::text
        LEFT JOIN packages pkg ON i.package_id = pkg.id
        LEFT JOIN services s ON i.service_number = s.service_number
        LEFT JOIN billing_settings bs ON true
        LEFT JOIN regions r ON r.id = s.region_id
        LEFT JOIN mitra m ON m.id = r.mitra_id
        ${whereClause}
        ORDER BY i.created_at DESC
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    queryParams.push(limit, offset);
    const result = await query(dataQuery, queryParams);

    const meta = { page, limit, total, search: search || undefined, month: month || undefined, year: year || undefined };
    return res.sendPaginated(result.rows, { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page < Math.ceil(total / limit), hasPrev: page > 1 }, meta);
}));

// GET /api/v1/billing/invoices/paid - Get paid invoices (paid, cancelled)
router.get('/invoices/paid', asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const month = req.query.month || '';
    const year = req.query.year || '';
    const start_date = req.query.start_date || '';
    const end_date = req.query.end_date || '';
    const offset = (page - 1) * limit;

    let whereClause = "WHERE i.status IN ('paid', 'cancelled')";
    let queryParams = [];

    if (search && search.trim()) {
        whereClause += ` AND (
            LOWER(i.invoice_number) LIKE LOWER($${queryParams.length + 1})
            OR LOWER(c.name) LIKE LOWER($${queryParams.length + 1})
            OR LOWER(c.phone) LIKE LOWER($${queryParams.length + 1})
            OR LOWER(i.service_number) LIKE LOWER($${queryParams.length + 1})
        )`;
        queryParams.push(`%${search.trim()}%`);
    }

    if (start_date && end_date) {
        whereClause += ` AND COALESCE(i.paid_at, i.updated_at)::date >= $${queryParams.length + 1}::date AND COALESCE(i.paid_at, i.updated_at)::date <= $${queryParams.length + 2}::date`;
        queryParams.push(start_date, end_date);
    } else if (month && year) {
        whereClause += ` AND EXTRACT(MONTH FROM COALESCE(i.paid_at, i.updated_at, i.due_date)) = $${queryParams.length + 1} AND EXTRACT(YEAR FROM COALESCE(i.paid_at, i.updated_at, i.due_date)) = $${queryParams.length + 2}`;
        queryParams.push(month, year);
    }

    const countQuery = `SELECT COUNT(*) as total FROM invoices i JOIN customers c ON i.customer_id::text = c.id::text ${whereClause}`;
    const countResult = await query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Use LEFT JOIN LATERAL to handle missing mitra/regions tables gracefully
    const dataQuery = `
        SELECT i.*, c.name as customer_name, c.phone as customer_phone,
               pkg.name as package_name, pkg.price as package_price,
               s.area, r.name as region_name, m.name as mitra,
                i.unique_code, i.amount_with_code,
                CASE WHEN i.invoice_number LIKE 'BULK-%' THEN 'MANUAL' ELSE 'OTOMATIS' END as kategori,
                i.discount as diskon, i.tax as ppn,
                 s.status as service_status,
                 s.isolir_date,
                 bs.suspension_time,
                 COALESCE(i.total_amount, i.amount) as total_base,
                 CASE
                   WHEN i.amount_with_code IS NOT NULL THEN i.amount_with_code
                   WHEN i.payment_gateway IN ('tripay') AND COALESCE(i.fee_bearer, 'customer') = 'customer' THEN i.amount + COALESCE(i.payment_fee_amount, 0)
                   ELSE COALESCE(i.total_amount, i.amount)
                 END as total,
                 i.payment_fee_amount as adm,
                COALESCE(pt.gateway, 
                  CASE WHEN pay_legacy.id IS NOT NULL THEN 'manual' ELSE NULL END
                ) as payment_source,
                COALESCE(pt.payment_method, pay_legacy.payment_method, i.payment_method) as payment_method_display,
                CASE 
                  WHEN COALESCE(pt.gateway, CASE WHEN pay_legacy.id IS NOT NULL THEN 'manual' ELSE NULL END) = 'autopay' THEN 'AUTOPAY'
                  WHEN COALESCE(pt.gateway, CASE WHEN pay_legacy.id IS NOT NULL THEN 'manual' ELSE NULL END) = 'tripay' THEN 'TRIPAY'
                  WHEN COALESCE(pt.gateway, CASE WHEN pay_legacy.id IS NOT NULL THEN 'manual' ELSE NULL END) = 'manual' THEN
                    CASE WHEN UPPER(pay_legacy.payment_method) IN ('CASH', 'TUNAI') THEN 'TUNAI' ELSE 'TRANSFER' END
                  ELSE TRIM(COALESCE(pt.gateway, ''))
                END as cabar,
                CASE
                  WHEN pt.gateway IN ('tripay', 'autopay') THEN 'System'
                  WHEN pay_legacy.processed_by IS NOT NULL THEN pay_legacy.processed_by
                  ELSE NULL
                END as processed_by,
                pay_legacy.notes as payment_notes,
                COALESCE(pt.paid_at, pay_legacy.payment_date, i.paid_at, i.updated_at) as actual_paid_at
        FROM invoices i
        JOIN customers c ON i.customer_id::text = c.id::text
        LEFT JOIN packages pkg ON i.package_id = pkg.id
        LEFT JOIN services s ON i.service_number = s.service_number
        LEFT JOIN billing_settings bs ON true
        LEFT JOIN regions r ON r.id = s.region_id
        LEFT JOIN mitra m ON m.id = r.mitra_id
        LEFT JOIN LATERAL (
            SELECT pt.gateway, pt.payment_method, pt.paid_at FROM payment_transactions pt
            WHERE pt.invoice_id = i.id AND pt.status = 'paid'
            ORDER BY pt.paid_at DESC LIMIT 1
        ) pt ON true
        LEFT JOIN LATERAL (
            SELECT pay.id, pay.payment_date, pay.payment_method, pay.processed_by, pay.notes
            FROM payments pay
            WHERE pay.invoice_id = i.id
            ORDER BY pay.created_at DESC LIMIT 1
        ) pay_legacy ON true
        ${whereClause}
        ORDER BY COALESCE(pt.paid_at, pay_legacy.payment_date, i.paid_at, i.updated_at) DESC NULLS LAST
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    queryParams.push(limit, offset);
    const result = await query(dataQuery, queryParams);

    // Enrich payment_method_display with readable bank names
    const enrichedRows = await Promise.all(
        result.rows.map(async (row) => ({
            ...row,
            payment_method_display: await formatPaymentMethod(row.payment_method_display),
            paid_at: row.actual_paid_at || row.paid_at
        }))
    );

    // Revenue stats
    const revenueQuery = `
        SELECT 
            COUNT(*) FILTER (WHERE i.status = 'paid') as paid_count,
            COUNT(*) FILTER (WHERE i.status = 'cancelled') as cancelled_count,
            COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid'), 0) as total_revenue,
            COALESCE(SUM(i.payment_fee_amount) FILTER (WHERE i.status = 'paid'), 0) as total_fee,
            COALESCE(SUM(CASE WHEN i.fee_bearer = 'merchant' THEN i.amount - COALESCE(i.payment_fee_amount, 0) ELSE i.amount END) FILTER (WHERE i.status = 'paid'), 0) as net_revenue
        FROM invoices i
        JOIN customers c ON i.customer_id::text = c.id::text
        ${whereClause}
    `;

    const statsParams = queryParams.slice(0, -2);
    const statsResult = await query(revenueQuery, statsParams);

    const meta = {
        page, limit, total,
        search: search || undefined, month: month || undefined, year: year || undefined,
        stats: statsResult.rows[0] || {}
    };

    return res.sendPaginated(enrichedRows, { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page < Math.ceil(total / limit), hasPrev: page > 1 }, meta);
}));

// POST /api/v1/billing/invoices/rapel/calculate - Preview rapel calculation
router.post('/invoices/rapel/calculate', asyncHandler(async (req, res) => {
    const { customer_id, months, service_number } = req.body;
    const numMonths = parseInt(months) || 1;

    if (!customer_id) {
        return res.sendError('VALIDATION', 'Customer ID harus diisi');
    }
    if (numMonths < 1 || numMonths > 12) {
        return res.sendError('VALIDATION', 'Jumlah bulan harus 1-12');
    }

    const customerResult = await query(
        `SELECT c.id, c.name, c.phone FROM customers c WHERE c.id = $1`, [customer_id]
    );
    if (customerResult.rows.length === 0) return res.sendNotFound('Customer');
    const customer = customerResult.rows[0];

    // Resolve service: if service_number provided, use it; otherwise check count
    let svcFilter = `s.customer_id = $1`;
    let svcParams = [customer_id];
    let invFilter = `i.customer_id = $1`;
    let invParams = [customer_id];
    if (service_number) {
        svcFilter = `s.service_number = $1`;
        svcParams = [service_number];
        invFilter = `i.service_number = $1`;
        invParams = [service_number];
    } else {
        const countResult = await query(`SELECT COUNT(*) as cnt FROM services WHERE customer_id = $1`, [customer_id]);
        if (parseInt(countResult.rows[0].cnt) > 1) {
            return res.status(400).json({ error: 'Customer has multiple services — specify service_number' });
        }
    }

    const serviceResult = await query(`
        SELECT s.service_number, s.package_id, s.siklus, s.isolir_date,
                p.name as package_name, p.price as package_price
         FROM services s JOIN packages p ON s.package_id = p.id
         WHERE ${svcFilter} LIMIT 1`, svcParams
    );
    if (serviceResult.rows.length === 0) return res.sendNotFound('Service');
    const svc = serviceResult.rows[0];
    const price = parseFloat(svc.package_price) || 0;

    // Find last invoice month (same logic as execute endpoint)
    const lastInvResult = await query(
        `SELECT MAX(due_date) as last_due_date FROM invoices i WHERE ${invFilter}`, invParams
    );
    const lastDueDate = lastInvResult.rows[0]?.last_due_date
        ? new Date(lastInvResult.rows[0].last_due_date)
        : (svc.isolir_date ? new Date(svc.isolir_date) : new Date());
    const hasPreviousInvoices = lastInvResult.rows[0]?.last_due_date != null;
    const monthOffset = hasPreviousInvoices ? 1 : 0;
    const nextMonth = new Date(lastDueDate.getFullYear(), lastDueDate.getMonth() + monthOffset, 1);

    // Calculate last due_date (matches execute endpoint)
    const lastPeriodMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + numMonths - 1, 1);
    let nextOverdue;
    const isFixed = svc.siklus === 'fixed' || svc.siklus === 'TETAP';
    if (isFixed) {
        const billingDay = lastDueDate.getDate();
        const lastDayOfMonth = new Date(lastPeriodMonth.getFullYear(), lastPeriodMonth.getMonth() + 1, 0).getDate();
        nextOverdue = new Date(lastPeriodMonth.getFullYear(), lastPeriodMonth.getMonth() + 1, Math.min(billingDay, lastDayOfMonth));
    } else {
        nextOverdue = new Date(lastPeriodMonth.getFullYear(), lastPeriodMonth.getMonth() + 1, 0);
    }
    const nextOverdueStr = `${nextOverdue.getFullYear()}-${String(nextOverdue.getMonth() + 1).padStart(2, '0')}-${String(nextOverdue.getDate()).padStart(2, '0')}`;

    // Bulk discount
    const bulkSettings = await query(`SELECT * FROM bulk_payment_settings WHERE id = 1`);
    const settings = bulkSettings.rows[0] || {};
    const discountConfig = {
        1: { type: settings.discount_1_month_type, value: parseFloat(settings.discount_1_month_value) || 0 },
        2: { type: settings.discount_2_months_type, value: parseFloat(settings.discount_2_months_value) || 0 },
        3: { type: settings.discount_3_months_type, value: parseFloat(settings.discount_3_months_value) || 0 },
        6: { type: settings.discount_6_months_type, value: parseFloat(settings.discount_6_months_value) || 0 },
        12: { type: settings.discount_12_months_type, value: parseFloat(settings.discount_12_months_value) || 0 }
    };
    const selectedDiscount = discountConfig[numMonths] || { type: 'percentage', value: 0 };

    const originalTotal = price * numMonths;
    let discountAmount = 0;
    let discountDisplay = 'Tidak ada diskon';
    if (selectedDiscount.type === 'percentage' && selectedDiscount.value > 0) {
        discountAmount = Math.round(originalTotal * selectedDiscount.value / 100);
        discountDisplay = `Diskon ${selectedDiscount.value}%`;
    } else if (selectedDiscount.type === 'free_months' && selectedDiscount.value > 0) {
        discountAmount = Math.round(price * selectedDiscount.value);
        discountDisplay = `Gratis ${selectedDiscount.value} bulan`;
    }
    const finalTotal = originalTotal - discountAmount;

    return res.sendSuccess({
        customer: { id: customer.id, name: customer.name, phone: customer.phone },
        service: { service_number: svc.service_number, package_name: svc.package_name, package_price: price },
        months: numMonths,
        original_total: originalTotal,
        discount: { type: selectedDiscount.type, value: selectedDiscount.value, amount: discountAmount, display: discountDisplay },
        final_total: finalTotal,
        next_overdue: nextOverdueStr
    });
}));

// POST /api/v1/billing/invoices/rapel - Execute rapel (create invoices + payment)
router.post('/invoices/rapel', asyncHandler(async (req, res) => {
    const { customer_id, months, payment_method, payment_date, notes, service_number } = req.body;
    const numMonths = parseInt(months) || 1;
    const processedBy = req.user?.username || 'admin';

    if (!customer_id) return res.sendError('VALIDATION', 'Customer ID harus diisi');
    if (numMonths < 1 || numMonths > 12) return res.sendError('VALIDATION', 'Jumlah bulan harus 1-12');

    // Resolve service scope
    let svcFilter = `s.customer_id = $1`;
    let svcParams = [customer_id];
    let invFilter = `i.customer_id = $1`;
    let invParams = [customer_id];
    if (service_number) {
        svcFilter = `s.service_number = $1`;
        svcParams = [service_number];
        invFilter = `i.service_number = $1`;
        invParams = [service_number];
    } else {
        const countResult = await query(`SELECT COUNT(*) as cnt FROM services WHERE customer_id = $1`, [customer_id]);
        if (parseInt(countResult.rows[0].cnt) > 1) {
            return res.status(400).json({ error: 'Customer has multiple services — specify service_number' });
        }
    }

    const result = await transaction(async (client) => {
        const svcResult = await client.query(`
            SELECT s.id as service_id, s.service_number, s.package_id, s.status as service_status,
                    s.siklus, s.isolir_date, p.name as package_name, p.price as package_price
             FROM services s JOIN packages p ON s.package_id = p.id
             WHERE ${svcFilter} LIMIT 1`, svcParams
        );
        if (svcResult.rows.length === 0) throw new Error('Service not found');
        const svc = svcResult.rows[0];
        const price = parseFloat(svc.package_price) || 0;

        const lastInvResult = await client.query(
            `SELECT MAX(due_date) as last_due_date FROM invoices i WHERE ${invFilter}`, invParams
        );
        const lastDueDate = lastInvResult.rows[0]?.last_due_date
            ? new Date(lastInvResult.rows[0].last_due_date)
            : (svc.isolir_date ? new Date(svc.isolir_date) : new Date());
        // When no previous invoice, the isolir_date IS the first period (don't skip a month)
        const hasPreviousInvoices = lastInvResult.rows[0]?.last_due_date != null;
        const monthOffset = hasPreviousInvoices ? 1 : 0;
        const nextMonth = new Date(lastDueDate.getFullYear(), lastDueDate.getMonth() + monthOffset, 1);

        const bulkSettings = await client.query(`SELECT * FROM bulk_payment_settings WHERE id = 1`);
        const settings = bulkSettings.rows[0] || {};
        const discountConfig = {
            1: { type: settings.discount_1_month_type, value: parseFloat(settings.discount_1_month_value) || 0 },
            2: { type: settings.discount_2_months_type, value: parseFloat(settings.discount_2_months_value) || 0 },
            3: { type: settings.discount_3_months_type, value: parseFloat(settings.discount_3_months_value) || 0 },
            6: { type: settings.discount_6_months_type, value: parseFloat(settings.discount_6_months_value) || 0 },
            12: { type: settings.discount_12_months_type, value: parseFloat(settings.discount_12_months_value) || 0 }
        };
        const selectedDiscount = discountConfig[numMonths] || { type: 'percentage', value: 0 };

        const originalTotal = price * numMonths;
        let totalDiscount = 0;
        if (selectedDiscount.type === 'percentage' && selectedDiscount.value > 0) {
            totalDiscount = Math.round(originalTotal * selectedDiscount.value / 100);
        } else if (selectedDiscount.type === 'free_months' && selectedDiscount.value > 0) {
            totalDiscount = Math.round(price * selectedDiscount.value);
        }
        const discountPerInvoice = numMonths > 0 ? Math.floor(totalDiscount / numMonths) : 0;
        const discountRemainder = numMonths > 0 ? totalDiscount - (discountPerInvoice * numMonths) : 0;

        const generatedInvoices = [];
        for (let i = 0; i < numMonths; i++) {
            const periodMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + i, 1);

            let dueDate;
            const isFixed = svc.siklus === 'fixed' || svc.siklus === 'TETAP';
            if (isFixed) {
                const billingDay = lastDueDate.getDate();
                const lastDayOfMonth = new Date(periodMonth.getFullYear(), periodMonth.getMonth() + 1, 0).getDate();
                dueDate = new Date(periodMonth.getFullYear(), periodMonth.getMonth() + 1, Math.min(billingDay, lastDayOfMonth));
            } else {
                dueDate = new Date(periodMonth.getFullYear(), periodMonth.getMonth() + 1, 0);
            }
            const invoiceNumber = generateInvoiceNumber();
            const invDiscount = discountPerInvoice + (i < discountRemainder ? 1 : 0);
            const finalAmount = price - invDiscount;

            const discountNote = totalDiscount > 0 ? `Diskon Rapel: Rp ${totalDiscount.toLocaleString('id-ID')}` : '';
            const invNotes = [notes, `Rapel ${numMonths} bulan`, discountNote].filter(Boolean).join(' | ');

            const invResult = await client.query(
                `INSERT INTO invoices (customer_id, package_id, invoice_number, amount, total_amount,
                 due_date, status, notes, created_at, service_number)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
                 RETURNING *`,
                 [customer_id, svc.package_id, invoiceNumber, price, finalAmount,
                  `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`,
                 payment_method ? 'paid' : 'unpaid', invNotes, svc.service_number]
            );

            // Set discount + final total_amount via update (columns not in INSERT)
            if (invDiscount > 0) {
                await client.query(
                    `UPDATE invoices SET discount = $1, total_amount = $2 WHERE id = $3`,
                    [invDiscount, finalAmount, invResult.rows[0].id]
                );
            }
            generatedInvoices.push(invResult.rows[0]);
        }

        let payment = null;
        if (payment_method) {
            const now = new Date();
            const payDate = payment_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const payResult = await client.query(
                `INSERT INTO payments (invoice_id, amount, payment_method, payment_date, notes, processed_by, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
                [generatedInvoices[0].id, originalTotal - totalDiscount, payment_method, payDate,
                 `Rapel ${numMonths} bulan (${generatedInvoices.length} invoice)`, processedBy]
            );
            payment = payResult.rows[0];

            for (const inv of generatedInvoices) {
                await client.query(
                    `UPDATE invoices SET status = 'paid', payment_date = $1, paid_at = $1,
                     payment_method = $2, payment_fee_amount = 0, fee_bearer = 'customer', updated_at = NOW()
                     WHERE id = $3`,
                    [payDate, payment_method, inv.id]
                );
            }
        }

        const finalDueDate = generatedInvoices.length > 0
            ? generatedInvoices[generatedInvoices.length - 1].due_date : null;

        return {
            customer_id, months: numMonths,
            generated: generatedInvoices.length,
            invoices: generatedInvoices.map(i => ({
                id: i.id, invoice_number: i.invoice_number, amount: i.amount,
                final_amount: i.final_amount, due_date: i.due_date, status: i.status
            })),
            payment: payment ? { id: payment.id, amount: payment.amount, method: payment.payment_method, date: payment.payment_date } : null,
            next_overdue: finalDueDate,
            // Post-processing data
            serviceId: svc.service_id,
            serviceStatus: svc.service_status,
            packageId: svc.package_id,
            siklus: svc.siklus,
            oldIsolirDate: svc.isolir_date,
            lastDueDate: finalDueDate
        };
    });

    // Post-processing: update service dates, restore if suspended, notif, accounting
    if (result.payment) {
        try {
            const BillingCycleService = require('../../../config/billing-cycle-service');
            const serviceSuspension = require('../../../config/serviceSuspension');
            const whatsappNotifications = require('../../../config/whatsapp-notifications');

            // 1. Update service dates
            // active_date = old isolir_date (start of the paid billing period)
            let newIsolirDate = null;
            let newIsolirDateStr = null;
            if (result.oldIsolirDate || result.lastDueDate) {
                const newActiveDate = result.oldIsolirDate || result.lastDueDate;
                newIsolirDate = await BillingCycleService.calculateIsolirDate(
                    result.customer_id, new Date(newActiveDate), null, result.siklus
                );
                // Format as local date string (avoid UTC conversion)
                newIsolirDateStr = `${newIsolirDate.getFullYear()}-${String(newIsolirDate.getMonth() + 1).padStart(2, '0')}-${String(newIsolirDate.getDate()).padStart(2, '0')}`;
                await query(`
                    UPDATE services SET active_date = $1, isolir_date = $2, updated_at = NOW()
                    WHERE id = $3
                `, [newActiveDate, newIsolirDateStr, result.serviceId]);
                logger.info(`Rapel: Updated service dates for ${result.customer_id}: active=${newActiveDate}, isolir=${newIsolirDateStr}`);
            }

            // 2. Restore service if was suspended
            if (result.serviceStatus === 'suspended') {
                const serviceData = await getOne(`
                    SELECT s.id as service_id, s.service_number, c.name as customer_name,
                           p.group as package_group, p.pppoe_profile
                    FROM services s
                    JOIN customers c ON c.id = s.customer_id
                    LEFT JOIN packages p ON p.id = s.package_id
                    WHERE s.id = $1
                `, [result.serviceId]);

                if (serviceData) {
                    await serviceSuspension.restoreServiceByServiceId(
                        serviceData.service_id,
                        { name: serviceData.customer_name, service_number: serviceData.service_number, package_group: serviceData.package_group, pppoe_profile: serviceData.pppoe_profile },
                        'Rapel payment - full restoration'
                    );
                }
                await query(`UPDATE services SET status = 'active', updated_at = NOW() WHERE id = $1`, [result.serviceId]);
                logger.info(`Rapel: Restored service for ${result.customer_id}`);
            }

            // 3. WhatsApp notification
            try {
                const notifDueDate = newIsolirDateStr || result.lastDueDate;
                await whatsappNotifications.sendPaymentReceivedNotification(result.payment.id, {
                    dueDate: notifDueDate
                });
            } catch (e) { logger.warn(`Rapel notif failed: ${e.message}`); }

            // 4. Accounting transaction
            const customerName = await getOne('SELECT name FROM customers WHERE id = $1', [result.customer_id]);
            const methodLabel = await formatPaymentMethod(result.payment.method);
            await createAccountingTransaction(
                'revenue',
                parseFloat(result.payment.amount),
                `Pembayaran rapel ${result.months} bulan dari ${customerName?.name || 'Unknown'} (${methodLabel})`,
                'payment',
                result.payment.id
            );

        } catch (e) {
            logger.error(`Rapel post-processing error for ${result.customer_id}:`, e.message);
        }
    }

    return res.sendSuccess(result);
}));

// POST /api/v1/billing/invoices/bulk-discount - Apply discount to multiple invoices
router.post('/invoices/bulk-discount', asyncHandler(async (req, res) => {
    const { invoice_ids, discount_amount, notes } = req.body;

    if (!invoice_ids || !Array.isArray(invoice_ids) || invoice_ids.length === 0) {
        return res.sendError('VALIDATION', 'Pilih invoice yang akan didiskon');
    }
    if (!discount_amount || parseFloat(discount_amount) <= 0) {
        return res.sendError('VALIDATION', 'Jumlah diskon harus lebih dari 0');
    }

    const discountPerInvoice = Math.floor(parseFloat(discount_amount) / invoice_ids.length);
    if (discountPerInvoice <= 0) {
        return res.sendError('VALIDATION', 'Jumlah diskon terlalu kecil untuk dibagi');
    }

    try {
        let updated = 0;
        for (const invId of invoice_ids) {
            const inv = await query('SELECT id, amount, total_amount, discount_amount FROM invoices WHERE id = $1', [invId]);
            if (inv.rows.length === 0) continue;

            const currentDiscount = parseFloat(inv.rows[0].discount_amount) || 0;
            const currentTotal = parseFloat(inv.rows[0].total_amount) || parseFloat(inv.rows[0].amount);
            const newDiscount = currentDiscount + discountPerInvoice;
            const newTotal = Math.max(0, currentTotal - discountPerInvoice);

            await query(
                `UPDATE invoices SET discount_amount = $1, total_amount = $2, final_amount = $2, 
                 discount_notes = COALESCE(discount_notes, '') || ' | ' || $3,
                 updated_at = NOW() WHERE id = $4`,
                [newDiscount, newTotal, notes || `Diskon manual Rp ${discountPerInvoice}`, invId]
            );
            updated++;
        }

        return res.sendSuccess({ updated, discount_per_invoice: discountPerInvoice, total_discount: parseFloat(discount_amount) }, { message: `Diskon diterapkan ke ${updated} invoice` });
    } catch (error) {
        logger.error('Error applying bulk discount:', error);
        return res.sendError('INTERNAL_ERROR', 'Gagal menerapkan diskon');
    }
}));


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
            processed_by,
            created_at,
            is_rolled_back,
            rolled_back_at,
            rolled_back_by,
            rollback_reason
        FROM payments
        WHERE invoice_id = $1
        ORDER BY created_at DESC
    `;

    const paymentsResult = await query(paymentsQuery, [id]);

    logger.info(`📊 Invoice ${id} - Payments found: ${paymentsResult.rows.length}`);

    // Format payment methods for display
    const formattedPayments = await Promise.all(
        paymentsResult.rows.map(async (payment) => ({
            ...payment,
            payment_method_display: await formatPaymentMethod(payment.payment_method)
        }))
    );

    if (formattedPayments.length > 0) {
        logger.info(`📊 Invoice ${id} - First payment:`, JSON.stringify(formattedPayments[0]));
    }

    const invoiceWithPayments = {
        ...invoice,
        payments: formattedPayments
    };

    const meta = {
        invoice_id: id,
        customer_id: invoice.customer_id,
        status: invoice.status,
        payment_count: paymentsResult.rows.length,
        has_payments: paymentsResult.rows.length > 0
    };

    logger.info(`✅ Sending invoice response for ID ${id}:`, JSON.stringify({
        status: invoice.status,
        payment_count: paymentsResult.rows.length,
        has_payments: paymentsResult.rows.length > 0,
        payments: paymentsResult.rows.map(p => ({ id: p.id, amount: p.amount, is_rolled_back: p.is_rolled_back }))
    }));

    return res.sendSuccess({ invoice: invoiceWithPayments }, meta);
}));

// POST /api/v1/billing/invoices - Create new invoice
router.post('/invoices', asyncHandler(async (req, res) => {
    const {
        customer_id,
        package_id,
        amount,
        due_date,
        notes,
        service_number: reqServiceNumber
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
    const invoiceNumber = generateInvoiceNumber();

    // Get service_number for this customer
    let serviceNumber = reqServiceNumber;
    if (!serviceNumber) {
        const serviceResult = await query('SELECT service_number FROM services WHERE customer_id = $1', [customer_id]);
        if (serviceResult.rows.length === 0) {
            return res.sendNotFound('Service');
        }
        if (serviceResult.rows.length > 1) {
            return res.status(400).json({ error: 'Customer has multiple services — specify service_number in request' });
        }
        serviceNumber = serviceResult.rows[0].service_number;
    }

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

    // Generate unique code for bank mutation matching (Autopay)
    let uniqueCode = null;
    let amountWithCode = null;
    try {
        const uniqueCodeGenerator = require('../../../config/unique-code');
        if (uniqueCodeGenerator.isEnabled()) {
            uniqueCode = await uniqueCodeGenerator.generateCode();
            amountWithCode = uniqueCodeGenerator.calculateAmountWithCode(discountResult.finalAmount, uniqueCode);
            logger.info(`[UniqueCode] Invoice ${invoiceNumber}: code=${uniqueCode}, amount_with_code=${amountWithCode}`);
        }
    } catch (codeError) {
        logger.error(`[UniqueCode] Failed to generate code for ${invoiceNumber}:`, codeError.message);
        // Continue without unique code if generation fails
    }

    // Insert invoice with discounts (start as draft)
    const result = await query(`
        INSERT INTO invoices (
            customer_id, package_id, invoice_number, amount,
            due_date, notes, status, created_at,
            discount_amount, final_amount, discount_notes, service_number,
            unique_code, amount_with_code
        ) VALUES (
            $1, $2, $3, $4, $5, $6, 'draft', CURRENT_TIMESTAMP,
            $7, $8, $9, $10, $11, $12
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
        BillingDiscountIntegration.formatDiscountNotes(discountResult.appliedDiscounts),
        serviceNumber,
        uniqueCode,
        amountWithCode
    ]);

    const invoice = result.rows[0];

    // Mark as attempted: set sent_at before WhatsApp so TAGIH column always turns green
    await query(`UPDATE invoices SET sent_at = CURRENT_TIMESTAMP WHERE id = $1`, [invoice.id]);
    invoice.sent_at = new Date();

    // Send WhatsApp notification for new invoice
    try {
        const whatsappNotifications = require('../../../config/whatsapp-notifications');
        await whatsappNotifications.sendInvoiceCreatedNotification(customer_id, invoice.id);
        logger.info(`WhatsApp notification sent for invoice ${invoice.invoice_number}`);
        // sent_at already set inside sendInvoiceCreatedNotification — status stays unpaid
    } catch (notifError) {
        logger.error(`Failed to send WhatsApp notification for invoice ${invoice.invoice_number}:`, notifError.message);
        // Keep as 'draft' - sent_at already set, TAGIH column will be green
        // WhatsApp page will show failed status for this notification
    }

    // Autopay integration: push invoice for auto-matching
    try {
        const autopayService = require('../../../services/autopay-service');
        const customerResult = await query('SELECT name FROM customers WHERE id = $1', [customer_id]);
        const customerName = customerResult.rows[0]?.name || 'Unknown';
        // Use amount_with_code if available, otherwise base amount
        const pushAmount = invoice.amount_with_code || invoice.final_amount || invoice.amount;
        await autopayService.pushInvoice({
            ...invoice,
            customer_name: customerName,
            amount: pushAmount
        });
    } catch (autopayError) {
        logger.error(`[Autopay] Failed to push invoice ${invoice.invoice_number}:`, autopayError.message);
        // Don't fail invoice creation if Autopay push fails
    }

    // Auto-apply marketing balance (non-blocking)
    try {
        const ReferralService = require('../../../services/referral-service');
        ReferralService.autoApplyMarketingBalance(customer_id)
            .catch(e => logger.warn(`Auto-apply marketing balance failed for ${customer_id}: ${e.message}`));
    } catch (e) {
        logger.warn(`Failed to init auto-apply marketing balance: ${e.message}`);
    }

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

    // Insert payment with admin info
    const processedBy = req.user?.username || 'admin';
    const paymentResult = await query(`
        INSERT INTO payments (
            invoice_id, amount, payment_method, payment_date,
            notes, processed_by, created_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP
        ) RETURNING *
    `, [invoice_id, amount, payment_method, payment_date || new Date(), notes, processedBy]);

    const payment = paymentResult.rows[0];

    // Update invoice status
    const totalPaid = await query(`
        SELECT COALESCE(SUM(amount), 0) as total_paid
        FROM payments
        WHERE invoice_id = $1
    `, [invoice_id]);

    const totalPaidAmount = parseFloat(totalPaid.rows[0].total_paid);
    let invoiceStatusChanged = false;
    let customerReactivated = false;
    let updatedDates = null;

    if (totalPaidAmount >= invoice.amount) {
        await query(
            'UPDATE invoices SET status = $1, paid_at = NOW(), updated_at = NOW() WHERE id = $2',
            ['paid', invoice_id]
        );
        invoiceStatusChanged = true;

        // Notify autopay (non-blocking)
        const autopayService = require('../../../services/autopay-service');
        const custNameResult = await query('SELECT name FROM customers WHERE id = $1', [invoice.customer_id]);
        autopayService.notifyAutopayInvoicePaid({
            invoice_number: invoice.invoice_number,
            amount: invoice.amount,
            customer_name: custNameResult.rows[0]?.name || '',
        }).catch(e => logger.warn('Autopay notify failed:', e.message));

        // Update service dates after payment
        updatedDates = await BillingCycleService.updateServiceDatesAfterPayment(invoice_id, payment_date || new Date());

        // Check if customer has any other unpaid invoices and update status if all paid
        const serviceNumber = invoice.service_number;
        if (!serviceNumber) {
            logger.warn(`⚠️ No service_number on invoice ${invoice.id}`);
        } else {
            const unpaidInvoicesCheck = await query(`
                SELECT COUNT(*) as unpaid_count
                FROM invoices
                WHERE service_number = $1 AND status IN ('unpaid', 'suspended')
            `, [serviceNumber]);

            const unpaidCount = parseInt(unpaidInvoicesCheck.rows[0].unpaid_count);

            if (unpaidCount === 0) {
                logger.info(`🔄 All invoices paid for service ${serviceNumber}, starting full restoration...`);

                // Get service data with customer and package info
                const serviceDataQuery = await query(`
                    SELECT
                        s.id as service_id,
                        s.service_number,
                        s.status as service_status,
                        s.package_id,
                        c.id as customer_id,
                        c.name as customer_name,
                        p.group as package_group,
                        p.pppoe_profile
                    FROM services s
                    JOIN customers c ON c.id = s.customer_id
                    LEFT JOIN packages p ON p.id = s.package_id
                    WHERE s.service_number = $1
                `, [serviceNumber]);

                if (serviceDataQuery.rows.length > 0) {
                    const serviceData = serviceDataQuery.rows[0];

                    // Only restore if service is currently not active (was suspended)
                    if (serviceData.service_status !== 'active') {
                        logger.info(`🔄 Restoring service ${serviceData.service_id} for customer ${serviceData.customer_name}...`);

                        try {
                            await serviceSuspension.restoreServiceByServiceId(
                                serviceData.service_id,
                                {
                                    name: serviceData.customer_name,
                                    service_number: serviceData.service_number,
                                    package_group: serviceData.package_group,
                                    pppoe_profile: serviceData.pppoe_profile
                                },
                                'Payment received - full restoration'
                            );

                            customerReactivated = true;
                            logger.info(`✅ Service ${serviceNumber} fully restored`);
                        } catch (restoreError) {
                            logger.error(`❌ Failed to restore service ${serviceNumber}:`, restoreError);
                            await query(`UPDATE services SET status = 'active', updated_at = NOW() WHERE service_number = $1`, [serviceNumber]);
                        }
                    } else {
                        logger.info(`ℹ️ Service ${serviceNumber} already active, no restoration needed`);
                        customerReactivated = true;
                    }
                } else {
                    logger.warn(`⚠️ No service found for number ${serviceNumber}`);
                }
            } else {
                logger.info(`ℹ️ Service ${serviceNumber} still has ${unpaidCount} unpaid invoice(s)`);
            }
        }
    }

    // Send WhatsApp notification for payment received (after dates updated)
    try {
        const whatsappNotifications = require('../../../config/whatsapp-notifications');
        await whatsappNotifications.sendPaymentReceivedNotification(payment.id, {
            dueDate: updatedDates?.newIsolirDate
        });
        logger.info(`WhatsApp notification sent for payment ${payment.id}`);
    } catch (notifError) {
        logger.error(`Failed to send WhatsApp notification for payment ${payment.id}:`, notifError.message);
    }

    // Create accounting transaction for revenue
    const customerQuery = await query('SELECT name FROM customers WHERE id = $1', [invoice.customer_id]);
    const customerName = customerQuery.rows[0]?.name || 'Unknown Customer';

    // Use payment_id as reference to prevent duplicates and allow multiple payments per invoice
    const methodLabel = await formatPaymentMethod(payment_method);
    await createAccountingTransaction(
        'revenue',
        parseFloat(amount),
        `Pembayaran tagihan #${invoice_id} dari ${customerName} (${methodLabel})`,
        'payment',
        payment.id
    );

    // Trigger referral credit for referrer + referred (non-blocking)
    try {
        const ReferralService = require('../../../services/referral-service');
        ReferralService.addReferrerMarketingCredit(invoice.customer_id)
            .catch(e => logger.warn(`Referrer credit failed: ${e.message}`));
        ReferralService.addReferredMarketingCredit(invoice.customer_id)
            .catch(e => logger.warn(`Referred credit failed: ${e.message}`));
    } catch (e) {
        logger.warn(`Failed to process referral credits: ${e.message}`);
    }

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

    return res.sendSuccess({ payment }, meta, 201);
}));

// POST /api/v1/billing/payments/:id/rollback - Rollback a payment (Admin only)
router.post('/payments/:id/rollback', asyncHandler(async (req, res) => {
    try {
        // Check if user is administrator or superadmin
        if (req.user?.role !== 'administrator' && req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                message: 'Hanya administrator yang dapat melakukan rollback pembayaran'
            });
        }

        const { id } = req.params;
        const { reason } = req.body;
        const rolledBackBy = req.user?.username || 'Admin';

        // Get payment details by invoice_id (frontend sends invoice ID)
        const paymentResult = await query(`
            SELECT p.*, i.customer_id, i.amount as invoice_amount, i.status as invoice_status
            FROM payments p
            JOIN invoices i ON i.id = p.invoice_id
            WHERE p.invoice_id = $1
            ORDER BY p.created_at DESC
            LIMIT 1
        `, [id]);

        if (paymentResult.rows.length === 0) {
            return res.sendNotFound('Payment untuk invoice ini');
        }

        const payment = paymentResult.rows[0];
        const paymentId = payment.id;

        // Check if already rolled back
        if (payment.is_rolled_back) {
            return res.sendError('RESOURCE_CONFLICT', 'Pembayaran sudah di-rollback sebelumnya', [], {
                payment_id: paymentId
            });
        }

        // Mark payment as rolled back
        await query(`
            UPDATE payments
            SET is_rolled_back = TRUE,
                rolled_back_at = CURRENT_TIMESTAMP,
                rolled_back_by = $1,
                rollback_reason = $2
            WHERE id = $3
        `, [rolledBackBy, reason || 'Perbaikan data', paymentId]);

        // Recalculate total paid (excluding rolled back payments)
        const totalPaidResult = await query(`
            SELECT COALESCE(SUM(amount), 0) as total_paid
            FROM payments
            WHERE invoice_id = $1 AND is_rolled_back = FALSE
        `, [payment.invoice_id]);

        const totalPaidAmount = parseFloat(totalPaidResult.rows[0].total_paid);
        const invoiceWasFullyPaid = parseFloat(payment.invoice_amount) <= (totalPaidAmount + parseFloat(payment.amount));

        // Update invoice status if it was fully paid before
        if (payment.invoice_status === 'paid' && invoiceWasFullyPaid && totalPaidAmount < parseFloat(payment.invoice_amount)) {
            await query(`
                UPDATE invoices
                SET status = 'unpaid', updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [payment.invoice_id]);

            // Suspend service again if this was the payment that reactivated the customer
            const serviceSuspension = require('../../../config/serviceSuspension');

            // Get service data
            const serviceDataResult = await query(`
                SELECT
                    s.id as service_id,
                    s.status as service_status,
                    s.package_id,
                    c.name,
                    p.group as package_group,
                    p.pppoe_profile
                FROM services s
                JOIN customers c ON c.id = s.customer_id
                LEFT JOIN packages p ON p.id = s.package_id
                WHERE s.customer_id = $1
                LIMIT 1
            `, [payment.customer_id]);

            if (serviceDataResult.rows.length > 0) {
                const serviceData = serviceDataResult.rows[0];

                // Only suspend if service is currently active
                if (serviceData.service_status === 'active') {
                    logger.info(`🔄 Rolling back payment ${paymentId} - suspending service for ${serviceData.name}`);
                    try {
                        await serviceSuspension.suspendCustomerService(
                            { name: serviceData.name, service_id: serviceData.service_id },
                            'Payment rollback - service suspended'
                        );
                        logger.info(`✅ Service suspended for rollback: ${serviceData.name}`);
                    } catch (suspendError) {
                        // Log error but don't fail the rollback
                        logger.error(`⚠️ Failed to suspend service during rollback for ${serviceData.name}:`, suspendError.message);
                        // Continue with rollback - service suspension is secondary
                    }
                }
            }

            logger.info(`✅ Invoice ${payment.invoice_id} status changed to unpaid due to payment rollback`);

            // Notify autopay that invoice is unpaid again (re-push for monitoring)
            try {
                const autopayService = require('../../../services/autopay-service');
                await autopayService.notifyAutopayInvoiceUnpaid({
                    invoice_id: payment.invoice_id,
                });
            } catch (autopayError) {
                logger.error(`[Rollback] Failed to notify autopay for invoice ${payment.invoice_id}:`, autopayError.message);
            }
        }

        // Delete the original accounting transaction for this payment to prevent duplicates
        // Find transactions with reference_type='invoice' (old format) or 'payment' (new format)
        const accountingDeleteResult = await query(`
            DELETE FROM accounting_transactions
            WHERE reference_type IN ('invoice', 'payment')
            AND (
                (reference_type = 'invoice' AND reference_id = $1) OR
                (reference_type = 'payment' AND reference_id = $2)
            )
            RETURNING id, type, amount
        `, [payment.invoice_id, paymentId]);

        if (accountingDeleteResult.rows.length > 0) {
            logger.info(`🗑️  Deleted ${accountingDeleteResult.rows.length} accounting transaction(s) for rolled back payment ${paymentId}`);
            accountingDeleteResult.rows.forEach(row => {
                logger.info(`   - Deleted ID ${row.id}: ${row.type} Rp ${row.amount}`);
            });
        } else {
            logger.warn(`⚠️  No accounting transaction found to delete for payment ${paymentId}`);
        }

        // Create accounting transaction for reversal
        const customerQuery = await query('SELECT name FROM customers WHERE id = $1', [payment.customer_id]);
        const customerName = customerQuery.rows[0]?.name || 'Unknown Customer';
        const methodLabel = await formatPaymentMethod(payment.payment_method);

        // Use unique reference for rollback to prevent duplicate expense transactions
        await createAccountingTransaction(
            'expense',
            parseFloat(payment.amount),
            `Rollback pembayaran #${payment.invoice_id} dari ${customerName} (${methodLabel}) - ${reason || 'Perbaikan data'}`,
            'rollback',
            paymentId // Use payment ID being rolled back as reference
        );

        logger.info(`Payment ${paymentId} rolled back by ${rolledBackBy}`);

        return res.sendSuccess({
            message: 'Pembayaran berhasil di-rollback',
            payment_id: paymentId,
            invoice_id: payment.invoice_id,
            new_invoice_status: totalPaidAmount < parseFloat(payment.invoice_amount) ? 'unpaid' : 'paid'
        });

    } catch (error) {
        logger.error('Error rolling back payment:', error);
        return res.sendError('INTERNAL_ERROR', 'Gagal melakukan rollback pembayaran', [error.message]);
    }
}));

// POST /api/v1/billing/invoices/:id/resend - Resend invoice notification
router.post('/invoices/:id/resend', asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        // Get invoice details
        const invoiceResult = await query(`
            SELECT i.*, c.id as customer_id
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            WHERE i.id = $1
        `, [id]);

        if (invoiceResult.rows.length === 0) {
            return res.sendNotFound('Invoice');
        }

        const invoice = invoiceResult.rows[0];

        // Check if invoice can be resent (overdue or unpaid)
        if (invoice.status !== 'overdue' && invoice.status !== 'unpaid' && invoice.status !== 'sent') {
            return res.sendError('INVALID_OPERATION', 'Invoice tidak dapat dikirim ulang. Hanya invoice yang overdue, unpaid, atau sent yang dapat dikirim ulang.', [], {
                current_status: invoice.status
            });
        }

        logger.info(`📤 Resending invoice ${invoice.invoice_number} for customer ${invoice.customer_id}`);

        // Set sent_at before attempt so TAGIH always shows green
        await query(`UPDATE invoices SET sent_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);

        // Send WhatsApp notification
        const whatsappNotifications = require('../../../config/whatsapp-notifications');
        const notificationResult = await whatsappNotifications.sendInvoiceCreatedNotification(
            invoice.customer_id,
            invoice.id
        );

        if (notificationResult.success && !notificationResult.skipped) {
            logger.info(`✅ Invoice ${invoice.invoice_number} resent successfully`);
            return res.sendSuccess({ message: 'Invoice berhasil dikirim ulang', invoice_id: id, invoice_number: invoice.invoice_number, sent_at: new Date() }, { action: 'invoice_resent', customer_id: invoice.customer_id });
        } else if (notificationResult.skipped) {
            return res.sendSuccess({ message: 'Pengingat invoice dilewati (template dinonaktifkan)', invoice_id: id }, { action: 'invoice_remind_skipped', reason: notificationResult.reason });
        } else {
            throw new Error(notificationResult.error || 'Gagal mengirim invoice');
        }
    } catch (error) {
        logger.error('Error resending invoice:', error);
        return res.sendError('INTERNAL_ERROR', 'Gagal mengirim ulang invoice', [error.message]);
    }
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

// ============================================
module.exports = router;