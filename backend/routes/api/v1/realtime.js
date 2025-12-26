const express = require('express');
const router = express.Router();
// const { getInterfaceTraffic, getInterfaces } = require('../../../config/mikrotik');
const MikrotikService = require('../../../services/mikrotik-service');
const snmpMonitor = require('../../../config/snmp-monitor');
const { getSetting } = require('../../../config/settingsManager');
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');

// GET /api/v1/realtime/traffic - Get real-time traffic data
router.get('/traffic', async (req, res) => {
    try {
        let iface = req.query.interface;
        const monitorMode = String(getSetting('monitor_mode', 'mikrotik')).toLowerCase();

        if (!iface) {
            iface = monitorMode === 'snmp'
                ? getSetting('snmp_interface', getSetting('main_interface', 'ether1'))
                : getSetting('main_interface', 'ether1');
        }

        let traffic;

        if (monitorMode === 'snmp') {
            const host = getSetting('snmp_host', '');
            const community = getSetting('snmp_community', 'public');
            const version = getSetting('snmp_version', '2c');
            const port = getSetting('snmp_port', '161');

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
        const monitorMode = String(getSetting('monitor_mode', 'mikrotik')).toLowerCase();

        let interfaces = [];

        if (monitorMode === 'snmp') {
            // For SNMP, return configured interface
            interfaces = [{
                name: getSetting('snmp_interface', 'ether1'),
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
        const limit = parseInt(req.query.limit) || 100;
        const search = req.query.search || '';
        const status = req.query.status || '';

        let customers = [];
        let totalTraffic = { upload: 0, download: 0 };

        // Get all customers with their package information
        const customersQuery = `
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
                p.speed as package_speed
            FROM customers_view c
            LEFT JOIN packages p ON c.package_id = p.id
            ORDER BY c.name ASC
            LIMIT $1
        `;

        const customersResult = await query(customersQuery, [limit]);

        // Try to get online status from customer_sessions table
        let onlineSessions = [];
        try {
            const sessionsQuery = await query(`
                SELECT
                    cs.username,
                    cs.ip_address,
                    cs.mac_address,
                    cs.start_time,
                    cs.upload_bytes,
                    cs.download_bytes,
                    cs.session_time,
                    cs.active,
                    cs.last_seen
                FROM customer_sessions cs
                WHERE cs.active = true OR cs.last_seen > NOW() - INTERVAL '5 minutes'
                ORDER BY cs.start_time DESC
            `);
            onlineSessions = sessionsQuery.rows.map(row => ({
                ...row,
                data_used: (row.upload_bytes || 0) + (row.download_bytes || 0),
                rx_power: null  // Column doesn't exist in table
            }));
        } catch (err) {
            logger.warn('customer_sessions table not found, using RADIUS API');

            // Fallback to RADIUS active users
            try {
                // const { getActivePPPoEConnections } = require('../../../config/mikrotik');
                const pppoeResult = await MikrotikService.getActivePPPoEConnections();

                if (pppoeResult.success) {
                    onlineSessions = pppoeResult.data.map(user => ({
                        username: user.name,
                        ip_address: user.address,
                        mac_address: user.callingstationid,
                        start_time: user.acctstarttime,
                        data_used: 0, // Not available from RADIUS query
                        session_time: parseInt(user.uptime) || 0,
                        active: true,
                        rx_power: null,
                        last_seen: new Date()
                    }));
                    logger.info(`Found ${onlineSessions.length} active RADIUS sessions`);
                } else {
                    logger.warn('Failed to get RADIUS sessions:', pppoeResult.message);
                }
            } catch (radiusErr) {
                logger.warn('RADIUS API not available, proceeding without session data:', radiusErr.message);
            }
        }

        // Process customers and add online status
        customers = customersResult.rows.map(customer => {
            const session = onlineSessions.find(s => s.username === customer.pppoe_username);

            let onlineStatus = 'offline';
            let uptime = null;
            let dataUsed = { upload: 0, download: 0 };
            let rxPower = null;
            let lastSeen = null;

            if (session) {
                if (session.active) {
                    onlineStatus = 'online';
                    uptime = session.session_time;
                    totalTraffic.upload += session.data_used ? session.data_used / 2 : 0;
                    totalTraffic.download += session.data_used ? session.data_used / 2 : 0;
                } else if (session.last_seen && new Date(session.last_seen) > new Date(Date.now() - 5 * 60 * 1000)) {
                    onlineStatus = 'idle';
                }

                dataUsed = {
                    upload: session.data_used ? session.data_used / 2 : 0,
                    download: session.data_used ? session.data_used / 2 : 0
                };
                rxPower = session.rx_power;
                lastSeen = session.last_seen;
            }

            // Apply search filter
            const matchesSearch = !search ||
                customer.name.toLowerCase().includes(search.toLowerCase()) ||
                customer.phone.includes(search) ||
                customer.pppoe_username?.toLowerCase().includes(search.toLowerCase());

            // Apply status filter
            const matchesStatus = !status || status === 'all' || onlineStatus === status;

            if (!matchesSearch || !matchesStatus) {
                return null;
            }

            return {
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                address: customer.address,
                pppoe_username: customer.pppoe_username,
                pppoe_password: customer.pppoe_password,
                status: customer.status,
                package_name: customer.package_name,
                package_speed: customer.package_speed,
                online_status: onlineStatus,
                last_seen: lastSeen,
                signal_strength: rxPower,
                rx_power: rxPower,
                uptime: uptime,
                data_used: dataUsed,
                location: null // Would need to implement GPS/location tracking
            };
        }).filter(customer => customer !== null);

        // Calculate stats
        const totalCustomers = customers.length;
        const onlineCustomers = customers.filter(c => c.online_status === 'online').length;
        const offlineCustomers = customers.filter(c => c.online_status === 'offline').length;
        const idleCustomers = customers.filter(c => c.online_status === 'idle').length;

        const stats = {
            total_customers: totalCustomers,
            online_customers: onlineCustomers,
            offline_customers: offlineCustomers,
            idle_customers: idleCustomers,
            total_traffic: totalTraffic
        };

        res.json({
            success: true,
            data: {
                customers: customers,
                stats: stats
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
        const monitorMode = String(getSetting('monitor_mode', 'mikrotik')).toLowerCase();

        let systemStats = {
            timestamp: new Date().toISOString(),
            mode: monitorMode
        };

        if (monitorMode === 'snmp') {
            // Get SNMP system stats
            const host = getSetting('snmp_host', '');
            const community = getSetting('snmp_community', 'public');
            const version = getSetting('snmp_version', '2c');
            const port = getSetting('snmp_port', '161');

            if (host) {
                try {
                    // You might want to implement these SNMP functions
                    // systemStats.cpuUsage = await snmpMonitor.getCPUUsage({ host, community, version, port });
                    // systemStats.memoryUsage = await snmpMonitor.getMemoryUsage({ host, community, version, port });
                    // systemStats.uptime = await snmpMonitor.getUptime({ host, community, version, port });
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

module.exports = router;