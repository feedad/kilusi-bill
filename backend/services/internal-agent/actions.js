const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../../config/database');
const logger = require('../../config/logger');
const { canExecuteTool } = require('./identity');

const MAX_DAILY_WRITE_ACTIONS = 20;

function formatRp(amount) {
    return 'Rp ' + Math.round(Number(amount || 0)).toLocaleString('id-ID');
}

function generateActionCode() {
    const num = crypto.randomInt(100000, 999999);
    return String(num);
}

function createInternalJwt(identity) {
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    return jwt.sign(
        {
            userId: identity.user_id || 1,
            username: identity.actor_username || 'admin',
            role: identity.actor_role || 'superadmin'
        },
        secret,
        { expiresIn: '2m' }
    );
}

function getInternalApiBaseUrl() {
    const port = process.env.PORT || 3001;
    return `http://127.0.0.1:${port}/api/v1`;
}

async function checkDailyWriteQuota(identity) {
    const res = await query(
        `SELECT COUNT(*)::int AS cnt
         FROM ai_agent_pending_actions
         WHERE phone = $1
           AND status = 'executed'
           AND executed_at >= CURRENT_DATE`,
        [identity.phone]
    );
    const count = res.rows?.[0]?.cnt || 0;
    if (count >= MAX_DAILY_WRITE_ACTIONS) {
        throw new Error(`Batas maksimum aksi tulis harian (${MAX_DAILY_WRITE_ACTIONS} aksi/hari) telah tercapai.`);
    }
}

function buildConfirmationCard(summary, code, previewOnly = false) {
    const lines = [
        'KONFIRMASI TINDAKAN',
        '-------------------',
        summary.trim(),
        '-------------------',
        `Kode Konfirmasi: ${code}`
    ];
    if (previewOnly) {
        lines.push('[MODE PLAYGROUND - PREVIEW SAJA, DATA TIDAK DIUBAH]');
    } else {
        lines.push(`Balas YA atau YA ${code} dalam 10 menit untuk mengeksekusi, atau balas BATAL untuk membatalkan.`);
    }
    return lines.join('\n');
}

async function createPendingAction({ identity, tool, args, summary, previewOnly = false }) {
    if (!canExecuteTool(identity, { name: tool, kind: 'write', roles: [identity.role] })) {
        throw new Error(`Anda tidak memiliki izin untuk menjalankan aksi tulis (${tool}).`);
    }

    await checkDailyWriteQuota(identity);

    if (previewOnly) {
        const previewCode = 'PREVIEW';
        const card = buildConfirmationCard(summary, previewCode, true);
        return {
            status: 'confirmation_required',
            preview: true,
            code: previewCode,
            summary,
            confirmation_card: card
        };
    }

    // Expire old actions and cancel any existing pending action for this phone so "YA" is unambiguous
    await query(
        `UPDATE ai_agent_pending_actions
         SET status = CASE WHEN expires_at <= CURRENT_TIMESTAMP THEN 'expired' ELSE 'cancelled' END
         WHERE phone = $1 AND status = 'pending'`,
        [identity.phone]
    );

    const code = generateActionCode();
    const insertRes = await query(
        `INSERT INTO ai_agent_pending_actions
            (code, phone, member_id, tool, args, summary, status, expires_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'pending', CURRENT_TIMESTAMP + INTERVAL '10 minutes')
         RETURNING id, code, expires_at`,
        [
            code,
            identity.phone,
            identity.member_id || null,
            tool,
            JSON.stringify(args || {}),
            summary
        ]
    );

    const row = insertRes.rows[0];
    const card = buildConfirmationCard(summary, row.code, false);

    return {
        status: 'confirmation_required',
        action_id: row.id,
        code: row.code,
        summary,
        confirmation_card: card
    };
}

function parseConfirmationReply(text) {
    if (!text || typeof text !== 'string') return null;
    const cleaned = text.trim();
    const confirmMatch = cleaned.match(/^(?:ya|oke|setuju|konfirmasi)(?:\s+#?([0-9a-zA-Z]{4,10}))?$/i);
    if (confirmMatch) {
        return {
            type: 'confirm',
            code: confirmMatch[1] ? confirmMatch[1].toUpperCase() : null
        };
    }
    const cancelMatch = cleaned.match(/^(?:batal|tidak|cancel|gagalkan)(?:\s+#?([0-9a-zA-Z]{4,10}))?$/i);
    if (cancelMatch) {
        return {
            type: 'cancel',
            code: cancelMatch[1] ? cancelMatch[1].toUpperCase() : null
        };
    }
    return null;
}

async function executeWriteAction(identity, pendingRow) {
    const tool = pendingRow.tool;
    const args = typeof pendingRow.args === 'string' ? JSON.parse(pendingRow.args) : (pendingRow.args || {});
    const baseUrl = getInternalApiBaseUrl();
    const token = createInternalJwt(identity);
    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    if (tool === 'record_payment') {
        const invoices = Array.isArray(args.invoices) && args.invoices.length > 0
            ? args.invoices
            : [{
                id: args.invoice_id,
                invoice_number: args.invoice_number,
                amount: args.amount
            }];

        const paidResults = [];
        for (const inv of invoices) {
            const noteParts = [];
            if (args.notes) noteParts.push(args.notes);
            noteParts.push(`Dicatat via Asisten WA oleh ${identity.name} (${identity.role})`);

            const payload = {
                invoice_id: inv.id,
                amount: Number(inv.amount),
                payment_method: args.payment_method_key || 'cash',
                payment_date: new Date().toISOString(),
                notes: noteParts.join(' | ')
            };

            const res = await axios.post(`${baseUrl}/billing/payments`, payload, {
                headers,
                timeout: 20000
            });
            paidResults.push({
                invoice_id: inv.id,
                invoice_number: inv.invoice_number,
                amount: Number(inv.amount),
                response: res.data
            });
        }

        const totalPaid = paidResults.reduce((acc, item) => acc + item.amount, 0);
        const invList = paidResults.map(i => i.invoice_number).join(', ');
        return {
            ok: true,
            message: [
                'PEMBAYARAN BERHASIL DICATAT',
                `Pelanggan: ${args.customer_name || '-'} (${args.service_number || '-'})`,
                `Invoice: ${invList}`,
                `Nominal: ${formatRp(totalPaid)}`,
                `Metode: ${args.payment_method_label || args.payment_method_key || 'Tunai'}`,
                `Dicatat oleh: ${identity.name}`
            ].join('\n'),
            data: paidResults
        };
    }

    if (tool === 'resend_invoice') {
        const res = await axios.post(
            `${baseUrl}/billing/invoices/${encodeURIComponent(args.invoice_id)}/resend`,
            {},
            { headers, timeout: 20000 }
        );
        return {
            ok: true,
            message: [
                'TAGIHAN BERHASIL DIKIRIM ULANG',
                `Pelanggan: ${args.customer_name || '-'}`,
                `Invoice: ${args.invoice_number || args.invoice_id}`,
                `Status: ${res.data?.data?.message || 'Terkirim'}`
            ].join('\n'),
            data: res.data
        };
    }

    if (tool === 'update_ticket_status') {
        const noteText = args.note
            ? `${args.note} (oleh ${identity.name} via Asisten WA)`
            : `Status diubah ke ${args.status} oleh ${identity.name} via Asisten WA`;

        const payload = {
            status: args.status,
            resolution_time: noteText
        };
        const res = await axios.put(
            `${baseUrl}/support/tickets/${encodeURIComponent(args.ticket_id)}`,
            payload,
            { headers, timeout: 15000 }
        );
        return {
            ok: true,
            message: [
                'STATUS TIKET DIPERBARUI',
                `Tiket: ${args.ticket_number || '#' + args.ticket_id}`,
                `Pelanggan: ${args.customer_name || '-'}`,
                `Status Baru: ${args.status}`,
                `Catatan: ${noteText}`
            ].join('\n'),
            data: res.data
        };
    }

    if (tool === 'suspend_service') {
        const serviceSuspension = require('../../config/serviceSuspension');
        const reason = args.reason || `Isolir manual via Asisten WA oleh ${identity.name}`;
        const customerObj = {
            id: args.customer_id,
            service_id: args.service_id,
            service_number: args.service_number,
            username: args.customer_name,
            name: args.customer_name,
            phone: args.customer_phone,
            pppoe_username: args.pppoe_username,
            static_ip: args.ip_address_static,
            mac_address: args.mac_address,
            package_id: args.package_id
        };
        const res = await serviceSuspension.suspendCustomerService(customerObj, reason);
        return {
            ok: true,
            message: [
                'LAYANAN BERHASIL DIISOLIR',
                `Pelanggan: ${args.customer_name} (${args.service_number})`,
                `PPPoE: ${args.pppoe_username || '-'}`,
                `Alasan: ${reason}`
            ].join('\n'),
            data: res
        };
    }

    if (tool === 'restore_service') {
        const serviceSuspension = require('../../config/serviceSuspension');
        const reason = args.reason || `Buka isolir manual via Asisten WA oleh ${identity.name}`;
        const res = await serviceSuspension.restoreServiceByServiceId(
            args.service_id,
            {
                name: args.customer_name,
                service_number: args.service_number,
                package_group: args.package_group || 'UPTO-10M'
            },
            reason
        );
        if (res && res.success === false) {
            throw new Error(res.message || 'Gagal membuka isolir layanan');
        }
        return {
            ok: true,
            message: [
                'LAYANAN BERHASIL DIAKTIFKAN KEMBALI',
                `Pelanggan: ${args.customer_name} (${args.service_number})`,
                `PPPoE: ${args.pppoe_username || '-'}`,
                `Alasan: ${reason}`
            ].join('\n'),
            data: res
        };
    }

    throw new Error(`Tool tulis tidak dikenali: ${tool}`);
}

async function logAuditAction({ identity, userMessage, tool, args, resultStatus, resultSummary, latencyMs = 0 }) {
    try {
        await query(
            `INSERT INTO ai_agent_audit_log
                (phone, member_id, member_name, role, user_message, tool, args, result_status, result_summary, tokens_in, tokens_out, latency_ms)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, 0, 0, $10)`,
            [
                identity.phone,
                identity.member_id || null,
                identity.name || null,
                identity.role || null,
                userMessage || '',
                tool || null,
                JSON.stringify(args || {}),
                resultStatus,
                String(resultSummary || '').slice(0, 1000),
                latencyMs
            ]
        );
    } catch (err) {
        logger.warn(`[InternalAgent] Failed writing audit log: ${err.message}`);
    }
}

async function tryHandleConfirmationReply(identity, text) {
    const parsed = parseConfirmationReply(text);
    if (!parsed) return { handled: false };

    const startedAt = Date.now();

    // Mark expired actions first
    await query(
        `UPDATE ai_agent_pending_actions
         SET status = 'expired'
         WHERE phone = $1 AND status = 'pending' AND expires_at <= CURRENT_TIMESTAMP`,
        [identity.phone]
    );

    if (parsed.type === 'cancel') {
        const params = [identity.phone];
        let sql = `
            UPDATE ai_agent_pending_actions
            SET status = 'cancelled', executed_at = CURRENT_TIMESTAMP
            WHERE phone = $1 AND status = 'pending'
        `;
        if (parsed.code) {
            params.push(parsed.code);
            sql += ` AND UPPER(code) = $2`;
        }
        sql += ` RETURNING id, code, tool, summary`;

        const cancelRes = await query(sql, params);
        if (!cancelRes.rows || cancelRes.rows.length === 0) {
            return {
                handled: true,
                status: 'no_pending',
                replyText: 'Tidak ada tindakan tertunda yang aktif untuk dibatalkan.'
            };
        }

        const cancelled = cancelRes.rows[0];
        await logAuditAction({
            identity,
            userMessage: text,
            tool: cancelled.tool,
            args: { code: cancelled.code },
            resultStatus: 'cancelled',
            resultSummary: `Dibatalkan kode ${cancelled.code}`,
            latencyMs: Date.now() - startedAt
        });

        return {
            handled: true,
            status: 'cancelled',
            replyText: `Tindakan dengan kode ${cancelled.code} telah dibatalkan.`
        };
    }

    // Confirm branch
    const pendingRes = await query(
        `SELECT * FROM ai_agent_pending_actions
         WHERE phone = $1 AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP
         ORDER BY created_at DESC`,
        [identity.phone]
    );
    const activeRows = pendingRes.rows || [];

    if (activeRows.length === 0) {
        return {
            handled: true,
            status: 'no_pending',
            replyText: 'Tidak ada tindakan tertunda yang aktif atau kode konfirmasi sudah kedaluwarsa (lebih dari 10 menit). Silakan ulangi perintah Anda.'
        };
    }

    let targetRow = null;
    if (parsed.code) {
        targetRow = activeRows.find(r => String(r.code).toUpperCase() === parsed.code);
        if (!targetRow) {
            return {
                handled: true,
                status: 'invalid_code',
                replyText: `Kode konfirmasi ${parsed.code} tidak ditemukan atau sudah tidak berlaku. Kode aktif saat ini: ${activeRows[0].code}.`
            };
        }
    } else if (activeRows.length === 1) {
        targetRow = activeRows[0];
    } else {
        const codes = activeRows.map(r => r.code).join(', ');
        return {
            handled: true,
            status: 'ambiguous_code',
            replyText: `Terdapat lebih dari satu tindakan tertunda. Silakan balas YA <kode> (pilihan kode: ${codes}).`
        };
    }

    // Verify permission still valid
    const allowed = canExecuteTool(identity, {
        name: targetRow.tool,
        kind: 'write',
        roles: [identity.role]
    });
    if (!allowed) {
        return {
            handled: true,
            status: 'forbidden',
            replyText: 'Izin tulis Anda untuk tindakan ini sudah tidak aktif.'
        };
    }

    try {
        await checkDailyWriteQuota(identity);
    } catch (quotaErr) {
        return {
            handled: true,
            status: 'quota_exceeded',
            replyText: quotaErr.message
        };
    }

    // Atomic claim
    const claimRes = await query(
        `UPDATE ai_agent_pending_actions
         SET status = 'executed', executed_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND phone = $2 AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP
         RETURNING *`,
        [targetRow.id, identity.phone]
    );

    if (!claimRes.rows || claimRes.rows.length === 0) {
        return {
            handled: true,
            status: 'already_processed',
            replyText: 'Tindakan ini sudah diproses atau baru saja kedaluwarsa.'
        };
    }

    const claimed = claimRes.rows[0];
    try {
        const execResult = await executeWriteAction(identity, claimed);
        await query(
            `UPDATE ai_agent_pending_actions SET result = $1::jsonb WHERE id = $2`,
            [JSON.stringify({ ok: true, message: execResult.message }), claimed.id]
        );
        await logAuditAction({
            identity,
            userMessage: text,
            tool: claimed.tool,
            args: claimed.args,
            resultStatus: 'executed',
            resultSummary: execResult.message,
            latencyMs: Date.now() - startedAt
        });
        return {
            handled: true,
            status: 'executed',
            tool: claimed.tool,
            replyText: execResult.message
        };
    } catch (execErr) {
        const errMsg = execErr?.response?.data?.message || execErr?.response?.data?.error || execErr.message || 'Gagal mengeksekusi tindakan';
        await query(
            `UPDATE ai_agent_pending_actions SET status = 'failed', result = $1::jsonb WHERE id = $2`,
            [JSON.stringify({ ok: false, error: errMsg }), claimed.id]
        );
        await logAuditAction({
            identity,
            userMessage: text,
            tool: claimed.tool,
            args: claimed.args,
            resultStatus: 'failed',
            resultSummary: errMsg,
            latencyMs: Date.now() - startedAt
        });
        return {
            handled: true,
            status: 'failed',
            tool: claimed.tool,
            replyText: `Gagal mengeksekusi tindakan (${claimed.code}): ${errMsg}`
        };
    }
}

module.exports = {
    formatRp,
    createPendingAction,
    parseConfirmationReply,
    tryHandleConfirmationReply,
    executeWriteAction
};
