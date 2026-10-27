const { query } = require('../../config/database');
const logger = require('../../config/logger');
const {
    getAgentConfig,
    getDailyTokenUsage,
    addDailyTokenUsage,
    chatCompletion
} = require('./llm-client');
const {
    resolveIdentityByPhone,
    resolveIdentityByMemberId
} = require('./identity');
const {
    getToolsForIdentity,
    toOpenAiToolsSchema,
    truncateToolOutput,
    executeToolCall
} = require('./tools');
const { tryHandleConfirmationReply } = require('./actions');

const MAX_TOOL_ITERATIONS = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_MESSAGES = 15;
const rateLimitMap = new Map();

const LEGACY_BYPASS_PREFIXES = [
    'setheader ',
    'setfooter ',
    'setadmin ',
    'settechnician ',
    'setgenieacs ',
    'setmikrotik ',
    'otp '
];

function checkRateLimit(phone) {
    const now = Date.now();
    const list = (rateLimitMap.get(phone) || []).filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    if (list.length >= RATE_LIMIT_MAX_MESSAGES) {
        rateLimitMap.set(phone, list);
        return false;
    }
    list.push(now);
    rateLimitMap.set(phone, list);
    return true;
}

async function getSessionMessages(phone) {
    try {
        const res = await query(
            `SELECT messages
             FROM ai_agent_conversations
             WHERE phone = $1
               AND updated_at >= NOW() - INTERVAL '30 minutes'
             LIMIT 1`,
            [phone]
        );
        const msgs = res.rows?.[0]?.messages;
        if (Array.isArray(msgs)) {
            return msgs.slice(-8);
        }
    } catch (err) {
        logger.warn(`[InternalAgent] Failed reading session for ${phone}: ${err.message}`);
    }
    return [];
}

async function appendSessionExchange(phone, memberId, userText, assistantText) {
    try {
        const current = await getSessionMessages(phone);
        const updated = [
            ...current,
            { role: 'user', content: String(userText || '').slice(0, 600) },
            { role: 'assistant', content: String(assistantText || '').slice(0, 1200) }
        ].slice(-10);

        await query(
            `INSERT INTO ai_agent_conversations (phone, messages, updated_at)
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (phone)
             DO UPDATE SET messages = EXCLUDED.messages, updated_at = NOW()`,
            [phone, JSON.stringify(updated)]
        );
    } catch (err) {
        logger.warn(`[InternalAgent] Failed saving session for ${phone}: ${err.message}`);
    }
}

async function clearSession(phone) {
    try {
        await query(`DELETE FROM ai_agent_conversations WHERE phone = $1`, [phone]);
    } catch (err) {
        logger.warn(`[InternalAgent] Failed clearing session for ${phone}: ${err.message}`);
    }
}

function buildSystemPrompt(identity) {
    const roleLabelMap = {
        superadmin: 'Superadmin (Akses Penuh)',
        admin: 'Admin Operasional',
        mitra: `Mitra Wilayah (${(identity.region_names || []).join(', ') || 'Tidak ada wilayah'})`,
        technician: 'Teknisi Lapangan'
    };
    const roleDesc = roleLabelMap[identity.role] || identity.role;
    const writeStatus = identity.can_write
        ? `AKTIF (Tools tulis diizinkan: ${(identity.allowed_write_tools || []).join(', ') || 'tidak ada'})`
        : 'NONAKTIF (Hanya Baca / Read-Only)';

    const scopeRules = [];
    if (identity.role === 'mitra') {
        scopeRules.push(`- Anda melayani Mitra "${identity.name}" yang HANYA membawahi wilayah: ${(identity.region_names || []).join(', ') || '-'}. Semua pencarian pelanggan, tagihan, dan laporan otomatis dibatasi ke wilayah tersebut.`);
    } else if (identity.role === 'technician') {
        scopeRules.push(`- Anda melayani Teknisi "${identity.name}". Fokus pada pengecekan teknis pelanggan, PPPoE/RADIUS, OLT/NAS, dan tiket gangguan milik teknisi ini. Jangan tampilkan laporan omzet keuangan perusahaan.`);
    }

    return [
        'Anda adalah Asisten Operasional Internal Kilusi Bill di WhatsApp.',
        `Identitas Pengirim: ${identity.name} | Peran: ${roleDesc} | Izin Tulis: ${writeStatus}.`,
        ...scopeRules,
        'Aturan Utama:',
        '1. Jawab dalam Bahasa Indonesia yang singkat, jelas, dan rapi untuk layar WhatsApp.',
        '2. JANGAN PERNAH mengarang data pelanggan, tagihan, nomor layanan, status koneksi, atau perangkat. Gunakan tool yang tersedia untuk mengambil data asli dari database.',
        '3. Untuk aksi perubahan data (catat pembayaran lunas, kirim ulang invoice, ubah status tiket, isolir, buka isolir), panggil tool write yang sesuai. Setiap aksi tulis wajib melalui mekanisme kode konfirmasi YA <KODE>.',
        '4. Jika tool mengembalikan beberapa kandidat pelanggan (disambiguation_required), tampilkan daftar kandidat tersebut dan minta pengirim menyebutkan nomor layanan atau nomor invoice yang dimaksud.',
        '5. Jangan pernah menyatakan pembayaran atau perubahan telah berhasil disimpan ke database sebelum pengirim mengonfirmasi dengan YA <KODE>.'
    ].join('\n');
}

async function logAuditEntry({ identity, userMessage, toolName, toolArgs, status, resultSummary, tokensUsed }) {
    try {
        await query(
            `INSERT INTO ai_agent_audit_log (phone, member_id, member_name, role, user_message, tool, args, result_status, result_summary, tokens_in, tokens_out, latency_ms)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, 0, 0)`,
            [
                identity.phone || '-',
                identity.member_id || null,
                identity.name || null,
                identity.role || 'unknown',
                String(userMessage || '').slice(0, 300),
                toolName || 'chat',
                JSON.stringify(toolArgs || {}),
                status || 'ok',
                String(resultSummary || '').slice(0, 500),
                Number(tokensUsed || 0)
            ]
        );
    } catch (err) {
        logger.warn(`[InternalAgent] Failed writing audit log: ${err.message}`);
    }
}

async function processMessage({ identity, text, previewOnly = false }) {
    const cleanText = String(text || '').trim();
    if (!cleanText) {
        return {
            handled: false,
            reply: '',
            toolCalls: [],
            tokensUsed: 0,
            identity
        };
    }

    // 1. Check reset command
    if (/^(\/reset|reset|hapus sesi|clear)$/i.test(cleanText)) {
        if (!previewOnly) {
            await clearSession(identity.phone);
        }
        return {
            handled: true,
            reply: '🔄 Riwayat percakapan Asisten AI telah direset.',
            toolCalls: [],
            tokensUsed: 0,
            identity
        };
    }

    // 2. Check deterministic confirmation/cancellation reply BEFORE invoking LLM
    if (!previewOnly) {
        const confirmResult = await tryHandleConfirmationReply(identity, cleanText);
        if (confirmResult.handled) {
            const replyMsg = confirmResult.replyText || confirmResult.reply || '';
            await appendSessionExchange(identity.phone, identity.member_id, cleanText, replyMsg);
            return {
                handled: true,
                reply: replyMsg,
                toolCalls: confirmResult.action ? [{
                    name: confirmResult.action.tool,
                    args: confirmResult.action.args,
                    status: confirmResult.status
                }] : [],
                tokensUsed: 0,
                identity
            };
        }
    }

    // 3. Check daily token budget
    const budgetInfo = await getDailyTokenUsage();
    if (budgetInfo.remaining <= 0) {
        const msg = `⚠️ *Kuota Token Harian Habis*\n\nPenggunaan token AI hari ini (${budgetInfo.used.toLocaleString('id-ID')} / ${budgetInfo.budget.toLocaleString('id-ID')}) telah mencapai batas maksimal.\nSilakan tingkatkan batas token di menu Pengaturan WhatsApp > AI Agent atau gunakan perintah manual.`;
        return {
            handled: true,
            reply: msg,
            toolCalls: [],
            tokensUsed: 0,
            identity
        };
    }

    const sessionHistory = previewOnly ? [] : await getSessionMessages(identity.phone);
    const availableTools = getToolsForIdentity(identity);
    const openAiTools = toOpenAiToolsSchema(availableTools);

    const messages = [
        { role: 'system', content: buildSystemPrompt(identity) },
        ...sessionHistory,
        { role: 'user', content: cleanText }
    ];

    const ctx = {
        identity,
        previewOnly,
        createdPendingAction: null
    };

    const executedToolCalls = [];
    let totalTokensUsed = 0;
    let finalReply = '';

    try {
        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
            const llmRes = await chatCompletion({
                messages,
                tools: openAiTools,
                tool_choice: 'auto',
                temperature: 0.1,
                max_tokens: 700
            });

            totalTokensUsed += Number(llmRes.usage?.total_tokens || 0);
            const assistantMsg = llmRes.message || { role: 'assistant', content: '' };
            const toolCalls = Array.isArray(assistantMsg.tool_calls) ? assistantMsg.tool_calls : [];

            if (toolCalls.length === 0) {
                finalReply = String(assistantMsg.content || '').trim();
                break;
            }

            messages.push({
                role: 'assistant',
                content: assistantMsg.content || null,
                tool_calls: toolCalls
            });

            for (const tc of toolCalls) {
                const fnName = tc.function?.name;
                const fnArgsRaw = tc.function?.arguments || '{}';
                let parsedArgs = {};
                try {
                    parsedArgs = typeof fnArgsRaw === 'string' ? JSON.parse(fnArgsRaw) : fnArgsRaw;
                } catch (_) {}

                const execRes = await executeToolCall(ctx, fnName, fnArgsRaw);
                executedToolCalls.push({
                    name: fnName,
                    args: parsedArgs,
                    status: previewOnly && execRes.status === 'pending_confirmation' ? 'preview' : execRes.status,
                    result: execRes.result
                });

                messages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: truncateToolOutput(execRes.result)
                });
            }

            // If a write tool generated a pending confirmation card, return it deterministically
            if (ctx.createdPendingAction && ctx.createdPendingAction.confirmation_card) {
                finalReply = ctx.createdPendingAction.confirmation_card;
                break;
            }
        }
    } catch (err) {
        logger.error(`[InternalAgent] Error during LLM execution for ${identity.phone}: ${err.message}`);
        await logAuditEntry({
            identity,
            toolName: 'llm_error',
            toolArgs: { prompt: cleanText.slice(0, 200) },
            status: 'error',
            resultSummary: err.message,
            tokensUsed: totalTokensUsed
        });
        return {
            handled: true,
            reply: `⚠️ Maaf, layanan AI Asisten sedang mengalami gangguan koneksi (${err.message}). Silakan coba beberapa saat lagi.`,
            toolCalls: executedToolCalls,
            tokensUsed: totalTokensUsed,
            identity
        };
    }

    if (!finalReply) {
        finalReply = 'Maaf, saya tidak dapat memproses permintaan tersebut saat ini.';
    }

    // Record audit logs
    if (executedToolCalls.length > 0) {
        for (let i = 0; i < executedToolCalls.length; i++) {
            const tc = executedToolCalls[i];
            const summaryText = tc.result?.error
                ? tc.result.error
                : (tc.result?.summary || JSON.stringify(tc.result).slice(0, 220));
            await logAuditEntry({
                identity,
                userMessage: cleanText,
                toolName: tc.name,
                toolArgs: tc.args,
                status: tc.status,
                resultSummary: summaryText,
                tokensUsed: i === 0 ? totalTokensUsed : 0
            });
        }
    } else {
        await logAuditEntry({
            identity,
            userMessage: cleanText,
            toolName: 'chat',
            toolArgs: { message: cleanText.slice(0, 160) },
            status: 'ok',
            resultSummary: finalReply.slice(0, 220),
            tokensUsed: totalTokensUsed
        });
    }

    if (!previewOnly) {
        await appendSessionExchange(identity.phone, identity.member_id, cleanText, finalReply);
    }

    return {
        handled: true,
        reply: finalReply,
        toolCalls: executedToolCalls,
        tokensUsed: totalTokensUsed,
        identity
    };
}

async function handleWhatsAppIncoming(sock, remoteJid, senderNumber, messageText) {
    try {
        const cfg = await getAgentConfig();
        if (!cfg.enabled) {
            return { handled: false };
        }

        const cleanText = String(messageText || '').trim();
        if (!cleanText) {
            return { handled: false };
        }

        const lower = cleanText.toLowerCase();
        if (LEGACY_BYPASS_PREFIXES.some(prefix => lower.startsWith(prefix))) {
            return { handled: false };
        }

        const identity = await resolveIdentityByPhone(senderNumber);
        if (!identity) {
            // Unregistered phone / external customer -> do not invoke internal AI agent
            return { handled: false };
        }

        if (identity.disabled) {
            await sock.sendMessage(remoteJid, {
                text: `⛔ *Akses Dinonaktifkan*\n\nHalo ${identity.name}, akses Asisten AI untuk nomor Anda sedang dinonaktifkan. Hubungi Superadmin untuk mengaktifkan kembali.`
            });
            return { handled: true };
        }

        if (!checkRateLimit(identity.phone)) {
            await sock.sendMessage(remoteJid, {
                text: `⏳ *Batas Pesan Tercapai*\n\nAnda mengirim terlalu banyak pesan dalam 1 menit terakhir. Silakan tunggu sebentar sebelum mengirim pesan lagi.`
            });
            return { handled: true };
        }

        const result = await processMessage({
            identity,
            text: cleanText,
            previewOnly: false
        });

        if (result.handled && result.reply) {
            await sock.sendMessage(remoteJid, { text: result.reply });
            return { handled: true };
        }

        return { handled: false };
    } catch (err) {
        logger.error(`[InternalAgent] Error in handleWhatsAppIncoming: ${err.message}`);
        return { handled: false };
    }
}

module.exports = {
    processMessage,
    handleWhatsAppIncoming,
    clearSession,
    resolveIdentityByPhone,
    resolveIdentityByMemberId
};
