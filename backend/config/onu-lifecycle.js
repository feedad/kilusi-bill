/**
 * ONU lifecycle detection
 *
 * Detects ONU replacements (customer swapped the ONU/MAC), renames the new ONU
 * to the customer name, and marks the previous ONU as `OLD-<NAME>-<DDMMYY>`
 * instead of deleting it. Every decision can be reviewed first (dry run) and is
 * written to `onu_change_log`.
 *
 * Data sources, in order of trust:
 *   1. radacct.callingstationid — MAC that is actually online right now
 *   2. technical_details.mac_address — last known MAC stored in billing
 *   3. OLT ONU list (SNMP) — serial/MAC of the ONU registered on the OLT
 */

const { query } = require('./database');
const { logger } = require('./logger');
const oltMonitor = require('./olt-snmp-monitor');
const { SESSION_STALE_SQL } = require('./radius-window');

const NAME_MAX = 30;
const DEFAULT_OLT_TIMEOUT_MS = 45000;

function sanitizeName(raw) {
    return String(raw || '')
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, NAME_MAX);
}

function normalizeMac(value) {
    return String(value || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
}

function isPlaceholderName(name) {
    const current = String(name || '').trim();
    if (!current) return true;
    if (current === '-' || current === '--') return true;
    if (/^n\/?a$/i.test(current)) return true;
    if (/^ONU\d+\/\d+$/i.test(current)) return true;
    if (/^EPON\d+\/\d+$/i.test(current)) return true;
    return false;
}

function localDateTag(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}${pad(date.getMonth() + 1)}${String(date.getFullYear()).slice(-2)}`;
}

function buildOldName(customerName, date = new Date()) {
    return sanitizeName(`OLD-${customerName}-${localDateTag(date)}`);
}

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms))
    ]);
}

async function loadOlts(oltId = null) {
    const params = [];
    // OLTs created without an explicit status (e.g. C-DATA) are still polled.
    let clause = `WHERE (status IS NULL OR status = 'active')`;
    if (oltId) {
        params.push(oltId);
        clause = `WHERE id = $1`;
    }
    const res = await query(
        `SELECT id, name, host, type, status, snmp_community, snmp_write_community,
                snmp_version, snmp_port
         FROM olts ${clause}
         ORDER BY name ASC`,
        params
    );
    return res.rows || [];
}

function oltConfig(olt, { write = false } = {}) {
    return {
        host: olt.host,
        community: write
            ? (olt.snmp_write_community || olt.snmp_community)
            : olt.snmp_community,
        version: olt.snmp_version || '2c',
        port: olt.snmp_port || 161,
        vendor: olt.type
    };
}

/**
 * Latest RADIUS MAC per PPPoE username for sessions still considered online.
 */
async function loadActiveSessions() {
    const res = await query(`
        SELECT DISTINCT ON (username)
            username,
            callingstationid AS mac_address,
            framedipaddress AS ip_address,
            acctstarttime
        FROM radacct
        WHERE acctstoptime IS NULL
          AND acctupdatetime IS NOT NULL
          AND acctupdatetime >= NOW() - ${SESSION_STALE_SQL}
          AND callingstationid IS NOT NULL
          AND TRIM(callingstationid) <> ''
        ORDER BY username, acctstarttime DESC
    `);
    const map = new Map();
    for (const row of res.rows || []) {
        map.set(String(row.username).toLowerCase(), {
            mac: normalizeMac(row.mac_address),
            ip: row.ip_address,
            started_at: row.acctstarttime
        });
    }
    return map;
}

async function loadCustomers() {
    const res = await query(`
        SELECT
            c.id AS customer_id,
            c.name AS customer_name,
            s.id AS service_id,
            s.service_number,
            s.status AS service_status,
            td.pppoe_username,
            td.mac_address AS stored_mac,
            r.name AS region_name,
            m.name AS mitra_name
        FROM customers c
        JOIN services s ON s.customer_id::text = c.id
        LEFT JOIN technical_details td ON td.service_id = s.id
        LEFT JOIN regions r ON s.region_id = r.id
        LEFT JOIN mitra m ON r.mitra_id = m.id
        WHERE td.pppoe_username IS NOT NULL
          AND TRIM(td.pppoe_username) <> ''
        ORDER BY c.name ASC
    `);
    return res.rows || [];
}

async function loadOnuLists(olts) {
    const lists = new Map();
    for (const olt of olts) {
        const startedAt = Date.now();
        try {
            const onus = await withTimeout(
                oltMonitor.getOnuList(oltConfig(olt), { skipMetrics: true }),
                DEFAULT_OLT_TIMEOUT_MS,
                `ONU list ${olt.name}`
            );
            lists.set(olt.id, { olt, onus, error: null });
            logger.info(`[ONU Lifecycle] ${olt.name}: ${onus.length} ONU dibaca (${Date.now() - startedAt}ms)`);
        } catch (err) {
            lists.set(olt.id, { olt, onus: [], error: err.message });
            logger.warn(`[ONU Lifecycle] ${olt.name}: gagal membaca daftar ONU — ${err.message}`);
        }
    }
    return lists;
}

/**
 * Build a review table of ONU changes without touching any device.
 *
 * @param {Object} options
 *   - oltId: limit to one OLT
 *   - customerId: limit to one customer
 * @returns {Object} { items, summary, olts }
 */
async function loadSignalHints() {
    try {
        const res = await query(`
            SELECT pppoe_username, olt_name, onu_index
            FROM olt_signal_cache
            WHERE polled_at > NOW() - INTERVAL '30 days'
        `);
        const map = new Map();
        for (const row of res.rows || []) {
            if (!row.pppoe_username || !row.olt_name || !row.onu_index) continue;
            map.set(String(row.pppoe_username).toLowerCase(), {
                olt_name: String(row.olt_name),
                onu_index: String(row.onu_index)
            });
        }
        return map;
    } catch (err) {
        logger.warn(`[ONU Lifecycle] gagal membaca cache sinyal: ${err.message}`);
        return new Map();
    }
}

function normalizeName(value) {
    return String(value || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/**
 * Two ONU names are considered the same when they only differ in punctuation,
 * spacing, or due to the 30 character limit on the OLT side.
 */
function isSameOnuName(current, desired) {
    const a = normalizeName(current);
    const b = normalizeName(desired);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 26 && (b.startsWith(a) || a.startsWith(b))) return true;
    return false;
}

function macDistance(a, b) {
    const cleanA = normalizeMac(a);
    const cleanB = normalizeMac(b);
    if (cleanA.length !== 12 || cleanB.length !== 12) return null;
    try {
        const left = BigInt('0x' + cleanA);
        const right = BigInt('0x' + cleanB);
        return left > right ? left - right : right - left;
    } catch (err) {
        return null;
    }
}

/**
 * Build a review table of ONU changes without touching any device.
 *
 * Matching is MAC driven: the ONU must belong to the customer's online RADIUS
 * session (exact MAC, cached OLT index, or a fuzzy MAC difference of <= 0x10).
 * Name matching is only used to find the OLD ONU that should be retired, never
 * to decide which ONU the customer currently owns.
 *
 * @param {Object} options
 *   - oltId: limit to one OLT
 *   - customerId: limit to one customer
 * @returns {Object} { items, summary, olts }
 */
async function scanOnuChanges(options = {}) {
    const { oltId = null, customerId = null } = options;

    const [olts, sessions, customers, hints] = await Promise.all([
        loadOlts(oltId),
        loadActiveSessions(),
        loadCustomers(),
        loadSignalHints()
    ]);

    const onuLists = await loadOnuLists(olts);
    const items = [];
    const assignedOnu = new Map();

    const targetCustomers = customerId
        ? customers.filter(row => String(row.customer_id) === String(customerId))
        : customers;

    const findOnu = (predicate) => {
        for (const entry of onuLists.values()) {
            if (entry.error) continue;
            const onu = entry.onus.find(predicate);
            if (onu) return { onu, olt: entry.olt, entry };
        }
        return null;
    };

    for (const row of targetCustomers) {
        const pppoe = String(row.pppoe_username || '').trim();
        if (!pppoe) continue;

        const session = sessions.get(pppoe.toLowerCase()) || null;
        const liveMac = session?.mac || '';
        const storedMac = normalizeMac(row.stored_mac);
        const desiredName = sanitizeName(row.customer_name);
        if (!desiredName) continue;

        const macChanged = Boolean(liveMac && storedMac && liveMac !== storedMac);

        let matched = null;
        let matchType = null;

        // 1. Exact MAC of the currently online session.
        if (liveMac) {
            matched = findOnu(item => normalizeMac(item.sn) === liveMac);
            if (matched) matchType = 'mac_exact';
        }

        // 2. Cached OLT signal index (polled every 5 minutes).
        if (!matched) {
            const hint = hints.get(pppoe.toLowerCase());
            if (hint) {
                const entry = [...onuLists.values()].find(
                    list => !list.error && String(list.olt.name).toLowerCase() === hint.olt_name.toLowerCase()
                );
                const onu = entry?.onus.find(item => String(item.index) === hint.onu_index);
                if (onu) {
                    matched = { onu, olt: entry.olt, entry };
                    matchType = 'cache_index';
                }
            }
        }

        // 3. Fuzzy MAC (ONT serial vs router MAC can differ in the last byte).
        if (!matched && liveMac) {
            matched = findOnu(item => {
                const distance = macDistance(item.sn, liveMac);
                return distance !== null && distance <= BigInt(0x10);
            });
            if (matched) matchType = 'mac_fuzzy';
        }

        // 4. Last known MAC from billing (customer offline right now).
        if (!matched && !liveMac && storedMac) {
            matched = findOnu(item => normalizeMac(item.sn) === storedMac);
            if (matched) matchType = 'stored_mac';
        }

        if (!matched) {
            // Only surface this when the MAC actually changed — otherwise it is noise.
            if (macChanged) {
                items.push({
                    action: 'sync_mac',
                    status: 'planned',
                    olt_id: null,
                    olt_name: null,
                    olt_ip: null,
                    onu_index: null,
                    onu_sn: null,
                    current_name: null,
                    new_name: null,
                    customer_id: row.customer_id,
                    customer_name: row.customer_name,
                    service_id: row.service_id,
                    service_number: row.service_number,
                    pppoe_username: pppoe,
                    old_mac: storedMac || null,
                    new_mac: liveMac || null,
                    message: 'MAC berubah di RADIUS, tetapi ONU-nya belum terlihat di daftar OLT (mungkin di OLT yang belum terbaca). Hanya data MAC billing yang disinkronkan.'
                });
            }
            continue;
        }

        const { onu, olt } = matched;
        const currentName = String(onu.name || '').trim();

        const onuKey = `${olt.id}|${onu.index}`;
        const owner = assignedOnu.get(onuKey);
        if (owner && owner !== String(row.customer_id)) {
            logger.warn(`[ONU Lifecycle] ONU ${olt.name} ${onu.index} diklaim dua pelanggan (${owner} & ${row.customer_id}), dilewati`);
            continue;
        }
        assignedOnu.set(onuKey, String(row.customer_id));

        if (isSameOnuName(currentName, desiredName)) {
            if (macChanged) {
                items.push({
                    action: 'sync_mac',
                    status: 'planned',
                    olt_id: olt.id,
                    olt_name: olt.name,
                    olt_ip: olt.host,
                    onu_index: onu.index,
                    onu_sn: onu.sn,
                    current_name: currentName,
                    new_name: desiredName,
                    customer_id: row.customer_id,
                    customer_name: row.customer_name,
                    service_id: row.service_id,
                    service_number: row.service_number,
                    pppoe_username: pppoe,
                    old_mac: storedMac || null,
                    new_mac: liveMac || null,
                    message: `Nama ONU sudah benar (${matchType}), MAC billing diperbarui.`
                });
            }
            continue;
        }

        items.push({
            action: 'rename_new',
            status: 'planned',
            olt_id: olt.id,
            olt_name: olt.name,
            olt_ip: olt.host,
            onu_index: onu.index,
            onu_sn: onu.sn,
            current_name: currentName || null,
            new_name: desiredName,
            customer_id: row.customer_id,
            customer_name: row.customer_name,
            service_id: row.service_id,
            service_number: row.service_number,
            pppoe_username: pppoe,
            old_mac: storedMac || null,
            new_mac: liveMac || null,
            message: isPlaceholderName(currentName)
                ? `ONU cocok lewat ${matchType}, belum bernama (${currentName || 'kosong'}) → diberi nama pelanggan.`
                : `ONU cocok lewat ${matchType}, nama "${currentName}" → nama pelanggan.`
        });

        // Retire the previous ONU only when it is offline and still carries this
        // customer's name. Online ONUs are left alone (they may belong to someone else).
        const entry = onuLists.get(olt.id);
        const stale = (entry?.onus || []).filter(item => {
            if (String(item.index) === String(onu.index)) return false;
            if (String(item.status) !== 'offline') return false;
            if (normalizeMac(item.sn) && normalizeMac(item.sn) === normalizeMac(onu.sn)) return false;
            return isSameOnuName(item.name, desiredName);
        });

        for (const oldOnu of stale) {
            const oldKey = `${olt.id}|${oldOnu.index}`;
            if (assignedOnu.has(oldKey)) continue;
            assignedOnu.set(oldKey, String(row.customer_id));

            items.push({
                action: 'mark_old',
                status: 'planned',
                olt_id: olt.id,
                olt_name: olt.name,
                olt_ip: olt.host,
                onu_index: oldOnu.index,
                onu_sn: oldOnu.sn,
                current_name: String(oldOnu.name || '').trim() || null,
                new_name: buildOldName(desiredName),
                customer_id: row.customer_id,
                customer_name: row.customer_name,
                service_id: row.service_id,
                service_number: row.service_number,
                pppoe_username: pppoe,
                old_mac: storedMac || null,
                new_mac: liveMac || null,
                message: 'ONU lama (offline) masih memakai nama pelanggan → ditandai OLD, tidak dihapus.'
            });
        }
    }

    const summary = {
        total: items.length,
        rename_new: items.filter(i => i.action === 'rename_new').length,
        mark_old: items.filter(i => i.action === 'mark_old').length,
        sync_mac: items.filter(i => i.action === 'sync_mac').length,
        skipped: items.filter(i => i.action === 'skip').length,
        olt_errors: [...onuLists.values()]
            .filter(entry => entry.error)
            .map(entry => ({ olt_name: entry.olt.name, error: entry.error }))
    };

    return { items, summary, olts: olts.map(o => ({ id: o.id, name: o.name, host: o.host })) };
}

async function logChange(entry) {
    try {
        await query(
            `INSERT INTO onu_change_log
                (olt_id, olt_name, olt_ip, customer_id, customer_name, service_id, pppoe_username,
                 action, status, onu_index, onu_sn, old_name, new_name, old_mac, new_mac, dry_run, message)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [
                entry.olt_id || null,
                entry.olt_name || null,
                entry.olt_ip || null,
                entry.customer_id || null,
                entry.customer_name || null,
                entry.service_id || null,
                entry.pppoe_username || null,
                entry.action,
                entry.status,
                entry.onu_index || null,
                entry.onu_sn || null,
                entry.current_name || null,
                entry.new_name || null,
                entry.old_mac || null,
                entry.new_mac || null,
                Boolean(entry.dry_run),
                entry.message || null
            ]
        );
    } catch (err) {
        logger.warn(`[ONU Lifecycle] gagal menulis onu_change_log: ${err.message}`);
    }
}

/**
 * Apply a scan result. Only `rename_new` and `mark_old` write to the OLT;
 * `sync_mac` updates technical_details.mac_address.
 *
 * @param {Array} items - items produced by scanOnuChanges
 * @param {Object} options - { markOld = true, dryRun = false, source = 'manual' }
 */
async function applyOnuChanges(items = [], options = {}) {
    const { markOld = true, dryRun = false, source = 'manual' } = options;
    const results = [];
    let applied = 0;
    let failed = 0;
    let skipped = 0;

    const oltsById = new Map();
    const ensureOlt = async (oltId) => {
        if (!oltId) return null;
        if (oltsById.has(oltId)) return oltsById.get(oltId);
        const res = await query(
            `SELECT id, name, host, type, snmp_community, snmp_write_community, snmp_version, snmp_port
             FROM olts WHERE id = $1`,
            [oltId]
        );
        const olt = res.rows?.[0] || null;
        oltsById.set(oltId, olt);
        return olt;
    };

    for (const item of items) {
        if (!item || !item.action) {
            skipped++;
            continue;
        }

        if (item.action === 'skip') {
            skipped++;
            continue;
        }

        if (item.action === 'mark_old' && !markOld) {
            const record = { ...item, status: 'skipped', dry_run: dryRun, message: 'Penandaan ONU lama dimatikan.' };
            await logChange({ ...record, action: 'mark_old' });
            results.push(record);
            skipped++;
            continue;
        }

        if (item.action === 'sync_mac') {
            if (!item.new_mac || dryRun) {
                const record = { ...item, status: dryRun ? 'dry_run' : 'skipped', dry_run: dryRun };
                if (!dryRun) await logChange(record);
                results.push(record);
                skipped++;
                continue;
            }
            try {
                await query(
                    `UPDATE technical_details SET mac_address = $1, updated_at = NOW()
                     WHERE service_id = $2`,
                    [item.new_mac, item.service_id]
                );
                const record = { ...item, status: 'success', dry_run: false, message: `MAC billing diperbarui menjadi ${item.new_mac}.` };
                await logChange(record);
                results.push(record);
                applied++;
            } catch (err) {
                const record = { ...item, status: 'error', dry_run: false, message: err.message };
                await logChange(record);
                results.push(record);
                failed++;
            }
            continue;
        }

        if (item.action !== 'rename_new' && item.action !== 'mark_old') {
            skipped++;
            continue;
        }

        const olt = await ensureOlt(item.olt_id);
        if (!olt) {
            const record = { ...item, status: 'error', dry_run: dryRun, message: 'OLT tidak ditemukan.' };
            await logChange(record);
            results.push(record);
            failed++;
            continue;
        }

        const safeName = sanitizeName(item.new_name);
        if (!safeName) {
            const record = { ...item, status: 'error', dry_run: dryRun, message: 'Nama baru kosong setelah sanitasi.' };
            await logChange(record);
            results.push(record);
            failed++;
            continue;
        }

        if (dryRun) {
            const record = { ...item, new_name: safeName, status: 'dry_run', dry_run: true };
            results.push(record);
            skipped++;
            continue;
        }

        try {
            // Small gap so OLT SNMP agent is not flooded.
            await new Promise(r => setTimeout(r, 250));
            const writeRes = await oltMonitor.setOnuName(
                oltConfig(olt, { write: true }),
                item.onu_index,
                safeName
            );
            if (!writeRes?.success) {
                throw new Error(writeRes?.message || 'SNMP write ditolak OLT');
            }

            const record = {
                ...item,
                new_name: safeName,
                status: 'success',
                dry_run: false,
                message: `Diubah dari "${item.current_name || '-'}" menjadi "${safeName}".`
            };
            await logChange({ ...record, source });

            if (item.action === 'rename_new' && item.service_id && item.new_mac) {
                await query(
                    `UPDATE technical_details SET mac_address = $1, updated_at = NOW()
                     WHERE service_id = $2 AND (mac_address IS NULL OR mac_address <> $1)`,
                    [item.new_mac, item.service_id]
                );
            }

            results.push(record);
            applied++;
            logger.info(`[ONU Lifecycle] ${olt.name} ONU ${item.onu_index}: "${item.current_name || '-'}" → "${safeName}" (${source})`);
        } catch (err) {
            const record = { ...item, new_name: safeName, status: 'error', dry_run: false, message: err.message };
            await logChange({ ...record, source });
            results.push(record);
            failed++;
            logger.error(`[ONU Lifecycle] ${olt.name} ONU ${item.onu_index}: ${err.message}`);
        }
    }

    return { applied, failed, skipped, results };
}

async function isAutoSyncEnabled() {
    try {
        const res = await query(`SELECT value FROM app_config WHERE key = 'onu_auto_sync_enabled' LIMIT 1`);
        const value = String(res.rows?.[0]?.value || '').toLowerCase();
        return value === 'true' || value === '1';
    } catch (err) {
        logger.warn(`[ONU Lifecycle] gagal membaca onu_auto_sync_enabled: ${err.message}`);
        return false;
    }
}

async function isMarkOldEnabled() {
    try {
        const res = await query(`SELECT value FROM app_config WHERE key = 'onu_auto_mark_old_enabled' LIMIT 1`);
        const value = String(res.rows?.[0]?.value || '').toLowerCase();
        return value === 'true' || value === '1';
    } catch (err) {
        logger.warn(`[ONU Lifecycle] gagal membaca onu_auto_mark_old_enabled: ${err.message}`);
        return false;
    }
}

/**
 * Cron entry point: scan and apply renames when enabled in app_config.
 */
async function runAutoSync() {
    if (!(await isAutoSyncEnabled())) {
        return { enabled: false, applied: 0, failed: 0, skipped: 0 };
    }

    const markOld = await isMarkOldEnabled();
    const scan = await scanOnuChanges();
    const actionable = scan.items.filter(item => {
        if (item.action === 'rename_new') return true;
        if (item.action === 'mark_old') return markOld;
        return item.action === 'sync_mac';
    });

    if (actionable.length === 0) {
        return { enabled: true, applied: 0, failed: 0, skipped: 0, scanned: scan.items.length };
    }

    const result = await applyOnuChanges(actionable, { markOld, source: 'cron' });
    logger.info(`[ONU Lifecycle] auto-sync: ${result.applied} diterapkan, ${result.failed} gagal, ${result.skipped} dilewati`);
    return { enabled: true, scanned: scan.items.length, ...result };
}

async function recentChanges(limit = 50) {
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const res = await query(
        `SELECT * FROM onu_change_log ORDER BY created_at DESC, id DESC LIMIT $1`,
        [safeLimit]
    );
    return res.rows || [];
}

module.exports = {
    sanitizeName,
    normalizeMac,
    isPlaceholderName,
    buildOldName,
    scanOnuChanges,
    applyOnuChanges,
    runAutoSync,
    isAutoSyncEnabled,
    isMarkOldEnabled,
    recentChanges
};
