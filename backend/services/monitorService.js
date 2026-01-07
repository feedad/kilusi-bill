const { query } = require('../config/database');
const { logger } = require('../config/logger');
const ping = require('ping');
const axios = require('axios');

class MonitorService {
    constructor() {
        this.monitors = [];
        this.isRunning = false;
        this.checkInterval = null;
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.info('[MonitorService] Starting service...');

        // Initial load
        await this.loadMonitors();

        // Run checking loop every 10 seconds (check individual intervals inside)
        this.checkInterval = setInterval(() => this.runChecks(), 10000);
    }

    async stop() {
        if (this.checkInterval) clearInterval(this.checkInterval);
        this.isRunning = false;
        logger.info('[MonitorService] Stopped service');
    }

    async loadMonitors() {
        try {
            const res = await query('SELECT * FROM uptime_monitors');
            this.monitors = res.rows;
            logger.info(`[MonitorService] Loaded ${this.monitors.length} monitors`);
        } catch (error) {
            logger.error('[MonitorService] Failed to load monitors:', error);
        }
    }

    async refresh() {
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
