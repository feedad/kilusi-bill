const { query } = require('../../../config/database');
const logger = require('../../../config/logger');

// Cache for known region and mitra keywords
let regionKeywordsCache = null;
let regionKeywordsCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Known payment methods and variations
const PAYMENT_METHOD_KEYWORDS = [
    { key: 'cash', tokens: ['tunai', 'cash'] },
    { key: 'bca', tokens: ['bca'] },
    { key: 'bri', tokens: ['bri'] },
    { key: 'mandiri', tokens: ['mandiri'] },
    { key: 'bni', tokens: ['bni'] },
    { key: 'ocbc', tokens: ['ocbc', 'ocbc nisp'] },
    { key: 'dana', tokens: ['dana'] },
    { key: 'gopay', tokens: ['gopay'] },
    { key: 'ovo', tokens: ['ovo'] },
    { key: 'transfer', tokens: ['transfer', 'tf', 'trf'] }
];

// Common noise / filler words in admin billing commands
const NOISE_WORDS = [
    'proses', 'proseskan', 'tagihan', 'tagihannya', 'invoice',
    'sudah', 'telah', 'udah', 'udh', 'sdh',
    'bayar', 'dibayar', 'bayarkan', 'lunas', 'melunasi',
    'via', 'lewat', 'melalui', 'pake', 'pakai',
    'atas', 'nama', 'an', 'a.n', 'a/n', 'pelanggan', 'customer', 'cust',
    'tolong', 'mohon', 'bantu', 'min', 'bot', 'admin', 'tolong bantu',
    'ke', 'dari', 'untuk', 'pada', 'di'
];

// Known address / area alias keywords that map to regions
const STATIC_AREA_KEYWORDS = [
    'talaga sunda', 'talagasunda', 'prima talaga sunda',
    'tatakang', 'jagadita', 'janaloka', 'jagakarta', 'jalatunda', 'talaga raya',
    'cibogo', 'blok cibogo', 'kirana', 'bukit cilaja', 'cilaja',
    'polandia', 'pld', 'poncol', 'poncol 1', 'poncol 2',
    'buana subang raya', 'buana subang raya 2', 'bsr', 'bsr2',
    'palabuan'
];


const MONTH_NAME_MAP = {
    januari: 1, jan: 1, january: 1,
    februari: 2, feb: 2, february: 2,
    maret: 3, mar: 3, march: 3,
    april: 4, apr: 4,
    mei: 5, may: 5,
    juni: 6, jun: 6, june: 6,
    juli: 7, jul: 7, july: 7,
    agustus: 8, agu: 8, agt: 8, aug: 8, august: 8,
    september: 9, sep: 9, sept: 9,
    oktober: 10, okt: 10, oct: 10, october: 10,
    november: 11, nov: 11,
    desember: 12, des: 12, dec: 12, december: 12
};

/**
 * Parses month, year, or date ranges into standardized start and end date strings.
 * Handles Indonesian month names, "YYYY-MM", numeric months, and custom date ranges.
 */
function parseDateRange({ month, year, date_from, date_to, extendCutoff = false } = {}) {
    const now = new Date();
    // Default year: if current system year is before 2026, use 2026 as context base year
    const baseYear = now.getFullYear() < 2026 ? 2026 : now.getFullYear();

    // 1. Explicit date_from & date_to
    if (date_from && /^\d{4}-\d{2}-\d{2}$/.test(String(date_from).trim())) {
        const fromStr = String(date_from).trim();
        let toStr = date_to && /^\d{4}-\d{2}-\d{2}$/.test(String(date_to).trim())
            ? String(date_to).trim()
            : fromStr;
        return {
            hasPeriod: true,
            startDate: `${fromStr} 00:00:00`,
            endDate: `${toStr} 23:59:59.999`,
            startDateOnly: fromStr,
            endDateOnly: toStr,
            label: `${fromStr} s.d. ${toStr}`
        };
    }

    // 2. Month and Year parsing
    let targetYear = year ? parseInt(year, 10) : null;
    let targetMonth = null;

    if (month) {
        const mStr = String(month).trim().toLowerCase();
        // Format "YYYY-MM"
        const yyyymmMatch = mStr.match(/^(\d{4})[-/.](\d{1,2})$/);
        if (yyyymmMatch) {
            targetYear = parseInt(yyyymmMatch[1], 10);
            targetMonth = parseInt(yyyymmMatch[2], 10);
        } else {
            // Format "Month YYYY" or "YYYY Month"
            const embeddedYearMatch = mStr.match(/\b(20\d{2})\b/);
            if (embeddedYearMatch) {
                targetYear = parseInt(embeddedYearMatch[1], 10);
            }
            // Extract month name or number
            const cleanedMonthStr = mStr.replace(/\b20\d{2}\b/g, '').trim();
            if (MONTH_NAME_MAP[cleanedMonthStr]) {
                targetMonth = MONTH_NAME_MAP[cleanedMonthStr];
            } else if (/^\d{1,2}$/.test(cleanedMonthStr)) {
                targetMonth = parseInt(cleanedMonthStr, 10);
            } else {
                for (const [mName, mNum] of Object.entries(MONTH_NAME_MAP)) {
                    if (cleanedMonthStr.includes(mName)) {
                        targetMonth = mNum;
                        break;
                    }
                }
            }
        }
    }

    if (!targetYear) {
        targetYear = baseYear;
    }

    if (targetMonth !== null && targetMonth >= 1 && targetMonth <= 12) {
        const padM = String(targetMonth).padStart(2, '0');
        const startStr = `${targetYear}-${padM}-01`;
        const lastDay = new Date(targetYear, targetMonth, 0).getDate();

        let endStr;
        let endTimestamp;
        if (extendCutoff) {
            // For billing financial reports: includes payment posted on the 1st of the next month (cutoff grace)
            const nextMonth = targetMonth === 12 ? 1 : targetMonth + 1;
            const nextYear = targetMonth === 12 ? targetYear + 1 : targetYear;
            endStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
            endTimestamp = `${endStr} 23:59:59.999`;
        } else {
            endStr = `${targetYear}-${padM}-${String(lastDay).padStart(2, '0')}`;
            endTimestamp = `${endStr} 23:59:59.999`;
        }

        const monthNamesIndo = [
            '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
        ];

        return {
            hasPeriod: true,
            targetYear,
            targetMonth,
            startDate: `${startStr} 00:00:00`,
            endDate: endTimestamp,
            startDateOnly: startStr,
            endDateOnly: endStr,
            label: `${monthNamesIndo[targetMonth]} ${targetYear}`
        };
    }

    return {
        hasPeriod: false,
        startDate: null,
        endDate: null,
        label: 'Semua Periode'
    };
}
async function loadKnownRegionKeywords() {
    const now = Date.now();
    if (regionKeywordsCache && (now - regionKeywordsCacheTime < CACHE_TTL_MS)) {
        return regionKeywordsCache;
    }

    const keywordSet = new Set(STATIC_AREA_KEYWORDS.map(k => k.toLowerCase()));


    try {
        const [regionsRes, mitraRes] = await Promise.all([
            query(`SELECT name FROM regions WHERE name IS NOT NULL`),
            query(`SELECT name FROM mitra WHERE name IS NOT NULL`)
        ]);

        for (const row of (regionsRes.rows || [])) {
            const name = String(row.name || '').trim().toLowerCase();
            if (name) {
                keywordSet.add(name);
                // Also add simplified versions (without RT/RW)
                const simplified = name.replace(/\brt\s*\d+\b/gi, '').replace(/\brw\s*\d+\b/gi, '').trim();
                if (simplified.length >= 3) keywordSet.add(simplified);
            }
        }

        for (const row of (mitraRes.rows || [])) {
            const name = String(row.name || '').trim().toLowerCase();
            if (name) keywordSet.add(name);
        }
    } catch (err) {
        logger.warn(`search-helper: Failed to load regions/mitra for keywords: ${err.message}`);
    }

    // Sort keywords by length descending so longer phrases match first (e.g. "talaga sunda" before "sunda")
    const sorted = Array.from(keywordSet)
        .filter(k => k.length >= 2)
        .sort((a, b) => b.length - a.length);

    regionKeywordsCache = sorted;
    regionKeywordsCacheTime = now;
    return sorted;
}

/**
 * Tokenize and parse billing shorthand query.
 * Examples:
 *   "dhonny bca talaga sunda" -> name: "dhonny", method: "bca", region: "talaga sunda"
 *   "dhonny 3 bulan bca"      -> name: "dhonny", months: 3, method: "bca"
 *   "proses tagihan dhony sudah bayar via bca talaga sunda" -> name: "dhony", method: "bca", region: "talaga sunda"
 */
async function parseShorthandQuery(text) {
    if (!text || typeof text !== 'string') {
        return {
            original: '',
            cleanedName: '',
            extractedMethod: null,
            extractedMonths: null,
            extractedRegion: null,
            isRapel: false
        };
    }

    let working = text.trim();
    let extractedMonths = null;
    let extractedMethod = null;
    let extractedRegion = null;

    // 1. Detect rapel period: "N bulan" / "N bln" / "rapel N"
    const rapelMatch = working.match(/\b(?:rapel\s*)?(\d{1,2})\s*(?:bulan|bln)\b/i) ||
                       working.match(/\brapel\s+(\d{1,2})\b/i);
    if (rapelMatch) {
        const m = parseInt(rapelMatch[1], 10);
        if (m >= 1 && m <= 12) {
            extractedMonths = m;
            working = working.replace(rapelMatch[0], ' ');
        }
    }

    // 2. Detect payment method tokens
    const lowerWorking = ' ' + working.toLowerCase() + ' ';
    for (const pm of PAYMENT_METHOD_KEYWORDS) {
        let matchedToken = null;
        for (const tok of pm.tokens) {
            const regex = new RegExp(`(?:\\s|^|via|lewat|pake|pakai)${tok}(?:\\s|$|[.,])`, 'i');
            if (regex.test(lowerWorking)) {
                matchedToken = tok;
                break;
            }
        }
        if (matchedToken) {
            extractedMethod = pm.key;
            // Remove token from working string
            const replaceRegex = new RegExp(`\\b${matchedToken}\\b`, 'gi');
            working = working.replace(replaceRegex, ' ');
            break;
        }
    }

    // 3. Detect known region/mitra keywords
    const knownRegions = await loadKnownRegionKeywords();
    for (const regKw of knownRegions) {
        const regRegex = new RegExp(`(?:\\b|^)${regKw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?:\\b|$)`, 'i');
        if (regRegex.test(working)) {
            extractedRegion = regKw;
            working = working.replace(regRegex, ' ');
            break;
        }
    }

    // 4. Strip noise words
    const tokens = working.split(/\s+/).filter(t => t.length > 0);
    const cleanedTokens = [];
    for (const t of tokens) {
        const low = t.toLowerCase().replace(/^[^\w]+|[^\w]+$/g, '');
        if (!low) continue;
        if (NOISE_WORDS.includes(low)) continue;
        cleanedTokens.push(t);
    }

    const cleanedName = cleanedTokens.join(' ').trim();

    return {
        original: text,
        cleanedName,
        extractedMethod,
        extractedMonths,
        extractedRegion,
        isRapel: extractedMonths !== null
    };
}

/**
 * Builds a typo-tolerant regex pattern for PostgreSQL ~* operator.
 * Handles:
 *   - Doubled vs single consonants (dhonny <-> dhony)
 *   - Common Indonesian phonetic variants (dh <-> d, sy <-> s, j <-> z, f <-> v <-> p)
 */
function buildFuzzyNameRegex(name) {
    if (!name || typeof name !== 'string') return null;
    const clean = name.trim().toLowerCase();
    if (clean.length < 2) return clean;

    let pattern = '';
    let i = 0;
    while (i < clean.length) {
        const two = clean.slice(i, i + 2);
        if (two === 'dh' || two === 'kh' || two === 'sy' || two === 'sh' || two === 'ch') {
            const base = two[0];
            pattern += `(${two}|${base})+`;
            i += 2;
            continue;
        }

        const ch = clean[i];
        if (ch === 'j' || ch === 'z') {
            pattern += '(j|z)+';
        } else if (ch === 'f' || ch === 'v' || ch === 'p') {
            pattern += '(f|v|p)+';
        } else if (ch === 'i' || ch === 'y') {
            pattern += '(i|y)+';
        } else if (/[a-z]/i.test(ch)) {
            pattern += `${ch}+`;
        } else {
            pattern += ch.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        }
        i++;
    }

    return pattern;
}

/**
 * Resolves customer, services, and region/mitra from raw query with high tolerance.
 *
 * @param {string} queryText - User's query, shorthand, or full sentence
 * @param {object} options
 *   - identity: user context for role/region scoping
 *   - includeInvoices: boolean, whether to fetch unpaid invoices
 *   - limit: number
 * @returns {object} { parsed, found, customer, candidates, error }
 */
async function resolveCustomerAndRegion(queryText, options = {}) {
    const { identity = {}, includeInvoices = false, limit = 10 } = options;
    const parsed = await parseShorthandQuery(queryText);

    // Search query to run: prefer parsed cleanedName, fallback to original
    const effectiveQuery = parsed.cleanedName || queryText.trim();
    if (!effectiveQuery) {
        return {
            parsed,
            found: false,
            error: 'Mohon sebutkan nama pelanggan, nomor layanan, nomor HP, atau nomor invoice.'
        };
    }

    const regionFilter = parsed.extractedRegion;
    const fuzzyPattern = buildFuzzyNameRegex(effectiveQuery);

    const conditions = [];
    const params = [];

    // Role-based scope (Mitra is scoped to their region_ids)
    if (identity.role === 'mitra') {
        if (!Array.isArray(identity.region_ids) || identity.region_ids.length === 0) {
            return {
                parsed,
                found: false,
                error: 'Akses ditolak: Anda tidak memiliki wilayah yang ditugaskan.'
            };
        }
        params.push(identity.region_ids);
        conditions.push(`s.region_id = ANY($${params.length}::uuid[])`);
    }

    // Region / Mitra keyword filter if detected from query
    if (regionFilter) {
        params.push(`%${regionFilter}%`);
        const regIdx = params.length;
        conditions.push(`(
            r.name ILIKE $${regIdx}
            OR m.name ILIKE $${regIdx}
            OR s.area ILIKE $${regIdx}
            OR c.address ILIKE $${regIdx}
        )`);
    }

    // Customer match conditions
    params.push(effectiveQuery);
    const exactIdx = params.length;
    params.push(`%${effectiveQuery}%`);
    const likeIdx = params.length;

    let nameCondition = `(
        s.service_number = $${exactIdx}
        OR c.id = $${exactIdx}
        OR c.phone = $${exactIdx}
        OR td.pppoe_username = $${exactIdx}
        OR td.mac_address ILIKE $${exactIdx}
        OR c.name ILIKE $${likeIdx}
        OR td.pppoe_username ILIKE $${likeIdx}
        OR c.address ILIKE $${likeIdx}
    )`;

    if (fuzzyPattern && fuzzyPattern !== effectiveQuery) {
        params.push(fuzzyPattern);
        const fuzzyIdx = params.length;
        nameCondition = `(
            ${nameCondition}
            OR c.name ~* $${fuzzyIdx}
        )`;
    }

    conditions.push(nameCondition);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
        SELECT
            c.id AS customer_id,
            c.name AS customer_name,
            c.phone AS customer_phone,
            c.address AS customer_address,
            s.id AS service_id,
            s.service_number,
            s.status AS service_status,
            s.active_date,
            s.isolir_date,
            s.siklus,
            s.billing_type,
            s.package_id,
            p.name AS package_name,
            p.speed AS package_speed,
            p.price AS package_price,
            td.pppoe_username,
            td.ip_address_static AS static_ip,
            td.mac_address,
            r.id AS region_id,
            r.name AS region_name,
            r.mitra_id,
            m.name AS mitra_name
        FROM customers c
        LEFT JOIN services s ON s.customer_id = c.id
        LEFT JOIN technical_details td ON td.service_id = s.id
        LEFT JOIN packages p ON s.package_id = p.id
        LEFT JOIN regions r ON s.region_id = r.id
        LEFT JOIN mitra m ON r.mitra_id = m.id
        ${whereClause}
        ORDER BY
            (c.name ILIKE $${exactIdx}) DESC,
            (s.service_number = $${exactIdx}) DESC,
            (s.status = 'active') DESC NULLS LAST,
            c.name ASC
        LIMIT ${Math.max(1, Math.min(25, limit))}
    `;

    const res = await query(sql, params);
    const rows = res.rows || [];

    if (rows.length === 0) {
        // If searching with region filter failed, try fallback without region filter
        if (regionFilter) {
            return resolveCustomerAndRegion(queryText.replace(new RegExp(regionFilter, 'gi'), ' '), {
                ...options,
                limit
            });
        }
        return {
            parsed,
            found: false,
            error: `Tidak ditemukan pelanggan yang cocok dengan "${effectiveQuery}".`
        };
    }

    // Deduplicate / group by customer_id and service_id
    const customerMap = new Map();
    for (const row of rows) {
        const key = `${row.customer_id}::${row.service_id || 'no_svc'}`;
        if (!customerMap.has(key)) {
            customerMap.set(key, {
                customer_id: row.customer_id,
                name: row.customer_name,
                customer_name: row.customer_name,
                phone: row.customer_phone || '-',
                customer_phone: row.customer_phone || '-',
                address: row.customer_address || '-',
                service_id: row.service_id,
                service_number: row.service_number || '-',
                service_status: row.service_status || '-',
                active_date: row.active_date,
                isolir_date: row.isolir_date,
                siklus: row.siklus || 'fixed',
                billing_type: row.billing_type || 'postpaid',
                package_id: row.package_id,
                package_name: row.package_name || '-',
                package_price: row.package_price ? Number(row.package_price) : 0,
                pppoe_username: row.pppoe_username || '-',
                static_ip: row.static_ip || null,
                mac_address: row.mac_address || null,
                region_id: row.region_id,
                region_name: row.region_name || '-',
                mitra_id: row.mitra_id || null,
                mitra_name: row.mitra_name || '-'
            });
        }
    }

    const uniqueCandidates = Array.from(customerMap.values());

    // If requested or if only 1 customer matched, load unpaid invoices
    if (includeInvoices && uniqueCandidates.length <= 3) {
        for (const cand of uniqueCandidates) {
            const invRes = await query(
                `SELECT
                    id, invoice_number, amount, amount_with_code, status, due_date
                 FROM invoices
                 WHERE customer_id = $1
                   AND status IN ('unpaid', 'overdue', 'suspended', 'sent', 'draft')
                 ORDER BY due_date ASC, id ASC`,
                [cand.customer_id]
            );
            cand.unpaid_invoices = invRes.rows || [];
        }
    }

    const isSingleMatch = uniqueCandidates.length === 1;

    return {
        parsed,
        extractedMethod: parsed.extractedMethod,
        extractedMonths: parsed.extractedMonths,
        extractedRegion: parsed.extractedRegion,
        found: true,
        customer: isSingleMatch ? uniqueCandidates[0] : null,
        candidates: uniqueCandidates,
        candidateCount: uniqueCandidates.length
    };
}

module.exports = {
    parseShorthandQuery,
    buildFuzzyNameRegex,
    resolveCustomerAndRegion,
    loadKnownRegionKeywords,
    parseDateRange,
    PAYMENT_METHOD_KEYWORDS,
    STATIC_AREA_KEYWORDS
};
