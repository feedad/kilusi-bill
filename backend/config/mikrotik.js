// Modul untuk koneksi dan operasi Mikrotik (optional) + SNMP monitor
const { logger } = require('./logger');
const { getSetting } = require('./settingsManager');
const snmpMonitor = require('./snmp-monitor');
let RouterOSAPI = null;
const useMikrotikApi = (String(require('./settingsManager').getSetting('mikrotik_api_enabled', 'false')).toLowerCase() === 'true');
if (useMikrotikApi) {
    try {
        RouterOSAPI = require('node-routeros-v2').RouterOSAPI;
    } catch (e) {
        logger.warn('node-routeros-v2 not installed; Mikrotik API disabled. Running in SNMP-only mode.');
        RouterOSAPI = null;
    }
}
// MySQL connection replaced with SQLite RADIUS database
const fs = require('fs');
const path = require('path');

let sock = null;
let mikrotikConnection = null;
// Multi-router support: connection pool keyed by router_id
const mikrotikConnectionsById = {};
let monitorInterval = null;
let writeQueue = Promise.resolve();

// Fungsi untuk set instance sock
function setSock(sockInstance) {
    sock = sockInstance;
}

// Fungsi untuk koneksi ke Mikrotik
async function connectToMikrotik() {
    // Check app mode first - skip MikroTik connection in RADIUS mode
    const appMode = getSetting('app_mode', 'api');
    if (appMode === 'radius') {
        logger.info('App is in RADIUS mode. Skipping MikroTik RouterOS connection.');
        return null;
    }

    if (!useMikrotikApi || !RouterOSAPI) {
        logger.info('Mikrotik API is disabled. Skipping RouterOS connection.');
        return null;
    }
    try {
        // Dapatkan konfigurasi Mikrotik
        const host = getSetting('mikrotik_host', '192.168.8.1');
        const port = parseInt(getSetting('mikrotik_port', '8728'));
        const user = getSetting('mikrotik_user', 'admin');
        const password = getSetting('mikrotik_password', 'admin');
        
        if (!host || !user || !password) {
            logger.error('Mikrotik configuration is incomplete');
            return null;
        }
        
        // Buat koneksi ke Mikrotik
        const conn = new RouterOSAPI({
            host,
            port,
            user,
            password,
            keepalive: true
        });
        
        // Connect ke Mikrotik
        await conn.connect();
        logger.info(`Connected to Mikrotik at ${host}:${port}`);
        
        // Set global connection
        mikrotikConnection = conn;
        
        return conn;
    } catch (error) {
        logger.error(`Error connecting to Mikrotik: ${error.message}`);
        return null;
    }
}

// Multi-router: read routers[] from settings or fallback to single default
function getRouterConfigs() {
    try {
        const settings = require('./settingsManager').getSettingsWithCache();
        const routers = Array.isArray(settings.routers) ? settings.routers : null;
        if (routers && routers.length) return routers.map(r => ({
            id: r.id || r.name || r.host || 'default',
            name: r.name || r.id || r.host,
            host: r.host || settings.mikrotik_host,
            port: parseInt(r.port || settings.mikrotik_port || '8728', 10),
            user: r.user || settings.mikrotik_user,
            password: r.password || settings.mikrotik_password
        }));
        // fallback single
        return [{
            id: 'default',
            name: 'Default Router',
            host: getSetting('mikrotik_host', '192.168.8.1'),
            port: parseInt(getSetting('mikrotik_port', '8728'), 10),
            user: getSetting('mikrotik_user', 'admin'),
            password: getSetting('mikrotik_password', 'admin')
        }];
    } catch (e) {
        return [{
            id: 'default',
            name: 'Default Router',
            host: getSetting('mikrotik_host', '192.168.8.1'),
            port: parseInt(getSetting('mikrotik_port', '8728'), 10),
            user: getSetting('mikrotik_user', 'admin'),
            password: getSetting('mikrotik_password', 'admin')
        }];
    }
}

function getRouterConfigById(routerId) {
    const list = getRouterConfigs();
    if (!routerId) return list[0];
    return list.find(r => String(r.id) === String(routerId)) || list[0];
}

async function connectToMikrotikForRouter(routerId) {
    if (!useMikrotikApi || !RouterOSAPI) return null;
    const cfg = getRouterConfigById(routerId);
    try {
        const key = String(cfg.id);
        if (mikrotikConnectionsById[key]) return mikrotikConnectionsById[key];
        const conn = new RouterOSAPI({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, keepalive: true });
        await conn.connect();
        mikrotikConnectionsById[key] = conn;
        logger.info(`Connected to Mikrotik [${key}] at ${cfg.host}:${cfg.port}`);
        return conn;
    } catch (e) {
        logger.error(`Error connecting to Mikrotik [${cfg.id}]: ${e.message}`);
        return null;
    }
}

async function getMikrotikConnectionForRouter(routerId) {
    const key = String((routerId || 'default'));
    let conn = mikrotikConnectionsById[key];
    if (!conn) conn = await connectToMikrotikForRouter(routerId);
    return conn;
}

// Serialize writes per router as well
const writeQueueByRouter = {};
async function rosWriteForRouter(routerId, command, params = []) {
    const task = (async () => {
        let conn = await getMikrotikConnectionForRouter(routerId);
        if (!conn) throw new Error('Koneksi ke Mikrotik gagal');
        try {
            return await conn.write(command, params);
        } catch (err) {
            const msg = (err && err.message) ? err.message : String(err);
            if (msg.includes('unregistered tag')) {
                logger.warn(`RouterOS unregistered tag on router [${routerId||'default'}]. Reconnecting and retrying once...`);
                try {
                    const key = String(routerId || 'default');
                    mikrotikConnectionsById[key] = null;
                    conn = await connectToMikrotikForRouter(routerId);
                    if (!conn) throw err;
                    return await conn.write(command, params);
                } catch (retryErr) {
                    throw retryErr;
                }
            }
            throw err;
        }
    })();

    const key = String(routerId || 'default');
    const q = writeQueueByRouter[key] || Promise.resolve();
    writeQueueByRouter[key] = q.then(() => task).catch(() => task);
    return task;
}

// Fungsi untuk mendapatkan koneksi Mikrotik
async function getMikrotikConnection() {
    if (!mikrotikConnection) {
        return await connectToMikrotik();
    }
    return mikrotikConnection;
}

// Serialize RouterOS writes and auto-recover on tag desync
async function rosWrite(command, params = []) {
    const task = (async () => {
        let conn = await getMikrotikConnection();
        if (!conn) throw new Error('Koneksi ke Mikrotik gagal');
        try {
            return await conn.write(command, params);
        } catch (err) {
            const msg = (err && err.message) ? err.message : String(err);
            if (msg.includes('unregistered tag')) {
                logger.warn('RouterOS unregistered tag received. Reconnecting and retrying once...');
                try {
                    mikrotikConnection = null;
                    conn = await connectToMikrotik();
                    if (!conn) throw err;
                    return await conn.write(command, params);
                } catch (retryErr) {
                    throw retryErr;
                }
            }
            throw err;
        }
    })();

    // Chain calls to avoid concurrent writes
    writeQueue = writeQueue.then(() => task).catch(() => task);
    return task;
}

// Fungsi untuk koneksi ke database RADIUS (PostgreSQL)
async function getRadiusConnection() {
    const radiusDb = require('./radius-postgres');
    // Initialize RADIUS tables if needed
    await radiusDb.initializeRadiusTables();
    return radiusDb; // Return the PostgreSQL RADIUS module
}

// Fungsi untuk mendapatkan seluruh user PPPoE dari RADIUS (PostgreSQL version)
async function getPPPoEUsersRadius() {
    const radiusDb = await getRadiusConnection();
    try {
        const rows = await radiusDb.query("SELECT username, value as password FROM radcheck WHERE attribute='Cleartext-Password'");
        return rows.map(row => ({ name: row.username, password: row.password }));
    } catch (error) {
        logger.error(`Error getting PPPoE users from RADIUS: ${error.message}`);
        return [];
    }
}

// Fungsi untuk menambah user PPPoE ke RADIUS (PostgreSQL version)
async function addPPPoEUserRadius({ username, password }) {
    const radiusDb = await getRadiusConnection();
    try {
        await radiusDb.query(
            "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
            [username, password]
        );
        return { success: true };
    } catch (error) {
        logger.error(`Error adding PPPoE user to RADIUS: ${error.message}`);
        return { success: false, message: error.message };
    }
}

// Wrapper: Pilih mode autentikasi dari settings
async function getPPPoEUsers() {
    const mode = getSetting('user_auth_mode', 'mikrotik');
    if (mode === 'radius') {
        return await getPPPoEUsersRadius();
    } else {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return [];
        }
        // Ambil semua secret PPPoE
    const pppSecrets = await rosWrite('/ppp/secret/print');
        // Ambil semua koneksi aktif
        const activeResult = await getActivePPPoEConnections();
        const activeNames = (activeResult && activeResult.success && Array.isArray(activeResult.data)) ? activeResult.data.map(c => c.name) : [];
        // Gabungkan data
        return pppSecrets.map(secret => ({
            id: secret['.id'],
            name: secret.name,
            password: secret.password,
            profile: secret.profile,
            active: activeNames.includes(secret.name)
        }));
    }
}

// Fungsi untuk edit user PPPoE (berdasarkan id)
async function editPPPoEUser({ id, username, password, profile }) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) throw new Error('Koneksi ke Mikrotik gagal');
        await rosWrite('/ppp/secret/set', [
            '=.id=' + id,
            '=name=' + username,
            '=password=' + password,
            '=profile=' + profile
        ]);
        return { success: true };
    } catch (error) {
        logger.error(`Error editing PPPoE user: ${error.message}`);
        throw error;
    }
}

// Fungsi untuk hapus user PPPoE (berdasarkan id)
async function deletePPPoEUser(id) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) throw new Error('Koneksi ke Mikrotik gagal');
    await rosWrite('/ppp/secret/remove', [ '=.id=' + id ]);
        return { success: true };
    } catch (error) {
        logger.error(`Error deleting PPPoE user: ${error.message}`);
        throw error;
    }
}

// Fungsi untuk mendapatkan daftar koneksi PPPoE aktif
async function getActivePPPoEConnections() {
    try {
        const mode = String(getSetting('user_auth_mode', 'mikrotik')).toLowerCase();
        if (mode === 'radius' || !useMikrotikApi) {
            const radiusDb = await getRadiusConnection();
            try {
                const rows = await radiusDb.getActivePPPoEConnections();
                return { success: true, message: `Ditemukan ${rows.length} koneksi PPPoE aktif (RADIUS)`, data: rows };
            } catch (error) {
                logger.error(`Error getting active PPPoE connections from RADIUS: ${error.message}`);
                return { success: false, message: error.message, data: [] };
            }
        } else {
            // Aggregate from all configured routers if available
            const routers = getRouterConfigs();
            if (Array.isArray(routers) && routers.length > 1) {
                const results = await Promise.all(routers.map(async (r) => {
                    try {
                        const list = await rosWriteForRouter(r.id, '/ppp/active/print');
                        return Array.isArray(list) ? list.map(item => ({ ...item, _router: r.id })) : [];
                    } catch (e) {
                        logger.warn(`Gagal mengambil PPPoE aktif dari router [${r.id}]: ${e.message}`);
                        return [];
                    }
                }));
                const flat = results.flat();
                return { success: true, message: `Ditemukan ${flat.length} koneksi PPPoE aktif (multi-router)`, data: flat };
            } else {
                const conn = await getMikrotikConnection();
                if (!conn) {
                    logger.error('No Mikrotik connection available');
                    return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
                }
                const pppConnections = await rosWrite('/ppp/active/print');
                return { success: true, message: `Ditemukan ${pppConnections.length} koneksi PPPoE aktif`, data: pppConnections };
            }
        }
    } catch (error) {
        logger.error(`Error getting active PPPoE connections: ${error.message}`);
        return { success: false, message: `Gagal ambil data PPPoE: ${error.message}`, data: [] };
    }
}

// Fungsi untuk mendapatkan daftar user PPPoE offline
async function getOfflinePPPoEUsers() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return [];
        }
        
        // Dapatkan semua secret PPPoE
    const pppSecrets = await rosWrite('/ppp/secret/print');
        
        // Dapatkan koneksi aktif
        const activeConnections = await getActivePPPoEConnections();
        const activeUsers = activeConnections.map(conn => conn.name);
        
        // Filter user yang offline
        const offlineUsers = pppSecrets.filter(secret => !activeUsers.includes(secret.name));
        
        return offlineUsers;
    } catch (error) {
        logger.error(`Error getting offline PPPoE users: ${error.message}`);
        return [];
    }
}

// Fungsi untuk mendapatkan informasi user PPPoE yang tidak aktif (untuk whatsapp.js)
async function getInactivePPPoEUsers() {
    try {
        const mode = String(getSetting('user_auth_mode', 'mikrotik')).toLowerCase();
        if (mode === 'radius' || !useMikrotikApi) {
            const radiusDb = await getRadiusConnection();
            try {
                const allUsers = await radiusDb.getAllRadiusUsers();
                const activeConnections = await radiusDb.getActivePPPoEConnections();
                const activeSet = new Set(activeConnections.map(r => r.name));
                const inactive = allUsers.filter(u => !activeSet.has(u.username));
                return {
                    success: true,
                    totalSecrets: allUsers.length,
                    totalActive: activeSet.size,
                    totalInactive: inactive.length,
                    data: inactive.map(u => ({ name: u.username, comment: '', profile: 'RADIUS', lastLogout: 'N/A' }))
                };
            } catch (error) {
                logger.error(`Error getting inactive PPPoE users from RADIUS: ${error.message}`);
                return {
                    success: false,
                    message: error.message,
                    totalSecrets: 0,
                    totalActive: 0,
                    totalInactive: 0,
                    data: []
                };
            }
        } else {
            const pppSecrets = await rosWrite('/ppp/secret/print');
            let activeUsers = [];
            const activeConnectionsResult = await getActivePPPoEConnections();
            if (activeConnectionsResult && activeConnectionsResult.success && Array.isArray(activeConnectionsResult.data)) {
                activeUsers = activeConnectionsResult.data.map(conn => conn.name);
            }
            const inactiveUsers = pppSecrets.filter(secret => !activeUsers.includes(secret.name));
            return {
                success: true,
                totalSecrets: pppSecrets.length,
                totalActive: activeUsers.length,
                totalInactive: inactiveUsers.length,
                data: inactiveUsers.map(user => ({ name: user.name, comment: user.comment || '', profile: user.profile, lastLogout: user['last-logged-out'] || 'N/A' }))
            };
        }
    } catch (error) {
        logger.error(`Error getting inactive PPPoE users: ${error.message}`);
        return {
            success: false,
            message: error.message,
            totalSecrets: 0,
            totalActive: 0,
            totalInactive: 0,
            data: []
        };
    }
}

// Fungsi untuk mendapatkan resource router
async function getRouterResources() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return null;
        }

        // Dapatkan resource router
    const resources = await rosWrite('/system/resource/print');

        // Debug: Log semua data yang dikembalikan (bisa dinonaktifkan nanti)
        // logger.info('=== DEBUG: Raw MikroTik Resource Response ===');
        // logger.info('Full response:', JSON.stringify(resources, null, 2));
        // logger.info('Response length:', resources.length);
        // if (resources.length > 0) {
        //     logger.info('First item:', JSON.stringify(resources[0], null, 2));
        //     logger.info('Available fields:', Object.keys(resources[0]));
        // }
        // logger.info('=== END DEBUG ===');

        return resources[0];
    } catch (error) {
        logger.error(`Error getting router resources: ${error.message}`);
        return null;
    }
}

function safeNumber(val) {
    if (val === undefined || val === null) return 0;
    const n = Number(val);
    return isNaN(n) ? 0 : n;
}

// Reset Mikrotik connection (for error recovery)
function resetMikrotikConnection() {
    try {
        if (mikrotikConnection && typeof mikrotikConnection.close === 'function') {
            mikrotikConnection.close().catch(() => {});
        }
    } catch (e) {
        // ignore
    } finally {
        mikrotikConnection = null;
    }
}

// Helper function untuk parsing memory dengan berbagai format
function parseMemoryValue(value) {
    if (!value) return 0;

    // Jika sudah berupa number, return langsung
    if (typeof value === 'number') return value;

    // Jika berupa string yang berisi angka
    if (typeof value === 'string') {
        // Coba parse sebagai integer dulu (untuk format bytes dari MikroTik)
        const intValue = parseInt(value);
        if (!isNaN(intValue)) return intValue;

        // Jika gagal, coba parse dengan unit
        const str = value.toString().toLowerCase();
        const numericPart = parseFloat(str.replace(/[^0-9.]/g, ''));
        if (isNaN(numericPart)) return 0;

        // Check for units
        if (str.includes('kib') || str.includes('kb')) {
            return numericPart * 1024;
        } else if (str.includes('mib') || str.includes('mb')) {
            return numericPart * 1024 * 1024;
        } else if (str.includes('gib') || str.includes('gb')) {
            return numericPart * 1024 * 1024 * 1024;
        } else {
            // Assume bytes if no unit
            return numericPart;
        }
    }

    return 0;
}

// Fungsi untuk mendapatkan informasi resource yang diformat
async function getResourceInfo() {
    // Ambil traffic interface utama (default ether1)
    const interfaceName = getSetting('snmp_interface', getSetting('main_interface', 'ether1'));
    let traffic = { rx: 0, tx: 0 };
    try {
        traffic = await getInterfaceTraffic(interfaceName);
    } catch (e) { traffic = { rx: 0, tx: 0 }; }

    // SNMP-only path
    const monitorMode = String(getSetting('monitor_mode', 'mikrotik')).toLowerCase();
    if (monitorMode === 'snmp' || !useMikrotikApi) {
        try {
            const host = getSetting('snmp_host', '192.168.88.2');
            const community = getSetting('snmp_community', 'public');
            const version = getSetting('snmp_version', '2c');
            const port = getSetting('snmp_port', '161');
            const info = await snmpMonitor.getDeviceInfo({ host, community, version, port });
            const cpu = await snmpMonitor.getCpuLoad({ host, community, version, port });
            const data = {
                trafficRX: traffic && traffic.rx ? (traffic.rx / 1000000).toFixed(2) : '0.00',
                trafficTX: traffic && traffic.tx ? (traffic.tx / 1000000).toFixed(2) : '0.00',
                cpuLoad: cpu !== null ? Number(cpu) : 0,
                cpuCount: null,
                cpuFrequency: null,
                architecture: info.sysDescr || 'N/A',
                model: info.sysName || 'N/A',
                serialNumber: 'N/A',
                firmware: 'N/A',
                voltage: 'N/A',
                temperature: 'N/A',
                badBlocks: 'N/A',
                memoryUsed: 0,
                memoryFree: 0,
                totalMemory: 0,
                diskUsed: 0,
                diskFree: 0,
                totalDisk: 0,
                uptime: info.sysUpTimeSeconds ? `${Math.floor(info.sysUpTimeSeconds/3600)}h ${(Math.floor(info.sysUpTimeSeconds/60)%60)}m` : 'N/A',
                version: 'SNMP',
                boardName: info.sysName || 'N/A',
                platform: 'SNMP'
            };
            return { success: true, message: 'Berhasil mengambil info resource via SNMP', data };
        } catch (error) {
            logger.error(`SNMP resource fetch error: ${error.message}`);
            return { success: false, message: `Gagal ambil resource via SNMP: ${error.message}`, data: null };
        }
    }

    try {
        const resources = await getRouterResources();
        if (!resources) {
            return { success: false, message: 'Resource router tidak ditemukan', data: null };
        }

        // Debug: Log raw resource data (bisa dinonaktifkan nanti)
        // logger.info('Raw MikroTik resource data:', JSON.stringify(resources, null, 2));

        // Parse memory berdasarkan field yang tersedia di debug
        // Berdasarkan debug: free-memory: 944705536, total-memory: 1073741824 (dalam bytes)
        const totalMem = parseMemoryValue(resources['total-memory']) || 0;
        const freeMem = parseMemoryValue(resources['free-memory']) || 0;
        const usedMem = totalMem > 0 && freeMem >= 0 ? totalMem - freeMem : 0;

        // Parse disk space berdasarkan field yang tersedia di debug
        // Berdasarkan debug: free-hdd-space: 438689792, total-hdd-space: 537133056 (dalam bytes)
        const totalDisk = parseMemoryValue(resources['total-hdd-space']) || 0;
        const freeDisk = parseMemoryValue(resources['free-hdd-space']) || 0;
        const usedDisk = totalDisk > 0 && freeDisk >= 0 ? totalDisk - freeDisk : 0;

        // Parse CPU load (bisa dalam format percentage atau decimal)
        let cpuLoad = safeNumber(resources['cpu-load']);
        if (cpuLoad > 0 && cpuLoad <= 1) {
            cpuLoad = cpuLoad * 100; // Convert dari decimal ke percentage
        }

        const data = {
            trafficRX: traffic && traffic.rx ? (traffic.rx / 1000000).toFixed(2) : '0.00',
            trafficTX: traffic && traffic.tx ? (traffic.tx / 1000000).toFixed(2) : '0.00',
            cpuLoad: Math.round(cpuLoad),
            cpuCount: safeNumber(resources['cpu-count']),
            cpuFrequency: safeNumber(resources['cpu-frequency']),
            architecture: resources['architecture-name'] || resources['cpu'] || 'N/A',
            model: resources['model'] || resources['board-name'] || 'N/A',
            serialNumber: resources['serial-number'] || 'N/A',
            firmware: resources['firmware-type'] || resources['version'] || 'N/A',
            voltage: resources['voltage'] || resources['board-voltage'] || 'N/A',
            temperature: resources['temperature'] || resources['board-temperature'] || 'N/A',
            badBlocks: resources['bad-blocks'] || 'N/A',
            // Konversi dari bytes ke MB dengan 2 decimal places
            memoryUsed: totalMem > 0 ? parseFloat((usedMem / 1024 / 1024).toFixed(2)) : 0,
            memoryFree: totalMem > 0 ? parseFloat((freeMem / 1024 / 1024).toFixed(2)) : 0,
            totalMemory: totalMem > 0 ? parseFloat((totalMem / 1024 / 1024).toFixed(2)) : 0,
            diskUsed: totalDisk > 0 ? parseFloat((usedDisk / 1024 / 1024).toFixed(2)) : 0,
            diskFree: totalDisk > 0 ? parseFloat((freeDisk / 1024 / 1024).toFixed(2)) : 0,
            totalDisk: totalDisk > 0 ? parseFloat((totalDisk / 1024 / 1024).toFixed(2)) : 0,
            uptime: resources.uptime || 'N/A',
            version: resources.version || 'N/A',
            boardName: resources['board-name'] || 'N/A',
            platform: resources['platform'] || 'N/A',
            // Debug info (bisa dihapus nanti)
            rawTotalMem: resources['total-memory'],
            rawFreeMem: resources['free-memory'],
            rawTotalDisk: resources['total-hdd-space'],
            rawFreeDisk: resources['free-hdd-space'],
            parsedTotalMem: totalMem,
            parsedFreeMem: freeMem,
            parsedTotalDisk: totalDisk,
            parsedFreeDisk: freeDisk
        };

        // Log parsed data for debugging (bisa dinonaktifkan nanti)
        // logger.info('Parsed memory data:', {
        //     totalMem: totalMem,
        //     freeMem: freeMem,
        //     usedMem: usedMem,
        //     totalMemMB: data.totalMemory,
        //     freeMemMB: data.memoryFree,
        //     usedMemMB: data.memoryUsed
        // });

        return {
            success: true,
            message: 'Berhasil mengambil info resource router',
            data
        };
    } catch (error) {
        logger.error(`Error getting formatted resource info: ${error.message}`);
        return { success: false, message: `Gagal ambil resource router: ${error.message}`, data: null };
    }
}

// Fungsi untuk mendapatkan daftar user hotspot aktif dari RADIUS (PostgreSQL version)
async function getActiveHotspotUsersRadius() {
    const radiusDb = await getRadiusConnection();
    try {
        // Ambil user yang sedang online dari radacct (acctstoptime IS NULL)
        const rows = await radiusDb.query("SELECT DISTINCT username FROM radacct WHERE acctstoptime IS NULL");
        return {
            success: true,
            message: `Ditemukan ${rows.length} user hotspot aktif (RADIUS)` ,
            data: rows.map(row => ({ name: row.username }))
        };
    } catch (error) {
        logger.error(`Error getting active hotspot users from RADIUS: ${error.message}`);
        return {
            success: false,
            message: error.message,
            data: []
        };
    }
}

// Fungsi untuk menambah user hotspot ke RADIUS (PostgreSQL version)
async function addHotspotUserRadius(username, password, profile) {
    const radiusDb = await getRadiusConnection();
    try {
        await radiusDb.query(
            "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
            [username, password]
        );
        return { success: true, message: 'User hotspot berhasil ditambahkan ke RADIUS' };
    } catch (error) {
        logger.error(`Error adding hotspot user to RADIUS: ${error.message}`);
        return { success: false, message: error.message };
    }
}

// Wrapper: Pilih mode autentikasi dari settings
async function getActiveHotspotUsers() {
    const mode = getSetting('user_auth_mode', 'mikrotik');
    if (mode === 'radius') {
        return await getActiveHotspotUsersRadius();
    } else {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }
        // Dapatkan daftar user hotspot aktif
    const hotspotUsers = await rosWrite('/ip/hotspot/active/print');
        logger.info(`Found ${hotspotUsers.length} active hotspot users`);
        
        return {
            success: true,
            message: `Ditemukan ${hotspotUsers.length} user hotspot aktif`,
            data: hotspotUsers
        };
    }
}

// Fungsi untuk menambahkan user hotspot
async function addHotspotUser(username, password, profile) {
    const mode = getSetting('user_auth_mode', 'mikrotik');
    if (mode === 'radius') {
        return await addHotspotUserRadius(username, password, profile);
    } else {
        try {
            const conn = await getMikrotikConnection();
            if (!conn) {
                logger.error('No Mikrotik connection available');
                return { success: false, message: 'Koneksi ke Mikrotik gagal' };
            }
            // Tambahkan user hotspot
            await rosWrite('/ip/hotspot/user/add', [
                '=name=' + username,
                '=password=' + password,
                '=profile=' + profile
            ]);
            return { success: true, message: 'User hotspot berhasil ditambahkan' };
        } catch (error) {
            logger.error(`Error adding hotspot user: ${error.message}`);
            return { success: false, message: `Gagal menambah user hotspot: ${error.message}` };
        }
    }
}

// Fungsi untuk menghapus user hotspot
async function deleteHotspotUser(username) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        // Cari user hotspot
    const users = await rosWrite('/ip/hotspot/user/print', [
            '?name=' + username
        ]);
        if (users.length === 0) {
            return { success: false, message: 'User hotspot tidak ditemukan' };
        }
        // Hapus user hotspot
    await rosWrite('/ip/hotspot/user/remove', [
            '=.id=' + users[0]['.id']
        ]);
        return { success: true, message: 'User hotspot berhasil dihapus' };
    } catch (error) {
        logger.error(`Error deleting hotspot user: ${error.message}`);
        return { success: false, message: `Gagal menghapus user hotspot: ${error.message}` };
    }
}

// Fungsi untuk menambahkan secret PPPoE
async function addPPPoESecret(username, password, profile, localAddress = '') {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        // Parameter untuk menambahkan secret
        const params = [
            '=name=' + username,
            '=password=' + password,
            '=profile=' + profile,
            '=service=pppoe'
        ];
        if (localAddress) {
            params.push('=local-address=' + localAddress);
        }
        // Tambahkan secret PPPoE
    await rosWrite('/ppp/secret/add', params);
        return { success: true, message: 'Secret PPPoE berhasil ditambahkan' };
    } catch (error) {
        logger.error(`Error adding PPPoE secret: ${error.message}`);
        return { success: false, message: `Gagal menambah secret PPPoE: ${error.message}` };
    }
}

// Fungsi untuk menghapus secret PPPoE
async function deletePPPoESecret(username) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        // Cari secret PPPoE
    const secrets = await rosWrite('/ppp/secret/print', [
            '?name=' + username
        ]);
        if (secrets.length === 0) {
            return { success: false, message: 'Secret PPPoE tidak ditemukan' };
        }
        // Hapus secret PPPoE
    await rosWrite('/ppp/secret/remove', [
            '=.id=' + secrets[0]['.id']
        ]);
        return { success: true, message: 'Secret PPPoE berhasil dihapus' };
    } catch (error) {
        logger.error(`Error deleting PPPoE secret: ${error.message}`);
        return { success: false, message: `Gagal menghapus secret PPPoE: ${error.message}` };
    }
}

// Fungsi untuk mengubah profile PPPoE
async function setPPPoEProfile(username, profile) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        // Cari secret PPPoE
    const secrets = await rosWrite('/ppp/secret/print', [
            '?name=' + username
        ]);
        if (secrets.length === 0) {
            return { success: false, message: 'Secret PPPoE tidak ditemukan' };
        }
        // Ubah profile PPPoE
    await rosWrite('/ppp/secret/set', [
            '=.id=' + secrets[0]['.id'],
            '=profile=' + profile
        ]);

        // Tambahan: Kick user dari sesi aktif PPPoE
        // Cari sesi aktif
    const activeSessions = await rosWrite('/ppp/active/print', [
            '?name=' + username
        ]);
        if (activeSessions.length > 0) {
            // Hapus semua sesi aktif user ini
            for (const session of activeSessions) {
                await rosWrite('/ppp/active/remove', [
                    '=.id=' + session['.id']
                ]);
            }
            logger.info(`User ${username} di-kick dari sesi aktif PPPoE setelah ganti profile`);
        }

        return { success: true, message: 'Profile PPPoE berhasil diubah dan user di-kick dari sesi aktif' };
    } catch (error) {
        logger.error(`Error setting PPPoE profile: ${error.message}`);
        return { success: false, message: `Gagal mengubah profile PPPoE: ${error.message}` };
    }
}

// Router-aware variants
async function setPPPoEProfileForRouter(username, profile, routerId) {
    try {
        const conn = await getMikrotikConnectionForRouter(routerId);
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        const secrets = await rosWriteForRouter(routerId, '/ppp/secret/print', [
            '?name=' + username
        ]);
        if (secrets.length === 0) {
            return { success: false, message: 'Secret PPPoE tidak ditemukan' };
        }
        await rosWriteForRouter(routerId, '/ppp/secret/set', [
            '=.id=' + secrets[0]['.id'],
            '=profile=' + profile
        ]);
        // Kick active sessions for that user
        const activeSessions = await rosWriteForRouter(routerId, '/ppp/active/print', [
            '?name=' + username
        ]);
        if (activeSessions.length > 0) {
            for (const session of activeSessions) {
                await rosWriteForRouter(routerId, '/ppp/active/remove', [
                    '=.id=' + session['.id']
                ]);
            }
            logger.info(`User ${username} di-kick dari sesi aktif PPPoE pada router [${routerId||'default'}]`);
        }
        return { success: true, message: 'Profile PPPoE berhasil diubah dan user di-kick dari sesi aktif' };
    } catch (error) {
        logger.error(`Error setting PPPoE profile (router-aware): ${error.message}`);
        return { success: false, message: `Gagal mengubah profile PPPoE: ${error.message}` };
    }
}

// Fungsi untuk monitoring koneksi PPPoE
let lastActivePPPoE = [];
async function monitorPPPoEConnections() {
    try {
        // Cek ENV untuk enable/disable monitoring
        const monitorEnable = (getSetting('pppoe_monitor_enable', 'true')).toLowerCase() === 'true';
        if (!monitorEnable) {
            logger.info('PPPoE monitoring is DISABLED by ENV');
            return;
        }
        // Dapatkan interval monitoring dari konfigurasi
        const interval = parseInt(getSetting('pppoe_monitor_interval_minutes', '1')) * 60 * 1000; // Convert menit ke ms
        
        // Bersihkan interval sebelumnya jika ada
        if (monitorInterval) {
            clearInterval(monitorInterval);
        }
        
        // Set interval untuk monitoring
        monitorInterval = setInterval(async () => {
            try {
                // Dapatkan koneksi PPPoE aktif
                const connections = await getActivePPPoEConnections();
                if (!connections.success) {
                    logger.warn(`Monitoring PPPoE connections failed: ${connections.message}`);
                    return;
                }
                const activeNow = connections.data.map(u => u.name);
                // Deteksi login/logout
                const loginUsers = activeNow.filter(u => !lastActivePPPoE.includes(u));
                const logoutUsers = lastActivePPPoE.filter(u => !activeNow.includes(u));
                if (loginUsers.length > 0) {
                    // Ambil detail user login
                    const loginDetail = connections.data.filter(u => loginUsers.includes(u.name));
                    // Ambil daftar user offline
                    let offlineList = [];
                    try {
                        const conn = await getMikrotikConnection();
                        const pppSecrets = await rosWrite('/ppp/secret/print');
                        offlineList = pppSecrets.filter(secret => !activeNow.includes(secret.name)).map(u => u.name);
                    } catch (e) {}
                    // Format pesan WhatsApp
                    let msg = `🔔 *PPPoE LOGIN*\n\n`;
                    loginDetail.forEach((u, i) => {
                        msg += `*${i+1}. ${u.name}*\n• Address: ${u.address || '-'}\n• Uptime: ${u.uptime || '-'}\n\n`;
                    });
                    msg += `🚫 *Pelanggan Offline* (${offlineList.length})\n`;
                    offlineList.forEach((u, i) => {
                        msg += `${i+1}. ${u}\n`;
                    });
                    // Kirim ke group WhatsApp
                    const technicianGroupId = getSetting('technician_group_id', '');
                    if (sock && technicianGroupId) {
                        try {
                            await sock.sendMessage(technicianGroupId, { text: msg });
                            logger.info(`PPPoE login notification sent to group: ${technicianGroupId}`);
                        } catch (e) {
                            logger.error('Gagal kirim notifikasi PPPoE ke WhatsApp group:', e);
                        }
                    } else {
                        logger.warn('No technician group configured for PPPoE notifications');
                    }
                    logger.info('PPPoE LOGIN:', loginUsers);
                }
                if (logoutUsers.length > 0) {
                    // Ambil detail user logout dari lastActivePPPoE (karena sudah tidak ada di connections.data)
                    let logoutDetail = logoutUsers.map(name => ({ name }));
                    // Ambil daftar user offline terbaru
                    let offlineList = [];
                    try {
                        const conn = await getMikrotikConnection();
                        const pppSecrets = await rosWrite('/ppp/secret/print');
                        offlineList = pppSecrets.filter(secret => !activeNow.includes(secret.name)).map(u => u.name);
                    } catch (e) {}
                    // Format pesan WhatsApp
                    let msg = `🚪 *PPPoE LOGOUT*\n\n`;
                    logoutDetail.forEach((u, i) => {
                        msg += `*${i+1}. ${u.name}*\n\n`;
                    });
                    msg += `🚫 *Pelanggan Offline* (${offlineList.length})\n`;
                    offlineList.forEach((u, i) => {
                        msg += `${i+1}. ${u}\n`;
                    });
                    // Kirim ke group WhatsApp
                    const technicianGroupId = getSetting('technician_group_id', '');
                    if (sock && technicianGroupId) {
                        try {
                            await sock.sendMessage(technicianGroupId, { text: msg });
                            logger.info(`PPPoE logout notification sent to group: ${technicianGroupId}`);
                        } catch (e) {
                            logger.error('Gagal kirim notifikasi PPPoE LOGOUT ke WhatsApp group:', e);
                        }
                    } else {
                        logger.warn('No technician group configured for PPPoE notifications');
                    }
                    logger.info('PPPoE LOGOUT:', logoutUsers);
                }
                lastActivePPPoE = activeNow;
                logger.info(`Monitoring PPPoE connections: ${connections.data.length} active connections`);
            } catch (error) {
                logger.error(`Error in PPPoE monitoring: ${error.message}`);
            }
        }, interval);
        
        logger.info(`PPPoE monitoring started with interval ${interval}ms`);
    } catch (error) {
        logger.error(`Error starting PPPoE monitoring: ${error.message}`);
    }
}

// Fungsi untuk mendapatkan traffic interface
async function getInterfaceTraffic(interfaceName = 'ether1') {
    try {
        const monitorMode = String(getSetting('monitor_mode', 'mikrotik')).toLowerCase();
        if (monitorMode === 'snmp' || !useMikrotikApi) {
            const host = getSetting('snmp_host', '192.168.88.2');
            const community = getSetting('snmp_community', 'public');
            const version = getSetting('snmp_version', '2c');
            const port = getSetting('snmp_port', '161');
            const res = await snmpMonitor.getInterfaceTraffic({ host, community, version, port, interfaceName });
            return { rx: res.in_bps || 0, tx: res.out_bps || 0 };
        } else {
            const conn = await getMikrotikConnection();
            if (!conn) return { rx: 0, tx: 0 };
            const res = await rosWrite('/interface/monitor-traffic', [
                `=interface=${interfaceName}`,
                '=once='
            ]);
            if (!res || !res[0]) return { rx: 0, tx: 0 };
            return { rx: res[0]['rx-bits-per-second'] || 0, tx: res[0]['tx-bits-per-second'] || 0 };
        }
    } catch (error) {
        const errMsg = (error && (error.message || String(error))) || 'unknown error';
        logger.error(`Error getting interface traffic (iface=${interfaceName}): ${errMsg}`);
        return { rx: 0, tx: 0 };
    }
}

// Fungsi untuk mendapatkan daftar interface
async function getInterfaces() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

    const interfaces = await rosWrite('/interface/print');
        return {
            success: true,
            message: `Ditemukan ${interfaces.length} interface`,
            data: interfaces
        };
    } catch (error) {
        logger.error(`Error getting interfaces: ${error.message}`);
        return { success: false, message: `Gagal ambil data interface: ${error.message}`, data: [] };
    }
}

// Fungsi untuk mendapatkan detail interface tertentu
async function getInterfaceDetail(interfaceName) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: null };
        }

    const interfaces = await rosWrite('/interface/print', [
            `?name=${interfaceName}`
        ]);

        if (interfaces.length === 0) {
            return { success: false, message: 'Interface tidak ditemukan', data: null };
        }

        return {
            success: true,
            message: `Detail interface ${interfaceName}`,
            data: interfaces[0]
        };
    } catch (error) {
        logger.error(`Error getting interface detail: ${error.message}`);
        return { success: false, message: `Gagal ambil detail interface: ${error.message}`, data: null };
    }
}

// Fungsi untuk enable/disable interface
async function setInterfaceStatus(interfaceName, enabled) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

        // Cari interface
    const interfaces = await rosWrite('/interface/print', [
            `?name=${interfaceName}`
        ]);

        if (interfaces.length === 0) {
            return { success: false, message: 'Interface tidak ditemukan' };
        }

        // Set status interface
        const action = enabled ? 'enable' : 'disable';
    await rosWrite(`/interface/${action}`, [
            `=.id=${interfaces[0]['.id']}`
        ]);

        return {
            success: true,
            message: `Interface ${interfaceName} berhasil ${enabled ? 'diaktifkan' : 'dinonaktifkan'}`
        };
    } catch (error) {
        logger.error(`Error setting interface status: ${error.message}`);
        return { success: false, message: `Gagal mengubah status interface: ${error.message}` };
    }
}

// Fungsi untuk mendapatkan daftar IP address
async function getIPAddresses() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

    const addresses = await rosWrite('/ip/address/print');
        return {
            success: true,
            message: `Ditemukan ${addresses.length} IP address`,
            data: addresses
        };
    } catch (error) {
        logger.error(`Error getting IP addresses: ${error.message}`);
        return { success: false, message: `Gagal ambil data IP address: ${error.message}`, data: [] };
    }
}

// Fungsi untuk menambah IP address
async function addIPAddress(interfaceName, address) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

    await rosWrite('/ip/address/add', [
            `=interface=${interfaceName}`,
            `=address=${address}`
        ]);

        return { success: true, message: `IP address ${address} berhasil ditambahkan ke ${interfaceName}` };
    } catch (error) {
        logger.error(`Error adding IP address: ${error.message}`);
        return { success: false, message: `Gagal menambah IP address: ${error.message}` };
    }
}

// Fungsi untuk menghapus IP address
async function deleteIPAddress(interfaceName, address) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

        // Cari IP address
    const addresses = await rosWrite('/ip/address/print', [
            `?interface=${interfaceName}`,
            `?address=${address}`
        ]);

        if (addresses.length === 0) {
            return { success: false, message: 'IP address tidak ditemukan' };
        }

        // Hapus IP address
    await rosWrite('/ip/address/remove', [
            `=.id=${addresses[0]['.id']}`
        ]);

        return { success: true, message: `IP address ${address} berhasil dihapus dari ${interfaceName}` };
    } catch (error) {
        logger.error(`Error deleting IP address: ${error.message}`);
        return { success: false, message: `Gagal menghapus IP address: ${error.message}` };
    }
}

// Fungsi untuk mendapatkan routing table
async function getRoutes() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

    const routes = await rosWrite('/ip/route/print');
        return {
            success: true,
            message: `Ditemukan ${routes.length} route`,
            data: routes
        };
    } catch (error) {
        logger.error(`Error getting routes: ${error.message}`);
        return { success: false, message: `Gagal ambil data route: ${error.message}`, data: [] };
    }
}

// Fungsi untuk menambah route
async function addRoute(destination, gateway, distance = '1') {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

    await rosWrite('/ip/route/add', [
            `=dst-address=${destination}`,
            `=gateway=${gateway}`,
            `=distance=${distance}`
        ]);

        return { success: true, message: `Route ${destination} via ${gateway} berhasil ditambahkan` };
    } catch (error) {
        logger.error(`Error adding route: ${error.message}`);
        return { success: false, message: `Gagal menambah route: ${error.message}` };
    }
}

// Fungsi untuk menghapus route
async function deleteRoute(destination) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

        // Cari route
    const routes = await rosWrite('/ip/route/print', [
            `?dst-address=${destination}`
        ]);

        if (routes.length === 0) {
            return { success: false, message: 'Route tidak ditemukan' };
        }

        // Hapus route
    await rosWrite('/ip/route/remove', [
            `=.id=${routes[0]['.id']}`
        ]);

        return { success: true, message: `Route ${destination} berhasil dihapus` };
    } catch (error) {
        logger.error(`Error deleting route: ${error.message}`);
        return { success: false, message: `Gagal menghapus route: ${error.message}` };
    }
}

// Fungsi untuk mendapatkan DHCP leases
async function getDHCPLeases() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

    const leases = await rosWrite('/ip/dhcp-server/lease/print');
        return {
            success: true,
            message: `Ditemukan ${leases.length} DHCP lease`,
            data: leases
        };
    } catch (error) {
        logger.error(`Error getting DHCP leases: ${error.message}`);
        return { success: false, message: `Gagal ambil data DHCP lease: ${error.message}`, data: [] };
    }
}

// Fungsi untuk mendapatkan DHCP server
async function getDHCPServers() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

    const servers = await rosWrite('/ip/dhcp-server/print');
        return {
            success: true,
            message: `Ditemukan ${servers.length} DHCP server`,
            data: servers
        };
    } catch (error) {
        logger.error(`Error getting DHCP servers: ${error.message}`);
        return { success: false, message: `Gagal ambil data DHCP server: ${error.message}`, data: [] };
    }
}

// Fungsi untuk ping
async function pingHost(host, count = '4') {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: null };
        }

    const result = await rosWrite('/ping', [
            `=address=${host}`,
            `=count=${count}`
        ]);

        return {
            success: true,
            message: `Ping ke ${host} selesai`,
            data: result
        };
    } catch (error) {
        logger.error(`Error pinging host: ${error.message}`);
        return { success: false, message: `Gagal ping ke ${host}: ${error.message}`, data: null };
    }
}

// Fungsi untuk mendapatkan system logs
async function getSystemLogs(topics = '', count = '50') {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

        const params = [];
        if (topics) {
            params.push(`?topics~${topics}`);
        }

    const logs = await rosWrite('/log/print', params);

        // Batasi jumlah log yang dikembalikan
        const limitedLogs = logs.slice(0, parseInt(count));

        return {
            success: true,
            message: `Ditemukan ${limitedLogs.length} log entries`,
            data: limitedLogs
        };
    } catch (error) {
        logger.error(`Error getting system logs: ${error.message}`);
        return { success: false, message: `Gagal ambil system logs: ${error.message}`, data: [] };
    }
}

// Fungsi untuk mendapatkan daftar profile PPPoE
async function getPPPoEProfiles() {
    try {
        // In RADIUS app mode, PPPoE profiles from MikroTik are not applicable.
        // Return success with empty data to avoid UI warnings when the page is accessed.
        const appMode = String(getSetting('app_mode', 'api')).toLowerCase();
        if (appMode === 'radius') {
            return { success: true, message: 'RADIUS mode: PPPoE profiles not applicable', data: [] };
        }

        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

    const profiles = await rosWrite('/ppp/profile/print');
        return {
            success: true,
            message: `Ditemukan ${profiles.length} PPPoE profile`,
            data: profiles
        };
    } catch (error) {
        logger.error(`Error getting PPPoE profiles: ${error.message}`);
        return { success: false, message: `Gagal ambil data PPPoE profile: ${error.message}`, data: [] };
    }
}

// Fungsi untuk mendapatkan detail profile PPPoE
async function getPPPoEProfileDetail(id) {
    try {
        const appMode = String(getSetting('app_mode', 'api')).toLowerCase();
        if (appMode === 'radius') {
            return { success: false, message: 'RADIUS mode: PPPoE profile detail not available', data: null };
        }

        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: null };
        }

    const profiles = await rosWrite('/ppp/profile/print', [`?.id=${id}`]);
        if (profiles.length === 0) {
            return { success: false, message: 'Profile tidak ditemukan', data: null };
        }

        return {
            success: true,
            message: 'Detail profile berhasil diambil',
            data: profiles[0]
        };
    } catch (error) {
        logger.error(`Error getting PPPoE profile detail: ${error.message}`);
        return { success: false, message: `Gagal ambil detail profile: ${error.message}`, data: null };
    }
}

// Fungsi untuk mendapatkan daftar profile hotspot
async function getHotspotProfiles() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }
        
    const profiles = await rosWrite('/ip/hotspot/user/profile/print');
        return {
            success: true,
            message: `Ditemukan ${profiles.length} profile hotspot`,
            data: profiles
        };
    } catch (error) {
        logger.error(`Error getting hotspot profiles: ${error.message}`);
        return { success: false, message: `Gagal ambil data profile hotspot: ${error.message}`, data: [] };
    }
}

// Fungsi untuk mendapatkan detail profile hotspot
async function getHotspotProfileDetail(id) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: null };
        }
        
    const result = await rosWrite('/ip/hotspot/user/profile/print', [
            '?.id=' + id
        ]);
        
        if (result && result.length > 0) {
            return { success: true, data: result[0] };
        } else {
            return { success: false, message: 'Profile tidak ditemukan', data: null };
        }
    } catch (error) {
        logger.error(`Error getting hotspot profile detail: ${error.message}`);
        return { success: false, message: error.message, data: null };
    }
}

// Fungsi untuk mendapatkan daftar server hotspot
async function getHotspotServers() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }
        
    const result = await rosWrite('/ip/hotspot/print');
        
        if (result && Array.isArray(result)) {
            return { success: true, data: result.map(server => ({
                id: server['.id'],
                name: server.name,
                interface: server.interface,
                profile: server.profile,
                address: server['address-pool'] || '',
                disabled: server.disabled === 'true'
            })) };
        } else {
            return { success: false, message: 'Gagal mendapatkan server hotspot', data: [] };
        }
    } catch (error) {
        logger.error(`Error getting hotspot servers: ${error.message}`);
        return { success: false, message: error.message, data: [] };
    }
}

// Fungsi untuk memutus koneksi user hotspot aktif
async function disconnectHotspotUser(username) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        
        // Cari ID koneksi aktif berdasarkan username
    const activeUsers = await rosWrite('/ip/hotspot/active/print', [
            '?user=' + username
        ]);
        
        if (!activeUsers || activeUsers.length === 0) {
            return { success: false, message: `User ${username} tidak ditemukan atau tidak aktif` };
        }
        
        // Putus koneksi user dengan ID yang ditemukan
    await rosWrite('/ip/hotspot/active/remove', [
            '=.id=' + activeUsers[0]['.id']
        ]);
        
        logger.info(`Disconnected hotspot user: ${username}`);
        return { success: true, message: `User ${username} berhasil diputus` };
    } catch (error) {
        logger.error(`Error disconnecting hotspot user: ${error.message}`);
        return { success: false, message: error.message };
    }
}

// Fungsi untuk kick/putus koneksi user PPPoE aktif
async function kickPPPoEUser(username) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

        // Cari user PPPoE aktif
    const activeSessions = await rosWrite('/ppp/active/print', [
            '?name=' + username
        ]);

        if (activeSessions.length === 0) {
            return { success: false, message: 'User tidak ditemukan dalam sesi aktif PPPoE' };
        }

        // Putus semua sesi aktif user ini
        for (const session of activeSessions) {
            await rosWrite('/ppp/active/remove', [
                '=.id=' + session['.id']
            ]);
        }

        logger.info(`Kicked PPPoE user: ${username}`);
        return { success: true, message: `User ${username} berhasil di-kick dari PPPoE` };
    } catch (error) {
        logger.error(`Error kicking PPPoE user: ${error.message}`);
        return { success: false, message: error.message };
    }
}

// Fungsi untuk menambah profile hotspot
async function addHotspotProfile(profileData) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        
        const {
            name,
            comment,
            rateLimit,
            rateLimitUnit,
            sessionTimeout,
            sessionTimeoutUnit,
            idleTimeout,
            idleTimeoutUnit,
            localAddress,
            remoteAddress,
            dnsServer,
            parentQueue,
            addressList,
            sharedUsers
        } = profileData;
        
        const params = [
            '=name=' + name
        ];
        
        if (comment) params.push('=comment=' + comment);
        if (rateLimit && rateLimitUnit) params.push('=rate-limit=' + rateLimit + rateLimitUnit);
        if (sessionTimeout && sessionTimeoutUnit) params.push('=session-timeout=' + sessionTimeout + sessionTimeoutUnit);
        if (idleTimeout && idleTimeoutUnit) params.push('=idle-timeout=' + idleTimeout + idleTimeoutUnit);
        if (localAddress) params.push('=local-address=' + localAddress);
        if (remoteAddress) params.push('=remote-address=' + remoteAddress);
        if (dnsServer) params.push('=dns-server=' + dnsServer);
        if (parentQueue) params.push('=parent-queue=' + parentQueue);
        if (addressList) params.push('=address-list=' + addressList);
        if (sharedUsers) params.push('=shared-users=' + sharedUsers);
        
    await rosWrite('/ip/hotspot/user/profile/add', params);
        
        return { success: true, message: 'Profile hotspot berhasil ditambahkan' };
    } catch (error) {
        logger.error(`Error adding hotspot profile: ${error.message}`);
        return { success: false, message: `Gagal menambah profile: ${error.message}` };
    }
}

// Fungsi untuk edit profile hotspot
async function editHotspotProfile(profileData) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        
        const {
            id,
            name,
            comment,
            rateLimit,
            rateLimitUnit,
            sessionTimeout,
            sessionTimeoutUnit,
            idleTimeout,
            idleTimeoutUnit,
            localAddress,
            remoteAddress,
            dnsServer,
            parentQueue,
            addressList,
            sharedUsers
        } = profileData;
        
        const params = [
            '=.id=' + id,
            '=name=' + name
        ];
        
        if (comment !== undefined) params.push('=comment=' + comment);
        if (rateLimit && rateLimitUnit) params.push('=rate-limit=' + rateLimit + rateLimitUnit);
        else if (rateLimit === '') params.push('=rate-limit=');
        if (sessionTimeout && sessionTimeoutUnit) params.push('=session-timeout=' + sessionTimeout + sessionTimeoutUnit);
        else if (sessionTimeout === '') params.push('=session-timeout=');
        if (idleTimeout && idleTimeoutUnit) params.push('=idle-timeout=' + idleTimeout + idleTimeoutUnit);
        else if (idleTimeout === '') params.push('=idle-timeout=');
        if (localAddress !== undefined) params.push('=local-address=' + localAddress);
        if (remoteAddress !== undefined) params.push('=remote-address=' + remoteAddress);
        if (dnsServer !== undefined) params.push('=dns-server=' + dnsServer);
        if (parentQueue !== undefined) params.push('=parent-queue=' + parentQueue);
        if (addressList !== undefined) params.push('=address-list=' + addressList);
        if (sharedUsers !== undefined) params.push('=shared-users=' + sharedUsers);
        
    await rosWrite('/ip/hotspot/user/profile/set', params);
        
        return { success: true, message: 'Profile hotspot berhasil diupdate' };
    } catch (error) {
        logger.error(`Error editing hotspot profile: ${error.message}`);
        return { success: false, message: `Gagal mengupdate profile: ${error.message}` };
    }
}

// Fungsi untuk hapus profile hotspot
async function deleteHotspotProfile(id) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        
    await rosWrite('/ip/hotspot/user/profile/remove', [
            '=.id=' + id
        ]);
        
        return { success: true, message: 'Profile hotspot berhasil dihapus' };
    } catch (error) {
        logger.error(`Error deleting hotspot profile: ${error.message}`);
        return { success: false, message: `Gagal menghapus profile: ${error.message}` };
    }
}

// Fungsi untuk mendapatkan firewall rules
async function getFirewallRules(chain = '') {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: [] };
        }

        const params = [];
        if (chain) {
            params.push(`?chain=${chain}`);
        }

    const rules = await rosWrite('/ip/firewall/filter/print', params);
        return {
            success: true,
            message: `Ditemukan ${rules.length} firewall rule${chain ? ` untuk chain ${chain}` : ''}`,
            data: rules
        };
    } catch (error) {
        logger.error(`Error getting firewall rules: ${error.message}`);
        return { success: false, message: `Gagal ambil data firewall rule: ${error.message}`, data: [] };
    }
}

// Fungsi untuk menambah IP ke firewall address list (untuk isolir static IP)
async function addFirewallAddressList(ipAddress, listName, comment = '') {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

        // Cek apakah IP sudah ada di address list
    const existing = await rosWrite('/ip/firewall/address-list/print', [
            `?list=${listName}`,
            `?address=${ipAddress}`
        ]);

        if (existing.length > 0) {
            return { success: false, message: `IP ${ipAddress} sudah ada di address list ${listName}` };
        }

        // Tambahkan IP ke address list
        const params = [
            `=list=${listName}`,
            `=address=${ipAddress}`
        ];
        if (comment) {
            params.push(`=comment=${comment}`);
        }

    await rosWrite('/ip/firewall/address-list/add', params);
        logger.info(`IP ${ipAddress} ditambahkan ke address list ${listName}`);

        return { success: true, message: `IP ${ipAddress} berhasil ditambahkan ke address list ${listName}` };
    } catch (error) {
        logger.error(`Error adding IP to firewall address list: ${error.message}`);
        return { success: false, message: `Gagal menambah IP ke address list: ${error.message}` };
    }
}

async function addFirewallAddressListForRouter(ipAddress, listName, comment = '', routerId) {
    try {
        const conn = await getMikrotikConnectionForRouter(routerId);
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        const existing = await rosWriteForRouter(routerId, '/ip/firewall/address-list/print', [
            `?list=${listName}`,
            `?address=${ipAddress}`
        ]);
        if (existing.length > 0) {
            return { success: false, message: `IP ${ipAddress} sudah ada di address list ${listName}` };
        }
        const params = [ `=list=${listName}`, `=address=${ipAddress}` ];
        if (comment) params.push(`=comment=${comment}`);
        await rosWriteForRouter(routerId, '/ip/firewall/address-list/add', params);
        logger.info(`IP ${ipAddress} ditambahkan ke address list ${listName} pada router [${routerId||'default'}]`);
        return { success: true, message: `IP ${ipAddress} berhasil ditambahkan ke address list ${listName}` };
    } catch (error) {
        logger.error(`Error adding IP to firewall address list (router-aware): ${error.message}`);
        return { success: false, message: `Gagal menambah IP ke address list: ${error.message}` };
    }
}

// Fungsi untuk menghapus IP dari firewall address list (untuk unisolir static IP)
async function removeFirewallAddressList(ipAddress, listName) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

        // Cari entry di address list
    const entries = await rosWrite('/ip/firewall/address-list/print', [
            `?list=${listName}`,
            `?address=${ipAddress}`
        ]);

        if (entries.length === 0) {
            return { success: false, message: `IP ${ipAddress} tidak ditemukan di address list ${listName}` };
        }

        // Hapus semua entry yang cocok
        for (const entry of entries) {
            await rosWrite('/ip/firewall/address-list/remove', [
                `=.id=${entry['.id']}`
            ]);
        }

        logger.info(`IP ${ipAddress} dihapus dari address list ${listName}`);
        return { success: true, message: `IP ${ipAddress} berhasil dihapus dari address list ${listName}` };
    } catch (error) {
        logger.error(`Error removing IP from firewall address list: ${error.message}`);
        return { success: false, message: `Gagal menghapus IP dari address list: ${error.message}` };
    }
}

async function removeFirewallAddressListForRouter(ipAddress, listName, routerId) {
    try {
        const conn = await getMikrotikConnectionForRouter(routerId);
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }
        const entries = await rosWriteForRouter(routerId, '/ip/firewall/address-list/print', [
            `?list=${listName}`,
            `?address=${ipAddress}`
        ]);
        if (entries.length === 0) {
            return { success: false, message: `IP ${ipAddress} tidak ditemukan di address list ${listName}` };
        }
        for (const entry of entries) {
            await rosWriteForRouter(routerId, '/ip/firewall/address-list/remove', [
                `=.id=${entry['.id']}`
            ]);
        }
        logger.info(`IP ${ipAddress} dihapus dari address list ${listName} pada router [${routerId||'default'}]`);
        return { success: true, message: `IP ${ipAddress} berhasil dihapus dari address list ${listName}` };
    } catch (error) {
        logger.error(`Error removing IP from firewall address list (router-aware): ${error.message}`);
        return { success: false, message: `Gagal menghapus IP dari address list: ${error.message}` };
    }
}

// Fungsi untuk restart router
async function restartRouter() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

    await rosWrite('/system/reboot');
        return { success: true, message: 'Router akan restart dalam beberapa detik' };
    } catch (error) {
        logger.error(`Error restarting router: ${error.message}`);
        return { success: false, message: `Gagal restart router: ${error.message}` };
    }
}

// Fungsi untuk mendapatkan identity router
async function getRouterIdentity() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: null };
        }

    const identity = await rosWrite('/system/identity/print');
        return {
            success: true,
            message: 'Identity router berhasil diambil',
            data: identity[0]
        };
    } catch (error) {
        logger.error(`Error getting router identity: ${error.message}`);
        return { success: false, message: `Gagal ambil identity router: ${error.message}`, data: null };
    }
}

// Fungsi untuk set identity router
async function setRouterIdentity(name) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal' };
        }

    await rosWrite('/system/identity/set', [
            `=name=${name}`
        ]);

        return { success: true, message: `Identity router berhasil diubah menjadi: ${name}` };
    } catch (error) {
        logger.error(`Error setting router identity: ${error.message}`);
        return { success: false, message: `Gagal mengubah identity router: ${error.message}` };
    }
}

// Fungsi untuk mendapatkan clock router
async function getRouterClock() {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('No Mikrotik connection available');
            return { success: false, message: 'Koneksi ke Mikrotik gagal', data: null };
        }

    const clock = await rosWrite('/system/clock/print');
        return {
            success: true,
            message: 'Clock router berhasil diambil',
            data: clock[0]
        };
    } catch (error) {
        logger.error(`Error getting router clock: ${error.message}`);
        return { success: false, message: `Gagal ambil clock router: ${error.message}`, data: null };
    }
}

// Fungsi untuk mendapatkan semua user (hotspot + PPPoE)
async function getAllUsers() {
    try {
        // Ambil user hotspot
        const hotspotResult = await getActiveHotspotUsers();
        const hotspotUsers = hotspotResult.success ? hotspotResult.data : [];

        // Ambil user PPPoE aktif
        const pppoeResult = await getActivePPPoEConnections();
        const pppoeUsers = pppoeResult.success ? pppoeResult.data : [];

        // Ambil user PPPoE offline
        const offlineResult = await getInactivePPPoEUsers();
        const offlineUsers = offlineResult.success ? offlineResult.data : [];

        return {
            success: true,
            message: `Total: ${hotspotUsers.length} hotspot aktif, ${pppoeUsers.length} PPPoE aktif, ${offlineUsers.length} PPPoE offline`,
            data: {
                hotspotActive: hotspotUsers,
                pppoeActive: pppoeUsers,
                pppoeOffline: offlineUsers,
                totalActive: hotspotUsers.length + pppoeUsers.length,
                totalOffline: offlineUsers.length
            }
        };
    } catch (error) {
        logger.error(`Error getting all users: ${error.message}`);
        return { success: false, message: `Gagal ambil data semua user: ${error.message}`, data: null };
    }
}

// ...
// Fungsi tambah user PPPoE (alias addPPPoESecret)
async function addPPPoEUser({ username, password, profile }) {
    const mode = getSetting('user_auth_mode', 'mikrotik');
    if (mode === 'radius') {
        return await addPPPoEUserRadius({ username, password });
    } else {
        return await addPPPoESecret(username, password, profile);
    }
}

// Update user hotspot (password dan profile)
async function updateHotspotUser(username, password, profile) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) throw new Error('Koneksi ke Mikrotik gagal');
        // Cari .id user berdasarkan username
    const users = await rosWrite('/ip/hotspot/user/print', [
            '?name=' + username
        ]);
        if (!users.length) throw new Error('User tidak ditemukan');
        const id = users[0]['.id'];
        // Update password dan profile
    await rosWrite('/ip/hotspot/user/set', [
            '=numbers=' + id,
            '=password=' + password,
            '=profile=' + profile
        ]);
        return true;
    } catch (err) {
        throw err;
    }
}

// Fungsi untuk generate voucher hotspot secara massal (versi lama - dihapus)
// Fungsi ini diganti dengan fungsi generateHotspotVouchers yang lebih lengkap di bawah

// Fungsi untuk menambah profile PPPoE
async function addPPPoEProfile(profileData) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) throw new Error('Koneksi ke Mikrotik gagal');
        
        const params = [
            '=name=' + profileData.name
        ];
        
        // Tambahkan field opsional jika ada
        if (profileData['rate-limit']) params.push('=rate-limit=' + profileData['rate-limit']);
        if (profileData['local-address']) params.push('=local-address=' + profileData['local-address']);
        if (profileData['remote-address']) params.push('=remote-address=' + profileData['remote-address']);
        if (profileData['dns-server']) params.push('=dns-server=' + profileData['dns-server']);
        if (profileData['parent-queue']) params.push('=parent-queue=' + profileData['parent-queue']);
        if (profileData['address-list']) params.push('=address-list=' + profileData['address-list']);
        if (profileData.comment) params.push('=comment=' + profileData.comment);
        if (profileData['bridge-learning'] && profileData['bridge-learning'] !== 'default') params.push('=bridge-learning=' + profileData['bridge-learning']);
        if (profileData['use-mpls'] && profileData['use-mpls'] !== 'default') params.push('=use-mpls=' + profileData['use-mpls']);
        if (profileData['use-compression'] && profileData['use-compression'] !== 'default') params.push('=use-compression=' + profileData['use-compression']);
        if (profileData['use-encryption'] && profileData['use-encryption'] !== 'default') params.push('=use-encryption=' + profileData['use-encryption']);
        if (profileData['only-one'] && profileData['only-one'] !== 'default') params.push('=only-one=' + profileData['only-one']);
        if (profileData['change-tcp-mss'] && profileData['change-tcp-mss'] !== 'default') params.push('=change-tcp-mss=' + profileData['change-tcp-mss']);
        
    await rosWrite('/ppp/profile/add', params);
        
        return { success: true };
    } catch (error) {
        logger.error(`Error adding PPPoE profile: ${error.message}`);
        return { success: false, message: error.message };
    }
}

// Fungsi untuk edit profile PPPoE
async function editPPPoEProfile(profileData) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) throw new Error('Koneksi ke Mikrotik gagal');
        
        const params = [
            '=.id=' + profileData.id
        ];
        
        // Tambahkan field yang akan diupdate
        if (profileData.name) params.push('=name=' + profileData.name);
        if (profileData['rate-limit'] !== undefined) params.push('=rate-limit=' + profileData['rate-limit']);
        if (profileData['local-address'] !== undefined) params.push('=local-address=' + profileData['local-address']);
        if (profileData['remote-address'] !== undefined) params.push('=remote-address=' + profileData['remote-address']);
        if (profileData['dns-server'] !== undefined) params.push('=dns-server=' + profileData['dns-server']);
        if (profileData['parent-queue'] !== undefined) params.push('=parent-queue=' + profileData['parent-queue']);
        if (profileData['address-list'] !== undefined) params.push('=address-list=' + profileData['address-list']);
        if (profileData.comment !== undefined) params.push('=comment=' + profileData.comment);
        if (profileData['bridge-learning'] !== undefined) params.push('=bridge-learning=' + profileData['bridge-learning']);
        if (profileData['use-mpls'] !== undefined) params.push('=use-mpls=' + profileData['use-mpls']);
        if (profileData['use-compression'] !== undefined) params.push('=use-compression=' + profileData['use-compression']);
        if (profileData['use-encryption'] !== undefined) params.push('=use-encryption=' + profileData['use-encryption']);
        if (profileData['only-one'] !== undefined) params.push('=only-one=' + profileData['only-one']);
        if (profileData['change-tcp-mss'] !== undefined) params.push('=change-tcp-mss=' + profileData['change-tcp-mss']);
        
    await rosWrite('/ppp/profile/set', params);
        
        return { success: true };
    } catch (error) {
        logger.error(`Error editing PPPoE profile: ${error.message}`);
        return { success: false, message: error.message };
    }
}

// Fungsi untuk hapus profile PPPoE
async function deletePPPoEProfile(id) {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) throw new Error('Koneksi ke Mikrotik gagal');
        
    await rosWrite('/ppp/profile/remove', [ '=.id=' + id ]);
        
        return { success: true };
    } catch (error) {
        logger.error(`Error deleting PPPoE profile: ${error.message}`);
        return { success: false, message: error.message };
    }
}

// Fungsi untuk generate hotspot vouchers
async function generateHotspotVouchers(count, prefix, profile, server, validUntil, price, charType = 'alphanumeric') {
    try {
        const conn = await getMikrotikConnection();
        if (!conn) {
            logger.error('Tidak dapat terhubung ke Mikrotik');
            return { success: false, message: 'Tidak dapat terhubung ke Mikrotik', vouchers: [] };
        }
        
        // Fungsi untuk generate random string berdasarkan jenis karakter
        function randomString(length, charType = 'alphanumeric') {
            let chars;
            switch (charType) {
                case 'numeric':
                    chars = '0123456789';
                    break;
                case 'alphabetic':
                    chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
                    break;
                case 'alphanumeric':
                default:
                    chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                    break;
            }
            let str = '';
            for (let i = 0; i < length; i++) {
                str += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return str;
        }
        
        const vouchers = [];
        
        // Log untuk debugging
        logger.info(`Generating ${count} vouchers with prefix ${prefix} and profile ${profile}`);
        
        for (let i = 0; i < count; i++) {
            const username = prefix + randomString(5, charType);
            const password = username; // Username dan password disamakan
            
            try {
                // Tambahkan user hotspot ke Mikrotik
                const params = [
                    `=name=${username}`,
                    `=password=${password}`,
                    `=profile=${profile}`,
                    `=comment=voucher`
                ];
                
                // Tambahkan server jika bukan 'all'
                if (server && server !== 'all') {
                    params.push(`=server=${server}`);
                }
                
                // Tambahkan user hotspot
                await rosWrite('/ip/hotspot/user/add', params);
                
                // Tambahkan ke array vouchers
                vouchers.push({
                    username,
                    password,
                    profile,
                    server: server !== 'all' ? server : 'all',
                    createdAt: new Date(),
                    price: price // Tambahkan harga ke data voucher
                });
                
                logger.info(`Voucher created: ${username}`);
            } catch (err) {
                logger.error(`Failed to create voucher ${username}: ${err.message}`);
                // Lanjutkan ke voucher berikutnya
            }
        }
        
        logger.info(`Successfully generated ${vouchers.length} vouchers`);
        
        return {
            success: true,
            message: `Berhasil membuat ${vouchers.length} voucher`,
            vouchers: vouchers
        };
    } catch (error) {
        logger.error(`Error generating vouchers: ${error.message}`);
        return {
            success: false,
            message: `Gagal generate voucher: ${error.message}`,
            vouchers: []
        };
    }
}

// --- Watcher settings.json untuk reset koneksi Mikrotik jika setting berubah ---
const settingsPath = path.join(process.cwd(), 'settings.json');
let lastMikrotikConfig = {};

function getCurrentMikrotikConfig() {
    return {
        host: getSetting('mikrotik_host', '192.168.8.1'),
        port: getSetting('mikrotik_port', '8728'),
        user: getSetting('mikrotik_user', 'admin'),
        password: getSetting('mikrotik_password', 'admin')
    };
}

function mikrotikConfigChanged(newConfig, oldConfig) {
    return (
        newConfig.host !== oldConfig.host ||
        newConfig.port !== oldConfig.port ||
        newConfig.user !== oldConfig.user ||
        newConfig.password !== oldConfig.password
    );
}

// Inisialisasi config awal
lastMikrotikConfig = getCurrentMikrotikConfig();

fs.watchFile(settingsPath, { interval: 2000 }, (curr, prev) => {
    try {
        const newConfig = getCurrentMikrotikConfig();
        if (mikrotikConfigChanged(newConfig, lastMikrotikConfig)) {
            logger.info('Konfigurasi Mikrotik di settings.json berubah, reset koneksi Mikrotik...');
            mikrotikConnection = null;
            lastMikrotikConfig = newConfig;
        }
    } catch (e) {
        logger.error('Gagal cek perubahan konfigurasi Mikrotik:', e.message);
    }
});

module.exports = {
    setSock,
    resetMikrotikConnection,
    getInterfaceTraffic,
    getPPPoEUsers,
    addPPPoEUser,
    editPPPoEUser,
    deletePPPoEUser,
    connectToMikrotik,
    getMikrotikConnection,
    // multi-router helpers
    getRouterResources,
    getResourceInfo,
    getActivePPPoEConnections,
    getOfflinePPPoEUsers,
    getInactivePPPoEUsers,
    // router-aware write
    setPPPoEProfileForRouter,
    addFirewallAddressListForRouter,
    removeFirewallAddressListForRouter,
    // legacy single-router APIs
    addFirewallAddressList,
    removeFirewallAddressList,
    getActiveHotspotUsers,
    addHotspotUser,
    deleteHotspotUser,
    addPPPoESecret,
    deletePPPoESecret,
    setPPPoEProfile,
    monitorPPPoEConnections,
    generateHotspotVouchers,
    getInterfaces,
    getInterfaceDetail,
    setInterfaceStatus,
    getIPAddresses,
    addIPAddress,
    deleteIPAddress,
    getRoutes,
    addRoute,
    deleteRoute,
    getDHCPLeases,
    getDHCPServers,
    pingHost,
    getSystemLogs,
    getPPPoEProfiles,
    getHotspotProfiles,
    getFirewallRules,
    restartRouter,
    getRouterIdentity,
    setRouterIdentity,
    getRouterClock,
    getAllUsers,
    updateHotspotUser,
    addPPPoEProfile,
    editPPPoEProfile,
    deletePPPoEProfile,
    getPPPoEProfileDetail,
    getHotspotProfileDetail,
    addHotspotProfile,
    editHotspotProfile,
    deleteHotspotProfile,
    getHotspotServers,
    disconnectHotspotUser,
    kickPPPoEUser
};
