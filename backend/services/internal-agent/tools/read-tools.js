const { query } = require('../../../config/database');
const radiusPostgres = require('../../../config/radius-postgres');
const { SESSION_STALE_SQL } = require('../../../config/radius-window');
const { formatRp } = require('../actions');
const { parseDateRange, resolveCustomerAndRegion } = require('./search-helper');
const {
    classifyRx,
    normalizeRx,
    resolveOnuSignal,
    hasFreshCache,
    refreshSignalCache
} = require('./onu-signal-helper');

function formatDateId(val) {
    if (!val) return '-';
    const d = val instanceof Date ? val : new Date(val);
    if (Number.isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function assertMitraHasRegions(identity) {
    if (identity.role === 'mitra' && (!Array.isArray(identity.region_ids) || identity.region_ids.length === 0)) {
        return false;
    }
    return true;
}

const readTools = [
    {
        name: 'search_customers',
        kind: 'read',
        roles: ['superadmin', 'admin', 'mitra', 'technician'],
        description: 'Cari pelanggan berdasarkan nama, nomor HP, nomor layanan (service_number), PPPoE username, alamat, atau wilayah/region.',
        parameters: {
            type: 'object',
            properties: {
                q: {
                    type: 'string',
                    description: 'Kata kunci pencarian (nama pelanggan, nomor HP, nomor layanan, PPPoE, atau alamat)'
                },
                region: {
                    type: 'string',
                    description: 'Filter wilayah/region opsional (misal "BUKIT CILAJA", "JANALOKA", "PONCOL 1").'
                }
            },
            required: ['q']
        },
        async run(ctx, args) {
            const { identity } = ctx;
            const q = String(args?.q || '').trim();
            if (!q) return { error: 'Parameter pencarian (q) harus diisi.' };
            if (!assertMitraHasRegions(identity)) {
                return { count: 0, customers: [], note: 'Tidak ada wilayah mitra yang terhubung.' };
            }

            const params = [`%${q}%`];
            let scopeClause = '';
            if (identity.role === 'mitra') {
                params.push(identity.region_ids);
                scopeClause = `AND s.region_id = ANY($${params.length}::uuid[])`;
            }

            const regionFilter = String(args?.region || '').trim();
            if (regionFilter) {
                params.push(`%${regionFilter}%`);
                const idx = params.length;
                scopeClause += ` AND (r.name ILIKE $${idx} OR m.name ILIKE $${idx} OR s.area ILIKE $${idx} OR c.address ILIKE $${idx})`;
            }

            const sql = `
                SELECT
                    c.id AS customer_id,
                    c.name,
                    c.phone,
                    c.address,
                    s.id AS service_id,
                    s.service_number,
                    s.status AS service_status,
                    s.active_date,
                    s.isolir_date,
                    s.siklus,
                    s.billing_type,
                    td.pppoe_username,
                    p.name AS package_name,
                    p.speed AS package_speed,
                    p.price AS package_price,
                    r.name AS region_name,
                    m.name AS mitra_name
                FROM customers c
                LEFT JOIN services s ON s.customer_id = c.id
                LEFT JOIN technical_details td ON td.service_id = s.id
                LEFT JOIN packages p ON s.package_id = p.id
                LEFT JOIN regions r ON s.region_id = r.id
                LEFT JOIN mitra m ON r.mitra_id = m.id
                WHERE (
                    c.name ILIKE $1
                    OR c.phone ILIKE $1
                    OR c.id ILIKE $1
                    OR s.service_number ILIKE $1
                    OR td.pppoe_username ILIKE $1
                    OR c.address ILIKE $1
                )
                ${scopeClause}
                ORDER BY (s.status = 'active') DESC NULLS LAST, c.name ASC
                LIMIT 15
            `;

            const res = await query(sql, params);
            const isTech = identity.role === 'technician';

            const customers = (res.rows || []).map(row => {
                const item = {
                    customer_id: row.customer_id,
                    name: row.name,
                    phone: row.phone || '-',
                    address: row.address || '-',
                    service_number: row.service_number || '-',
                    service_status: row.service_status || '-',
                    pppoe_username: row.pppoe_username || '-',
                    package_name: row.package_name || '-',
                    package_speed: row.package_speed || '-',
                    region_name: row.region_name || '-',
                    mitra_name: row.mitra_name || '-',
                    isolir_date: formatDateId(row.isolir_date)
                };
                if (!isTech) {
                    item.package_price = formatRp(row.package_price);
                }
                return item;
            });

            return {
                count: customers.length,
                customers
            };
        }
    },
    {
        name: 'get_customer_detail',
        kind: 'read',
        roles: ['superadmin', 'admin', 'mitra', 'technician'],
        description: 'Lihat detail lengkap pelanggan, layanan, teknis PPPoE, dan riwayat tagihan berdasarkan customer_id, nomor layanan, PPPoE, atau nama.',
        parameters: {
            type: 'object',
            properties: {
                identifier: {
                    type: 'string',
                    description: 'Nomor layanan (service_number), customer_id, PPPoE username, nomor HP, atau nama pelanggan'
                }
            },
            required: ['identifier']
        },
        async run(ctx, args) {
            const { identity } = ctx;
            const idStr = String(args?.identifier || args?.customer_id || args?.service_number || '').trim();
            if (!idStr) return { error: 'Identifier pelanggan wajib diisi.' };
            if (!assertMitraHasRegions(identity)) {
                return { error: 'Akses ditolak: wilayah mitra tidak ditemukan.' };
            }

            const params = [idStr, `%${idStr}%`];
            let scopeClause = '';
            if (identity.role === 'mitra') {
                params.push(identity.region_ids);
                scopeClause = `AND s.region_id = ANY($${params.length}::uuid[])`;
            }

            const sql = `
                SELECT
                    c.id AS customer_id,
                    c.name,
                    c.phone,
                    c.address,
                    s.id AS service_id,
                    s.service_number,
                    s.status AS service_status,
                    s.active_date,
                    s.isolir_date,
                    s.siklus,
                    s.billing_type,
                    td.pppoe_username,
                    td.ip_address_static,
                    td.mac_address,
                    td.device_model,
                    p.name AS package_name,
                    p.speed AS package_speed,
                    p.price AS package_price,
                    r.name AS region_name,
                    m.name AS mitra_name
                FROM customers c
                LEFT JOIN services s ON s.customer_id = c.id
                LEFT JOIN technical_details td ON td.service_id = s.id
                LEFT JOIN packages p ON s.package_id = p.id
                LEFT JOIN regions r ON s.region_id = r.id
                LEFT JOIN mitra m ON r.mitra_id = m.id
                WHERE (
                    c.id = $1
                    OR s.service_number = $1
                    OR LOWER(td.pppoe_username) = LOWER($1)
                    OR c.phone = $1
                    OR c.name ILIKE $2
                )
                ${scopeClause}
                ORDER BY (c.id = $1 OR s.service_number = $1) DESC, c.name ASC
                LIMIT 5
            `;

            const res = await query(sql, params);
            if (!res.rows || res.rows.length === 0) {
                return { found: false, message: `Pelanggan "${idStr}" tidak ditemukan di wilayah akses Anda.` };
            }

            const row = res.rows[0];
            const isTech = identity.role === 'technician';

            const detail = {
                found: true,
                customer_id: row.customer_id,
                name: row.name,
                phone: row.phone || '-',
                address: row.address || '-',
                service_number: row.service_number || '-',
                service_status: row.service_status || '-',
                billing_type: row.billing_type || '-',
                siklus: row.siklus || '-',
                active_date: formatDateId(row.active_date),
                isolir_date: formatDateId(row.isolir_date),
                pppoe_username: row.pppoe_username || '-',
                ip_address_static: row.ip_address_static || '-',
                mac_address: row.mac_address || '-',
                device_model: row.device_model || '-',
                package_name: row.package_name || '-',
                package_speed: row.package_speed || '-',
                region_name: row.region_name || '-',
                mitra_name: row.mitra_name || '-'
            };

            if (!isTech) {
                detail.package_price = formatRp(row.package_price);
                const invRes = await query(
                    `SELECT invoice_number, amount, amount_with_code, status, due_date, COALESCE(paid_at, payment_date) AS paid_at, payment_method
                     FROM invoices
                     WHERE customer_id = $1 OR (service_number IS NOT NULL AND service_number = $2)
                     ORDER BY due_date DESC, created_at DESC
                     LIMIT 5`,
                    [row.customer_id, row.service_number || '']
                );
                detail.recent_invoices = (invRes.rows || []).map(inv => ({
                    invoice_number: inv.invoice_number,
                    amount: formatRp(inv.amount),
                    status: inv.status,
                    due_date: formatDateId(inv.due_date),
                    paid_at: inv.paid_at ? formatDateId(inv.paid_at) : null,
                    payment_method: inv.payment_method || null
                }));
            }

            return detail;
        }
    },
    {
        name: 'get_connection_status',
        kind: 'read',
        roles: ['superadmin', 'admin', 'mitra', 'technician'],
        description: 'Cek status koneksi RADIUS/PPPoE online/offline, IP address, MAC address, dan grup RADIUS pelanggan.',
        parameters: {
            type: 'object',
            properties: {
                identifier: {
                    type: 'string',
                    description: 'Nomor layanan (service_number), PPPoE username, atau nama pelanggan'
                }
            },
            required: ['identifier']
        },
        async run(ctx, args) {
            const { identity } = ctx;
            const idStr = String(args?.identifier || args?.service_number || args?.pppoe || '').trim();
            if (!idStr) return { error: 'Identifier (nomor layanan / PPPoE / nama) harus diisi.' };
            if (!assertMitraHasRegions(identity)) {
                return { error: 'Akses ditolak: wilayah mitra tidak ditemukan.' };
            }

            const params = [idStr, `%${idStr}%`];
            let scopeClause = '';
            if (identity.role === 'mitra') {
                params.push(identity.region_ids);
                scopeClause = `AND s.region_id = ANY($${params.length}::uuid[])`;
            }

            const svcRes = await query(
                `SELECT c.name, s.service_number, s.status AS service_status, td.pppoe_username, r.name AS region_name
                 FROM services s
                 JOIN customers c ON s.customer_id = c.id
                 LEFT JOIN technical_details td ON td.service_id = s.id
                 LEFT JOIN regions r ON s.region_id = r.id
                 WHERE (
                     s.service_number = $1
                     OR LOWER(td.pppoe_username) = LOWER($1)
                     OR c.phone = $1
                     OR c.name ILIKE $2
                 )
                 ${scopeClause}
                 ORDER BY (s.service_number = $1 OR LOWER(td.pppoe_username) = LOWER($1)) DESC
                 LIMIT 1`,
                params
            );

            let pppoeUsername = null;
            let customerInfo = null;

            if (svcRes.rows && svcRes.rows.length > 0) {
                customerInfo = svcRes.rows[0];
                pppoeUsername = customerInfo.pppoe_username;
            } else if (identity.role === 'mitra') {
                return { found: false, message: `Layanan "${idStr}" tidak ditemukan di wilayah mitra Anda.` };
            }

            if (!pppoeUsername) {
                const prefix = customerInfo?.service_number || idStr;
                const radRes = await query(
                    `SELECT username FROM radcheck WHERE LOWER(username) LIKE LOWER($1) LIMIT 1`,
                    [`${prefix}%`]
                );
                if (radRes.rows?.[0]) {
                    pppoeUsername = radRes.rows[0].username;
                } else {
                    pppoeUsername = idStr;
                }
            }

            const conn = await radiusPostgres.getUserConnectionStatus(pppoeUsername);
            const grpRes = await query(
                `SELECT groupname FROM radusergroup WHERE LOWER(username) = LOWER($1) LIMIT 1`,
                [pppoeUsername]
            );
            const radiusGroup = grpRes.rows?.[0]?.groupname || '-';

            return {
                found: true,
                customer_name: customerInfo?.name || '-',
                service_number: customerInfo?.service_number || '-',
                service_status: customerInfo?.service_status || '-',
                region_name: customerInfo?.region_name || '-',
                pppoe_username: pppoeUsername,
                radius_group: radiusGroup,
                online: Boolean(conn?.online),
                connection_status: conn?.status || 'offline',
                framed_ip: conn?.framed_ip || conn?.ip_address || null,
                nas_ip: conn?.nas_ip || null,
                mac_address: conn?.mac_address || null,
                session_start: conn?.session_start ? formatDateId(conn.session_start) : null,
                last_seen: conn?.last_seen ? formatDateId(conn.last_seen) : null
            };
        }
    },
    {
        name: 'list_unpaid_invoices',
        kind: 'read',
        roles: ['superadmin', 'admin', 'mitra'],
        description: 'Daftar tagihan (invoice) yang belum dibayar (unpaid/overdue/suspended/sent). Bisa difilter berdasarkan bulan, mitra, nama wilayah/region, status tagihan, dan jatuh tempo.',
        parameters: {
            type: 'object',
            properties: {
                month: {
                    type: 'string',
                    description: 'Filter bulan jatuh tempo tagihan (format YYYY-MM seperti "2026-10", atau nama bulan seperti "oktober").'
                },
                year: {
                    type: 'number',
                    description: 'Filter tahun jatuh tempo tagihan (misal: 2026).'
                },
                status: {
                    type: 'string',
                    description: 'Filter status spesifik: "all" (semua belum lunas), "unpaid", "overdue", "suspended", "sent". Default "all".'
                },
                mitra: {
                    type: 'string',
                    description: 'Filter nama mitra (misal: "TALAGA SUNDA", "PONCOL", "BSR2", "PLD").'
                },
                region: {
                    type: 'string',
                    description: 'Filter nama wilayah/region (misal: Cibogo, Kirana, Poncol, PLD).'
                },
                overdue_only: {
                    type: 'boolean',
                    description: 'Jika true, hanya tampilkan yang sudah lewat jatuh tempo.'
                },
                limit: {
                    type: 'number',
                    description: 'Maksimal baris yang ditampilkan (default 15, maks 25).'
                }
            }
        },
        async run(ctx, args) {
            const { identity } = ctx;
            if (!assertMitraHasRegions(identity)) {
                return { total_count: 0, total_amount: formatRp(0), invoices: [] };
            }

            const limit = Math.min(25, Math.max(1, parseInt(args?.limit, 10) || 15));
            const params = [];
            const conditions = [];

            // 1. Status Filter
            const statusFilter = String(args?.status || 'all').trim().toLowerCase();
            if (statusFilter === 'unpaid') {
                conditions.push(`i.status = 'unpaid'`);
            } else if (statusFilter === 'overdue') {
                conditions.push(`(i.status = 'overdue' OR (i.status IN ('unpaid', 'sent') AND i.due_date < CURRENT_DATE))`);
            } else if (statusFilter === 'suspended') {
                conditions.push(`i.status = 'suspended'`);
            } else if (statusFilter === 'sent') {
                conditions.push(`i.status = 'sent'`);
            } else {
                conditions.push(`i.status IN ('unpaid', 'overdue', 'suspended', 'sent', 'draft')`);
            }

            if (identity.role === 'mitra') {
                params.push(identity.region_ids);
                conditions.push(`s.region_id = ANY($${params.length}::uuid[])`);
            } else {
                if (args?.region && String(args.region).trim()) {
                    params.push(`%${String(args.region).trim()}%`);
                    const idx = params.length;
                    conditions.push(`(r.name ILIKE $${idx} OR m.name ILIKE $${idx} OR s.area ILIKE $${idx} OR c.address ILIKE $${idx})`);
                }
                if (args?.mitra && String(args.mitra).trim()) {
                    params.push(`%${String(args.mitra).trim()}%`);
                    const idx = params.length;
                    conditions.push(`(m.name ILIKE $${idx} OR r.name ILIKE $${idx})`);
                }
            }

            // 2. Month / Year filter (based on due_date)
            const period = parseDateRange({
                month: args?.month,
                year: args?.year,
                extendCutoff: false
            });
            if (period.hasPeriod && period.startDateOnly && period.endDateOnly) {
                params.push(period.startDateOnly);
                params.push(period.endDateOnly);
                conditions.push(`i.due_date >= $${params.length - 1}::date AND i.due_date <= $${params.length}::date`);
            }

            if (args?.overdue_only === true && statusFilter !== 'overdue') {
                conditions.push(`i.due_date < CURRENT_DATE`);
            }

            const whereSql = conditions.join(' AND ');

            const summaryRes = await query(
                `SELECT COUNT(*)::int AS total_count, COALESCE(SUM(i.amount), 0) AS total_amount
                 FROM invoices i
                 JOIN customers c ON i.customer_id = c.id
                 LEFT JOIN services s ON (s.service_number = i.service_number OR (i.service_number IS NULL AND s.customer_id = c.id))
                 LEFT JOIN regions r ON s.region_id = r.id
                 LEFT JOIN mitra m ON r.mitra_id = m.id
                 WHERE ${whereSql}`,
                params
            );

            params.push(limit);
            const listRes = await query(
                `SELECT
                    i.invoice_number,
                    i.amount,
                    i.amount_with_code,
                    i.status,
                    i.due_date,
                    c.name AS customer_name,
                    c.phone AS customer_phone,
                    COALESCE(i.service_number, s.service_number) AS service_number,
                    s.status AS service_status,
                    r.name AS region_name,
                    m.name AS mitra_name
                 FROM invoices i
                 JOIN customers c ON i.customer_id = c.id
                 LEFT JOIN services s ON (s.service_number = i.service_number OR (i.service_number IS NULL AND s.customer_id = c.id))
                 LEFT JOIN regions r ON s.region_id = r.id
                 LEFT JOIN mitra m ON r.mitra_id = m.id
                 WHERE ${whereSql}
                 ORDER BY i.due_date ASC, c.name ASC
                 LIMIT $${params.length}`,
                params
            );

            const totalCount = summaryRes.rows?.[0]?.total_count || 0;
            const totalAmount = Number(summaryRes.rows?.[0]?.total_amount || 0);

            return {
                period: period.hasPeriod ? period.label : 'Semua Periode',
                total_count: totalCount,
                total_amount: formatRp(totalAmount),
                total_amount_raw: totalAmount,
                shown_count: listRes.rows?.length || 0,
                invoices: (listRes.rows || []).map(row => ({
                    invoice_number: row.invoice_number,
                    customer_name: row.customer_name,
                    service_number: row.service_number || '-',
                    region_name: row.region_name || '-',
                    mitra_name: row.mitra_name || '-',
                    amount: formatRp(row.amount),
                    due_date: formatDateId(row.due_date),
                    status: row.status,
                    service_status: row.service_status || '-'
                }))
            };
        }
    },
    {
        name: 'get_invoice_detail',
        kind: 'read',
        roles: ['superadmin', 'admin', 'mitra'],
        description: 'Lihat detail satu invoice berdasarkan nomor invoice (misal INV-202605-0001).',
        parameters: {
            type: 'object',
            properties: {
                invoice_number: {
                    type: 'string',
                    description: 'Nomor invoice'
                }
            },
            required: ['invoice_number']
        },
        async run(ctx, args) {
            const { identity } = ctx;
            const invNum = String(args?.invoice_number || '').trim();
            if (!invNum) return { error: 'Nomor invoice wajib diisi.' };
            if (!assertMitraHasRegions(identity)) {
                return { error: 'Akses ditolak: wilayah mitra tidak ditemukan.' };
            }

            const params = [invNum];
            let scopeClause = '';
            if (identity.role === 'mitra') {
                params.push(identity.region_ids);
                scopeClause = `AND s.region_id = ANY($${params.length}::uuid[])`;
            }

            const res = await query(
                `SELECT
                    i.*,
                    c.name AS customer_name,
                    c.phone AS customer_phone,
                    s.service_number AS resolved_service_number,
                    s.status AS service_status,
                    p.name AS package_name,
                    r.name AS region_name,
                    m.name AS mitra_name
                 FROM invoices i
                 JOIN customers c ON i.customer_id = c.id
                 LEFT JOIN services s ON (s.service_number = i.service_number OR (i.service_number IS NULL AND s.customer_id = c.id))
                 LEFT JOIN packages p ON COALESCE(i.package_id, s.package_id) = p.id
                 LEFT JOIN regions r ON s.region_id = r.id
                 LEFT JOIN mitra m ON r.mitra_id = m.id
                 WHERE UPPER(i.invoice_number) = UPPER($1)
                 ${scopeClause}
                 LIMIT 1`,
                params
            );

            if (!res.rows || res.rows.length === 0) {
                return { found: false, message: `Invoice "${invNum}" tidak ditemukan di wilayah akses Anda.` };
            }

            const inv = res.rows[0];
            return {
                found: true,
                id: inv.id,
                invoice_number: inv.invoice_number,
                customer_name: inv.customer_name,
                customer_phone: inv.customer_phone || '-',
                service_number: inv.service_number || inv.resolved_service_number || '-',
                service_status: inv.service_status || '-',
                package_name: inv.package_name || '-',
                region_name: inv.region_name || '-',
                mitra_name: inv.mitra_name || '-',
                amount: formatRp(inv.amount),
                amount_with_code: inv.amount_with_code ? formatRp(inv.amount_with_code) : null,
                unique_code: inv.unique_code || null,
                status: inv.status,
                due_date: formatDateId(inv.due_date),
                paid_at: (inv.paid_at || inv.payment_date) ? formatDateId(inv.paid_at || inv.payment_date) : null,
                payment_method: inv.payment_method || null,
                notes: inv.notes || null
            };
        }
    },
    {
        name: 'get_daily_summary',
        kind: 'read',
        roles: ['superadmin', 'admin', 'mitra'],
        description: 'Rekap pembayaran harian (jumlah transaksi, total pendapatan, rincian metode bayar dan per mitra) untuk tanggal tertentu (default hari ini).',
        parameters: {
            type: 'object',
            properties: {
                date: {
                    type: 'string',
                    description: 'Tanggal format YYYY-MM-DD, atau "today" / "hari ini", atau "yesterday" / "kemarin". Kosongkan untuk hari ini.'
                }
            }
        },
        async run(ctx, args) {
            const { identity } = ctx;
            if (!assertMitraHasRegions(identity)) {
                return { transaction_count: 0, total_revenue: formatRp(0), transactions: [] };
            }

            const rawDate = String(args?.date || '').trim().toLowerCase();
            let dateExpr = 'CURRENT_DATE';
            const params = [];

            if (rawDate === 'yesterday' || rawDate === 'kemarin') {
                dateExpr = `(CURRENT_DATE - INTERVAL '1 day')::date`;
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
                params.push(rawDate);
                dateExpr = `$1::date`;
            }

            const dateRes = await query(
                `SELECT to_char(${dateExpr}, 'YYYY-MM-DD') AS target_date, to_char(${dateExpr}, 'DD/MM/YYYY') AS formatted_date`,
                params
            );
            const targetDateStr = dateRes.rows[0].target_date;
            const formattedDate = dateRes.rows[0].formatted_date;

            const qParams = [targetDateStr];
            let scopeClause = '';
            if (identity.role === 'mitra') {
                qParams.push(identity.region_ids);
                scopeClause = `AND s.region_id = ANY($2::uuid[])`;
            }

            const paymentsRes = await query(
                `SELECT
                    p.id,
                    p.amount,
                    p.payment_method,
                    p.payment_gateway,
                    p.payment_date,
                    i.invoice_number,
                    COALESCE(i.service_number, s.service_number) AS service_number,
                    c.name AS customer_name,
                    r.name AS region_name,
                    COALESCE(m.name, 'KILUSI PUSAT') AS mitra_name
                 FROM payments p
                 JOIN invoices i ON p.invoice_id = i.id
                 JOIN customers c ON i.customer_id = c.id
                 LEFT JOIN services s ON (s.service_number = i.service_number OR (i.service_number IS NULL AND s.customer_id = c.id))
                 LEFT JOIN regions r ON s.region_id = r.id
                 LEFT JOIN mitra m ON r.mitra_id = m.id
                 WHERE p.is_rolled_back = false
                   AND p.payment_date >= ($1::date)
                   AND p.payment_date < ($1::date + INTERVAL '1 day')
                   ${scopeClause}
                 ORDER BY p.payment_date DESC`,
                qParams
            );

            let cashTotal = 0;
            let transferTotal = 0;
            let autopayTotal = 0;
            let tripayTotal = 0;
            let totalRevenue = 0;

            const rows = paymentsRes.rows || [];
            for (const p of rows) {
                const amt = Number(p.amount || 0);
                totalRevenue += amt;
                const gw = String(p.payment_gateway || '').toLowerCase();
                const meth = String(p.payment_method || '').toLowerCase();

                if (gw === 'autopay' || meth.includes('autopay')) {
                    autopayTotal += amt;
                } else if (gw === 'tripay' || meth.includes('tripay')) {
                    tripayTotal += amt;
                } else if (meth === 'cash' || meth === 'tunai') {
                    cashTotal += amt;
                } else {
                    transferTotal += amt;
                }
            }

            return {
                date: formattedDate,
                transaction_count: rows.length,
                total_revenue: formatRp(totalRevenue),
                breakdown: {
                    tunai: formatRp(cashTotal),
                    transfer: formatRp(transferTotal),
                    autopay: formatRp(autopayTotal),
                    tripay: formatRp(tripayTotal)
                },
                transactions: rows.slice(0, 20).map(r => ({
                    invoice_number: r.invoice_number,
                    customer_name: r.customer_name,
                    service_number: r.service_number || '-',
                    region_name: r.region_name || '-',
                    mitra_name: r.mitra_name,
                    amount: formatRp(r.amount),
                    method: r.payment_method || r.payment_gateway || '-'
                }))
            };
        }
    },
    {
        name: 'get_financial_report',
        kind: 'read',
        roles: ['superadmin', 'admin', 'mitra'],
        description: 'Laporan keuangan dan rekap omzet/pendapatan (bruto, fee payment gateway, pendapatan bersih, jumlah invoice terbayar, dan sisa tagihan belum lunas) berdasarkan periode bulan atau rentang tanggal, dengan filter mitra atau wilayah opsional.',
        parameters: {
            type: 'object',
            properties: {
                month: {
                    type: 'string',
                    description: 'Bulan laporan format YYYY-MM (misal: "2026-10") atau nama bulan (misal: "oktober", "oktober 2026").'
                },
                year: {
                    type: 'number',
                    description: 'Tahun laporan (misal: 2026). Opsional jika sudah tercakup di month.'
                },
                date_from: {
                    type: 'string',
                    description: 'Tanggal awal filter rentang kustom (format YYYY-MM-DD).'
                },
                date_to: {
                    type: 'string',
                    description: 'Tanggal akhir filter rentang kustom (format YYYY-MM-DD).'
                },
                mitra: {
                    type: 'string',
                    description: 'Filter nama mitra tertentu (misal: "TALAGA SUNDA", "PONCOL", "BSR2", "PLD").'
                },
                region: {
                    type: 'string',
                    description: 'Filter nama wilayah/region tertentu.'
                }
            }
        },
        async run(ctx, args) {
            const { identity } = ctx;
            if (!assertMitraHasRegions(identity)) {
                return {
                    period: 'Tidak ada wilayah',
                    total_invoices_paid: 0,
                    gross_revenue: formatRp(0),
                    merchant_fee: formatRp(0),
                    net_revenue: formatRp(0),
                    summary_text: 'Akun mitra Anda belum memiliki wilayah yang ditugaskan.'
                };
            }

            const period = parseDateRange({
                month: args?.month,
                year: args?.year,
                date_from: args?.date_from,
                date_to: args?.date_to,
                extendCutoff: true
            });

            const paidConditions = ["i.status = 'paid'"];
            const paidParams = [];

            if (period.hasPeriod && period.startDate && period.endDate) {
                paidParams.push(period.startDate);
                paidParams.push(period.endDate);
                paidConditions.push(`i.paid_at >= $${paidParams.length - 1} AND i.paid_at <= $${paidParams.length}`);
            }

            if (identity.role === 'mitra') {
                paidParams.push(identity.region_ids);
                paidConditions.push(`s.region_id = ANY($${paidParams.length}::uuid[])`);
            } else {
                if (args?.region && String(args.region).trim()) {
                    paidParams.push(`%${String(args.region).trim()}%`);
                    paidConditions.push(`r.name ILIKE $${paidParams.length}`);
                }
                if (args?.mitra && String(args.mitra).trim()) {
                    paidParams.push(`%${String(args.mitra).trim()}%`);
                    paidConditions.push(`(m.name ILIKE $${paidParams.length} OR r.name ILIKE $${paidParams.length})`);
                }
            }

            const paidWhereSql = paidConditions.join(' AND ');

            // 1. Overall Revenue Aggregation
            const revRes = await query(
                `SELECT
                    COUNT(*)::int AS total_invoices_paid,
                    COALESCE(SUM(i.amount), 0) AS gross_revenue,
                    COALESCE(SUM(CASE WHEN i.fee_bearer = 'merchant' THEN COALESCE(i.payment_fee_amount, 0) ELSE 0 END), 0) AS total_merchant_fee,
                    COALESCE(SUM(CASE WHEN i.fee_bearer = 'merchant' THEN (i.amount - COALESCE(i.payment_fee_amount, 0)) ELSE i.amount END), 0) AS net_revenue
                 FROM invoices i
                 LEFT JOIN services s ON (s.service_number = i.service_number OR (i.service_number IS NULL AND s.customer_id = i.customer_id))
                 LEFT JOIN regions r ON s.region_id = r.id
                 LEFT JOIN mitra m ON r.mitra_id = m.id
                 WHERE ${paidWhereSql}`,
                paidParams
            );

            const revRow = revRes.rows?.[0] || {};
            const totalPaidCount = parseInt(revRow.total_invoices_paid, 10) || 0;
            const grossNum = Number(revRow.gross_revenue || 0);
            const feeNum = Number(revRow.total_merchant_fee || 0);
            const netNum = Number(revRow.net_revenue || 0);

            // 2. Breakdown by Payment Channel
            const channelRes = await query(
                `SELECT
                    CASE
                        WHEN LOWER(COALESCE(i.payment_gateway, '')) = 'tripay' OR LOWER(COALESCE(i.payment_method, '')) LIKE '%tripay%' THEN 'Tripay'
                        WHEN LOWER(COALESCE(i.payment_gateway, '')) = 'autopay' OR LOWER(COALESCE(i.payment_method, '')) LIKE '%autopay%' THEN 'Autopay'
                        WHEN LOWER(COALESCE(i.payment_method, '')) IN ('cash', 'tunai') THEN 'Tunai'
                        ELSE 'Transfer Bank'
                    END AS channel,
                    COUNT(*)::int AS count,
                    COALESCE(SUM(i.amount), 0) AS total
                 FROM invoices i
                 LEFT JOIN services s ON (s.service_number = i.service_number OR (i.service_number IS NULL AND s.customer_id = i.customer_id))
                 LEFT JOIN regions r ON s.region_id = r.id
                 LEFT JOIN mitra m ON r.mitra_id = m.id
                 WHERE ${paidWhereSql}
                 GROUP BY channel
                 ORDER BY total DESC`,
                paidParams
            );

            // 3. Breakdown by Mitra (if not restricted to single mitra)
            let mitraBreakdown = [];
            if (identity.role !== 'mitra') {
                const mRes = await query(
                    `SELECT
                        COALESCE(m.name, 'KILUSI PUSAT') AS mitra_name,
                        COUNT(*)::int AS paid_count,
                        COALESCE(SUM(i.amount), 0) AS gross_revenue,
                        COALESCE(SUM(CASE WHEN i.fee_bearer = 'merchant' THEN (i.amount - COALESCE(i.payment_fee_amount, 0)) ELSE i.amount END), 0) AS net_revenue
                     FROM invoices i
                     LEFT JOIN services s ON (s.service_number = i.service_number OR (i.service_number IS NULL AND s.customer_id = i.customer_id))
                     LEFT JOIN regions r ON s.region_id = r.id
                     LEFT JOIN mitra m ON r.mitra_id = m.id
                     WHERE ${paidWhereSql}
                     GROUP BY m.name
                     ORDER BY gross_revenue DESC`,
                    paidParams
                );
                mitraBreakdown = (mRes.rows || []).map(r => ({
                    mitra_name: r.mitra_name,
                    paid_count: parseInt(r.paid_count, 10) || 0,
                    gross_revenue: formatRp(r.gross_revenue),
                    net_revenue: formatRp(r.net_revenue)
                }));
            }

            // 4. Unpaid Invoices in same period & scope
            const unpaidConditions = [`i.status IN ('unpaid', 'overdue', 'suspended', 'sent', 'draft')`];
            const unpaidParams = [];

            if (period.hasPeriod && period.startDateOnly && period.endDateOnly) {
                unpaidParams.push(period.startDateOnly);
                unpaidParams.push(period.endDateOnly);
                unpaidConditions.push(`i.due_date >= $${unpaidParams.length - 1}::date AND i.due_date <= $${unpaidParams.length}::date`);
            }

            if (identity.role === 'mitra') {
                unpaidParams.push(identity.region_ids);
                unpaidConditions.push(`s.region_id = ANY($${unpaidParams.length}::uuid[])`);
            } else {
                if (args?.region && String(args.region).trim()) {
                    unpaidParams.push(`%${String(args.region).trim()}%`);
                    unpaidConditions.push(`r.name ILIKE $${unpaidParams.length}`);
                }
                if (args?.mitra && String(args.mitra).trim()) {
                    unpaidParams.push(`%${String(args.mitra).trim()}%`);
                    unpaidConditions.push(`(m.name ILIKE $${unpaidParams.length} OR r.name ILIKE $${unpaidParams.length})`);
                }
            }

            const unpaidRes = await query(
                `SELECT
                    COUNT(*)::int AS unpaid_count,
                    COALESCE(SUM(i.amount), 0) AS unpaid_amount
                 FROM invoices i
                 LEFT JOIN services s ON (s.service_number = i.service_number OR (i.service_number IS NULL AND s.customer_id = i.customer_id))
                 LEFT JOIN regions r ON s.region_id = r.id
                 LEFT JOIN mitra m ON r.mitra_id = m.id
                 WHERE ${unpaidConditions.join(' AND ')}`,
                unpaidParams
            );
            const unpaidCount = parseInt(unpaidRes.rows?.[0]?.unpaid_count, 10) || 0;
            const unpaidAmountNum = Number(unpaidRes.rows?.[0]?.unpaid_amount || 0);

            // 5. Format Summary Text
            const channels = (channelRes.rows || []).map(c => ({
                channel: c.channel,
                count: parseInt(c.count, 10) || 0,
                total: formatRp(c.total)
            }));

            const scopeLabel = args?.mitra
                ? `Mitra ${args.mitra.toUpperCase()}`
                : (identity.role === 'mitra' ? `Mitra ${identity.name}` : (args?.region ? `Wilayah ${args.region}` : 'Seluruh Wilayah / Pusat'));

            const textLines = [
                `📊 *LAPORAN KEUANGAN KILUSI BILL*`,
                `Periode: ${period.label}`,
                `Cakupan: ${scopeLabel}`,
                `---------------------------------`,
                `✅ Total Invoice Lunas: *${totalPaidCount} invoice*`,
                `💰 Pendapatan Bruto: *${formatRp(grossNum)}*`,
                feeNum > 0 ? `💳 Biaya Gateway (Merchant): -${formatRp(feeNum)}` : null,
                `💵 *Pendapatan Bersih: ${formatRp(netNum)}*`,
                `---------------------------------`,
                `⏳ Tertunggak (${period.label}): *${unpaidCount} invoice* (${formatRp(unpaidAmountNum)})`,
                `---------------------------------`,
                `📌 *Rincian Metode Pembayaran:*`
            ].filter(Boolean);

            if (channels.length > 0) {
                for (const ch of channels) {
                    textLines.push(`• ${ch.channel}: ${ch.count} transaksi (${ch.total})`);
                }
            } else {
                textLines.push(`• Tidak ada transaksi pembayaran.`);
            }

            if (mitraBreakdown.length > 0) {
                textLines.push(`---------------------------------`);
                textLines.push(`🤝 *Rincian Pendapatan per Mitra:*`);
                for (const mb of mitraBreakdown) {
                    textLines.push(`• ${mb.mitra_name}: ${mb.paid_count} inv | Bersih: ${mb.net_revenue}`);
                }
            }

            return {
                period: period.label,
                scope: scopeLabel,
                date_range: {
                    from: period.startDate,
                    to: period.endDate
                },
                total_invoices_paid: totalPaidCount,
                gross_revenue: formatRp(grossNum),
                gross_revenue_raw: grossNum,
                merchant_fee: formatRp(feeNum),
                net_revenue: formatRp(netNum),
                net_revenue_raw: netNum,
                unpaid_count: unpaidCount,
                unpaid_total: formatRp(unpaidAmountNum),
                by_method: channels,
                by_mitra: mitraBreakdown,
                summary_text: textLines.join('\n')
            };
        }
    },
    {
        name: 'list_tickets',
        kind: 'read',
        roles: ['superadmin', 'admin', 'mitra', 'technician'],
        description: 'Daftar tiket gangguan/support. Teknisi otomatis melihat tiket yang ditugaskan kepadanya.',
        parameters: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    description: 'Filter status tiket: open, in_progress, pending, resolved, closed, atau kosongkan untuk tiket aktif'
                },
                customer_query: {
                    type: 'string',
                    description: 'Filter nama pelanggan, nomor HP, nomor layanan, atau nomor tiket (opsional)'
                },
                technician_query: {
                    type: 'string',
                    description: 'Filter nama/username teknisi yang ditugaskan (opsional, misal: "geding")'
                }
            }
        },
        async run(ctx, args) {
            const { identity } = ctx;
            if (!assertMitraHasRegions(identity)) {
                return { count: 0, tickets: [] };
            }

            const params = [];
            const conditions = [];

            if (args?.status && String(args.status).trim()) {
                params.push(String(args.status).trim().toLowerCase());
                conditions.push(`LOWER(st.status) = $${params.length}`);
            } else {
                conditions.push(`st.status NOT IN ('resolved', 'closed')`);
            }
            if (args?.customer_query && String(args.customer_query).trim()) {
                const cq = String(args.customer_query).trim();
                params.push(cq);
                const exactIdx = params.length;
                params.push(`%${cq}%`);
                const likeIdx = params.length;
                conditions.push(`(st.customer_name ILIKE $${likeIdx} OR st.customer_phone ILIKE $${likeIdx} OR st.ticket_number ILIKE $${likeIdx} OR s.service_number = $${exactIdx})`);
            }

            if (args?.technician_query && String(args.technician_query).trim()) {
                params.push(`%${String(args.technician_query).trim()}%`);
                const tIdx = params.length;
                conditions.push(`(u.username ILIKE $${tIdx} OR st.assigned_to ILIKE $${tIdx})`);
            }

            if (identity.role === 'technician') {
                params.push(identity.tech_user_id || -1);
                const idIdx = params.length;
                params.push(identity.name || '');
                const nameIdx = params.length;
                conditions.push(`(st.assigned_to_user = $${idIdx} OR LOWER(COALESCE(st.assigned_to, '')) = LOWER($${nameIdx}))`);
            } else if (identity.role === 'mitra') {
                params.push(identity.region_ids);
                conditions.push(`s.region_id = ANY($${params.length}::uuid[])`);
            }
            const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            const res = await query(
                `SELECT DISTINCT ON (st.id)
                    st.id,
                    st.ticket_number,
                    st.customer_name,
                    st.customer_phone,
                    st.subject,
                    st.category,
                    st.priority,
                    st.status,
                    st.assigned_to,
                    u.username AS assigned_username,
                    r.name AS region_name,
                    st.created_at
                 FROM support_tickets st
                 LEFT JOIN customers c ON st.customer_id = c.id
                 LEFT JOIN services s ON s.customer_id = c.id
                 LEFT JOIN regions r ON s.region_id = r.id
                 LEFT JOIN users u ON st.assigned_to_user = u.id
                 ${whereSql}
                 ORDER BY st.id DESC
                 LIMIT 15`,
                params
            );

            return {
                count: res.rows?.length || 0,
                tickets: (res.rows || []).map(t => ({
                    id: t.id,
                    ticket_number: t.ticket_number || `#${t.id}`,
                    customer_name: t.customer_name || '-',
                    customer_phone: t.customer_phone || '-',
                    subject: t.subject,
                    category: t.category || '-',
                    priority: t.priority || 'normal',
                    status: t.status,
                    assigned_to: t.assigned_username || t.assigned_to || '-',
                    region_name: t.region_name || '-',
                    created_at: formatDateId(t.created_at)
                }))
            };
        }
    },
    {
        name: 'list_technicians',
        kind: 'read',
        roles: ['superadmin', 'admin', 'mitra', 'technician'],
        description: 'Daftar teknisi yang terdaftar beserta nomor HP dan jumlah tiket aktif (open/in_progress) yang sedang ditangani.',
        parameters: {
            type: 'object',
            properties: {}
        },
        async run() {
            const res = await query(
                `SELECT
                    u.id,
                    u.username,
                    COALESCE(m.name, u.username) AS name,
                    COALESCE(u.phone, m.phone, '-') AS phone,
                    COUNT(DISTINCT st.id) FILTER (WHERE st.status NOT IN ('resolved', 'closed'))::int AS active_tickets
                 FROM users u
                 LEFT JOIN ai_agent_members m ON m.member_type = 'technician' AND (m.ref_id = u.id::text OR LOWER(m.name) = LOWER(u.username)) AND m.enabled = true
                 LEFT JOIN support_tickets st ON (st.assigned_to_user = u.id OR LOWER(COALESCE(st.assigned_to, '')) = LOWER(u.username))
                 WHERE u.role = 'technician'
                 GROUP BY u.id, u.username, m.name, u.phone, m.phone
                 ORDER BY u.username ASC`
            );

            return {
                count: res.rows?.length || 0,
                technicians: (res.rows || []).map(t => ({
                    id: t.id,
                    username: t.username,
                    name: t.name,
                    phone: t.phone || '-',
                    active_tickets: t.active_tickets || 0
                }))
            };
        }
    },
    {
        name: 'get_device_status',
        kind: 'read',
        roles: ['superadmin', 'admin', 'technician'],
        description: 'Cek status perangkat jaringan NAS (MikroTik) dan OLT beserta status ping/uptime monitor.',
        parameters: {
            type: 'object',
            properties: {}
        },
        async run() {
            const [monitorsRes, nasRes, oltRes] = await Promise.all([
                query(`SELECT name, target, device_type, status, response_time, last_checked FROM uptime_monitors ORDER BY device_type, name`),
                query(`SELECT id, shortname, nasname, ip_address, is_active, snmp_status, snmp_cpu_usage, snmp_memory_usage, snmp_active_connections FROM nas WHERE is_active = true ORDER BY id`),
                query(`SELECT id, name, host, type, status FROM olts ORDER BY name`)
            ]);

            return {
                uptime_monitors: (monitorsRes.rows || []).map(m => ({
                    name: m.name,
                    ip: m.target,
                    type: m.device_type || 'device',
                    status: m.status || 'unknown',
                    latency_ms: m.response_time || 0,
                    last_checked: m.last_checked ? formatDateId(m.last_checked) : '-'
                })),
                nas_devices: (nasRes.rows || []).map(n => ({
                    name: n.shortname || n.nasname,
                    ip: n.ip_address || n.nasname,
                    snmp_status: n.snmp_status || 'unknown',
                    cpu_percent: n.snmp_cpu_usage || 0,
                    memory_percent: n.snmp_memory_usage || 0,
                    active_pppoe: n.snmp_active_connections || 0
                })),
                olt_devices: (oltRes.rows || []).map(o => ({
                    name: o.name,
                    host: o.host,
                    vendor: o.type,
                    status: o.status || 'active'
                }))
            };
        }
    },
    {
        name: 'list_suspended_services',
        kind: 'read',
        roles: ['superadmin', 'admin', 'mitra'],
        description: 'Daftar pelanggan dengan layanan terisolir (status suspended atau riwayat isolir pada bulan/tanggal tertentu).',
        parameters: {
            type: 'object',
            properties: {
                month: {
                    type: 'string',
                    description: 'Filter bulan isolir (format YYYY-MM seperti "2026-10", atau nama bulan seperti "oktober").'
                },
                year: {
                    type: 'number',
                    description: 'Filter tahun isolir (misal: 2026).'
                },
                date_from: {
                    type: 'string',
                    description: 'Tanggal awal rentang isolir (format YYYY-MM-DD).'
                },
                date_to: {
                    type: 'string',
                    description: 'Tanggal akhir rentang isolir (format YYYY-MM-DD).'
                },
                mitra: {
                    type: 'string',
                    description: 'Filter nama mitra (misal: "TALAGA SUNDA", "PONCOL", "BSR2", "PLD").'
                },
                region: {
                    type: 'string',
                    description: 'Filter nama wilayah/region opsional.'
                },
                limit: {
                    type: 'number',
                    description: 'Maksimal baris yang ditampilkan (default 25).'
                }
            }
        },
        async run(ctx, args) {
            const { identity } = ctx;
            if (!assertMitraHasRegions(identity)) {
                return { count: 0, services: [] };
            }

            const limit = Math.min(50, Math.max(1, parseInt(args?.limit, 10) || 25));
            const params = [];
            const conditions = [];

            const period = parseDateRange({
                month: args?.month,
                year: args?.year,
                date_from: args?.date_from,
                date_to: args?.date_to,
                extendCutoff: false
            });

            if (period.hasPeriod && period.startDateOnly && period.endDateOnly) {
                params.push(period.startDateOnly);
                params.push(period.endDateOnly);
                conditions.push(`s.isolir_date >= $${params.length - 1}::date AND s.isolir_date <= $${params.length}::date`);
            } else {
                conditions.push(`s.status = 'suspended'`);
            }

            if (identity.role === 'mitra') {
                params.push(identity.region_ids);
                conditions.push(`s.region_id = ANY($${params.length}::uuid[])`);
            } else {
                if (args?.region && String(args.region).trim()) {
                    params.push(`%${String(args.region).trim()}%`);
                    const idx = params.length;
                    conditions.push(`(r.name ILIKE $${idx} OR m.name ILIKE $${idx} OR s.area ILIKE $${idx})`);
                }
                if (args?.mitra && String(args.mitra).trim()) {
                    params.push(`%${String(args.mitra).trim()}%`);
                    const idx = params.length;
                    conditions.push(`(m.name ILIKE $${idx} OR r.name ILIKE $${idx})`);
                }
            }

            params.push(limit);
            const res = await query(
                `SELECT
                    c.id AS customer_id,
                    c.name AS customer_name,
                    c.phone AS customer_phone,
                    s.service_number,
                    s.status AS service_status,
                    s.isolir_date,
                    td.pppoe_username,
                    r.name AS region_name,
                    m.name AS mitra_name
                 FROM services s
                 JOIN customers c ON s.customer_id = c.id
                 LEFT JOIN technical_details td ON td.service_id = s.id
                 LEFT JOIN regions r ON s.region_id = r.id
                 LEFT JOIN mitra m ON r.mitra_id = m.id
                 WHERE ${conditions.join(' AND ')}
                 ORDER BY s.isolir_date DESC NULLS LAST, c.name ASC
                 LIMIT $${params.length}`,
                params
            );

            return {
                period: period.hasPeriod ? period.label : 'Sedang Terisolir (Status Suspended)',
                count: res.rows?.length || 0,
                services: (res.rows || []).map(row => ({
                    customer_name: row.customer_name,
                    customer_phone: row.customer_phone || '-',
                    service_number: row.service_number || '-',
                    service_status: row.service_status || '-',
                    pppoe_username: row.pppoe_username || '-',
                    region_name: row.region_name || '-',
                    mitra_name: row.mitra_name || '-',
                    isolir_date: formatDateId(row.isolir_date)
                }))
            };
        }
    },
    {
        name: 'list_offline_active_customers',
        kind: 'read',
        roles: ['superadmin', 'admin', 'mitra', 'technician'],
        description: 'Daftar pelanggan yang layanannya aktif tetapi koneksi PPPoE-nya sedang offline (tidak ada sesi RADIUS aktif). Bisa difilter per wilayah/region atau mitra. Gunakan ini untuk pertanyaan seperti "pelanggan mana yang aktif tapi offline di Janaloka 8".',
        parameters: {
            type: 'object',
            properties: {
                region: {
                    type: 'string',
                    description: 'Filter wilayah/region (misal "JANALOKA", "BUKIT CILAJA", "PONCOL 2"). Kosongkan untuk semua wilayah.'
                },
                mitra: {
                    type: 'string',
                    description: 'Filter nama mitra opsional (misal "TALAGA SUNDA").'
                },
                limit: {
                    type: 'number',
                    description: 'Maksimal baris yang ditampilkan (default 25, maksimal 50).'
                }
            }
        },
        async run(ctx, args) {
            const { identity } = ctx;
            if (!assertMitraHasRegions(identity)) {
                return { count: 0, total: 0, customers: [], note: 'Tidak ada wilayah mitra yang terhubung.' };
            }

            const limit = Math.min(50, Math.max(1, parseInt(args?.limit, 10) || 25));
            const params = [];
            const conditions = [
                `s.status = 'active'`,
                `td.pppoe_username IS NOT NULL`,
                `NOT EXISTS (
                    SELECT 1 FROM radacct ra
                    WHERE LOWER(ra.username) = LOWER(td.pppoe_username)
                      AND ra.acctstoptime IS NULL
                      AND ra.acctupdatetime IS NOT NULL
                      AND ra.acctupdatetime >= NOW() - ${SESSION_STALE_SQL}
                )`
            ];

            if (identity.role === 'mitra') {
                params.push(identity.region_ids);
                conditions.push(`s.region_id = ANY($${params.length}::uuid[])`);
            }

            const regionFilter = String(args?.region || '').trim();
            if (regionFilter) {
                params.push(`%${regionFilter}%`);
                const idx = params.length;
                conditions.push(`(r.name ILIKE $${idx} OR r.name ILIKE $${idx} OR s.area ILIKE $${idx} OR c.address ILIKE $${idx})`);
            }

            const mitraFilter = String(args?.mitra || '').trim();
            if (mitraFilter) {
                params.push(`%${mitraFilter}%`);
                conditions.push(`m.name ILIKE $${params.length}`);
            }

            const whereClause = `WHERE ${conditions.join(' AND ')}`;
            const fromClause = `
                FROM services s
                JOIN customers c ON s.customer_id::text = c.id
                LEFT JOIN technical_details td ON td.service_id = s.id
                LEFT JOIN packages p ON s.package_id = p.id
                LEFT JOIN regions r ON s.region_id = r.id
                LEFT JOIN mitra m ON r.mitra_id = m.id
            `;

            const countRes = await query(`SELECT COUNT(*) AS total ${fromClause} ${whereClause}`, params);
            const total = parseInt(countRes.rows?.[0]?.total, 10) || 0;

            const listParams = [...params, limit];
            const res = await query(`
                SELECT
                    c.name AS customer_name,
                    c.phone AS customer_phone,
                    s.service_number,
                    s.package_id,
                    p.name AS package_name,
                    td.pppoe_username,
                    td.mac_address,
                    r.name AS region_name,
                    m.name AS mitra_name,
                    (
                        SELECT MAX(ra.acctstoptime)
                        FROM radacct ra
                        WHERE LOWER(ra.username) = LOWER(td.pppoe_username)
                          AND ra.acctstoptime IS NOT NULL
                    ) AS last_seen
                ${fromClause}
                ${whereClause}
                ORDER BY r.name ASC NULLS LAST, c.name ASC
                LIMIT $${listParams.length}
            `, listParams);

            const customers = (res.rows || []).map(row => ({
                customer_name: row.customer_name,
                customer_phone: row.customer_phone || '-',
                service_number: row.service_number || '-',
                package_name: row.package_name || '-',
                pppoe_username: row.pppoe_username || '-',
                region_name: row.region_name || '-',
                mitra_name: row.mitra_name || '-',
                last_seen: row.last_seen ? formatDateId(row.last_seen) : 'belum pernah'
            }));

            return {
                total,
                count: customers.length,
                scope: regionFilter || mitraFilter || 'semua wilayah',
                customers
            };
        }
    },
    {
        name: 'get_onu_signal',
        kind: 'read',
        roles: ['superadmin', 'admin', 'mitra', 'technician'],
        description: 'Cek redaman / daya optik (RX power dBm) ONU satu pelanggan. Sumber berlapis: cache OLT, GenieACS, lalu SNMP OLT langsung. Gunakan untuk pertanyaan seperti "berapa redaman pak Budi".',
        parameters: {
            type: 'object',
            properties: {
                identifier: {
                    type: 'string',
                    description: 'Nama pelanggan, nomor layanan, nomor HP, atau PPPoE username.'
                }
            },
            required: ['identifier']
        },
        async run(ctx, args) {
            const { identity } = ctx;
            const identifier = String(args?.identifier || '').trim();
            if (!identifier) return { error: 'Sebutkan nama pelanggan, nomor layanan, atau PPPoE username.' };
            if (!assertMitraHasRegions(identity)) {
                return { error: 'Akses ditolak: wilayah mitra tidak ditemukan.' };
            }

            const resolved = await resolveCustomerAndRegion(identifier, { identity, limit: 5 });
            if (!resolved?.found) {
                return { found: false, reason: resolved?.error || `Pelanggan "${identifier}" tidak ditemukan.` };
            }

            if (!resolved.customer) {
                return {
                    found: false,
                    disambiguation_required: true,
                    reason: 'Ada beberapa pelanggan yang cocok. Sebutkan nomor layanan atau nama lebih lengkap.',
                    candidates: (resolved.candidates || []).map(c => ({
                        name: c.name,
                        service_number: c.service_number,
                        region_name: c.region_name,
                        pppoe_username: c.pppoe_username
                    }))
                };
            }

            const customer = resolved.customer;
            const pppoeUsername = customer.pppoe_username && customer.pppoe_username !== '-'
                ? customer.pppoe_username
                : null;

            let sessionRow = null;
            if (customer.service_id) {
                try {
                    const sessRes = await query(
                        `SELECT ra.username, ra.framedipaddress, ra.callingstationid, ra.acctstarttime, ra.acctstoptime,
                                ra.acctupdatetime
                         FROM radacct ra
                         WHERE LOWER(ra.username) = LOWER($1)
                         ORDER BY ra.acctstarttime DESC NULLS LAST
                         LIMIT 1`,
                        [pppoeUsername || customer.service_number]
                    );
                    sessionRow = sessRes.rows?.[0] || null;
                } catch (err) {
                    // non fatal
                }
            }

            const techRes = customer.service_id
                ? await query(
                    `SELECT device_serial_number, device_model FROM technical_details WHERE service_id = $1 LIMIT 1`,
                    [customer.service_id]
                )
                : { rows: [] };
            const tech = techRes.rows?.[0] || {};

            const signal = await resolveOnuSignal({
                pppoeUsername,
                macAddress: sessionRow?.callingstationid || customer.mac_address,
                sessionIp: sessionRow?.framedipaddress,
                serialNumber: tech.device_serial_number
            });

            const sessionOnline = Boolean(
                sessionRow && !sessionRow.acctstoptime
            );

            return {
                found: Boolean(signal.found),
                customer_name: customer.name,
                service_number: customer.service_number || '-',
                pppoe_username: pppoeUsername || '-',
                region_name: customer.region_name || '-',
                package_name: customer.package_name || '-',
                online: sessionOnline,
                ip_address: sessionRow?.framedipaddress || null,
                device_model: tech.device_model || '-',
                rx_power: signal.rx_power,
                rx_power_unit: 'dBm',
                quality: signal.quality,
                olt_name: signal.olt_name || null,
                onu_index: signal.onu_index || null,
                source: signal.source || null,
                measured_at: signal.polled_at || null,
                reason: signal.found ? null : signal.reason
            };
        }
    },
    {
        name: 'list_weak_onu_signals',
        kind: 'read',
        roles: ['superadmin', 'admin', 'mitra', 'technician'],
        description: 'Daftar ONU dengan redaman jelek (RX power rendah) dari cache OLT. Filter severity "warning" (< -24 dBm) atau "critical" (< -27 dBm), bisa per OLT atau wilayah. Gunakan untuk pertanyaan seperti "pelanggan mana yang redaman jelek di HSGQ".',
        parameters: {
            type: 'object',
            properties: {
                severity: {
                    type: 'string',
                    description: 'Tingkat keparahan: "critical" (default, < -27 dBm) atau "warning" (< -24 dBm).'
                },
                olt: {
                    type: 'string',
                    description: 'Filter nama OLT (misal "HSGQ", "Hioso").'
                },
                region: {
                    type: 'string',
                    description: 'Filter wilayah/region opsional.'
                },
                limit: {
                    type: 'number',
                    description: 'Maksimal baris yang ditampilkan (default 20, maksimal 50).'
                }
            }
        },
        async run(ctx, args) {
            const { identity } = ctx;
            if (!assertMitraHasRegions(identity)) {
                return { count: 0, total: 0, items: [], note: 'Tidak ada wilayah mitra yang terhubung.' };
            }

            const severity = String(args?.severity || 'critical').toLowerCase() === 'warning' ? 'warning' : 'critical';
            const threshold = severity === 'critical' ? -27 : -24;
            const limit = Math.min(50, Math.max(1, parseInt(args?.limit, 10) || 20));

            let cacheReady = await hasFreshCache();
            if (!cacheReady) {
                await refreshSignalCache();
                cacheReady = await hasFreshCache();
            }

            const params = [threshold];
            const conditions = [
                `c.rx_power IS NOT NULL`,
                `c.rx_power < $1`
            ];

            if (identity.role === 'mitra') {
                params.push(identity.region_ids);
                conditions.push(`s.region_id = ANY($${params.length}::uuid[])`);
            }

            const oltFilter = String(args?.olt || '').trim();
            if (oltFilter) {
                params.push(`%${oltFilter}%`);
                conditions.push(`c.olt_name ILIKE $${params.length}`);
            }

            const regionFilter = String(args?.region || '').trim();
            if (regionFilter) {
                params.push(`%${regionFilter}%`);
                const idx = params.length;
                conditions.push(`(r.name ILIKE $${idx} OR s.area ILIKE $${idx} OR cu.address ILIKE $${idx})`);
            }

            const whereClause = `WHERE ${conditions.join(' AND ')}`;
            const fromClause = `
                FROM olt_signal_cache c
                JOIN technical_details td ON LOWER(td.pppoe_username) = LOWER(c.pppoe_username)
                JOIN services s ON td.service_id = s.id
                JOIN customers cu ON s.customer_id::text = cu.id
                LEFT JOIN regions r ON s.region_id = r.id
                LEFT JOIN mitra m ON r.mitra_id = m.id
            `;

            const countRes = await query(`SELECT COUNT(*) AS total ${fromClause} ${whereClause}`, params);
            const total = parseInt(countRes.rows?.[0]?.total, 10) || 0;

            const listParams = [...params, limit];
            const res = await query(`
                SELECT
                    cu.name AS customer_name,
                    s.service_number,
                    c.pppoe_username,
                    c.rx_power,
                    c.tx_power,
                    c.olt_name,
                    c.onu_index,
                    c.polled_at,
                    r.name AS region_name,
                    m.name AS mitra_name
                ${fromClause}
                ${whereClause}
                ORDER BY c.rx_power ASC
                LIMIT $${listParams.length}
            `, listParams);

            const items = (res.rows || []).map(row => ({
                customer_name: row.customer_name,
                service_number: row.service_number || '-',
                pppoe_username: row.pppoe_username,
                rx_power: normalizeRx(row.rx_power),
                quality: classifyRx(row.rx_power),
                olt_name: row.olt_name || '-',
                onu_index: row.onu_index || null,
                region_name: row.region_name || '-',
                mitra_name: row.mitra_name || '-',
                measured_at: row.polled_at ? formatDateId(row.polled_at) : null
            }));

            return {
                severity,
                threshold_dbm: threshold,
                total,
                count: items.length,
                cache_fresh: cacheReady,
                note: cacheReady ? null : 'Cache sinyal OLT belum tersedia/basi; angka mungkin tidak lengkap.',
                items
            };
        }
    }
];

module.exports = {
    readTools,
    formatDateId
};
