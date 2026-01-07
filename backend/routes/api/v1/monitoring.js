const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const { logger } = require('../../../config/logger');
const monitorService = require('../../../services/monitorService');
const oltMonitor = require('../../../config/olt-snmp-monitor');
const snmp = require('net-snmp'); // Direct import for main traffic check
const { getSetting } = require('../../../config/settingsManager');

// Helper to create SNMP session
function createSnmpSession(host, community, version = '2c') {
    return snmp.createSession(host, community, {
        version: version === '2c' ? snmp.Version2c : snmp.Version1,
        timeout: 2000
    });
}

// GET /api/v1/monitoring/stats - Consolidated Dashboard Stats
router.get('/stats', async (req, res) => {
    try {
        const responseData = {
            warnings: [],
            alerts: [],
            traffic: [],
            uptime: [],
            activity: []
        };

        // 1. Uptime Monitors
        const monitors = await query('SELECT * FROM uptime_monitors ORDER BY id ASC');
        responseData.uptime = monitors.rows;

        // 2. Data Warning (High Attenuation ONUs)
        // 2. Data Warning (Signal Quality Stats)
        responseData.signalStats = { normal: 0, warning: 0, critical: 0 };

        try {
            // Fix: Use 'olts' table instead of 'nas'
            const oltsRes = await query("SELECT * FROM olts WHERE status = 'active' AND type IN ('zte', 'huawei', 'hsgq', 'hioso', 'vsol')");

            if (oltsRes.rows.length === 0) {
                responseData.warnings.push({ name: 'System Info', sn: '-', rxPower: '-', olt: 'No Active OLTs Found' });
            } else {
                // Parallelize OLT scans for performance
                // We scan all active OLTs now (removing slice limit since user wants combined data)
                const scanPromises = oltsRes.rows.map(async (olt) => {
                    try {
                        const onuList = await oltMonitor.getOnuList({
                            host: olt.host,
                            community: olt.snmp_community,
                            version: olt.snmp_version,
                            port: olt.snmp_port,
                            vendor: olt.type
                        });

                        onuList.forEach(onu => {
                            const rx = parseFloat(onu.rxPower);
                            if (isNaN(rx)) return;

                            // Categorize
                            if (rx >= -24) {
                                responseData.signalStats.normal++;
                            } else if (rx >= -27) { // -24 to -27
                                responseData.signalStats.warning++;
                                responseData.warnings.push({
                                    name: onu.name || `ONU-${onu.sn}`,
                                    sn: onu.sn,
                                    rxPower: onu.rxPower,
                                    olt: olt.name,
                                    severity: 'warning'
                                });
                            } else { // < -27
                                responseData.signalStats.critical++;
                                responseData.warnings.push({
                                    name: onu.name || `ONU-${onu.sn}`,
                                    sn: onu.sn,
                                    rxPower: onu.rxPower,
                                    olt: olt.name,
                                    severity: 'critical'
                                });
                            }
                        });

                    } catch (e) {
                        logger.warn(`Failed to scan OLT ${olt.name}: ${e.message}`);
                    }
                });

                await Promise.all(scanPromises);

                // Sort by worst signal
                responseData.warnings.sort((a, b) => parseFloat(a.rxPower) - parseFloat(b.rxPower));
            }

        } catch (e) {
            logger.error(`Data warning fetch failed: ${e.message}`);
        }

        // 3. Active Alerts (Connectivity & Radius)
        responseData.connectivity = { total: 0, online: 0, offline: 0 };

        try {
            // Radius Rejects
            const rejects = await query(`
                SELECT username, reply, authdate 
                FROM radpostauth 
                WHERE reply = 'Access-Reject' 
                AND authdate > NOW() - INTERVAL '1 hour'
                ORDER BY authdate DESC LIMIT 5
            `);

            rejects.rows.forEach(r => {
                responseData.alerts.push({
                    type: 'Radius Reject',
                    message: `Login failed for ${r.username}`, // Shortened for UI
                    detail: r.reply,
                    time: r.authdate
                });
            });

            // Connectivity Stats
            const [activeCustRes, activeSessRes] = await Promise.all([
                query("SELECT COUNT(*) as count FROM services WHERE status = 'active'"),
                query("SELECT COUNT(*) as count FROM radacct WHERE acctstoptime IS NULL")
            ]);

            const totalActive = parseInt(activeCustRes.rows[0].count) || 0;
            const openSessions = parseInt(activeSessRes.rows[0].count) || 0;
            const disconnected = Math.max(0, totalActive - openSessions);

            responseData.connectivity = {
                total: totalActive,
                online: openSessions,
                offline: disconnected
            };

        } catch (e) {
            responseData.alerts.push({ type: 'System Error', message: `Monitor Failed: ${e.message}` });
        }

        // 4. Network Traffic (Main Interface) - Placeholder for stats
        // Actual live traffic is fetched via /traffic/live endpoint
        responseData.traffic = [];

        // 5. Recent Activity
        try {
            const activity = await query(`
                SELECT username, acctstarttime, acctstoptime, framedipaddress, callingstationid
                FROM radacct
                WHERE acctstoptime IS NULL
                ORDER BY acctstarttime DESC LIMIT 10
            `);
            responseData.activity = activity.rows;
        } catch (e) { }


        res.json({ success: true, data: responseData });

    } catch (error) {
        logger.error('Error fetching monitoring stats:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
});

// GET /api/v1/monitoring/traffic/live - Real-time Traffic reading
router.get('/traffic/live', async (req, res) => {
    try {
        // Fix: fetch object and access properties safely
        const { getSetting } = require('../../../config/settingsManager'); // Local require to ensure clean state
        const network = getSetting('network') || {};
        const mainTraffic = network.main_traffic || {};

        const routerId = mainTraffic.router_id;
        const interfaceName = mainTraffic.interface_name;

        if (!routerId || !interfaceName) {
            return res.json({ success: false, message: 'Interface not configured' });
        }

        const nasal = await query('SELECT * FROM nas WHERE id = $1', [routerId]);
        if (nasal.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Router not found' });
        }
        const nas = nasal.rows[0];

        // Fetch traffic using snmp-monitor (generic)
        const { getInterfaceTraffic } = require('../../../config/snmp-monitor');

        const stats = await getInterfaceTraffic({
            host: nas.ip_address || nas.nasname, // Use IP if available, else hostname
            community: nas.snmp_community,
            version: nas.snmp_version,
            port: nas.snmp_port,
            interfaceName: interfaceName
        });

        res.json({ success: true, data: stats });

    } catch (error) {
        // logger.error(`Traffic fetch error: ${error.message}`); // Verbose
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/v1/monitoring/monitors
router.get('/monitors', async (req, res) => {
    try {
        const result = await query('SELECT * FROM uptime_monitors ORDER BY id ASC');
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/v1/monitoring/monitors
router.post('/monitors', async (req, res) => {
    try {
        const { name, target, type, interval } = req.body;
        const result = await query(`
            INSERT INTO uptime_monitors (name, target, type, interval)
            VALUES ($1, $2, $3, $4) RETURNING *
        `, [name, target, type || 'icmp', interval || 60]);

        monitorService.refresh(); // Reload service
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/v1/monitoring/monitors/:id
router.delete('/monitors/:id', async (req, res) => {
    try {
        await query('DELETE FROM uptime_monitors WHERE id = $1', [req.params.id]);
        monitorService.refresh();
        res.json({ success: true, message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
