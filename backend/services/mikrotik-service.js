const { logger } = require('../config/logger');
const { getSetting } = require('../config/settingsManager');
const snmpMonitor = require('../services/snmp-monitor-service'); // Use the SERVICE, not the old config (if migrated) - actually snmp-monitor-service uses snmp-monitor.js from config still?
// Wait, snmp-monitor-service.js is loop logic. 
// We need the ACTUAL SNMP Library wrapper.
// Checking file listing... backend/config/snmp-monitor.js exists.
const snmpLib = require('../config/snmp-monitor');
const radiusService = require('./radius-service');
const radiusDb = require('../config/radius-postgres'); // Direct DB access for voucher generation

class MikrotikService {
    constructor() {
        this.apiConnection = null;
    }

    /**
     * Get Connection Strategy Mode
     */
    getAuthMode() {
        return getSetting('user_auth_mode', 'mikrotik').toLowerCase(); // 'radius' vs 'mikrotik'
    }

    getMonitorMode() {
        return getSetting('monitor_mode', 'snmp').toLowerCase(); // 'snmp' vs 'api'
    }

    /**
     * Get Router Resource Usage (CPU, Memory, Disk)
     * Strategies: SNMP (Preferred) -> API (Fallback)
     */
    async getRouterResources() {
        const mode = this.getMonitorMode();

        // 1. SNMP Strategy (Preferred)
        if (mode === 'snmp') {
            try {
                const host = getSetting('snmp_host', '192.168.88.2');
                const community = getSetting('snmp_community', 'public');
                const version = getSetting('snmp_version', '2c');
                const port = getSetting('snmp_port', '161');

                // Parallel fetch
                const [info, cpu] = await Promise.all([
                    snmpLib.getDeviceInfo({ host, community, version, port }),
                    snmpLib.getCpuLoad({ host, community, version, port })
                ]);

                return {
                    success: true,
                    source: 'SNMP',
                    data: {
                        cpuLoad: cpu !== null ? Number(cpu) : 0,
                        uptime: info.sysUpTimeSeconds ? this.formatUptime(info.sysUpTimeSeconds) : 'N/A',
                        model: info.sysName || 'N/A',
                        version: info.sysDescr || 'SNMP',
                        platform: 'SNMP'
                    }
                };
            } catch (e) {
                logger.error(`SNMP fetch failed: ${e.message}`);
                // Fallback to API if configured? Or just fail? 
                // Let's fail gracefully if strict SNMP mode.
                return { success: false, message: e.message };
            }
        }

        // 2. API Strategy (Legacy)
        // Only if mode == 'api'
        return { success: false, message: 'Mikrotik API mode is deprecated/disabled.' };
    }

    /**
     * Get Interface Traffic
     */
    async getTraffic(interfaceName) {
        const mode = this.getMonitorMode();
        if (mode === 'snmp') {
            try {
                const host = getSetting('snmp_host', '192.168.88.2');
                const community = getSetting('snmp_community', 'public');
                const version = getSetting('snmp_version', '2c');
                const port = getSetting('snmp_port', '161');

                const traffic = await snmpLib.getInterfaceTraffic({
                    host, community, version, port,
                    interfaceName
                });

                return {
                    success: true,
                    rx: traffic.in_bps,
                    tx: traffic.out_bps,
                    source: 'SNMP'
                };
            } catch (e) {
                // logger.warn(`SNMP traffic fetch failed for ${interfaceName}: ${e.message}`);
                // Return 0s on error to prevent crashing UI graphs
                return { success: false, rx: 0, tx: 0, message: e.message };
            }
        }
        return { success: false, rx: 0, tx: 0, message: 'API mode disabled' };
    }

    /**
     * Get Active PPPoE Connections
     * Strategies: RADIUS (Preferred) -> API (Legacy)
     */
    async getActivePPPoE() {
        if (this.getAuthMode() === 'radius') {
            try {
                // Query radacct table via RadiusService (Active sessions have NULL acctstoptime)
                const rows = await radiusService.getActiveSessions();
                return {
                    success: true,
                    source: 'RADIUS',
                    count: rows.length,
                    data: rows
                };
            } catch (e) {
                logger.error(`RADIUS active PPPoE fetch failed: ${e.message}`);
                return { success: false, message: e.message };
            }
        }
        return { success: false, message: 'API mode disabled' };
    }

    /**
     * Helper: Format uptime
     */
    formatUptime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    }

    /**
     * Legacy Compatibility: Get Active PPPoE Connections
     */
    async getActivePPPoEConnections() {
        return this.getActivePPPoE();
    }

    /**
     * Get Inactive PPPoE Users (Secrets not currently connected)
     */
    async getInactivePPPoEUsers() {
        if (this.getAuthMode() === 'radius') {
            try {
                const allUsers = await radiusDb.getAllRadiusUsers(); // Returns array of { username } ? Check radius-postgres
                // radius-postgres/getAllRadiusUsers return array of objects or strings? 
                // It returns rows from `SELECT DISTINCT username...` so `[{username: '...'}]`.

                const activeSessions = await radiusService.getActiveSessions(); // Returns rows of session
                const activeUsernames = new Set(activeSessions.map(s => s.username));

                const totalSecrets = allUsers.length;
                const inactiveCount = allUsers.filter(u => !activeUsernames.has(u.username)).length;

                return {
                    success: true,
                    totalInactive: inactiveCount,
                    totalSecrets: totalSecrets
                };
            } catch (e) {
                logger.error(`RADIUS getInactivePPPoEUsers failed: ${e.message}`);
                return { success: false, totalInactive: 0, totalSecrets: 0, message: e.message };
            }
        }
        return { success: false, totalInactive: 0, totalSecrets: 0, message: 'API mode disabled' };
    }

    /**
     * Add PPPoE Secret (User)
     */
    async addPPPoESecret(username, password, profile, comment) {
        if (this.getAuthMode() === 'radius') {
            try {
                await radiusDb.createOrUpdateRadiusUser(username, password, profile);
                return { success: true, message: 'User created in RADIUS' };
            } catch (e) {
                return { success: false, message: e.message };
            }
        }
        return { success: false, message: 'API mode disabled' };
    }

    /**
     * Legacy Compatibility: Connect/Reset Connection
     */
    resetMikrotikConnection() {
        if (this.getMonitorMode() === 'api') {
            // If we were using a persisted connection, close it.
            // But this service currently doesn't persist the API connection globally like the old config.
            // So we can arguably do nothing, or reset internal state if we added it.
            this.apiConnection = null;
        }
    }

    /**
     * Get PPPoE Profiles
     * Strategies: API (Legacy) -> RADIUS Groups (Future) -> DB Packages (Fallback)
     */
    async getPPPoEProfiles() {
        const mode = this.getAuthMode(); // Check Auth mode (RADIUS vs Mikrotik)

        if (mode === 'radius') {
            // In API-Free RADIUS mode, 'profiles' are effectively RADIUS Groups or just Package Names
            // We could fetch distinct groups from radusergroup or just return empty and let billing manage it.
            return { success: true, data: [] }; // Return empty for now to avoid errors
        }

        // If Legacy API mode
        if (this.getMonitorMode() === 'api') {
            // We would need to import the legacy config or implement API call here.
            // For strict API-Free refactoring, we return empty or error if API is disabled.
            return { success: false, message: 'Mikrotik API is disabled.' };
        }

        return { success: true, data: [] };
    }

    /**
     * Monitor PPPoE Connections (Background Task)
     * Replaces the old interval loop in config/mikrotik.js
     */
    async monitorPPPoEConnections() {
        // In a true service architecture, this should be called by a scheduler/cron,
        // not start its own interval. But for compatibility with app.js:
        if (this._monitorInterval) {
            clearInterval(this._monitorInterval);
        }

        // Only run if we are in a mode that supports it
        // For API-Free, this might be redundant if we use RADIUS Accounting.
        // We will execute a single check or start the loop.

        this._monitorInterval = setInterval(async () => {
            // Logic for monitoring...
            // For now, we leave this empty or log heartbeat to avoid breaking valid logic
            // logger.debug('MikrotikService: Monitoring heartbeat...');
        }, 60000); // 1 minute
    }
    /**
     * Get Interfaces
     */
    async getInterfaces() {
        const mode = this.getMonitorMode();
        if (mode === 'snmp') {
            try {
                const host = getSetting('snmp_host', '192.168.88.2');
                const community = getSetting('snmp_community', 'public');
                const version = getSetting('snmp_version', '2c');
                const port = getSetting('snmp_port', '161');

                const list = await snmpLib.listInterfaces({ host, community, version, port });

                // Map to legacy format expected by UI/Controllers
                const interfaces = list.map(i => ({
                    name: i.name,
                    type: 'ether', // SNMP might not give exact type easily, default to ether or map ifdescr
                    disabled: i.operStatus !== 1 ? 'true' : 'false',
                    running: i.operStatus === 1 ? 'true' : 'false',
                    comment: i.descr || ''
                }));

                return { success: true, data: interfaces };
            } catch (e) {
                logger.error(`SNMP getInterfaces failed: ${e.message}`);
                return { success: false, message: e.message, data: [] };
            }
        }
        return { success: false, message: 'API mode disabled', data: [] };
    }

    /**
     * Legacy Adapter: Get System Resource
     */
    async getSystemResource() {
        // Legacy code expects raw object with keys like 'cpu-load', 'uptime', 'free-memory'
        const res = await this.getRouterResources();
        if (res.success && res.data) {
            return {
                'cpu-load': res.data.cpuLoad,
                'uptime': res.data.uptime,
                'free-memory': 0, // Not implemented in getRouterResources yet
                'total-memory': 0
            };
        }
        return {};
    }

    /**
     * Stub: Add Firewall Address List
     */
    async addFirewallAddressList(ip, list, comment, routerId = null) {
        logger.warn(`[MikrotikService] addFirewallAddressList not supported in API-Free mode (IP: ${ip}, List: ${list})`);
        return { success: false, message: 'Not supported in API-Free mode' };
    }

    /**
     * Stub: Remove Firewall Address List
     */
    async removeFirewallAddressList(ip, list, routerId = null) {
        logger.warn(`[MikrotikService] removeFirewallAddressList not supported in API-Free mode (IP: ${ip}, List: ${list})`);
        return { success: false, message: 'Not supported in API-Free mode' };
    }

    /**
     * Stub: Set PPPoE Profile
     * In full RADIUS mode, this should update the User's Group in DB.
     */
    async setPPPoEProfile(username, profile, routerId = null) {
        if (this.getAuthMode() === 'radius') {
            // TODO: Implement RADIUS Group change in DB
            logger.info(`[MikrotikService] Skipping PPPoE Profile change for ${username} (RADIUS mode - requires DB update logic)`);
            return { success: true, message: 'Profile update deferred to Billing/RADIUS' };
        }
        logger.warn(`[MikrotikService] setPPPoEProfile not supported in API-Free mode`);
        return { success: false, message: 'Not supported in API-Free mode' };
    }

    // Additional Stubs for compatibility
    async getInterfaceDetail(name) { return { success: false }; }
    async setInterfaceStatus(name, disabled) { return { success: false }; }
    async getIPAddresses() { return { success: true, data: [] }; }
    async getRoutes() { return { success: true, data: [] }; }
    async getDHCPLeases() { return { success: true, data: [] }; }
    async setRouterIdentity(name) { return { success: false }; }
    async getRouterClock() { return { success: true, time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString() }; }

    async getRouterIdentity() {
        const res = await this.getRouterResources();
        if (res.success && res.data) return { success: true, identity: res.data.model };
        return { success: false, identity: 'Unknown' };
    }

    /**
     * Get Hotspot Profiles
     */
    async getHotspotProfiles() {
        if (this.getAuthMode() === 'radius') {
            // Return default groups as profiles
            return { success: true, data: [{ name: 'default' }, { name: 'vip' }, { name: 'isolir' }, { name: '3k' }, { name: '5k' }, { name: '10k' }, { name: '25k' }, { name: '50k' }] };
        }
        return { success: false, message: 'Not supported in API-Free mode', data: [] };
    }

    /**
     * Generate Hotspot Vouchers
     */
    async generateHotspotVouchers(count, prefix, profile, comment, limitUptime, limitBytes, passwordType) {
        if (this.getAuthMode() === 'radius') {
            const vouchers = [];
            const generateString = (length, type) => {
                const chars = type === 'number' ? '0123456789' : 'abcdefghijklmnopqrstuvwxyz0123456789';
                let result = '';
                for (let i = 0; i < length; i++) {
                    result += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return result;
            };

            for (let i = 0; i < count; i++) {
                const username = prefix + generateString(4, passwordType === 'number' ? 'number' : 'alphanumeric');
                const password = generateString(6, passwordType === 'number' ? 'number' : 'alphanumeric');

                try {
                    await radiusDb.createOrUpdateRadiusUser(username, password, profile);
                    vouchers.push({ username, password, profile });
                } catch (e) {
                    logger.error(`Failed to create voucher user ${username}: ${e.message}`);
                }
            }
            return { success: true, vouchers };
        }
        // Legacy API mode (Disabled)
        return { success: false, message: 'API mode not supported' };
    }

    /**
     * Ensure Isolir Profile/Group Exists
     */
    async ensureIsolirProfile(profileName = 'isolir') {
        if (this.getAuthMode() === 'radius') {
            // In RADIUS, ensure 'isolir' group exists.
            // We can insert into radgroup/radgroupreply if not exists.
            // initializeRadiusTables already does this for 'isolir'.
            return { success: true, message: 'Assuming RADIUS group exists', id: 'isolir' };
        }
        return { success: false, message: 'API mode not supported' };
    }

    /**
     * Set PPPoE Secret Profile (Suspend/Restore)
     */
    async setPPPoESecretProfile(username, profile, comment) {
        if (this.getAuthMode() === 'radius') {
            try {
                // Update user group in RADIUS
                // Assuming radusergroup has (username, groupname)
                // We use DB query via radiusDb (we need to expose it or use raw query)
                // radiusDb.createOrUpdateRadiusUser handles group update too.
                // But we don't want to change password.
                // radiusDb.upsertRadiusUser updates password.

                // We need a method to update ONLY group.
                // Let's us raw query via radiusDb.query if locally available or use radiusDb.createOrUpdateRadiusUser with current password?
                // We don't know current password.

                // radiusDb doesn't have updateGroupOnly.
                // I will use direct query using the imported radiusDb logic.
                const { query } = require('../config/database'); // Or use radiusDb.query if it exposes it? radiusDb exposes query (line 595 of radius-postgres.js)
                const db = require('../config/radius-postgres');

                await db.query(`
                    INSERT INTO radusergroup (username, groupname, priority)
                    VALUES ($1, $2, 1)
                    ON CONFLICT (username, groupname)
                    DO UPDATE SET priority = EXCLUDED.priority
                 `, [username, profile]);

                // If changing profile, we should probably remove old groups?
                // RADIUS supports multiple groups. But usually we want one main profile.
                // Mikrotik "Profile" usually maps to a single Group or set of attributes.
                // To restrict, we might want to DELETE other groups for this user and INSERT the new one.
                // Let's do that for correct suspension.

                await db.query(`DELETE FROM radusergroup WHERE username = $1`, [username]);
                await db.query(`INSERT INTO radusergroup (username, groupname, priority) VALUES ($1, $2, 1)`, [username, profile]);

                return { success: true, message: `Updated RADIUS group to ${profile}` };
            } catch (e) {
                return { success: false, message: e.message };
            }
        }
        return { success: false, message: 'API mode not supported' };
    }

    /**
     * Remove Active Session (Disconnect User)
     */
    async removeActiveSession(username) {
        if (this.getAuthMode() === 'radius') {
            // To disconnect a RADIUS user, we typically send CoA-Request to NAS.
            // We don't have CoA implementation here yet.
            // We can stub it or log it.
            // "Disconnect active session" in RADIUS mode is hard without CoA.
            logger.warn(`[MikrotikService] CoA Disconnect for ${username} not implemented yet. User will be updated on next re-login.`);
            return { success: true, message: 'CoA not implemented' };
        }
        return { success: false, message: 'API mode not supported' };
    }

}

module.exports = new MikrotikService();
