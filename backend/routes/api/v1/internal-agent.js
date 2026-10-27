const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const { getSetting, updateSetting, refreshSettings } = require('../../../config/settingsManager');
const logger = require('../../../config/logger');
const {
    getAgentConfig,
    getDailyTokenUsage,
    listModels
} = require('../../../services/internal-agent/llm-client');
const {
    ALL_WRITE_TOOLS,
    normalizePhone,
    resolveIdentityByPhone,
    resolveIdentityByMemberId,
    syncMembersFromSystem
} = require('../../../services/internal-agent/identity');
const {
    processMessage
} = require('../../../services/internal-agent');

const WRITE_TOOL_METADATA = [
    {
        name: 'record_payment',
        label: 'Catat Pembayaran (Lunas)',
        description: 'Mencatat pelunasan invoice (Tunai/Transfer) & otomatis buka isolir jika lunas',
        roles: ['superadmin', 'admin', 'mitra', 'technician']
    },
    {
        name: 'resend_invoice',
        label: 'Kirim Ulang Tagihan',
        description: 'Mengirim ulang notifikasi tagihan WhatsApp ke pelanggan',
        roles: ['superadmin', 'admin', 'mitra']
    },
    {
        name: 'update_ticket_status',
        label: 'Update Status Tiket',
        description: 'Mengubah status tiket gangguan (in_progress, resolved, closed) & catatan',
        roles: ['superadmin', 'admin', 'mitra', 'technician']
    },
    {
        name: 'suspend_service',
        label: 'Isolir Layanan Manual',
        description: 'Mengisolir (suspend) layanan PPPoE/IP Statik pelanggan & memutus sesi RADIUS',
        roles: ['superadmin', 'admin', 'mitra']
    },
    {
        name: 'restore_service',
        label: 'Buka Isolir Manual',
        description: 'Mengaktifkan kembali layanan pelanggan yang sedang terisolir',
        roles: ['superadmin', 'admin', 'mitra']
    }
];

function maskApiKey(key) {
    const str = String(key || '').trim();
    if (!str) return '';
    if (str.length <= 10) return '••••••••';
    return `${str.slice(0, 6)}••••••••${str.slice(-4)}`;
}

async function fetchEnrichedMembers() {
    await syncMembersFromSystem();

    const res = await query(
        `SELECT
            am.id,
            am.member_type,
            am.ref_id,
            am.name,
            am.phone,
            am.can_read,
            am.can_write,
            am.allowed_write_tools,
            am.enabled,
            am.updated_at
         FROM ai_agent_members am
         ORDER BY
            CASE am.member_type
                WHEN 'superadmin' THEN 1
                WHEN 'admin' THEN 2
                WHEN 'mitra' THEN 3
                WHEN 'technician' THEN 4
                ELSE 5
            END,
            am.name ASC`
    );

    const regionsRes = await query(
        `SELECT r.id, r.name, r.mitra_id, m.name AS mitra_name, m.phone AS mitra_phone
         FROM regions r
         LEFT JOIN mitra m ON r.mitra_id = m.id`
    );
    const regions = regionsRes.rows || [];

    return (res.rows || []).map(row => {
        let allowedTools = [];
        if (Array.isArray(row.allowed_write_tools)) {
            allowedTools = row.allowed_write_tools;
        } else if (typeof row.allowed_write_tools === 'string') {
            try {
                allowedTools = JSON.parse(row.allowed_write_tools);
            } catch (_) {
                allowedTools = [];
            }
        }

        let scopeLabel = 'Semua Wilayah';
        if (row.member_type === 'mitra') {
            const normPhone = normalizePhone(row.phone);
            const matchedRegions = regions.filter(r =>
                (row.ref_id && String(r.mitra_id) === String(row.ref_id)) ||
                (r.mitra_phone && normalizePhone(r.mitra_phone) === normPhone)
            );
            scopeLabel = matchedRegions.length > 0
                ? matchedRegions.map(r => r.name).join(', ')
                : 'Belum ada wilayah terhubung';
        } else if (row.member_type === 'technician') {
            scopeLabel = 'Data Teknis & Tiket Teknisi';
        }

        return {
            id: row.id,
            member_type: row.member_type,
            ref_id: row.ref_id,
            name: row.name,
            phone: row.phone,
            can_read: Boolean(row.can_read),
            can_write: Boolean(row.can_write),
            allowed_write_tools: allowedTools,
            enabled: Boolean(row.enabled),
            scope_label: scopeLabel,
            updated_at: row.updated_at
        };
    });
}

// GET /api/v1/whatsapp/internal-agent/config
router.get('/config', async (req, res) => {
    try {
        const cfg = await getAgentConfig();
        const usage = await getDailyTokenUsage();
        const members = await fetchEnrichedMembers();
        const dailyWriteLimit = parseInt(getSetting('ai_agent_daily_write_limit', '30'), 10) || 30;

        res.json({
            success: true,
            data: {
                config: {
                    enabled: cfg.enabled,
                    base_url: cfg.baseUrl,
                    api_key_masked: maskApiKey(cfg.apiKey),
                    has_api_key: Boolean(cfg.apiKey),
                    model: cfg.model,
                    daily_token_budget: cfg.dailyTokenBudget,
                    daily_write_limit: dailyWriteLimit
                },
                usage: {
                    date: usage.date,
                    tokens_used: usage.used,
                    token_budget: usage.budget,
                    tokens_remaining: usage.remaining
                },
                members,
                available_write_tools: WRITE_TOOL_METADATA
            }
        });
    } catch (error) {
        logger.error('[InternalAgent API] Failed getting config:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memuat konfigurasi AI Agent',
            error: error.message
        });
    }
});

// PUT /api/v1/whatsapp/internal-agent/config
router.put('/config', async (req, res) => {
    try {
        const {
            enabled,
            base_url,
            api_key,
            model,
            daily_token_budget,
            daily_write_limit
        } = req.body || {};

        if (typeof enabled === 'boolean') {
            await updateSetting('ai_agent_enabled', enabled);
        }
        if (typeof base_url === 'string' && base_url.trim()) {
            await updateSetting('ai_agent_llm_base_url', base_url.trim().replace(/\/+$/, ''));
        }
        if (typeof api_key === 'string' && api_key.trim() && !api_key.includes('••••')) {
            await updateSetting('ai_agent_llm_api_key', api_key.trim());
        }
        if (typeof model === 'string' && model.trim()) {
            await updateSetting('ai_agent_llm_model', model.trim());
        }
        if (daily_token_budget !== undefined) {
            const budgetNum = Math.max(1000, parseInt(daily_token_budget, 10) || 200000);
            await updateSetting('ai_agent_daily_token_budget', budgetNum);
        }
        if (daily_write_limit !== undefined) {
            const limitNum = Math.max(1, parseInt(daily_write_limit, 10) || 30);
            await updateSetting('ai_agent_daily_write_limit', limitNum);
        }

        await refreshSettings();

        const cfg = await getAgentConfig();
        res.json({
            success: true,
            message: 'Konfigurasi AI Agent berhasil disimpan',
            data: {
                enabled: cfg.enabled,
                base_url: cfg.baseUrl,
                api_key_masked: maskApiKey(cfg.apiKey),
                has_api_key: Boolean(cfg.apiKey),
                model: cfg.model,
                daily_token_budget: cfg.dailyTokenBudget,
                daily_write_limit: parseInt(getSetting('ai_agent_daily_write_limit', '30'), 10) || 30
            }
        });
    } catch (error) {
        logger.error('[InternalAgent API] Failed updating config:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menyimpan konfigurasi AI Agent',
            error: error.message
        });
    }
});

// GET /api/v1/whatsapp/internal-agent/models
router.get('/models', async (req, res) => {
    try {
        const overrideBaseUrl = req.query.base_url ? String(req.query.base_url).trim() : undefined;
        const overrideApiKey = (req.query.api_key && !String(req.query.api_key).includes('••••'))
            ? String(req.query.api_key).trim()
            : undefined;

        const models = await listModels({
            baseUrl: overrideBaseUrl,
            apiKey: overrideApiKey
        });

        res.json({
            success: true,
            data: { models }
        });
    } catch (error) {
        logger.error('[InternalAgent API] Failed fetching LLM models:', error);
        res.status(502).json({
            success: false,
            message: `Gagal mengambil daftar model dari LLM endpoint: ${error.message}`,
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/internal-agent/members/sync
router.post('/members/sync', async (req, res) => {
    try {
        const members = await fetchEnrichedMembers();
        res.json({
            success: true,
            message: 'Daftar nomor internal berhasil disinkronkan',
            data: { members }
        });
    } catch (error) {
        logger.error('[InternalAgent API] Failed syncing members:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menyinkronkan daftar anggota',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/internal-agent/members
router.post('/members', async (req, res) => {
    try {
        const {
            member_type = 'admin',
            ref_id = null,
            name,
            phone,
            can_read = true,
            can_write = false,
            allowed_write_tools = [],
            enabled = true
        } = req.body || {};

        const cleanName = String(name || '').trim();
        const cleanPhone = normalizePhone(phone);
        if (!cleanName || !cleanPhone) {
            return res.status(400).json({
                success: false,
                message: 'Nama dan nomor WhatsApp wajib diisi.'
            });
        }

        const validTypes = ['superadmin', 'admin', 'mitra', 'technician'];
        const roleType = validTypes.includes(member_type) ? member_type : 'admin';
        const filteredTools = Array.isArray(allowed_write_tools)
            ? allowed_write_tools.filter(t => ALL_WRITE_TOOLS.includes(t))
            : [];

        await query(
            `INSERT INTO ai_agent_members (member_type, ref_id, name, phone, can_read, can_write, allowed_write_tools, enabled, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW())
             ON CONFLICT (phone)
             DO UPDATE SET
                member_type = EXCLUDED.member_type,
                ref_id = COALESCE(EXCLUDED.ref_id, ai_agent_members.ref_id),
                name = EXCLUDED.name,
                can_read = EXCLUDED.can_read,
                can_write = EXCLUDED.can_write,
                allowed_write_tools = EXCLUDED.allowed_write_tools,
                enabled = EXCLUDED.enabled,
                updated_at = NOW()`,
            [
                roleType,
                ref_id ? String(ref_id) : null,
                cleanName,
                cleanPhone,
                Boolean(can_read),
                Boolean(can_write),
                JSON.stringify(filteredTools),
                Boolean(enabled)
            ]
        );

        const members = await fetchEnrichedMembers();
        res.json({
            success: true,
            message: 'Anggota AI Agent berhasil disimpan',
            data: { members }
        });
    } catch (error) {
        logger.error('[InternalAgent API] Failed adding member:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menyimpan anggota AI Agent',
            error: error.message
        });
    }
});

// PUT /api/v1/whatsapp/internal-agent/members/:id
router.put('/members/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) {
            return res.status(400).json({ success: false, message: 'ID anggota tidak valid' });
        }

        const existingRes = await query(`SELECT * FROM ai_agent_members WHERE id = $1 LIMIT 1`, [id]);
        if (!existingRes.rows || existingRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Anggota tidak ditemukan' });
        }
        const existing = existingRes.rows[0];

        const {
            member_type,
            name,
            phone,
            can_read,
            can_write,
            allowed_write_tools,
            enabled
        } = req.body || {};

        const nextType = member_type || existing.member_type;
        const nextName = name !== undefined ? String(name).trim() : existing.name;
        const nextPhone = phone !== undefined ? normalizePhone(phone) : existing.phone;
        const nextRead = can_read !== undefined ? Boolean(can_read) : existing.can_read;
        const nextWrite = nextType === 'superadmin'
            ? true
            : (can_write !== undefined ? Boolean(can_write) : existing.can_write);
        const nextTools = nextType === 'superadmin'
            ? ALL_WRITE_TOOLS
            : (Array.isArray(allowed_write_tools)
                ? allowed_write_tools.filter(t => ALL_WRITE_TOOLS.includes(t))
                : existing.allowed_write_tools);
        const nextEnabled = enabled !== undefined ? Boolean(enabled) : existing.enabled;

        await query(
            `UPDATE ai_agent_members
             SET member_type = $1,
                 name = $2,
                 phone = $3,
                 can_read = $4,
                 can_write = $5,
                 allowed_write_tools = $6::jsonb,
                 enabled = $7,
                 updated_at = NOW()
             WHERE id = $8`,
            [
                nextType,
                nextName,
                nextPhone,
                nextRead,
                nextWrite,
                JSON.stringify(nextTools),
                nextEnabled,
                id
            ]
        );

        const members = await fetchEnrichedMembers();
        res.json({
            success: true,
            message: `Pengaturan izin untuk ${nextName} berhasil diperbarui`,
            data: { members }
        });
    } catch (error) {
        logger.error('[InternalAgent API] Failed updating member:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memperbarui izin anggota',
            error: error.message
        });
    }
});

// DELETE /api/v1/whatsapp/internal-agent/members/:id
router.delete('/members/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        await query(`DELETE FROM ai_agent_members WHERE id = $1`, [id]);
        const members = await fetchEnrichedMembers();
        res.json({
            success: true,
            message: 'Anggota berhasil dihapus',
            data: { members }
        });
    } catch (error) {
        logger.error('[InternalAgent API] Failed deleting member:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menghapus anggota',
            error: error.message
        });
    }
});

// GET /api/v1/whatsapp/internal-agent/logs
router.get('/logs', async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 200);
        const roleFilter = req.query.role ? String(req.query.role).trim() : '';
        const statusFilter = req.query.status ? String(req.query.status).trim() : '';

        const params = [];
        const conditions = ['1=1'];

        if (roleFilter && roleFilter !== 'all') {
            params.push(roleFilter);
            conditions.push(`l.role = $${params.length}`);
        }
        if (statusFilter && statusFilter !== 'all') {
            params.push(statusFilter);
            conditions.push(`l.result_status = $${params.length}`);
        }

        params.push(limit);
        const logsRes = await query(
            `SELECT
                l.id,
                l.phone,
                l.member_id,
                COALESCE(m.name, l.member_name, l.phone) AS member_name,
                l.role,
                l.tool AS tool_name,
                l.args AS tool_args,
                l.result_status AS status,
                l.result_summary,
                (COALESCE(l.tokens_in, 0) + COALESCE(l.tokens_out, 0)) AS tokens_used,
                l.created_at
             FROM ai_agent_audit_log l
             LEFT JOIN ai_agent_members m ON l.member_id = m.id
             WHERE ${conditions.join(' AND ')}
             ORDER BY l.created_at DESC
             LIMIT $${params.length}`,
            params
        );

        const pendingRes = await query(
            `SELECT
                p.id,
                p.code,
                p.phone,
                COALESCE(m.name, p.phone) AS member_name,
                COALESCE(m.member_type, 'admin') AS role,
                p.tool,
                p.summary,
                p.status,
                p.expires_at,
                p.created_at
             FROM ai_agent_pending_actions p
             LEFT JOIN ai_agent_members m ON p.member_id = m.id
             ORDER BY p.created_at DESC
             LIMIT 20`
        );

        res.json({
            success: true,
            data: {
                logs: logsRes.rows || [],
                pending_actions: pendingRes.rows || []
            }
        });
    } catch (error) {
        logger.error('[InternalAgent API] Failed fetching logs:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memuat log audit AI Agent',
            error: error.message
        });
    }
});

// POST /api/v1/whatsapp/internal-agent/test
router.post('/test', async (req, res) => {
    try {
        const { member_id, phone, message } = req.body || {};
        const cleanMsg = String(message || '').trim();
        if (!cleanMsg) {
            return res.status(400).json({
                success: false,
                message: 'Pesan uji coba wajib diisi.'
            });
        }

        let identity = null;
        if (member_id) {
            identity = await resolveIdentityByMemberId(parseInt(member_id, 10));
        }
        if (!identity && phone) {
            identity = await resolveIdentityByPhone(phone);
        }

        if (!identity) {
            return res.status(404).json({
                success: false,
                message: 'Nomor/anggota tidak terdaftar di daftar AI Agent internal.'
            });
        }

        if (identity.disabled) {
            return res.json({
                success: true,
                data: {
                    reply: `⛔ Akses Asisten AI untuk ${identity.name} (${identity.phone}) sedang dinonaktifkan.`,
                    tool_calls: [],
                    tokens_used: 0,
                    identity: {
                        name: identity.name,
                        phone: identity.phone,
                        role: identity.role,
                        can_write: identity.can_write,
                        region_names: identity.region_names || []
                    }
                }
            });
        }

        const result = await processMessage({
            identity,
            text: cleanMsg,
            previewOnly: true
        });

        const usage = await getDailyTokenUsage();

        res.json({
            success: true,
            data: {
                reply: result.reply,
                tool_calls: result.toolCalls || [],
                tokens_used: result.tokensUsed || 0,
                usage: {
                    date: usage.date,
                    tokens_used: usage.used,
                    token_budget: usage.budget,
                    tokens_remaining: usage.remaining
                },
                identity: {
                    name: identity.name,
                    phone: identity.phone,
                    role: identity.role,
                    can_write: identity.can_write,
                    allowed_write_tools: identity.allowed_write_tools || [],
                    region_names: identity.region_names || []
                }
            }
        });
    } catch (error) {
        logger.error('[InternalAgent API] Error in test playground:', error);
        res.status(500).json({
            success: false,
            message: `Gagal menjalankan simulasi AI: ${error.message}`,
            error: error.message
        });
    }
});

module.exports = router;
