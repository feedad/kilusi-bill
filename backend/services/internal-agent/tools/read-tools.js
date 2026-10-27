const { query } = require('../../../config/database');
const radiusPostgres = require('../../../config/radius-postgres');
const { formatRp } = require('../actions');

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
        description: 'Cari pelanggan berdasarkan nama, nomor HP, nomor layanan (service_number), PPPoE username, atau alamat.',
        parameters: {
            type: 'object',
            properties: {
                q: {
                    type: 'string',
                    description: 'Kata kunci pencarian (nama pelanggan, nomor HP, nomor layanan, PPPoE, atau alamat)'
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
        description: 'Daftar tagihan (invoice) yang belum dibayar (unpaid/overdue/suspended/sent). Bisa difilter berdasarkan nama wilayah/region dan jatuh tempo.',
        parameters: {
            type: 'object',
            properties: {
                region: {
                    type: 'string',
                    description: 'Filter opsional nama wilayah/region/mitra (misal: Cibogo, Kirana, Poncol, PLD)'
                },
                overdue_only: {
                    type: 'boolean',
                    description: 'Jika true, hanya tampilkan yang sudah lewat jatuh tempo'
                },
                limit: {
                    type: 'number',
                    description: 'Maksimal baris yang ditampilkan (default 15, maks 25)'
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
            const conditions = [`i.status IN ('unpaid', 'overdue', 'suspended', 'sent', 'draft')`];

            if (identity.role === 'mitra') {
                params.push(identity.region_ids);
                conditions.push(`s.region_id = ANY($${params.length}::uuid[])`);
            }

            if (args?.region && String(args.region).trim()) {
                params.push(`%${String(args.region).trim()}%`);
                const idx = params.length;
                conditions.push(`(r.name ILIKE $${idx} OR m.name ILIKE $${idx} OR s.area ILIKE $${idx} OR c.address ILIKE $${idx})`);
            }

            if (args?.overdue_only === true) {
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
                total_count: totalCount,
                total_amount: formatRp(totalAmount),
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
        description: 'Daftar pelanggan dengan layanan sedang terisolir (status suspended).',
        parameters: {
            type: 'object',
            properties: {
                region: {
                    type: 'string',
                    description: 'Filter nama wilayah/region opsional'
                }
            }
        },
        async run(ctx, args) {
            const { identity } = ctx;
            if (!assertMitraHasRegions(identity)) {
                return { count: 0, services: [] };
            }

            const params = [];
            const conditions = [`s.status = 'suspended'`];

            if (identity.role === 'mitra') {
                params.push(identity.region_ids);
                conditions.push(`s.region_id = ANY($${params.length}::uuid[])`);
            }

            if (args?.region && String(args.region).trim()) {
                params.push(`%${String(args.region).trim()}%`);
                const idx = params.length;
                conditions.push(`(r.name ILIKE $${idx} OR m.name ILIKE $${idx} OR s.area ILIKE $${idx})`);
            }

            const res = await query(
                `SELECT
                    c.id AS customer_id,
                    c.name AS customer_name,
                    c.phone AS customer_phone,
                    s.service_number,
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
                 LIMIT 25`,
                params
            );

            return {
                count: res.rows?.length || 0,
                services: (res.rows || []).map(row => ({
                    customer_name: row.customer_name,
                    customer_phone: row.customer_phone || '-',
                    service_number: row.service_number || '-',
                    pppoe_username: row.pppoe_username || '-',
                    region_name: row.region_name || '-',
                    mitra_name: row.mitra_name || '-',
                    isolir_date: formatDateId(row.isolir_date)
                }))
            };
        }
    }
];

module.exports = {
    readTools,
    formatDateId
};
