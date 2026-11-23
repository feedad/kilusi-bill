const axios = require('axios');
const { query } = require('../../../config/database');
const { logger } = require('../../../config/logger');
const { getSetting } = require('../../../config/settingsManager');
const oltSnmpMonitor = require('../../../config/olt-snmp-monitor');

// Redaman thresholds — keep in sync with routes/api/v1/monitoring.js
const RX_NORMAL_MIN = -24;
const RX_WARNING_MIN = -27;
const CACHE_FRESH_MINUTES = 10;

function classifyRx(dbm) {
    if (dbm === null || dbm === undefined || dbm === '') return null;
    const value = Number(dbm);
    if (!Number.isFinite(value)) return null;
    if (value >= RX_NORMAL_MIN) return 'normal';
    if (value >= RX_WARNING_MIN) return 'warning';
    return 'critical';
}

function normalizeRx(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const cleaned = String(raw).replace(/[^0-9.\-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return null;
    let value = Number(cleaned);
    if (!Number.isFinite(value)) return null;
    if (Math.abs(value) > 1000) value = value / 100;
    if (value >= 0 || value < -60) return null;
    return Number(value.toFixed(2));
}

function normalizeMac(raw) {
    return String(raw || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
}

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label || 'operation'} timeout ${ms}ms`)), ms))
    ]);
}

async function getCachedSignal(pppoeUsername) {
    if (!pppoeUsername) return null;
    try {
        const res = await query(
            `SELECT pppoe_username, rx_power, tx_power, distance, olt_name, onu_index, polled_at
             FROM olt_signal_cache
             WHERE pppoe_username = $1
               AND polled_at > NOW() - INTERVAL '${CACHE_FRESH_MINUTES} minutes'
             LIMIT 1`,
            [pppoeUsername]
        );
        const row = res.rows?.[0];
        if (!row) return null;
        const rx = normalizeRx(row.rx_power);
        return {
            found: true,
            source: 'olt_signal_cache',
            rx_power: rx,
            quality: classifyRx(rx),
            tx_power: normalizeRx(row.tx_power),
            distance: row.distance || null,
            olt_name: row.olt_name || '-',
            onu_index: row.onu_index || null,
            polled_at: row.polled_at
        };
    } catch (err) {
        logger.warn(`[OnuSignal] cache lookup failed: ${err.message}`);
        return null;
    }
}

function extractRxFromDevice(device) {
    const vp = device?.VirtualParameters || {};
    const candidates = [
        vp.RXPower?._value,
        vp.redaman?._value,
        vp.rxPower?._value,
        device?.InternetGatewayDevice?.WANDevice?.['1']?.WANPONInterfaceConfig?.RXPower?._value,
        device?.InternetGatewayDevice?.WANDevice?.['1']?.X_ZTE_COM_WANPONInterfaceConfig?.RXPower?._value
    ];
    for (const candidate of candidates) {
        const rx = normalizeRx(candidate);
        if (rx !== null) return rx;
    }
    return null;
}

function buildGenieAcsClient(baseURL) {
    return axios.create({
        baseURL,
        timeout: 8000,
        headers: { Accept: 'application/json' }
    });
}

async function resolveGenieAcsUrl() {
    let url = getSetting('genieacs_url', '');
    if (!url) {
        try {
            const { getSettingAsync } = require('../../../config/settingsManager');
            if (typeof getSettingAsync === 'function') {
                url = await getSettingAsync('genieacs_url', '');
            }
        } catch (err) {
            logger.debug(`[OnuSignal] settings init failed: ${err.message}`);
        }
    }
    if (!url) {
        try {
            const res = await query(`SELECT value FROM app_config WHERE key = 'genieacs_url' LIMIT 1`);
            url = res.rows?.[0]?.value || '';
        } catch (err) {
            logger.debug(`[OnuSignal] app_config lookup failed: ${err.message}`);
        }
    }
    return String(url || 'http://localhost:7557').trim();
}

async function findGenieAcsDevice({ pppoeUsername, macAddress, sessionIp }) {
    const client = buildGenieAcsClient(await resolveGenieAcsUrl());
    const queries = [];

    if (sessionIp) queries.push({ 'VirtualParameters.pppoeIP': String(sessionIp) });
    const mac = normalizeMac(macAddress);
    if (mac) {
        const pretty = mac.match(/.{2}/g)?.join(':');
        queries.push({ 'VirtualParameters.pppoeMac': pretty });
    }
    if (pppoeUsername) {
        queries.push({ 'VirtualParameters.pppoeUsername': String(pppoeUsername) });
        queries.push({ 'VirtualParameters.pppUsername': String(pppoeUsername) });
    }

    for (const q of queries) {
        try {
            const res = await client.get('/devices', {
                params: {
                    query: JSON.stringify(q),
                    projection: '_id,_deviceId,_lastInform,VirtualParameters',
                    limit: 1
                }
            });
            const device = Array.isArray(res.data) ? res.data[0] : null;
            if (device) return device;
        } catch (err) {
            logger.debug(`[OnuSignal] GenieACS query failed (${Object.keys(q)[0]}): ${err.message}`);
        }
    }
    return null;
}

async function getGenieAcsSignal(context) {
    try {
        const device = await findGenieAcsDevice(context);
        if (!device) return null;

        const rx = extractRxFromDevice(device);
        if (rx === null) return null;

        return {
            found: true,
            source: 'genieacs',
            rx_power: rx,
            quality: classifyRx(rx),
            olt_name: null,
            onu_index: null,
            serial_number: device?._deviceId?._SerialNumber || null,
            polled_at: device?._lastInform || null
        };
    } catch (err) {
        logger.warn(`[OnuSignal] GenieACS lookup failed: ${err.message}`);
        return null;
    }
}

async function getSnmpSignal({ serialNumber, macAddress, cacheHint }) {
    let olts = [];
    try {
        const res = await query(
            `SELECT name, host, type, snmp_community, snmp_port, snmp_version, snmp_write_community
             FROM olts WHERE status = 'active'`
        );
        olts = res.rows || [];
    } catch (err) {
        logger.warn(`[OnuSignal] failed listing OLTs: ${err.message}`);
        return null;
    }

    const serials = [serialNumber, normalizeMac(macAddress)].filter(Boolean).filter(v => v.length >= 6);
    const indexes = cacheHint?.onu_index ? [cacheHint.onu_index] : [];
    const preferred = String(cacheHint?.olt_name || '').toLowerCase();

    const ordered = [...olts].sort((a, b) => {
        if (!preferred) return 0;
        const aHit = String(a.name || '').toLowerCase() === preferred ? 0 : 1;
        const bHit = String(b.name || '').toLowerCase() === preferred ? 0 : 1;
        return aHit - bHit;
    });

    for (const olt of ordered) {
        const config = {
            host: olt.host,
            community: olt.snmp_community,
            version: olt.snmp_version || '2c',
            port: olt.snmp_port || 161,
            vendor: olt.type
        };
        try {
            const found = await withTimeout(
                oltSnmpMonitor.findOnuByAny(config, { indexes, serials }),
                8000,
                `SNMP ${olt.name}`
            );
            if (found?.success) {
                const rx = normalizeRx(found.rxPower);
                return {
                    found: true,
                    source: 'olt_snmp',
                    rx_power: rx,
                    quality: classifyRx(rx),
                    olt_name: olt.name,
                    onu_index: found.index || null,
                    onu_status: found.status || null,
                    serial_number: found.sn || serials[0] || null,
                    polled_at: new Date()
                };
            }
        } catch (err) {
            logger.debug(`[OnuSignal] ${olt.name} lookup failed: ${err.message}`);
        }
    }
    return null;
}

async function getCacheHint(pppoeUsername) {
    if (!pppoeUsername) return null;
    try {
        const res = await query(
            `SELECT olt_name, onu_index, rx_power, polled_at
             FROM olt_signal_cache
             WHERE pppoe_username = $1
               AND polled_at > NOW() - INTERVAL '7 days'
             LIMIT 1`,
            [pppoeUsername]
        );
        const row = res.rows?.[0];
        if (!row) return null;
        return { olt_name: row.olt_name, onu_index: row.onu_index };
    } catch (err) {
        logger.warn(`[OnuSignal] cache hint lookup failed: ${err.message}`);
        return null;
    }
}

/**
 * Resolve optical signal (redaman) for one service using layered sources:
 * OLT cache -> GenieACS -> live SNMP.
 */
async function resolveOnuSignal({ pppoeUsername, macAddress, sessionIp, serialNumber } = {}) {
    const fromCache = await getCachedSignal(pppoeUsername);
    if (fromCache) return fromCache;

    const cacheHint = await getCacheHint(pppoeUsername);

    const fromAcs = await getGenieAcsSignal({
        pppoeUsername,
        macAddress,
        sessionIp
    });
    if (fromAcs) return fromAcs;

    const fromSnmp = await getSnmpSignal({ serialNumber, macAddress, cacheHint });
    if (fromSnmp) return fromSnmp;

    const reasons = [];
    if (!pppoeUsername) reasons.push('PPPoE username tidak ditemukan');
    if (!fromCache) reasons.push('belum ada di cache OLT (10 menit terakhir)');
    if (!fromAcs) reasons.push('tidak terdaftar di GenieACS');
    if (!fromSnmp) reasons.push('tidak ditemukan di OLT via SNMP');

    return {
        found: false,
        rx_power: null,
        quality: null,
        reason: `Redaman belum tersedia: ${reasons.join('; ')}.`
    };
}

async function hasFreshCache() {
    try {
        const res = await query(
            `SELECT 1 FROM olt_signal_cache
             WHERE polled_at > NOW() - INTERVAL '${CACHE_FRESH_MINUTES} minutes'
             LIMIT 1`
        );
        return (res.rows || []).length > 0;
    } catch (err) {
        logger.warn(`[OnuSignal] cache freshness check failed: ${err.message}`);
        return false;
    }
}

async function refreshSignalCache() {
    try {
        const { pollOltSignal } = require('../../../config/olt-signal-poller');
        await withTimeout(pollOltSignal(), 45000, 'OLT signal poll');
        return true;
    } catch (err) {
        logger.warn(`[OnuSignal] cache refresh failed: ${err.message}`);
        return false;
    }
}

module.exports = {
    RX_NORMAL_MIN,
    RX_WARNING_MIN,
    CACHE_FRESH_MINUTES,
    classifyRx,
    normalizeRx,
    normalizeMac,
    getCachedSignal,
    resolveOnuSignal,
    hasFreshCache,
    refreshSignalCache
};
