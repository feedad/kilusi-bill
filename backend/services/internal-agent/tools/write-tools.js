const { query } = require('../../../config/database');
const { getSetting } = require('../../../config/settingsManager');
const { createPendingAction, formatRp } = require('../actions');
const { formatDateId } = require('./read-tools');

async function loadPaymentSettings() {
    let ps = getSetting('payment_settings', null);
    if (!ps || typeof ps !== 'object') {
        try {
            const res = await query(`SELECT value FROM app_config WHERE key = 'payment_settings' LIMIT 1`);
            if (res.rows?.[0]?.value) {
                ps = typeof res.rows[0].value === 'string'
                    ? JSON.parse(res.rows[0].value)
                    : res.rows[0].value;
            }
        } catch (_) {}
    }
    return ps || { bank_accounts: [], ewallets: [] };
}

async function resolvePaymentMethod(rawMethod, customerMitraId = null) {
    const text = String(rawMethod || 'tunai').trim().toLowerCase();
    if (!text || text === 'tunai' || text === 'cash') {
        return { key: 'cash', label: 'TUNAI (Cash)' };
    }

    const ps = await loadPaymentSettings();
    const banks = Array.isArray(ps.bank_accounts) ? ps.bank_accounts.filter(b => b.isActive !== false) : [];
    const ewallets = Array.isArray(ps.ewallets) ? ps.ewallets.filter(e => e.isActive !== false) : [];

    // Direct key match (bank_xxx / ewallet_xxx)
    if (text.startsWith('bank_')) {
        const id = text.slice(5);
        const found = banks.find(b => String(b.id) === id);
        if (found) {
            return {
                key: `bank_${found.id}`,
                label: `${found.bankName} - ${found.accountNumber} (${found.accountName})`
            };
        }
    }
    if (text.startsWith('ewallet_')) {
        const id = text.slice(8);
        const found = ewallets.find(e => String(e.id) === id);
        if (found) {
            return {
                key: `ewallet_${found.id}`,
                label: `${found.provider} - ${found.phoneNumber} (${found.accountName})`
            };
        }
    }

    const scoreCandidate = (item) => {
        if (!customerMitraId) {
            return item.is_company ? 2 : 1;
        }
        const mIds = Array.isArray(item.mitra_ids) ? item.mitra_ids.map(String) : [];
        if (item.mitra_id && String(item.mitra_id) === String(customerMitraId)) return 3;
        if (mIds.includes(String(customerMitraId))) return 3;
        if (item.is_company) return 2;
        return 1;
    };

    const matchingBanks = banks.filter(b => {
        const name = String(b.bankName || '').toLowerCase();
        const accName = String(b.accountName || '').toLowerCase();
        const accNum = String(b.accountNumber || '').toLowerCase();
        return name.includes(text) || text.includes(name) || accName.includes(text) || accNum === text;
    });

    if (matchingBanks.length > 0) {
        matchingBanks.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
        const chosen = matchingBanks[0];
        return {
            key: `bank_${chosen.id}`,
            label: `${chosen.bankName} - ${chosen.accountNumber} (${chosen.accountName})`
        };
    }

    const matchingEwallets = ewallets.filter(e => {
        const prov = String(e.provider || '').toLowerCase();
        const accName = String(e.accountName || '').toLowerCase();
        return prov.includes(text) || text.includes(prov) || accName.includes(text);
    });

    if (matchingEwallets.length > 0) {
        matchingEwallets.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
        const chosen = matchingEwallets[0];
        return {
            key: `ewallet_${chosen.id}`,
            label: `${chosen.provider} - ${chosen.phoneNumber} (${chosen.accountName})`
        };
    }

    // If user said "transfer" generically and there is a matching mitra bank or default bank
    if (text === 'transfer' || text === 'tf' || text === 'bank') {
        if (banks.length > 0) {
            const sorted = [...banks].sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
            const chosen = sorted[0];
            return {
                key: `bank_${chosen.id}`,
                label: `${chosen.bankName} - ${chosen.accountNumber} (${chosen.accountName})`
            };
        }
    }

    const availableLabels = [
        'TUNAI',
        ...banks.map(b => `${b.bankName} (${b.accountName})`),
        ...ewallets.map(e => `${e.provider} (${e.accountName})`)
    ];
    return {
        error: `Metode pembayaran "${rawMethod}" tidak ditemukan di Pengaturan Pembayaran. Pilihan tersedia: ${availableLabels.join(', ')}.`
    };
}

const writeTools = [
    {
        name: 'record_payment',
        kind: 'write',
        roles: ['superadmin', 'admin', 'mitra', 'technician'],
        description: 'Siapkan pencatatan pembayaran tagihan (invoice) pelanggan. Bisa menggunakan nomor invoice ATAU nama/nomor layanan pelanggan. Wajib konfirmasi YA sebelum tersimpan.',
        parameters: {
            type: 'object',
            properties: {
                customer_query: {
                    type: 'string',
                    description: 'Nama pelanggan, nomor HP, atau nomor layanan (misal: "ibu ade", "24000010601")'
                },
                invoice_number: {
                    type: 'string',
                    description: 'Nomor invoice spesifik jika diketahui (misal: "INV-202605-0001")'
                },
                amount: {
                    type: 'number',
                    description: 'Nominal pembayaran dalam Rupiah. Kosongkan jika melunasi penuh sesuai tagihan.'
                },
                method: {
                    type: 'string',
                    description: 'Metode pembayaran: "tunai"/"cash", atau nama bank/ewallet ("bca", "bri", "ocbc", "dana", "gopay")'
                },
                notes: {
                    type: 'string',
                    description: 'Catatan tambahan pembayaran (opsional)'
                }
            },
            required: ['method']
        },
        async run(ctx, args) {
            const { identity, previewOnly } = ctx;
            const invNumber = String(args?.invoice_number || '').trim();
            const custQuery = String(args?.customer_query || '').trim();
            const rawMethod = String(args?.method || 'tunai').trim();

            if (!invNumber && !custQuery) {
                return { error: 'Mohon sebutkan nama pelanggan, nomor layanan, atau nomor invoice yang akan dilunaskan.' };
            }

            if (identity.role === 'mitra' && (!Array.isArray(identity.region_ids) || identity.region_ids.length === 0)) {
                return { error: 'Akses ditolak: wilayah mitra tidak ditemukan.' };
            }

            const params = [];
            const conditions = [`i.status IN ('unpaid', 'overdue', 'suspended', 'sent', 'draft')`];

            if (identity.role === 'mitra') {
                params.push(identity.region_ids);
                conditions.push(`s.region_id = ANY($${params.length}::uuid[])`);
            }

            if (invNumber) {
                params.push(invNumber);
                conditions.push(`UPPER(i.invoice_number) = UPPER($${params.length})`);
            } else {
                params.push(custQuery);
                const exactIdx = params.length;
                params.push(`%${custQuery}%`);
                const likeIdx = params.length;
                conditions.push(`(
                    s.service_number = $${exactIdx}
                    OR c.id = $${exactIdx}
                    OR c.phone = $${exactIdx}
                    OR UPPER(i.invoice_number) = UPPER($${exactIdx})
                    OR c.name ILIKE $${likeIdx}
                    OR td.pppoe_username ILIKE $${likeIdx}
                )`);
            }

            const res = await query(
                `SELECT
                    i.id AS invoice_id,
                    i.invoice_number,
                    i.amount,
                    i.status AS invoice_status,
                    i.due_date,
                    c.id AS customer_id,
                    c.name AS customer_name,
                    c.phone AS customer_phone,
                    COALESCE(i.service_number, s.service_number) AS service_number,
                    s.id AS service_id,
                    s.status AS service_status,
                    r.name AS region_name,
                    r.mitra_id,
                    m.name AS mitra_name
                 FROM invoices i
                 JOIN customers c ON i.customer_id = c.id
                 LEFT JOIN services s ON (s.service_number = i.service_number OR (i.service_number IS NULL AND s.customer_id = c.id))
                 LEFT JOIN technical_details td ON td.service_id = s.id
                 LEFT JOIN regions r ON s.region_id = r.id
                 LEFT JOIN mitra m ON r.mitra_id = m.id
                 WHERE ${conditions.join(' AND ')}
                 ORDER BY i.due_date ASC, i.id ASC
                 LIMIT 20`,
                params
            );

            const rows = res.rows || [];
            if (rows.length === 0) {
                return {
                    found: false,
                    error: `Tidak ditemukan tagihan belum lunas untuk "${invNumber || custQuery}" di wilayah akses Anda.`
                };
            }

            // Group by customer_id + service_number to detect if multiple distinct customers matched
            const customerGroups = new Map();
            for (const row of rows) {
                const key = `${row.customer_id}::${row.service_number || ''}`;
                if (!customerGroups.has(key)) {
                    customerGroups.set(key, {
                        customer_id: row.customer_id,
                        customer_name: row.customer_name,
                        service_number: row.service_number || '-',
                        region_name: row.region_name || '-',
                        mitra_id: row.mitra_id || null,
                        invoices: []
                    });
                }
                customerGroups.get(key).invoices.push(row);
            }

            if (customerGroups.size > 1) {
                const candidates = Array.from(customerGroups.values()).map(g => ({
                    customer_name: g.customer_name,
                    service_number: g.service_number,
                    region_name: g.region_name,
                    unpaid_invoices: g.invoices.map(i => ({
                        invoice_number: i.invoice_number,
                        amount: formatRp(i.amount),
                        due_date: formatDateId(i.due_date)
                    }))
                }));
                return {
                    status: 'disambiguation_required',
                    message: `Ditemukan ${candidates.length} pelanggan berbeda yang cocok dengan "${custQuery}". Mohon sebutkan nama lengkap, nomor layanan, atau nomor invoice yang dimaksud:`,
                    candidates
                };
            }

            const targetGroup = Array.from(customerGroups.values())[0];
            const methodResolved = await resolvePaymentMethod(rawMethod, targetGroup.mitra_id);
            if (methodResolved.error) {
                return { error: methodResolved.error };
            }

            let targetInvoices = targetGroup.invoices;
            if (args?.amount && targetInvoices.length > 1) {
                // If user specified an exact amount matching one invoice, pick that earliest invoice
                const exactMatch = targetInvoices.find(i => Number(i.amount) === Number(args.amount));
                if (exactMatch) {
                    targetInvoices = [exactMatch];
                } else {
                    targetInvoices = [targetInvoices[0]];
                }
            }

            const invoicePayloads = targetInvoices.map(inv => ({
                id: inv.invoice_id,
                invoice_number: inv.invoice_number,
                amount: (targetInvoices.length === 1 && args?.amount) ? Number(args.amount) : Number(inv.amount),
                due_date: formatDateId(inv.due_date)
            }));

            const totalAmount = invoicePayloads.reduce((sum, i) => sum + Number(i.amount), 0);
            const invText = invoicePayloads.map(i => `${i.invoice_number} (${formatRp(i.amount)}, JT ${i.due_date})`).join(', ');

            const summary = [
                'Aksi: Catat Pembayaran Tagihan (Lunas)',
                `Pelanggan: ${targetGroup.customer_name}`,
                `No. Layanan: ${targetGroup.service_number}`,
                `Wilayah: ${targetGroup.region_name}`,
                `Invoice: ${invText}`,
                `Total Bayar: ${formatRp(totalAmount)}`,
                `Metode: ${methodResolved.label}`,
                args?.notes ? `Catatan: ${args.notes}` : null
            ].filter(Boolean).join('\n');

            const pending = await createPendingAction({
                identity,
                tool: 'record_payment',
                args: {
                    customer_id: targetGroup.customer_id,
                    customer_name: targetGroup.customer_name,
                    service_number: targetGroup.service_number,
                    invoice_id: invoicePayloads[0].id,
                    invoice_number: invoicePayloads[0].invoice_number,
                    amount: totalAmount,
                    invoices: invoicePayloads,
                    payment_method_key: methodResolved.key,
                    payment_method_label: methodResolved.label,
                    notes: args?.notes || ''
                },
                summary,
                previewOnly
            });

            ctx.createdPendingAction = pending;
            return pending;
        }
    },
    {
        name: 'resend_invoice',
        kind: 'write',
        roles: ['superadmin', 'admin', 'mitra'],
        description: 'Kirim ulang notifikasi WhatsApp tagihan (invoice) ke pelanggan. Wajib konfirmasi YA.',
        parameters: {
            type: 'object',
            properties: {
                invoice_number: {
                    type: 'string',
                    description: 'Nomor invoice jika diketahui'
                },
                customer_query: {
                    type: 'string',
                    description: 'Nama pelanggan atau nomor layanan jika nomor invoice tidak diketahui'
                }
            }
        },
        async run(ctx, args) {
            const { identity, previewOnly } = ctx;
            const invNumber = String(args?.invoice_number || '').trim();
            const custQuery = String(args?.customer_query || '').trim();
            if (!invNumber && !custQuery) {
                return { error: 'Sebutkan nomor invoice atau nama/nomor layanan pelanggan.' };
            }

            if (identity.role === 'mitra' && (!Array.isArray(identity.region_ids) || identity.region_ids.length === 0)) {
                return { error: 'Akses ditolak: wilayah mitra tidak ditemukan.' };
            }

            const params = [];
            const conditions = [`i.status IN ('unpaid', 'overdue', 'suspended', 'sent', 'draft')`];
            if (identity.role === 'mitra') {
                params.push(identity.region_ids);
                conditions.push(`s.region_id = ANY($${params.length}::uuid[])`);
            }

            if (invNumber) {
                params.push(invNumber);
                conditions.push(`UPPER(i.invoice_number) = UPPER($${params.length})`);
            } else {
                params.push(custQuery);
                const exactIdx = params.length;
                params.push(`%${custQuery}%`);
                const likeIdx = params.length;
                conditions.push(`(s.service_number = $${exactIdx} OR c.phone = $${exactIdx} OR c.name ILIKE $${likeIdx})`);
            }

            const res = await query(
                `SELECT i.id, i.invoice_number, i.amount, i.due_date, c.name AS customer_name, c.phone AS customer_phone, COALESCE(i.service_number, s.service_number) AS service_number
                 FROM invoices i
                 JOIN customers c ON i.customer_id = c.id
                 LEFT JOIN services s ON (s.service_number = i.service_number OR (i.service_number IS NULL AND s.customer_id = c.id))
                 WHERE ${conditions.join(' AND ')}
                 ORDER BY i.due_date DESC
                 LIMIT 5`,
                params
            );

            if (!res.rows || res.rows.length === 0) {
                return { error: `Invoice aktif untuk "${invNumber || custQuery}" tidak ditemukan.` };
            }

            if (res.rows.length > 1 && !invNumber) {
                const uniqueCustomers = new Set(res.rows.map(r => r.customer_name));
                if (uniqueCustomers.size > 1) {
                    return {
                        status: 'disambiguation_required',
                        message: 'Ditemukan beberapa pelanggan. Mohon sebutkan nomor invoice atau nomor layanan spesifik:',
                        candidates: res.rows.map(r => ({
                            invoice_number: r.invoice_number,
                            customer_name: r.customer_name,
                            service_number: r.service_number,
                            amount: formatRp(r.amount)
                        }))
                    };
                }
            }

            const inv = res.rows[0];
            const summary = [
                'Aksi: Kirim Ulang Notifikasi Tagihan ke WA Pelanggan',
                `Pelanggan: ${inv.customer_name} (${inv.customer_phone || '-'})`,
                `No. Layanan: ${inv.service_number || '-'}`,
                `Invoice: ${inv.invoice_number}`,
                `Nominal: ${formatRp(inv.amount)} (JT ${formatDateId(inv.due_date)})`
            ].join('\n');

            const pending = await createPendingAction({
                identity,
                tool: 'resend_invoice',
                args: {
                    invoice_id: inv.id,
                    invoice_number: inv.invoice_number,
                    customer_name: inv.customer_name,
                    service_number: inv.service_number
                },
                summary,
                previewOnly
            });

            ctx.createdPendingAction = pending;
            return pending;
        }
    },
    {
        name: 'update_ticket_status',
        kind: 'write',
        roles: ['superadmin', 'admin', 'mitra', 'technician'],
        description: 'Ubah status tiket support/gangguan (open, in_progress, pending, resolved, closed) beserta catatan penyelesaian. Wajib konfirmasi YA.',
        parameters: {
            type: 'object',
            properties: {
                ticket_number: {
                    type: 'string',
                    description: 'Nomor tiket atau ID tiket'
                },
                status: {
                    type: 'string',
                    enum: ['open', 'in_progress', 'pending', 'resolved', 'closed'],
                    description: 'Status baru tiket'
                },
                note: {
                    type: 'string',
                    description: 'Catatan progres atau penyelesaian tiket'
                }
            },
            required: ['ticket_number', 'status']
        },
        async run(ctx, args) {
            const { identity, previewOnly } = ctx;
            const rawNum = String(args?.ticket_number || '').trim().replace(/^#/, '');
            const newStatus = String(args?.status || '').trim().toLowerCase();
            const validStatuses = ['open', 'in_progress', 'pending', 'resolved', 'closed'];

            if (!rawNum) return { error: 'Nomor tiket wajib diisi.' };
            if (!validStatuses.includes(newStatus)) {
                return { error: `Status tidak valid. Pilih salah satu: ${validStatuses.join(', ')}` };
            }

            const params = [rawNum];
            const conditions = [`(UPPER(COALESCE(st.ticket_number, '')) = UPPER($1) OR st.id::text = $1)`];

            if (identity.role === 'technician') {
                params.push(identity.tech_user_id || -1);
                const idIdx = params.length;
                params.push(identity.name || '');
                const nameIdx = params.length;
                conditions.push(`(st.assigned_to_user = $${idIdx} OR LOWER(COALESCE(st.assigned_to, '')) = LOWER($${nameIdx}))`);
            } else if (identity.role === 'mitra') {
                if (!Array.isArray(identity.region_ids) || identity.region_ids.length === 0) {
                    return { error: 'Akses ditolak: wilayah mitra tidak ditemukan.' };
                }
                params.push(identity.region_ids);
                conditions.push(`s.region_id = ANY($${params.length}::uuid[])`);
            }

            const res = await query(
                `SELECT st.id, st.ticket_number, st.customer_name, st.subject, st.status
                 FROM support_tickets st
                 LEFT JOIN services s ON s.customer_id = st.customer_id
                 WHERE ${conditions.join(' AND ')}
                 LIMIT 1`,
                params
            );

            if (!res.rows || res.rows.length === 0) {
                return { error: `Tiket "${rawNum}" tidak ditemukan atau di luar cakupan tugas Anda.` };
            }

            const ticket = res.rows[0];
            const summary = [
                'Aksi: Perbarui Status Tiket Gangguan',
                `Tiket: ${ticket.ticket_number || '#' + ticket.id}`,
                `Pelanggan: ${ticket.customer_name || '-'}`,
                `Subjek: ${ticket.subject}`,
                `Perubahan Status: ${ticket.status} -> ${newStatus}`,
                args?.note ? `Catatan: ${args.note}` : null
            ].filter(Boolean).join('\n');

            const pending = await createPendingAction({
                identity,
                tool: 'update_ticket_status',
                args: {
                    ticket_id: ticket.id,
                    ticket_number: ticket.ticket_number || `#${ticket.id}`,
                    customer_name: ticket.customer_name,
                    status: newStatus,
                    note: args?.note || ''
                },
                summary,
                previewOnly
            });

            ctx.createdPendingAction = pending;
            return pending;
        }
    },
    {
        name: 'suspend_service',
        kind: 'write',
        roles: ['superadmin', 'admin', 'mitra'],
        description: 'Isolir (suspend) layanan internet pelanggan secara manual. Mengubah grup RADIUS ke ISOLIR dan memutus sesi aktif (CoA). Wajib konfirmasi YA.',
        parameters: {
            type: 'object',
            properties: {
                service_number: {
                    type: 'string',
                    description: 'Nomor layanan pelanggan jika diketahui'
                },
                customer_query: {
                    type: 'string',
                    description: 'Nama pelanggan, PPPoE username, atau nomor HP jika nomor layanan tidak diketahui'
                },
                reason: {
                    type: 'string',
                    description: 'Alasan isolir layanan'
                }
            }
        },
        async run(ctx, args) {
            const { identity, previewOnly } = ctx;
            const target = String(args?.service_number || args?.customer_query || '').trim();
            if (!target) return { error: 'Nomor layanan atau nama pelanggan wajib diisi.' };

            if (identity.role === 'mitra' && (!Array.isArray(identity.region_ids) || identity.region_ids.length === 0)) {
                return { error: 'Akses ditolak: wilayah mitra tidak ditemukan.' };
            }

            const params = [target, `%${target}%`];
            let scopeClause = '';
            if (identity.role === 'mitra') {
                params.push(identity.region_ids);
                scopeClause = `AND s.region_id = ANY($${params.length}::uuid[])`;
            }

            const res = await query(
                `SELECT
                    c.id AS customer_id,
                    c.name AS customer_name,
                    c.phone AS customer_phone,
                    s.id AS service_id,
                    s.service_number,
                    s.status AS service_status,
                    s.package_id,
                    td.pppoe_username,
                    td.ip_address_static,
                    td.mac_address,
                    r.name AS region_name
                 FROM services s
                 JOIN customers c ON s.customer_id = c.id
                 LEFT JOIN technical_details td ON td.service_id = s.id
                 LEFT JOIN regions r ON s.region_id = r.id
                 WHERE (
                     s.service_number = $1
                     OR LOWER(COALESCE(td.pppoe_username, '')) = LOWER($1)
                     OR c.phone = $1
                     OR c.name ILIKE $2
                 )
                 ${scopeClause}
                 ORDER BY (s.service_number = $1) DESC, c.name ASC
                 LIMIT 5`,
                params
            );

            if (!res.rows || res.rows.length === 0) {
                return { error: `Layanan pelanggan "${target}" tidak ditemukan.` };
            }
            if (res.rows.length > 1 && res.rows[0].service_number !== target) {
                return {
                    status: 'disambiguation_required',
                    message: 'Ditemukan beberapa layanan pelanggan. Mohon sebutkan nomor layanan yang spesifik:',
                    candidates: res.rows.map(r => ({
                        customer_name: r.customer_name,
                        service_number: r.service_number,
                        pppoe_username: r.pppoe_username || '-',
                        region_name: r.region_name || '-',
                        status: r.service_status
                    }))
                };
            }

            const svc = res.rows[0];
            const reason = String(args?.reason || `Isolir manual via Asisten WA oleh ${identity.name}`).trim();

            const summary = [
                'Aksi: Isolir (Suspend) Layanan Pelanggan',
                `Pelanggan: ${svc.customer_name}`,
                `No. Layanan: ${svc.service_number}`,
                `PPPoE: ${svc.pppoe_username || '-'}`,
                `Wilayah: ${svc.region_name || '-'}`,
                `Status Saat Ini: ${svc.service_status}`,
                `Alasan: ${reason}`
            ].join('\n');

            const pending = await createPendingAction({
                identity,
                tool: 'suspend_service',
                args: {
                    customer_id: svc.customer_id,
                    customer_name: svc.customer_name,
                    customer_phone: svc.customer_phone,
                    service_id: svc.service_id,
                    service_number: svc.service_number,
                    pppoe_username: svc.pppoe_username,
                    ip_address_static: svc.ip_address_static,
                    mac_address: svc.mac_address,
                    package_id: svc.package_id,
                    reason
                },
                summary,
                previewOnly
            });

            ctx.createdPendingAction = pending;
            return pending;
        }
    },
    {
        name: 'restore_service',
        kind: 'write',
        roles: ['superadmin', 'admin', 'mitra'],
        description: 'Buka isolir (restore/aktifkan kembali) layanan internet pelanggan yang sedang terisolir. Wajib konfirmasi YA.',
        parameters: {
            type: 'object',
            properties: {
                service_number: {
                    type: 'string',
                    description: 'Nomor layanan pelanggan jika diketahui'
                },
                customer_query: {
                    type: 'string',
                    description: 'Nama pelanggan, PPPoE username, atau nomor HP jika nomor layanan tidak diketahui'
                },
                reason: {
                    type: 'string',
                    description: 'Alasan buka isolir'
                }
            }
        },
        async run(ctx, args) {
            const { identity, previewOnly } = ctx;
            const target = String(args?.service_number || args?.customer_query || '').trim();
            if (!target) return { error: 'Nomor layanan atau nama pelanggan wajib diisi.' };

            if (identity.role === 'mitra' && (!Array.isArray(identity.region_ids) || identity.region_ids.length === 0)) {
                return { error: 'Akses ditolak: wilayah mitra tidak ditemukan.' };
            }

            const params = [target, `%${target}%`];
            let scopeClause = '';
            if (identity.role === 'mitra') {
                params.push(identity.region_ids);
                scopeClause = `AND s.region_id = ANY($${params.length}::uuid[])`;
            }

            const res = await query(
                `SELECT
                    c.id AS customer_id,
                    c.name AS customer_name,
                    s.id AS service_id,
                    s.service_number,
                    s.status AS service_status,
                    td.pppoe_username,
                    COALESCE(p."group", p.pppoe_profile, 'UPTO-10M') AS package_group,
                    r.name AS region_name
                 FROM services s
                 JOIN customers c ON s.customer_id = c.id
                 LEFT JOIN technical_details td ON td.service_id = s.id
                 LEFT JOIN packages p ON s.package_id = p.id
                 LEFT JOIN regions r ON s.region_id = r.id
                 WHERE (
                     s.service_number = $1
                     OR LOWER(COALESCE(td.pppoe_username, '')) = LOWER($1)
                     OR c.phone = $1
                     OR c.name ILIKE $2
                 )
                 ${scopeClause}
                 ORDER BY (s.service_number = $1) DESC, (s.status = 'suspended') DESC, c.name ASC
                 LIMIT 5`,
                params
            );

            if (!res.rows || res.rows.length === 0) {
                return { error: `Layanan pelanggan "${target}" tidak ditemukan.` };
            }
            if (res.rows.length > 1 && res.rows[0].service_number !== target) {
                return {
                    status: 'disambiguation_required',
                    message: 'Ditemukan beberapa layanan pelanggan. Mohon sebutkan nomor layanan yang spesifik:',
                    candidates: res.rows.map(r => ({
                        customer_name: r.customer_name,
                        service_number: r.service_number,
                        pppoe_username: r.pppoe_username || '-',
                        region_name: r.region_name || '-',
                        status: r.service_status
                    }))
                };
            }

            const svc = res.rows[0];
            const reason = String(args?.reason || `Buka isolir manual via Asisten WA oleh ${identity.name}`).trim();

            const summary = [
                'Aksi: Buka Isolir (Restore) Layanan Pelanggan',
                `Pelanggan: ${svc.customer_name}`,
                `No. Layanan: ${svc.service_number}`,
                `PPPoE: ${svc.pppoe_username || '-'}`,
                `Grup Paket: ${svc.package_group}`,
                `Wilayah: ${svc.region_name || '-'}`,
                `Status Saat Ini: ${svc.service_status}`,
                `Alasan: ${reason}`
            ].join('\n');

            const pending = await createPendingAction({
                identity,
                tool: 'restore_service',
                args: {
                    customer_id: svc.customer_id,
                    customer_name: svc.customer_name,
                    service_id: svc.service_id,
                    service_number: svc.service_number,
                    pppoe_username: svc.pppoe_username,
                    package_group: svc.package_group,
                    reason
                },
                summary,
                previewOnly
            });

            ctx.createdPendingAction = pending;
            return pending;
        }
    }
];

module.exports = {
    writeTools,
    resolvePaymentMethod
};
