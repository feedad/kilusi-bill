const { query } = require('../../config/database');
const logger = require('../../config/logger');

const ALL_WRITE_TOOLS = [
    'record_payment',
    'resend_invoice',
    'update_ticket_status',
    'suspend_service',
    'restore_service'
];

function normalizePhone(raw) {
    if (!raw) return '';
    const cleaned = String(raw)
        .replace(/@s\.whatsapp\.net$/i, '')
        .replace(/@c\.us$/i, '')
        .replace(/@lid$/i, '')
        .replace(/:\d+$/, '')
        .replace(/\D/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('0')) {
        return '62' + cleaned.slice(1);
    }
    if (cleaned.startsWith('8') && cleaned.length >= 9) {
        return '62' + cleaned;
    }
    return cleaned;
}

function getPhoneVariants(raw) {
    const norm = normalizePhone(raw);
    if (!norm) return [];
    const variants = new Set([norm]);
    if (norm.startsWith('62')) {
        variants.add('0' + norm.slice(2));
        variants.add(norm.slice(2));
    }
    return Array.from(variants);
}

async function getSuperAdminActor() {
    try {
        const res = await query(
            `SELECT id, username, role, phone
             FROM users
             WHERE role IN ('superadmin', 'administrator')
             ORDER BY (role = 'superadmin') DESC, id ASC
             LIMIT 1`
        );
        if (res.rows && res.rows.length > 0) {
            return res.rows[0];
        }
    } catch (err) {
        logger.warn(`[InternalAgent] Failed looking up superadmin user: ${err.message}`);
    }
    return { id: 1, username: 'admin', role: 'superadmin', phone: null };
}

async function enrichMemberRow(row) {
    if (!row) return null;
    const role = row.member_type;
    const normPhone = normalizePhone(row.phone);
    const superActor = await getSuperAdminActor();

    const parsedTools = Array.isArray(row.allowed_write_tools)
        ? row.allowed_write_tools
        : (typeof row.allowed_write_tools === 'string'
            ? (() => { try { return JSON.parse(row.allowed_write_tools); } catch (_) { return []; } })()
            : []);

    const isSuper = role === 'superadmin';
    const canRead = isSuper ? true : Boolean(row.can_read);
    const canWrite = isSuper ? true : Boolean(row.can_write);
    const allowedWriteTools = isSuper ? [...ALL_WRITE_TOOLS] : parsedTools.filter(t => ALL_WRITE_TOOLS.includes(t));

    const identity = {
        member_id: row.id || null,
        role,
        name: row.name || 'Internal Member',
        phone: normPhone,
        ref_id: row.ref_id ? String(row.ref_id) : null,
        enabled: isSuper ? true : Boolean(row.enabled),
        can_read: canRead,
        can_write: canWrite,
        allowed_write_tools: allowedWriteTools,
        user_id: superActor.id,
        actor_username: superActor.username,
        actor_role: superActor.role,
        tech_user_id: null,
        mitra_id: null,
        mitra_ids: [],
        region_ids: [],
        region_names: []
    };

    if (role === 'superadmin' || role === 'admin') {
        if (row.ref_id && /^\d+$/.test(String(row.ref_id))) {
            try {
                const uRes = await query(`SELECT id, username, role FROM users WHERE id = $1 LIMIT 1`, [Number(row.ref_id)]);
                if (uRes.rows?.[0]) {
                    identity.user_id = uRes.rows[0].id;
                    identity.actor_username = uRes.rows[0].username;
                    identity.actor_role = uRes.rows[0].role;
                }
            } catch (_) {}
        }
    } else if (role === 'technician') {
        if (row.ref_id && /^\d+$/.test(String(row.ref_id))) {
            identity.tech_user_id = Number(row.ref_id);
        } else {
            try {
                const variants = getPhoneVariants(normPhone);
                const uRes = await query(
                    `SELECT id FROM users WHERE role = 'technician' AND phone = ANY($1) ORDER BY id ASC LIMIT 1`,
                    [variants]
                );
                if (uRes.rows?.[0]) {
                    identity.tech_user_id = uRes.rows[0].id;
                }
            } catch (_) {}
        }
    } else if (role === 'mitra') {
        try {
            const variants = getPhoneVariants(normPhone);
            const mRes = await query(
                `SELECT m.id AS mitra_id, m.name AS mitra_name, r.id AS region_id, r.name AS region_name
                 FROM mitra m
                 LEFT JOIN regions r ON r.mitra_id = m.id
                 WHERE m.disabled_at IS NULL
                   AND (m.id::text = $1 OR m.phone = ANY($2))`,
                [row.ref_id ? String(row.ref_id) : '', variants]
            );
            const mitraIds = new Set();
            const regionIds = new Set();
            const regionNames = new Set();
            for (const r of mRes.rows || []) {
                if (r.mitra_id) mitraIds.add(String(r.mitra_id));
                if (r.region_id) regionIds.add(String(r.region_id));
                if (r.region_name) regionNames.add(String(r.region_name));
            }
            identity.mitra_ids = Array.from(mitraIds);
            identity.mitra_id = identity.mitra_ids[0] || (row.ref_id ? String(row.ref_id) : null);
            identity.region_ids = Array.from(regionIds);
            identity.region_names = Array.from(regionNames);
        } catch (err) {
            logger.warn(`[InternalAgent] Failed loading mitra regions for ${normPhone}: ${err.message}`);
        }
    }

    return identity;
}

async function resolveIdentityByPhone(rawPhone) {
    const normPhone = normalizePhone(rawPhone);
    if (!normPhone) return null;

    const variants = getPhoneVariants(normPhone);
    try {
        const res = await query(
            `SELECT * FROM ai_agent_members WHERE phone = ANY($1) ORDER BY (member_type = 'superadmin') DESC, id ASC LIMIT 1`,
            [variants]
        );
        if (res.rows && res.rows.length > 0) {
            const row = res.rows[0];
            if (!row.enabled && row.member_type !== 'superadmin') {
                return null;
            }
            return await enrichMemberRow(row);
        }
    } catch (err) {
        logger.warn(`[InternalAgent] Failed querying ai_agent_members by phone: ${err.message}`);
    }

    // Fallback check against env WHATSAPP_SUPER_ADMIN or users.role='superadmin'
    const envSuper = normalizePhone(process.env.WHATSAPP_SUPER_ADMIN || process.env.ADMIN_NUMBER || '');
    const superActor = await getSuperAdminActor();
    const dbSuperPhone = normalizePhone(superActor.phone || '');

    if ((envSuper && normPhone === envSuper) || (dbSuperPhone && normPhone === dbSuperPhone)) {
        return await enrichMemberRow({
            id: null,
            member_type: 'superadmin',
            ref_id: String(superActor.id),
            name: superActor.username || 'Superadmin',
            phone: normPhone,
            can_read: true,
            can_write: true,
            allowed_write_tools: ALL_WRITE_TOOLS,
            enabled: true
        });
    }

    return null;
}

async function resolveIdentityByMemberId(memberId) {
    if (!memberId) return null;
    try {
        const res = await query(`SELECT * FROM ai_agent_members WHERE id = $1 LIMIT 1`, [Number(memberId)]);
        if (res.rows && res.rows.length > 0) {
            return await enrichMemberRow(res.rows[0]);
        }
    } catch (err) {
        logger.warn(`[InternalAgent] Failed querying ai_agent_members by id ${memberId}: ${err.message}`);
    }
    return null;
}

function canExecuteTool(identity, toolDef) {
    if (!identity || !toolDef) return false;
    if (identity.enabled === false && identity.role !== 'superadmin') return false;
    if (!identity.can_read && identity.role !== 'superadmin') return false;
    if (Array.isArray(toolDef.roles) && !toolDef.roles.includes(identity.role)) {
        return false;
    }
    if (toolDef.kind === 'write') {
        if (identity.role === 'superadmin') return true;
        if (!identity.can_write) return false;
        if (!Array.isArray(identity.allowed_write_tools)) return false;
        return identity.allowed_write_tools.includes(toolDef.name);
    }
    return true;
}

async function syncMembersFromSystem() {
    let inserted = 0;

    const uRes = await query(
        `INSERT INTO ai_agent_members (member_type, ref_id, name, phone, can_read, can_write, allowed_write_tools, enabled)
         SELECT
             CASE
                 WHEN u.role = 'superadmin' THEN 'superadmin'
                 WHEN u.role IN ('administrator', 'operator') THEN 'admin'
                 ELSE 'technician'
             END AS member_type,
             u.id::text AS ref_id,
             u.username AS name,
             REGEXP_REPLACE(REGEXP_REPLACE(TRIM(u.phone), '[^0-9]', '', 'g'), '^0', '62') AS phone,
             true AS can_read,
             (u.role = 'superadmin') AS can_write,
             CASE
                 WHEN u.role = 'superadmin' THEN $1::jsonb
                 ELSE '[]'::jsonb
             END AS allowed_write_tools,
             true AS enabled
         FROM users u
         WHERE u.phone IS NOT NULL AND TRIM(u.phone) <> ''
         ORDER BY (u.role = 'superadmin') DESC, u.id ASC
         ON CONFLICT (phone) DO NOTHING
         RETURNING id`,
        [JSON.stringify(ALL_WRITE_TOOLS)]
    );
    inserted += uRes.rowCount || 0;

    const mRes = await query(
        `INSERT INTO ai_agent_members (member_type, ref_id, name, phone, can_read, can_write, allowed_write_tools, enabled)
         SELECT DISTINCT ON (REGEXP_REPLACE(REGEXP_REPLACE(TRIM(m.phone), '[^0-9]', '', 'g'), '^0', '62'))
             'mitra' AS member_type,
             m.id::text AS ref_id,
             m.name AS name,
             REGEXP_REPLACE(REGEXP_REPLACE(TRIM(m.phone), '[^0-9]', '', 'g'), '^0', '62') AS phone,
             true AS can_read,
             false AS can_write,
             '[]'::jsonb AS allowed_write_tools,
             true AS enabled
         FROM mitra m
         WHERE m.disabled_at IS NULL AND m.phone IS NOT NULL AND TRIM(m.phone) <> ''
         ORDER BY REGEXP_REPLACE(REGEXP_REPLACE(TRIM(m.phone), '[^0-9]', '', 'g'), '^0', '62'), m.name ASC
         ON CONFLICT (phone) DO NOTHING
         RETURNING id`
    );
    inserted += mRes.rowCount || 0;

    return { inserted };
}

module.exports = {
    ALL_WRITE_TOOLS,
    normalizePhone,
    getPhoneVariants,
    resolveIdentityByPhone,
    resolveIdentityByMemberId,
    canExecuteTool,
    syncMembersFromSystem
};
