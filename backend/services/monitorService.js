const { query } = require('../config/database');
const { logger } = require('../config/logger');
const ping = require('ping');
const axios = require('axios');
const whatsappNotificationManager = require('../config/whatsapp-notifications');

class MonitorService {
    constructor() {
        this.monitors = [];
        this.isRunning = false;
        this.checkInterval = null;
        this.syncInterval = null;
        this.deviceStates = new Map(); // monitor.id -> { failCount: 0, lastAlertedStatus: 'up'|'down' }
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.info('[MonitorService] Starting service...');

        // Auto sync active NAS and OLT to uptime_monitors
        await this.syncDevicesToMonitors();

        // Initial load
        await this.loadMonitors();

        // Run checking loop every 10 seconds (check individual intervals inside)
        this.checkInterval = setInterval(() => this.runChecks(), 10000);

        // Re-sync devices every 10 minutes in case new NAS/OLT is added
        this.syncInterval = setInterval(() => this.syncDevicesToMonitors(), 10 * 60 * 1000);
    }

    async stop() {
        clearInterval(this.checkInterval);
        clearInterval(this.syncInterval);
        this.isRunning = false;
        logger.info('[MonitorService] Stopped service');
    }


    async nmsSyncDevicesToMonitors() {
        return await this.syncDevicesToMonitors();
    }
    async syncDevicesToMonitors() {
        try {
            // 1. Sync NAS devices
            const nasRes = await query(`
                SELECT id, nasname, shortname 
                FROM nas 
                WHERE is_active = true AND nasname IS NOT NULL AND nasname != ''
            `);
            for (const nas of nasRes.rows) {
                const target = nas.nasname.trim();
                const name = `NAS - ${nas.shortname || target}`;
                const existing = await query(`
                    SELECT id FROM uptime_monitors 
                    WHERE target = $1 OR (device_type = 'nas' AND device_id = $2)
                    LIMIT 1
                `, [target, String(nas.id)]);

                if (existing.rows.length === 0) {
                    await query(`
                        INSERT INTO uptime_monitors (name, target, type, interval, device_type, device_id, status)
                        VALUES ($1, $2, 'icmp', 60, 'nas', $3, 'unknown')
                    `, [name, target, String(nas.id)]);
                    logger.info(`[MonitorService] Auto-registered NAS monitor: ${name} (${target})`);
                } else {
                    await query(`
                        UPDATE uptime_monitors 
                        SET device_type = 'nas', device_id = $1, name = $2 
                        WHERE id = $3
                    `, [String(nas.id), name, existing.rows[0].id]);
                }
            }

            // 2. Sync OLT devices
            const oltRes = await query(`
                SELECT id, name, host 
                FROM olts 
                WHERE (status = 'active' OR status IS NULL) AND host IS NOT NULL AND host != ''
            `);
            for (const olt of oltRes.rows) {
                const target = olt.host.trim();
                const name = `OLT - ${olt.name || target}`;
                const existing = await query(`
                    SELECT id FROM uptime_monitors 
                    WHERE target = $1 OR (device_type = 'olt' AND device_id = $2)
                    LIMIT 1
                `, [target, String(olt.id)]);

                if (existing.rows.length === 0) {
                    await query(`
                        INSERT INTO uptime_monitors (name, target, type, interval, device_type, device_id, status)
                        VALUES ($1, $2, 'icmp', 60, 'olt', $3, 'unknown')
                    `, [name, target, String(olt.id)]);
                    logger.info(`[MonitorService] Auto-registered OLT monitor: ${name} (${target})`);
                } else {
                    await query(`
                        UPDATE uptime_monitors 
                        SET device_type = 'olt', device_id = $1, name = $2 
                        WHERE id = $3
                    `, [String(olt.id), name, existing.rows[0].id]);
                }
            }
        } catch (error) {
            logger.error('[MonitorService] Failed to sync NAS/OLT devices to uptime monitors:', error);
        }
    }

    async loadMonitors() {
        try {
            const res = await query('SELECT * FROM uptime_monitors');
            this.monitors = res.rows;
            for (const m of this.monitors) {
                if (!this.deviceStates.has(m.id)) {
                    this.deviceStates.set(m.id, {
                        failCount: 0,
                        lastAlertedStatus: m.status || 'unknown'
                    });
                }
            }
            logger.info(`[MonitorService] Loaded ${this.monitors.length} monitors`);
        } catch (error) {
            logger.error('[MonitorService] Failed to load monitors:', error);
        }
    }

    async refresh() {
        await this.syncDevicesToMonitors();
        await this.loadMonitors();
    }

    async runChecks() {
        const now = new Date();
        for (const monitor of this.monitors) {
            // Check if due time
            const lastChecked = monitor.last_checked ? new Date(monitor.last_checked) : new Date(0);
            const nextCheck = new Date(lastChecked.getTime() + (monitor.interval * 1000));

            if (now >= nextCheck) {
                this.checkMonitor(monitor);
            }
        }
    }

    async checkMonitor(monitor) {
        let status = 'down';
        let latency = 0;
        const startTime = Date.now();

        try {
            if (monitor.type === 'icmp') {
                const res = await ping.promise.probe(monitor.target, { timeout: 2 });
                status = res.alive ? 'up' : 'down';
                latency = res.time === 'unknown' ? 0 : Math.round(res.time);
            } else if (monitor.type === 'http') {
                await axios.get(monitor.target, { timeout: 5000 });
                status = 'up';
                latency = Date.now() - startTime;
            }
        } catch (error) {
            status = 'down';
            latency = 0;
        }

        // Handle alert state transition
        try {
            const state = this.deviceStates.get(monitor.id) || { failCount: 0, lastAlertedStatus: monitor.status || 'unknown' };
            const devType = monitor.device_type || 'nas';

            if (status === 'down') {
                state.failCount = (state.failCount || 0) + 1;
                // Send alert after 2 consecutive failed probes to avoid network jitter false positives
                if (state.failCount >= 2 && state.lastAlertedStatus !== 'down') {
                    state.lastAlertedStatus = 'down';
                    whatsappNotificationManager.sendNetworkDeviceDownAlert({
                        type: devType,
                        name: monitor.name,
                        ip: monitor.target,
                        downTime: new Date()
                    }).catch(err => logger.error(`[MonitorService] Failed to send DOWN alert for ${monitor.name}:`, err));
                }
            } else if (status === 'up') {
                state.failCount = 0;
                if (state.lastAlertedStatus === 'down') {
                    state.lastAlertedStatus = 'up';
                    whatsappNotificationManager.sendNetworkDeviceUpAlert({
                        type: devType,
                        name: monitor.name,
                        ip: monitor.target,
                        latency,
                        recoveryTime: new Date()
                    }).catch(err => logger.error(`[MonitorService] Failed to send UP alert for ${monitor.name}:`, err));
                } else {
                    state.lastAlertedStatus = 'up';
                }
            }
            this.deviceStates.set(monitor.id, state);
        } catch (alertErr) {
            logger.error(`[MonitorService] Alert state check error for ${monitor.name}:`, alertErr);
        }

        // Update DB
        try {
            // Fetch current history first to append
            const currentRes = await query('SELECT history FROM uptime_monitors WHERE id = $1', [monitor.id]);
            let history = currentRes.rows[0]?.history || [];

            // Add new entry
            const entry = {
                ts: new Date().toISOString(),
                status,
                latency
            };
            history.push(entry);

            // Keep last 50
            if (history.length > 50) history = history.slice(-50);

            await query(`
                UPDATE uptime_monitors 
                SET status = $1, response_time = $2, last_checked = NOW(), history = $3
                WHERE id = $4
            `, [status, latency, JSON.stringify(history), monitor.id]);

            // Update local cache
            monitor.status = status;
            monitor.response_time = latency;
            monitor.last_checked = new Date();
            monitor.history = history;

        } catch (err) {
            logger.error(`[MonitorService] Error updating monitor ${monitor.name}:`, err);
        }
    }
}

module.exports = new MonitorService();
