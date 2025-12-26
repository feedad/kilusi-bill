const { query } = require('../config/database');
const { logger } = require('../config/logger');
const snmpMonitor = require('../config/snmp-monitor');

class SnmpMonitorService {
    constructor() {
        this.autoCheckInterval = null;
        this.INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) return;

        logger.info(`Starting SNMP Monitor Service (Interval: ${this.INTERVAL_MS / 1000}s)`);

        // Run immediately
        this.checkAll();

        // Schedule
        this.autoCheckInterval = setInterval(() => this.checkAll(), this.INTERVAL_MS);
        this.isRunning = true;
    }

    stop() {
        if (this.autoCheckInterval) {
            clearInterval(this.autoCheckInterval);
            this.autoCheckInterval = null;
        }
        this.isRunning = false;
        logger.info('Stopped SNMP Monitor Service');
    }

    async checkAll() {
        try {
            const nasResult = await query(`
                SELECT id, shortname, nasname,
                       snmp_enabled, snmp_community, snmp_version, snmp_port
                FROM nas
                WHERE snmp_enabled = true
                ORDER BY snmp_last_checked ASC NULLS FIRST
            `);

            const nasList = nasResult.rows;
            if (nasList.length === 0) return;

            logger.info(`[SNMP Monitor] Checking ${nasList.length} NAS servers...`);

            // Process in batches
            const batchSize = 5;
            for (let i = 0; i < nasList.length; i += batchSize) {
                const batch = nasList.slice(i, i + batchSize);
                await Promise.all(batch.map(nas => this.checkOne(nas)));

                // Small delay to prevent network spikes
                if (i + batchSize < nasList.length) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            logger.info('[SNMP Monitor] Check completed');

        } catch (error) {
            logger.error('[SNMP Monitor] Failed to run checkAll:', error);
        }
    }

    async checkOne(nas) {
        try {

            let timeoutId;
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('SNMP timeout')), 10000);
            });

            const snmpPromise = snmpMonitor.getSystemInfo({
                host: nas.nasname,
                community: nas.snmp_community || 'public',
                version: nas.snmp_version || '2c',
                port: nas.snmp_port || 161
            }).finally(() => clearTimeout(timeoutId));

            const snmpData = await Promise.race([snmpPromise, timeoutPromise]);

            if (snmpData && snmpData.success) {
                await query(`
                    UPDATE nas SET
                        snmp_status = 'online',
                        snmp_last_checked = NOW(),
                        snmp_cpu_usage = $1,
                        snmp_memory_usage = $2,
                        snmp_interface_count = $3,
                        snmp_uptime = $4,
                        snmp_system_description = $5,
                        snmp_contact = $6,
                        snmp_location = $7,
                        snmp_error = NULL
                    WHERE id = $8
                `, [
                    snmpData.data.cpu_usage || 0,
                    snmpData.data.memory_usage || 0,
                    snmpData.data.interface_count || 0,
                    snmpData.data.uptime || 0,
                    snmpData.data.sysDescr || null,
                    snmpData.data.sysContact || null,
                    snmpData.data.sysLocation || null,
                    nas.id
                ]);
            } else {
                throw new Error(snmpData.message || 'Unknown SNMP error');
            }
        } catch (error) {
            logger.warn(`[SNMP Monitor] Failed checking NAS ${nas.shortname}: ${error.message}`);
            await query(`
                UPDATE nas SET
                    snmp_status = 'offline',
                    snmp_last_checked = NOW(),
                    snmp_error = $1
                WHERE id = $2
            `, [error.message, nas.id]);
        }
    }

    /**
     * Get Detailed SNMP Information for a NAS
     * Returns comprehensive system, resource, and interface information
     */
    async getDetailedInfo(nasId) {
        // Get NAS from database
        const nasResult = await query(`
            SELECT id, shortname, nasname,
                   snmp_enabled, snmp_community, snmp_version, snmp_port
            FROM nas WHERE id = $1
        `, [nasId]);

        if (nasResult.rows.length === 0) {
            throw { code: 'NOT_FOUND', message: 'NAS not found' };
        }

        const nas = nasResult.rows[0];

        if (!nas.snmp_enabled) {
            return {
                enabled: false,
                message: 'SNMP not enabled for this NAS'
            };
        }

        const snmpConfig = {
            host: nas.nasname,
            community: nas.snmp_community || 'public',
            version: nas.snmp_version || '2c',
            port: nas.snmp_port || 161
        };

        try {
            // Fetch all SNMP data in parallel
            // Use both getDeviceInfo (for MikroTik-specific) and getSystemInfo (for CPU/memory)
            const [deviceInfo, systemInfoResult, cpuLoad, memoryStorage, interfaces] = await Promise.all([
                snmpMonitor.getDeviceInfo(snmpConfig).catch(e => ({ error: e.message })),
                snmpMonitor.getSystemInfo(snmpConfig).catch(e => ({ success: false, error: e.message })),
                snmpMonitor.getCpuLoad(snmpConfig).catch(() => null),
                snmpMonitor.getMemoryAndStorage(snmpConfig).catch(() => null),
                snmpMonitor.listInterfaces(snmpConfig).catch(() => [])
            ]);

            // Extract system info data (getSystemInfo returns { success, data })
            const systemInfo = systemInfoResult?.success ? systemInfoResult.data : (systemInfoResult || {});

            // Filter only physical ethernet interfaces
            const physicalInterfaces = interfaces.filter(iface => {
                const name = (iface.name || iface.descr || '').toLowerCase();
                return name.match(/^(ether|eth|sfp|combo|lan|wan|ge-|xe-|et-|vlan|bridge)/i) &&
                    !name.includes('pppoe') &&
                    !name.includes('loopback');
            });

            // Get traffic rates for physical interfaces
            let trafficRates = [];
            if (physicalInterfaces.length > 0) {
                try {
                    const indices = physicalInterfaces.map(i => i.index);
                    trafficRates = await snmpMonitor.getInterfacesTrafficBulk({
                        ...snmpConfig,
                        indices
                    });
                } catch (e) {
                    logger.debug(`Could not fetch traffic rates: ${e.message}`);
                }
            }

            // Create a map of traffic rates by index
            const trafficRateMap = {};
            trafficRates.forEach(tr => {
                trafficRateMap[tr.index] = tr;
            });

            // uptime from deviceInfo (sysUpTimeSeconds) or fallback to systemInfo.uptime
            const uptimeSeconds = deviceInfo?.sysUpTimeSeconds || systemInfo.uptime || 0;

            return {
                enabled: true,
                system: {
                    name: deviceInfo?.sysName || deviceInfo?.identity || systemInfo.sysName || nas.shortname,
                    description: deviceInfo?.sysDescr || systemInfo.sysDescr || 'N/A',
                    uptime: uptimeSeconds,
                    uptimeFormatted: this._formatUptime(uptimeSeconds),
                    contact: systemInfo.sysContact || 'N/A',
                    location: systemInfo.sysLocation || 'N/A',
                    // From snmp-monitor.js getSystemInfo
                    cpuUsage: systemInfo.cpu_usage || 0,
                    memoryUsage: systemInfo.memory_usage || 0,
                    interfaceCount: systemInfo.interface_count || 0,
                    activeConnections: systemInfo.active_connections || 0,
                    // Mikrotik specific from getDeviceInfo
                    routerOsVersion: deviceInfo?.version || 'N/A',
                    boardName: deviceInfo?.boardName || 'N/A',
                    architecture: deviceInfo?.architecture || 'N/A',
                    cpuCount: deviceInfo?.cpuCount || 1,
                    licenseLevel: deviceInfo?.licenseLevel || 'N/A',
                    cpuTemperature: deviceInfo?.cpuTemperature || null,
                    boardTemperature: deviceInfo?.boardTemperature || null,
                    systemVoltage: null
                },
                resources: {
                    cpuUsage: cpuLoad || systemInfo.cpu_usage || 0,
                    memory: memoryStorage?.mem || {
                        total: systemInfo.memory_total || 0,
                        used: (systemInfo.memory_total || 0) - (systemInfo.memory_available || 0),
                        usedPct: systemInfo.memory_usage || 0
                    },
                    storage: memoryStorage?.storage || []
                },
                interfaces: physicalInterfaces.map(iface => {
                    const traffic = trafficRateMap[iface.index] || {};
                    // Speed from highSpeedMbps (in Mbps) or fallback
                    const speedMbps = iface.highSpeedMbps || 0;
                    // Get bytes from listInterfaces (inOctets/outOctets) or from getInterfacesTrafficBulk
                    const inBytes = traffic.total_in_bytes ?? iface.inOctets ?? 0;
                    const outBytes = traffic.total_out_bytes ?? iface.outOctets ?? 0;

                    return {
                        index: iface.index,
                        name: iface.name || iface.descr || `Interface ${iface.index}`,
                        description: iface.descr || '',
                        status: iface.operStatus === 1 ? 'up' : 'down',
                        adminStatus: iface.adminStatus === 1 ? 'up' : 'down',
                        speed: speedMbps * 1000000, // Convert Mbps to bps for consistency
                        speedFormatted: speedMbps > 0 ? `${speedMbps} Mbps` : 'N/A',
                        mac: iface.mac || 'N/A',
                        mtu: iface.mtu || 1500,
                        type: iface.type || 'ethernet',
                        rxBytes: inBytes,
                        txBytes: outBytes,
                        rxBytesFormatted: this._formatBytes(inBytes),
                        txBytesFormatted: this._formatBytes(outBytes),
                        rxRate: traffic.in_bps || 0,  // bits per second
                        txRate: traffic.out_bps || 0, // bits per second
                        rxRateFormatted: this._formatRate(traffic.in_bps),
                        txRateFormatted: this._formatRate(traffic.out_bps)
                    };
                }),
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            logger.error(`Error fetching SNMP detail for NAS ${nasId}:`, error);
            throw { code: 'SNMP_ERROR', message: error.message };
        }
    }

    // Helper: Format uptime to readable string
    _formatUptime(seconds) {
        if (!seconds) return 'N/A';
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }

    // Helper: Format bytes to readable string
    _formatBytes(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Helper: Format rate (bits per second) to readable string
    _formatRate(bps) {
        if (!bps || bps === 0) return '0 bps';
        const k = 1000; // Use 1000 for bits (standard networking)
        const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
        const i = Math.floor(Math.log(bps) / Math.log(k));
        const val = parseFloat((bps / Math.pow(k, i)).toFixed(2));
        return val + ' ' + sizes[i];
    }
}

const service = new SnmpMonitorService();

// Auto-start if imported? Or let index.js start it?
// For now, let's start it on import to mimic previous behavior where require() started it.
// Ideally, this should be controlled by app.js or index.js
service.start();

module.exports = service;
