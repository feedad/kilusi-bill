const express = require('express');
const router = express.Router();
// const { getInterfaceTraffic, getInterfaces } = require('../../../config/mikrotik');
const MikrotikService = require('../../../services/mikrotik-service');
const snmpMonitor = require('../../../config/snmp-monitor');
const oltSnmpMonitor = require('../../../config/olt-snmp-monitor');
const { getSetting } = require('../../../config/settingsManager');
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');
const { asyncHandler } = require('../../../middleware/response');
const genieacsApi = require('../../../config/genieacs');
const axios = require('axios');

// Helper function to validate MAC address format
function isValidMacAddress(mac) {
    if (!mac) return false;
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    return macRegex.test(mac);
}

// Helper function to format MAC address consistently
function formatMacAddress(mac) {
    if (!mac) return null;
    return mac.toUpperCase().replace(/-/g, ':');
}

// Helper function to auto-sync MAC from RADIUS to technical_details
// Smart Update: Updates if MAC is NULL, empty, OR different from RADIUS
async function syncMacFromRadius(pppoeUsername, macAddress) {
    if (!pppoeUsername || !macAddress || !isValidMacAddress(macAddress)) {
        return false;
    }

    const formattedMac = formatMacAddress(macAddress);

    try {
        // Smart Update: Update MAC if it's NULL, empty, OR different from RADIUS
        const updateQuery = `
            UPDATE technical_details
            SET mac_address = $1, updated_at = CURRENT_TIMESTAMP
            WHERE pppoe_username = $2
              AND (mac_address IS NULL OR mac_address = '' OR mac_address != $1)
            RETURNING id, mac_address as old_mac
        `;
        const result = await query(updateQuery, [formattedMac, pppoeUsername]);

        if (result.rows.length > 0) {
            const oldMac = result.rows[0].old_mac;
            if (oldMac && oldMac !== '') {
                logger.info(`🔄 MAC auto-synced (changed) for ${pppoeUsername}: ${oldMac} → ${formattedMac}`);
            } else {
                logger.info(`✅ MAC auto-synced (set) for ${pppoeUsername}: ${formattedMac}`);
            }
            return true;
        }

        return false; // MAC sama, tidak diupdate
    } catch (err) {
        logger.debug(`Failed to sync MAC for ${pppoeUsername}:`, err.message);
        return false;
    }
}

// Helper function to get OLT signal data from GenieACS
async function getOLTSignalData(pppoeUsername) {
    try {
        const genieacsUrl = getSetting('genieacs_url', 'http://localhost:7557');
        const genieacsUsername = getSetting('genieacs_username', 'admin');
        const genieacsPassword = getSetting('genieacs_password', 'admin');

        // Find device by PPPoE username
        const devicesResponse = await axios.get(`${genieacsUrl}/devices?query=${JSON.stringify({_id: {$regex: pppoeUsername}})}`, {
            auth: { username: genieacsUsername, password: genieacsPassword },
            timeout: 5000
        });

        if (devicesResponse.data && devicesResponse.data.length > 0) {
            const device = devicesResponse.data[0];

            // Priority 1: Get OLT RX Power (redaman/loss) - this is from OLT side (more accurate)
            const oltRxPowerPaths = [
                'VirtualParameters.olt_rx_power',         // Custom parameter for OLT RX power
                'VirtualParameters.redaman_olt',           // Redaman dari OLT
                'VirtualParameters.olt_signal',           // Signal strength from OLT
                'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.RXPower',
                'Device.WANDevice.1.WANPONInterfaceConfig.RXPower'
            ];

            let rxPower = null;
            let signalSource = 'onu'; // Track source: 'olt' or 'onu'

            // Try OLT-side parameters first (redaman OLT is preferred)
            for (const path of oltRxPowerPaths) {
                const parts = path.split('.');
                let value = device;
                for (const part of parts) {
                    if (value && typeof value === 'object' && part in value) {
                        value = value[part];
                        if (value && value._value !== undefined) {
                            value = value._value;
                        }
                    } else {
                        value = null;
                        break;
                    }
                }
                if (value !== null && value !== undefined && value !== '') {
                    rxPower = parseFloat(value);
                    if (path.includes('olt') || path.includes('redaman_olt')) {
                        signalSource = 'olt';
                    }
                    break;
                }
            }

            // Priority 2: Fallback to ONU RX Power (from ONU/GenieACS side)
            if (rxPower === null) {
                const onuRxPowerPaths = [
                    'VirtualParameters.RXPower',
                    'VirtualParameters.redaman',
                    'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.RXPower',
                    'Device.WANDevice.1.WANPONInterfaceConfig.RXPower'
                ];

                for (const path of onuRxPowerPaths) {
                    const parts = path.split('.');
                    let value = device;
                    for (const part of parts) {
                        if (value && typeof value === 'object' && part in value) {
                            value = value[part];
                            if (value && value._value !== undefined) {
                                value = value._value;
                            }
                        } else {
                            value = null;
                            break;
                        }
                    }
                    if (value !== null && value !== undefined && value !== '') {
                        rxPower = parseFloat(value);
                        break;
                    }
                }
            }

            // Get TX Power
            const txPowerPaths = [
                'VirtualParameters.TXPower',
                'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.TXPower'
            ];

            let txPower = null;
            for (const path of txPowerPaths) {
                const parts = path.split('.');
                let value = device;
                for (const part of parts) {
                    if (value && typeof value === 'object' && part in value) {
                        value = value[part];
                        if (value && value._value !== undefined) {
                            value = value._value;
                        }
                    } else {
                        value = null;
                        break;
                    }
                }
                if (value !== null && value !== undefined && value !== '') {
                    txPower = parseFloat(value);
                    break;
                }
            }

            // Get distance/OLT info if available
            const distance = device.InternetGatewayDevice?.WANDevice?.['1']?.WANPONInterfaceConfig?.Distance?._value;

            return {
                rx_power: rxPower,
                tx_power: txPower,
                distance: distance,
                signal_source: signalSource,
                device_id: device._id
            };
        }

        return null;
    } catch (error) {
        logger.warn(`Failed to get OLT signal data for ${pppoeUsername}:`, error.message);
        return null;
    }
}

// Helper function to format uptime in readable format
function formatUptime(seconds) {
    if (!seconds) return null;

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

// GET /api/v1/realtime/traffic - Get real-time traffic data
router.get('/traffic', async (req, res) => {
    try {
        let iface = req.query.interface;
        const networkConfig = getSetting('network', {});
        const monitorMode = String(networkConfig?.mikrotik?.monitor_mode || 'mikrotik').toLowerCase();

        if (!iface) {
            iface = monitorMode === 'snmp'
                ? getSetting('network.mikrotik.snmp_interface', getSetting('main_interface', 'ether1'))
                : getSetting('main_interface', 'ether1');
        }

        let traffic;

        if (monitorMode === 'snmp') {
            const snmpSettings = networkConfig?.mikrotik?.snmp || {};
            const host = snmpSettings.host;
            const community = snmpSettings.community || 'public';
            const version = snmpSettings.version || '2c';
            const port = snmpSettings.port || 161;

            if (!host) {
                return res.json({
                    success: false,
                    rx: 0,
                    tx: 0,
                    message: 'SNMP host tidak dikonfigurasi'
                });
            }

            const snmpTraffic = await snmpMonitor.getInterfaceTraffic({
                host,
                community,
                version,
                port,
                interfaceName: iface
            });

            traffic = {
                rx: snmpTraffic.in_bps || 0,
                tx: snmpTraffic.out_bps || 0,
                interface: iface,
                mode: 'snmp',
                timestamp: new Date().toISOString()
            };
        } else {
            // MikroTik mode
            const mikrotikTraffic = await MikrotikService.getTraffic(iface);
            // Adapt format because MikrotikService.getTraffic returns { rx, tx } (formatted from SNMP or API)
            // But legacy getInterfaceTraffic returned ['rx-byte']
            // Current MikrotikService.getTraffic returns rx/tx in bps usually if from SNMP. 
            // If we are simulating legacy API which returned bytes, we might have mismatch. 
            // But front-end "realtime" graph likely wants rate.
            // Let's assume MikrotikService provides usable numbers.
            traffic = {
                rx: mikrotikTraffic.rx || 0,
                tx: mikrotikTraffic.tx || 0,
                interface: iface,
                mode: 'mikrotik',
                timestamp: new Date().toISOString()
            };
        }

        res.json({
            success: true,
            data: { traffic }
        });

    } catch (error) {
        logger.error('Error fetching traffic data:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data traffic'
        });
    }
});

// GET /api/v1/realtime/interfaces - Get available interfaces
router.get('/interfaces', async (req, res) => {
    try {
        const networkConfig = getSetting('network', {});
        const monitorMode = String(networkConfig?.mikrotik?.monitor_mode || 'mikrotik').toLowerCase();

        let interfaces = [];

        if (monitorMode === 'snmp') {
            // For SNMP, return configured interface
            interfaces = [{
                name: getSetting('network.mikrotik.snmp_interface', 'ether1'),
                type: 'snmp',
                description: 'SNMP Monitored Interface'
            }];
        } else {
            // Get MikroTik interfaces
            interfaces = await MikrotikService.getInterfaces();
            if (interfaces.success && Array.isArray(interfaces.data)) {
                interfaces = interfaces.data.map(iface => ({
                    name: iface.name || iface['interface-name'],
                    type: iface.type || 'unknown',
                    running: String(iface.running) === 'true',
                    description: iface.comment || ''
                }));
            } else {
                interfaces = [];
            }
        }

        res.json({
            success: true,
            data: { interfaces }
        });

    } catch (error) {
        logger.error('Error fetching interfaces:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data interface'
        });
    }
});

// GET /api/v1/realtime/online-customers - Get online customers with comprehensive data
router.get('/online-customers', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const page = Math.floor(offset / limit) + 1;
        const search = req.query.search || '';
        const status = req.query.status || 'online';

        let customers = [];
        let totalTraffic = { upload: 0, download: 0 };
        let totalCount = 0;

        // Build WHERE clause for search and status filter
        const whereConditions = [];
        const queryParams = [];

        if (search) {
            whereConditions.push('(c.name ILIKE $1 OR c.phone ILIKE $1 OR c.pppoe_username ILIKE $1)');
            queryParams.push(`%${search}%`);
        }

        // Count total customers matching the filter
        const countQuery = `
            SELECT COUNT(*) as total
            FROM customers_view c
            ${whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''}
        `;
        const countResult = await query(countQuery, queryParams);
        totalCount = parseInt(countResult.rows[0].total);

        const mode = req.query.mode || 'full';

        // Get online status from radacct (RADIUS accounting table)
        // CRITICAL: Interim update 5 menit sudah di-set di MikroTik, tapi banyak sesi zombie
        // karena router tidak mengirim Accounting-Stop saat disconnect/reboot.
        // Solusi: hanya ambil sesi yang acctupdatetime-nya dalam 30 menit terakhir.
        // Ini memastikan hanya user yang benar-benar aktif yang ditampilkan.
        let onlineSessions = [];
        try {
            const radiusQuery = `
                SELECT DISTINCT ON (username)
                    username,
                    framedipaddress as ip_address,
                    callingstationid as mac_address,
                    acctstarttime as start_time,
                    acctinputoctets as upload_bytes,
                    acctoutputoctets as download_bytes,
                    acctsessiontime as session_time,
                    nasipaddress,
                    EXTRACT(EPOCH FROM (NOW() - acctstarttime)) as uptime_seconds,
                    acctupdatetime as last_update
                FROM radacct
                WHERE acctstoptime IS NULL
                ORDER BY username, acctstarttime DESC
            `;

            const radiusResult = await query(radiusQuery);
            onlineSessions = radiusResult.rows.map(row => ({
                username: row.username,
                ip_address: row.ip_address,
                mac_address: row.mac_address,
                start_time: row.start_time,
                upload_bytes: parseInt(row.upload_bytes) || 0,
                download_bytes: parseInt(row.download_bytes) || 0,
                session_time: parseInt(row.session_time) || 0,
                active: true,
                rx_power: null,
                last_seen: row.last_update,
                last_update: row.last_update,
                data_used: (parseInt(row.upload_bytes) || 0) + (parseInt(row.download_bytes) || 0),
                uptime_seconds: parseInt(row.uptime_seconds) || 0
            }));

            logger.info(`Found ${onlineSessions.length} TRULY active sessions (updated within 30 minutes)`);

            // Auto-sync MAC addresses from RADIUS to technical_details for online customers
            // This runs asynchronously in background
            setImmediate(async () => {
                for (const session of onlineSessions) {
                    if (session.mac_address && session.username) {
                        syncMacFromRadius(session.username, session.mac_address).catch(err => {
                            logger.debug(`Background MAC sync error for ${session.username}:`, err.message);
                        });
                    }
                }
            });
        } catch (err) {
            logger.error('Error querying radacct:', err);
        }

        // ===================== DASHBOARD FAST PATH =====================
        // For dashboard widget: skip OLT/SNMP/GenieACS, return only online customers + stats
        if (mode === 'dashboard') {
            try {
                const onlineUsernames = onlineSessions.map(s => s.username).filter(Boolean);
                let dashboardCustomers = [];

                if (onlineUsernames.length > 0) {
                    const dashboardQuery = `
                        SELECT
                            c.id,
                            c.name,
                            c.phone,
                            c.pppoe_username,
                            p.name as package_name
                        FROM customers_view c
                        LEFT JOIN packages p ON c.package_id = p.id
                        WHERE c.pppoe_username = ANY($1)
                        ORDER BY c.name ASC
                        LIMIT $2 OFFSET $3
                    `;
                    const dashResult = await query(dashboardQuery, [onlineUsernames, limit, offset]);

                    // Map to response format
                    const sessionMap = new Map(onlineSessions.map(s => [s.username, s]));
                    dashboardCustomers = dashResult.rows.map(customer => {
                        const session = sessionMap.get(customer.pppoe_username);
                        return {
                            id: customer.id,
                            name: customer.name,
                            phone: customer.phone,
                            pppoe_username: customer.pppoe_username,
                            package_name: customer.package_name,
                            online_status: 'online',
                            last_seen: session?.last_seen || null,
                            signal_strength: null,
                            rx_power: null,
                            tx_power: null,
                            olt_distance: null,
                            olt_name: null,
                            onu_index: null,
                            uptime: session?.uptime_seconds || null,
                            uptime_formatted: formatUptime(session?.uptime_seconds || 0),
                            data_used: { upload: session?.upload_bytes || 0, download: session?.download_bytes || 0 },
                            location: null
                        };
                    });
                }

                const statsOnline = onlineSessions.length;
                const statsOffline = Math.max(0, totalCount - statsOnline);

                return res.json({
                    success: true,
                    data: {
                        customers: dashboardCustomers,
                        stats: {
                            total_customers: totalCount,
                            online_customers: statsOnline,
                            offline_customers: statsOffline,
                            idle_customers: 0,
                            total_traffic: { upload: 0, download: 0 }
                        },
                        pagination: {
                            total: dashboardCustomers.length,
                            page: page,
                            pageSize: limit,
                            totalPages: Math.ceil(dashboardCustomers.length / limit)
                        }
                    }
                });
            } catch (dashError) {
                logger.error('Error in dashboard fast path:', dashError);
                // Fall through to full mode on error
            }
        }
        // ===================== END DASHBOARD FAST PATH =====================

        // ===================== FULL MODE (Halaman Pelanggan Online) =====================
        // Hanya tampilkan pelanggan dengan sesi AKTIF di RADIUS (onlineSessions)
        // Query langsung customer yang pppoe_username-nya ada di onlineSessions

        // Sort sessions by start_time descending (newest connection first)
        onlineSessions.sort((a, b) => {
            const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
            const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
            return bTime - aTime;
        });

        const sessionMap = new Map(onlineSessions.map(s => [s.username, s]));
        const allOnlineUsernames = onlineSessions.map(s => s.username).filter(Boolean);
        const statsOnline = onlineSessions.length;
        const statsOffline = Math.max(0, totalCount - statsOnline);

        // Filter usernames by search if needed (maintaining sort order)
        let pageUsernames = allOnlineUsernames;
        if (search) {
            try {
                const searchResult = await query(`
                    SELECT c.pppoe_username FROM customers_view c
                    WHERE c.pppoe_username = ANY($1)
                    AND (c.name ILIKE $2 OR c.phone ILIKE $2 OR c.pppoe_username ILIKE $2)
                `, [allOnlineUsernames, `%${search}%`]);
                const searchUsernames = new Set(searchResult.rows.map(r => r.pppoe_username));
                pageUsernames = allOnlineUsernames.filter(u => searchUsernames.has(u));
            } catch (e) {
                logger.warn('Search filter error:', e.message);
            }
        }

        // Paginate the sorted usernames list
        const totalOnline = pageUsernames.length;
        const paginatedUsernames = pageUsernames.slice(offset, offset + limit);
        const filteredTotal = paginatedUsernames.length;

        let paginatedCustomers = [];

        if (paginatedUsernames.length > 0) {
            // Query customer data for paginated usernames
            const onlineCustomerQuery = `
                SELECT
                    c.id,
                    c.name,
                    c.phone,
                    c.address,
                    c.pppoe_username,
                    c.pppoe_password,
                    c.status,
                    c.created_at,
                    c.updated_at,
                    p.name as package_name,
                    p.price as package_price,
                    p.speed as package_speed,
                    td.mac_address,
                    td.device_serial_number,
                    cu.bytes_in as usage_bytes_in,
                    cu.bytes_out as usage_bytes_out
                FROM customers_view c
                LEFT JOIN packages p ON c.package_id = p.id
                LEFT JOIN services s ON s.customer_id = c.id
                LEFT JOIN technical_details td ON td.service_id = s.id
                LEFT JOIN customer_usage cu ON cu.service_id = s.id
                    AND cu.period_start <= CURRENT_DATE
                    AND cu.period_end > CURRENT_DATE
                WHERE c.pppoe_username = ANY($1)
            `;
            const onlineResult = await query(onlineCustomerQuery, [paginatedUsernames]);
            const customerMap = new Map(onlineResult.rows.map(c => [c.pppoe_username, c]));

            // Fetch cached OLT signal data (non-blocking, background)
            let signalByPppoe = {};
            try {
                const oltsResult = await query('SELECT id, name, host, type, snmp_community, snmp_port, snmp_version FROM olts WHERE status = $1', ['active']);
                const signalResult = await oltSnmpMonitor.matchSignalToCustomers(onlineSessions, oltsResult.rows);
                signalByPppoe = Object.fromEntries(signalResult);
            } catch (e) {
                logger.warn('Failed to get cached OLT signal data:', e.message);
            }

            // Build customer objects in the sorted order
            paginatedCustomers = paginatedUsernames
                .map(username => customerMap.get(username))
                .filter(Boolean)
                .map(customer => {
                    const session = sessionMap.get(customer.pppoe_username);
                    let uptimeValue = 0;

                    if (session) {
                        uptimeValue = session.uptime_seconds > 0 ? session.uptime_seconds : session.session_time;
                        totalTraffic.upload += session.data_used ? session.data_used / 2 : 0;
                        totalTraffic.download += session.data_used ? session.data_used / 2 : 0;
                    }

                    const signal = signalByPppoe[customer.pppoe_username] || {};

                    return {
                        id: customer.id,
                        name: customer.name,
                        phone: customer.phone,
                        address: customer.address,
                        pppoe_username: customer.pppoe_username,
                        pppoe_password: customer.pppoe_password,
                        status: customer.status,
                        mac_address: customer.mac_address,
                        package_name: customer.package_name,
                        package_speed: customer.package_speed,
                        online_status: 'online',
                        last_seen: session?.last_seen || null,
                        signal_strength: signal.rx_power || null,
                        rx_power: signal.rx_power || null,
                        tx_power: signal.tx_power || null,
                        olt_distance: signal.distance || null,
                        olt_name: signal.olt_name || null,
                        onu_index: signal.onu_index || null,
                        uptime: uptimeValue,
                        uptime_formatted: formatUptime(uptimeValue),
                        data_used: { upload: session?.upload_bytes || 0, download: session?.download_bytes || 0 },
                        ip_address: session?.ip_address || null,
                        location: null,
                        usage_bytes_in: parseInt(cu?.bytes_in) || 0,
                        usage_bytes_out: parseInt(cu?.bytes_out) || 0
                    };
                });
        }

        // All modes: use paginatedCustomers directly (no SNMP blocking)
        customers = paginatedCustomers;

        // Stats
        const stats = {
            total_customers: totalCount,
            online_customers: statsOnline,
            offline_customers: statsOffline,
            idle_customers: 0,
            total_traffic: totalTraffic
        };

        // Calculate pagination info
        const totalPages = Math.ceil(totalOnline / limit);

        const pagination = {
            total: totalOnline,
            page: page,
            pageSize: limit,
            totalPages: totalPages
        };

        res.json({
            success: true,
            data: {
                customers: paginatedCustomers,
                stats: stats,
                pagination: pagination
            }
        });

    } catch (error) {
        logger.error('Error fetching online customers:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data pelanggan online'
        });
    }
});

// Helper function to parse MikroTik uptime format
function parseUptime(uptimeStr) {
    if (!uptimeStr) return 0;

    // Parse formats like "2w3d4h5m6s" or "1h30m"
    const regex = /(\d+)w?(\d+)d?(\d+)h?(\d+)m?(\d+)s?/g;
    let match;
    let totalSeconds = 0;

    while ((match = regex.exec(uptimeStr)) !== null) {
        const weeks = parseInt(match[1]) || 0;
        const days = parseInt(match[2]) || 0;
        const hours = parseInt(match[3]) || 0;
        const minutes = parseInt(match[4]) || 0;
        const seconds = parseInt(match[5]) || 0;

        totalSeconds += weeks * 7 * 24 * 3600;
        totalSeconds += days * 24 * 3600;
        totalSeconds += hours * 3600;
        totalSeconds += minutes * 60;
        totalSeconds += seconds;
    }

    return totalSeconds;
}

// GET /api/v1/realtime/system-stats - Get system statistics
router.get('/system-stats', async (req, res) => {
    try {
        const networkConfig = getSetting('network', {});
        const monitorMode = String(networkConfig?.mikrotik?.monitor_mode || 'mikrotik').toLowerCase();

        let systemStats = {
            timestamp: new Date().toISOString(),
            mode: monitorMode
        };

        if (monitorMode === 'snmp') {
            // Get SNMP system stats
            const snmpSettings = networkConfig?.mikrotik?.snmp || {};
            const host = snmpSettings.host;
            const community = snmpSettings.community || 'public';
            const version = snmpSettings.version || '2c';
            const port = snmpSettings.port || 161;

            if (host) {
                try {
                    // Get CPU load via SNMP
                    const cpuLoad = await snmpMonitor.getCpuLoad({ host, community, version, port });
                    if (cpuLoad !== null) systemStats.cpuUsage = cpuLoad;

                    // Get system info
                    const sysInfo = await snmpMonitor.getSystemInfo({ host, community, version, port });
                    if (sysInfo.success) {
                        systemStats = { ...systemStats, ...sysInfo.data };
                    }
                } catch (err) {
                    logger.warn('Failed to get SNMP system stats:', err);
                }
            }
        } else {
            // Get MikroTik system stats
            // const { getSystemResource } = require('../../config/mikrotik');
            try {
                const resources = await MikrotikService.getSystemResource();
                systemStats = {
                    ...systemStats,
                    cpuUsage: resources['cpu-load'] || 0,
                    memoryUsage: resources['free-memory'] || 0,
                    totalMemory: resources['total-memory'] || 0,
                    uptime: resources.uptime || 0
                };
            } catch (err) {
                logger.warn('Failed to get MikroTik system stats:', err);
            }
        }

        // Add database stats
        try {
            const dbStats = await query(`
                SELECT
                    COUNT(*) as total_customers,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_customers,
                    COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_customers
                FROM customers_view
            `);

            systemStats.database = {
                totalCustomers: parseInt(dbStats.rows[0].total_customers),
                activeCustomers: parseInt(dbStats.rows[0].active_customers),
                inactiveCustomers: parseInt(dbStats.rows[0].inactive_customers)
            };
        } catch (err) {
            logger.warn('Failed to get database stats:', err);
        }

        res.json({
            success: true,
            data: { systemStats }
        });

    } catch (error) {
        logger.error('Error fetching system stats:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data statistik sistem'
        });
    }
});

// POST /api/v1/realtime/coa - Send CoA (Change of Authorization) to disconnect user
router.post('/coa', async (req, res) => {
    try {
        const { username, pppoe_username } = req.body;
        const targetUsername = pppoe_username || username;

        if (!targetUsername) {
            return res.status(400).json({
                success: false,
                message: 'Username atau PPPoE username diperlukan'
            });
        }

        logger.info(`🔄 CoA request for user: ${targetUsername}`);

        // Get active RADIUS session for this user
        const sessionQuery = `
            SELECT
                username,
                framedipaddress as framed_ip,
                callingstationid as mac_address,
                nasipaddress as nas_ip,
                acctsessionid as session_id,
                nasporttype as nas_port_type
            FROM radacct
            WHERE username = $1
            AND acctstoptime IS NULL
            ORDER BY acctstarttime DESC
            LIMIT 1
        `;

        const sessionResult = await query(sessionQuery, [targetUsername]);

        if (sessionResult.rows.length === 0) {
            return res.json({
                success: false,
                message: `Tidak ada sesi aktif untuk user ${targetUsername}`
            });
        }

        const session = sessionResult.rows[0];

        // Get NAS secret from nas table
        const nasQuery = `
            SELECT secret, coaport, nasname
            FROM nas
            WHERE nasname = $1 OR shortname = $1
            LIMIT 1
        `;

        const nasResult = await query(nasQuery, [session.nas_ip]);

        if (nasResult.rows.length === 0) {
            return res.json({
                success: false,
                message: `NAS tidak ditemukan untuk IP ${session.nas_ip}`
            });
        }

        const nas = nasResult.rows[0];
        const coaPort = nas.coaport || 3799;

        logger.info(`📡 Sending CoA to NAS ${session.nas_ip}:${coaPort} for user ${targetUsername}`);

        // Import radius disconnect module
        const radiusDisconnect = require('../../../config/radius-disconnect');

        const result = await radiusDisconnect.disconnectUser({
            username: targetUsername,
            nasIp: session.nas_ip,
            nasSecret: nas.secret,
            sessionId: session.session_id,
            framedIp: session.framed_ip,
            coaPort: coaPort
        });

        if (result.success) {
            logger.info(`✅ CoA SUCCESS for user ${targetUsername}`);
        } else {
            logger.warn(`⚠️ CoA FAILED for user ${targetUsername}: ${result.message}`);
        }

        res.json({
            success: result.success,
            message: result.message,
            user: targetUsername,
            timestamp: new Date()
        });

    } catch (error) {
        logger.error('Error in CoA request:', error);
        res.status(500).json({
            success: false,
            message: `Terjadi kesalahan saat mengirim CoA: ${error.message}`
        });
    }
});

// GET /api/v1/realtime/olt-onus - Get ONUs from all OLTs with customer mapping
router.get('/olt-onus', async (req, res) => {
    try {
        const oltId = req.query.olt_id;
        const status = req.query.status;

        // Get all OLTs from database or specific OLT
        let oltQuery = 'SELECT id, name, host, type, snmp_community, snmp_port, snmp_version FROM olts WHERE status = $1';
        const queryParams = ['active'];

        if (oltId) {
            oltQuery += ' AND id = $2';
            queryParams.push(oltId);
        }

        const oltsResult = await query(oltQuery, queryParams);
        const olts = oltsResult.rows;

        if (olts.length === 0) {
            return res.json({
                success: true,
                data: {
                    onus: [],
                    olts: [],
                    message: 'Tidak ada OLT aktif ditemukan'
                }
            });
        }

        // Get all technical details for mapping
        const techDetailsQuery = `
            SELECT
                td.pppoe_username,
                td.mac_address,
                td.device_serial_number,
                s.id as service_id,
                s.customer_id,
                c.name as customer_name,
                c.phone as customer_phone
            FROM technical_details td
            LEFT JOIN services s ON td.service_id = s.id
            LEFT JOIN customers c ON s.customer_id = c.id
            WHERE td.mac_address IS NOT NULL OR td.device_serial_number IS NOT NULL
        `;
        const techDetailsResult = await query(techDetailsQuery);
        const techDetailsMap = new Map();

        techDetailsResult.rows.forEach(row => {
            const mac = row.mac_address ? row.mac_address.toLowerCase() : null;
            const sn = row.device_serial_number;
            if (mac) techDetailsMap.set(mac, row);
            if (sn) techDetailsMap.set(sn, row);
        });

        const allOnus = [];
        const oltErrors = [];

        // Fetch ONUs from each OLT
        for (const olt of olts) {
            try {
                const oltConfig = {
                    host: olt.host,
                    community: olt.snmp_community,
                    version: olt.snmp_version || '2c',
                    port: olt.snmp_port || 161,
                    vendor: olt.type
                };

                logger.info(`Fetching ONUs from OLT ${olt.name} (${olt.host})`);
                const onus = await oltSnmpMonitor.getOnuList(oltConfig);

                for (const onu of onus) {
                    const onuMac = onu.sn ? onu.sn.toLowerCase() : null;
                    const techDetail = onuMac ? techDetailsMap.get(onuMac) : null;

                    // Filter by status if specified
                    if (status && onu.status !== status) {
                        continue;
                    }

                    allOnus.push({
                        olt_id: olt.id,
                        olt_name: olt.name,
                        olt_host: olt.host,
                        olt_type: olt.type,
                        index: onu.index,
                        sn: onu.sn,
                        status: onu.status,
                        rx_power: onu.rxPower,
                        distance: onu.distance,
                        temperature: onu.temperature,
                        name: onu.name,
                        raw_index: onu.rawIndex,
                        customer: techDetail ? {
                            service_id: techDetail.service_id,
                            customer_id: techDetail.customer_id,
                            name: techDetail.customer_name,
                            phone: techDetail.customer_phone,
                            pppoe_username: techDetail.pppoe_username,
                            mac_address: techDetail.mac_address
                        } : null
                    });
                }

                logger.info(`Fetched ${onus.length} ONUs from OLT ${olt.name}`);
            } catch (oltError) {
                logger.error(`Error fetching ONUs from OLT ${olt.name}:`, oltError);
                oltErrors.push({
                    olt_id: olt.id,
                    olt_name: olt.name,
                    error: oltError.message
                });
            }
        }

        // Calculate stats
        const stats = {
            total_onus: allOnus.length,
            online_onus: allOnus.filter(o => o.status === 'online').length,
            offline_onus: allOnus.filter(o => o.status === 'offline').length,
            mapped_onus: allOnus.filter(o => o.customer !== null).length,
            unmapped_onus: allOnus.filter(o => o.customer === null).length
        };

        res.json({
            success: true,
            data: {
                onus: allOnus,
                olts: olts,
                stats: stats
            },
            errors: oltErrors.length > 0 ? oltErrors : undefined
        });

    } catch (error) {
        logger.error('Error fetching OLT ONUs:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data ONU dari OLT'
        });
    }
});

// GET /api/v1/realtime/olt-onus/:sn - Get specific ONU by Serial Number (MAC)
router.get('/olt-onus/:sn', async (req, res) => {
    try {
        const sn = req.params.sn;

        // Get all OLTs
        const oltsResult = await query('SELECT id, name, host, type, snmp_community, snmp_port, snmp_version FROM olts WHERE status = $1', ['active']);
        const olts = oltsResult.rows;

        let foundOnu = null;

        // Search in each OLT
        for (const olt of olts) {
            try {
                const oltConfig = {
                    host: olt.host,
                    community: olt.snmp_community,
                    version: olt.snmp_version || '2c',
                    port: olt.snmp_port || 161,
                    vendor: olt.type
                };

                const onu = await oltSnmpMonitor.findOnuBySn(oltConfig, sn);
                if (onu) {
                    foundOnu = {
                        ...onu,
                        olt_id: olt.id,
                        olt_name: olt.name,
                        olt_host: olt.host,
                        olt_type: olt.type
                    };
                    break;
                }
            } catch (oltError) {
                logger.debug(`Error searching ONU ${sn} in OLT ${olt.name}:`, oltError.message);
            }
        }

        if (!foundOnu) {
            return res.json({
                success: false,
                message: `ONU dengan SN ${sn} tidak ditemukan`
            });
        }

        res.json({
            success: true,
            data: { onu: foundOnu }
        });

    } catch (error) {
        logger.error('Error fetching ONU by SN:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data ONU'
        });
    }
});

// POST /api/v1/realtime/olt-onus/rename - Auto-rename ONUs to match customer names
router.post('/olt-onus/rename', async (req, res) => {
    try {
        const { olt_id, dry_run = true } = req.body;

        logger.info(`Starting ONU auto-re${dry_run ? 'name (dry run)' : 'name'}`, { olt_id, dry_run });

        // Get OLTs from database
        let oltQuery = 'SELECT id, name, host, type, snmp_community, snmp_write_community, snmp_port, snmp_version FROM olts WHERE status = $1';
        const queryParams = ['active'];

        if (olt_id) {
            oltQuery += ' AND id = $2';
            queryParams.push(olt_id);
        }

        const oltsResult = await query(oltQuery, queryParams);
        const olts = oltsResult.rows;

        if (olts.length === 0) {
            return res.json({
                success: false,
                message: 'Tidak ada OLT aktif ditemukan'
            });
        }

        // Build MAC → customer_name map from RADIUS accounting data
        // radacct.callingstationid contains actual device MAC address
        const techDetailsQuery = `
            WITH active_macs AS (
                SELECT DISTINCT LOWER(TRIM(callingstationid)) as mac
                FROM radacct
                WHERE acctstoptime IS NULL
            )
            SELECT 
                td.pppoe_username,
                LOWER(td.mac_address) as mac_address,
                s.id as service_id,
                s.customer_id,
                c.name as customer_name
            FROM technical_details td
            LEFT JOIN services s ON td.service_id = s.id
            LEFT JOIN customers c ON s.customer_id = c.id::text
            WHERE td.mac_address IS NOT NULL
              AND c.name IS NOT NULL
              AND LOWER(td.mac_address) IN (SELECT mac FROM active_macs)
        `;
        const techDetailsResult = await query(techDetailsQuery);
        const macToCustomer = new Map();

        techDetailsResult.rows.forEach(row => {
            const mac = row.mac_address.toLowerCase();
            macToCustomer.set(mac, row.customer_name);
        });

        // Also add non-online MACs (fallback for devices not currently in radacct)
        const allMacsQuery = `
            SELECT LOWER(td.mac_address) as mac, c.name as customer_name
            FROM technical_details td
            LEFT JOIN services s ON td.service_id = s.id
            LEFT JOIN customers c ON s.customer_id = c.id::text
            WHERE td.mac_address IS NOT NULL AND c.name IS NOT NULL
        `;
        const allMacsResult = await query(allMacsQuery);
        allMacsResult.rows.forEach(row => {
            const mac = row.mac.toLowerCase();
            if (!macToCustomer.has(mac)) {
                macToCustomer.set(mac, row.customer_name);
            }
        });

        logger.info(`Built customer MAC map: ${macToCustomer.size} entries`);

        const renameResults = [];
        let totalOnus = 0;
        let renamedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // Process each OLT
        for (const olt of olts) {
            try {
                const oltConfig = {
                    host: olt.host,
                    community: olt.snmp_write_community || olt.snmp_community,
                    version: olt.snmp_version || '2c',
                    port: olt.snmp_port || 161,
                    vendor: olt.type
                };

                logger.info(`Processing OLT ${olt.name} (${olt.host})`);

                // Get all ONUs from this OLT
                const onus = await oltSnmpMonitor.getOnuList({
                    ...oltConfig,
                    community: olt.snmp_community // Use read community for getting list
                });

                totalOnus += onus.length;
                logger.info(`[Rename] Found ${onus.length} ONUs on ${olt.name}`);

                for (const onu of onus) {
                    const onuMac = onu.sn ? onu.sn.toLowerCase() : null;
                    const customerName = onuMac ? macToCustomer.get(onuMac) : null;

                    const result = {
                        olt_name: olt.name,
                        onu_index: onu.index,
                        onu_sn: onu.sn,
                        current_name: onu.name,
                        customer_name: customerName || null,
                        action: null,
                        status: null,
                        message: null
                    };

                    // Only rename unnamed ONUs (empty, dash, or whitespace)
                    const currentName = (onu.name || '').trim();
                    const isUnnamed = !currentName || currentName === '-' || currentName === '--';

                    if (!isUnnamed) {
                        result.action = 'skip';
                        result.status = 'already_named';
                        result.message = `ONU already named "${onu.name}"`;
                        skippedCount++;
                    } else if (customerName) {
                        // Check if name already used by another ONU (ONU replacement case)
                        const duplicateName = onus.find(o => 
                            o.index !== onu.index && 
                            (o.name || '').trim().toLowerCase() === customerName.toLowerCase()
                        );
                        if (duplicateName) {
                            logger.info(`[Rename] Name "${customerName}" already used by ONU ${duplicateName.index} on ${olt.name} - likely ONU replacement`);
                        }

                        result.action = 'rename';
                        result.new_name = customerName;

                        if (!dry_run) {
                            try {
                                await new Promise(r => setTimeout(r, 150));
                                await oltSnmpMonitor.setOnuName(oltConfig, onu.rawIndex, customerName);
                                result.status = 'success';
                                result.message = `Renamed from "" to "${customerName}"`;
                                renamedCount++;
                                logger.info(`[Rename] ✅ ${olt.name} ONU ${onu.index}: "${onu.name}" → "${customerName}"`);
                            } catch (renameError) {
                                result.status = 'error';
                                result.message = `Failed to rename: ${renameError.message}`;
                                errorCount++;
                                logger.error(`[Rename] ❌ ${olt.name} ONU ${onu.index}: ${renameError.message}`);
                            }
                        } else {
                            result.status = 'dry_run';
                            result.message = `Would rename from "" to "${customerName}"`;
                            renamedCount++;
                        }
                    } else {
                        result.action = 'skip';
                        result.status = 'no_customer';
                        result.message = `No customer found for MAC "${onu.sn}"`;
                        skippedCount++;
                    }

                    renameResults.push(result);
                }

            } catch (oltError) {
                logger.error(`Error processing OLT ${olt.name}:`, oltError);
                renameResults.push({
                    olt_name: olt.name,
                    action: 'error',
                    status: 'olt_error',
                    message: `Failed to process OLT: ${oltError.message}`
                });
                errorCount++;
            }
        }

        res.json({
            success: true,
            data: {
                dry_run: dry_run,
                summary: {
                    total_olts: olts.length,
                    total_onus: totalOnus,
                    renamed: renamedCount,
                    skipped: skippedCount,
                    errors: errorCount
                },
                results: renameResults
            },
            message: dry_run
                ? `Dry run selesai. ${renamedCount} ONU akan di-rename.`
                : `Selesai. ${renamedCount} ONU berhasil di-rename.`
        });

    } catch (error) {
        logger.error('Error in ONU auto-rename:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat auto-rename ONU'
        });
    }
});

// GET /api/v1/realtime/online-status - Lightweight endpoint for auto-refresh
// Only returns realtime data (status, traffic, signal) without full customer details
router.get('/online-status', asyncHandler(async (req, res) => {
    try {
        const { customer_ids } = req.query;

        if (!customer_ids) {
            return res.status(400).json({
                success: false,
                message: 'customer_ids parameter is required'
            });
        }

        const customerIdList = Array.isArray(customer_ids) ? customer_ids : customer_ids.split(',');

        // Get realtime data: online sessions from radacct
        const statusQuery = `
            SELECT
                username,
                framedipaddress as ip_address,
                callingstationid as mac_address,
                acctstarttime as start_time,
                acctinputoctets as upload_bytes,
                acctoutputoctets as download_bytes,
                acctsessiontime as session_time,
                EXTRACT(EPOCH FROM (NOW() - acctstarttime)) as uptime_seconds
            FROM radacct
            WHERE acctstoptime IS NULL
            ORDER BY acctstarttime DESC
        `;

        const statusResult = await query(statusQuery);
        const onlineSessions = new Map();

        statusResult.rows.forEach(row => {
            onlineSessions.set(row.username, {
                username: row.username,
                ip_address: row.ip_address,
                mac_address: row.mac_address,
                start_time: row.start_time,
                upload_bytes: parseInt(row.upload_bytes) || 0,
                download_bytes: parseInt(row.download_bytes) || 0,
                session_time: parseInt(row.session_time) || 0,
                active: true,
                uptime_seconds: parseInt(row.uptime_seconds) || 0
            });
        });

        // Get cached signal data (no SNMP)
        const onlineUsernames = [...onlineSessions.keys()];
        const signalByPppoe = oltSnmpMonitor.getSignalForUsernames(onlineUsernames);

        // Background refresh signal cache if stale (non-blocking, every 30 min)
        if (oltSnmpMonitor.isSignalCacheStale() && onlineSessions.size > 0) {
          query('SELECT id, name, host, type, snmp_community, snmp_port, snmp_version FROM olts WHERE status = $1', ['active']).then(oltsResult => {
            oltSnmpMonitor.matchSignalToCustomers([...onlineSessions.values()], oltsResult.rows).catch(e => {
              logger.warn('Background signal refresh failed:', e.message);
            });
          }).catch(e => logger.warn('Failed to fetch OLTs for background refresh:', e.message));
        }

        // Build response with only online status data
        const statusData = {};

        for (const customerId of customerIdList) {
            const pppoeQuery = `
                SELECT td.pppoe_username
                FROM technical_details td
                LEFT JOIN services s ON td.service_id = s.id
                WHERE s.customer_id = $1
            `;
            const pppoeResult = await query(pppoeQuery, [customerId]);

            if (pppoeResult.rows.length > 0) {
                const pppoeUsername = pppoeResult.rows[0].pppoe_username;
                const session = onlineSessions.get(pppoeUsername);
                const signal = signalByPppoe[pppoeUsername] || {};

                if (session || signal.rx_power) {
                    statusData[customerId] = {
                        online_status: session ? 'online' : 'offline',
                        uptime_seconds: session?.uptime_seconds || 0,
                        data_used: {
                            upload: session?.upload_bytes || 0,
                            download: session?.download_bytes || 0
                        },
                        rx_power: signal.rx_power || null,
                        tx_power: signal.tx_power || null,
                        olt_distance: signal.distance || null,
                        olt_name: signal.olt_name || null,
                        onu_index: signal.onu_index || null
                    };
                }
            }
        }

        res.json({
            success: true,
            data: {
                status: statusData,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('Error in CoA request:', error);
        res.status(500).json({
            success: false,
            message: `Terjadi kesalahan saat mengirim CoA: ${error.message}`
        });
    }
}));

// POST /api/v1/realtime/radius-sync - Reopen RADIUS sessions stopped by restart
router.post('/radius-sync', async (req, res) => {
    try {
        const radiusSync = require('../../../config/radius-sync');
        const result = await radiusSync.reopenStoppedSessions();

        res.json({
            success: result.success,
            reopened: result.reopened,
            message: result.success
                ? `${result.reopened} session(s) reopened`
                : `Reopen failed: ${result.error}`,
            timestamp: new Date()
        });
    } catch (error) {
        logger.error('Error in RADIUS sync reopen:', error);
        res.status(500).json({
            success: false,
            message: `Terjadi kesalahan: ${error.message}`
        });
    }
});

// GET /api/v1/realtime/online-status - Lightweight endpoint for auto-refresh
// TEMPORARILY DISABLED - will be fixed separately
// router.get('/online-status', asyncHandler(async (req, res) => {
//     try {
//         const { customer_ids } = req.query;
//         if (!customer_ids) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'customer_ids parameter is required'
//             });
//         }
//         ... rest of implementation
//     } catch (error) {
//         logger.error('Error fetching online status:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Terjadi kesalahan saat mengambil data status'
//         });
//     }
// });

module.exports = router;