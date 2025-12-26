const { query } = require('../config/database');
const { logger } = require('../config/logger');
const snmpMonitor = require('../config/snmp-monitor');
const radiusDb = require('../config/radius-postgres');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class RadiusService {
    /**
     * Get All NAS Servers
     */
    async getAllNas() {
        const queryStr = `
            SELECT
                id, shortname, nasname, secret, type, description,
                created_at, updated_at, COALESCE(ports, 0) as ports,
                snmp_enabled, snmp_community, snmp_version, snmp_port,
                snmp_cpu_usage, snmp_memory_usage, snmp_interface_count, snmp_active_connections,
                snmp_last_checked as last_seen, snmp_status, COALESCE(snmp_status, 'unknown') as status
            FROM nas
            WHERE is_active = true
            ORDER BY shortname ASC
        `;
        const result = await query(queryStr);
        return result.rows;
    }

    /**
     * Get NAS by ID
     */
    async getNasById(id) {
        const queryStr = `
            SELECT
                id, shortname, nasname, secret, type, description,
                ports, snmp_enabled, snmp_community, snmp_community_trap, snmp_version, snmp_port,
                snmp_username, snmp_auth_protocol, snmp_auth_password, snmp_priv_protocol, snmp_priv_password,
                snmp_security_level, snmp_cpu_usage, snmp_memory_usage, snmp_interface_count,
                snmp_active_connections, snmp_last_checked, snmp_status,
                created_at, updated_at
            FROM nas
            WHERE id = $1
        `;
        const result = await query(queryStr, [id]);
        return result.rows[0];
    }

    /**
     * Create NAS
     */
    async createNas(data) {
        const {
            shortname, nasname, secret, type = 'other', description = '',
            snmp_enabled = false, snmp_community = 'public', snmp_community_trap = 'public',
            snmp_version = '2c', snmp_port = 161, snmp_username = '',
            snmp_auth_protocol = 'SHA', snmp_auth_password = '',
            snmp_priv_protocol = 'AES', snmp_priv_password = '', snmp_security_level = 'authPriv'
        } = data;

        // Check duplicates
        const check = await query('SELECT id FROM nas WHERE shortname = $1 OR nasname = $2', [shortname, nasname]);
        if (check.rows.length > 0) throw { code: 'CONFLICT', message: 'NAS with this name or IP already exists' };

        const insertQuery = `
            INSERT INTO nas (
                nasname, shortname, ip_address, secret, type, description,
                snmp_enabled, snmp_community, snmp_community_trap, snmp_version, snmp_port,
                snmp_username, snmp_auth_protocol, snmp_auth_password, snmp_priv_protocol, snmp_priv_password, snmp_security_level,
                created_at, updated_at, is_active
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW(), true
            )
            RETURNING *
        `;

        const result = await query(insertQuery, [
            nasname, shortname, nasname, secret, type, description,
            snmp_enabled, snmp_community, snmp_community_trap, snmp_version, snmp_port,
            snmp_username, snmp_auth_protocol, snmp_auth_password, snmp_priv_protocol, snmp_priv_password, snmp_security_level
        ]);

        return result.rows[0];
    }

    /**
     * Update NAS
     */
    async updateNas(id, data) {
        const current = await this.getNasById(id);
        if (!current) throw { code: 'NOT_FOUND', message: 'NAS not found' };

        // Duplicate check if changing unique fields
        if (data.shortname || data.nasname) {
            const check = await query(
                'SELECT id FROM nas WHERE (shortname = $1 OR nasname = $2) AND id != $3',
                [data.shortname || current.shortname, data.nasname || current.nasname, id]
            );
            if (check.rows.length > 0) throw { code: 'CONFLICT', message: 'NAS with this name or IP already exists' };
        }

        const updateQuery = `
            UPDATE nas SET
                shortname = COALESCE($1, shortname),
                nasname = COALESCE($2, nasname),
                ip_address = COALESCE($2, ip_address),
                secret = COALESCE($3, secret),
                type = COALESCE($4, type),
                description = COALESCE($5, description),
                snmp_enabled = COALESCE($6, snmp_enabled),
                snmp_community = COALESCE($7, snmp_community),
                snmp_community_trap = COALESCE($8, snmp_community_trap),
                snmp_version = COALESCE($9, snmp_version),
                snmp_port = COALESCE($10, snmp_port),
                snmp_username = COALESCE($11, snmp_username),
                snmp_auth_protocol = COALESCE($12, snmp_auth_protocol),
                snmp_auth_password = COALESCE($13, snmp_auth_password),
                snmp_priv_protocol = COALESCE($14, snmp_priv_protocol),
                snmp_priv_password = COALESCE($15, snmp_priv_password),
                snmp_security_level = COALESCE($16, snmp_security_level),
                updated_at = NOW()
            WHERE id = $17
            RETURNING *
        `;

        const result = await query(updateQuery, [
            data.shortname, data.nasname, data.secret, data.type, data.description,
            data.snmp_enabled, data.snmp_community, data.snmp_community_trap, data.snmp_version, data.snmp_port,
            data.snmp_username, data.snmp_auth_protocol, data.snmp_auth_password, data.snmp_priv_protocol, data.snmp_priv_password, data.snmp_security_level,
            id
        ]);

        return result.rows[0];
    }

    /**
     * Delete NAS
     */
    async deleteNas(id) {
        const result = await query('DELETE FROM nas WHERE id = $1', [id]);
        return result.rowCount > 0;
    }

    /**
     * Test NAS Connection (Ping & SNMP)
     */
    async testConnection(id) {
        const nas = await this.getNasById(id);
        if (!nas) throw { code: 'NOT_FOUND', message: 'NAS not found' };

        const results = {
            radius: { success: false, message: 'Not tested' },
            snmp: { success: false, message: 'Not tested' }
        };

        // Ping Test
        try {
            const { stdout } = await execPromise(`ping -c 3 -W 2 ${nas.nasname}`);
            results.radius = {
                success: stdout.includes('bytes from'),
                message: stdout.includes('bytes from') ? 'Reachable' : 'Unreachable'
            };
        } catch (e) {
            results.radius = { success: false, message: 'Unreachable (Ping failed)' };
        }

        // SNMP Test
        if (nas.snmp_enabled) {
            try {
                const snmpData = await snmpMonitor.getSystemInfo({
                    host: nas.nasname,
                    community: nas.snmp_community || 'public',
                    version: nas.snmp_version || '2c',
                    port: nas.snmp_port || 161
                });

                // snmpMonitor throws error on failure, so if we are here, it succeeded.
                // It returns the data object directly.
                const data = snmpData;

                results.snmp = {
                    success: true,
                    message: 'SNMP Connected',
                    data: {
                        uptime: data.sysUpTimeSeconds || 0,
                        cpu: data.cpuTemperature || 0, // Fallback if regular cpu load not in system info, or we need getCpuLoad separate
                        memory: 0 // Memory info is in getMemoryAndStorage
                    }
                };

                // Retrieve CPU/Memory separately as getSystemInfo might not have them all standard
                try {
                    const cpuLoad = await snmpMonitor.getCpuLoad({
                        host: nas.nasname, community: nas.snmp_community, version: nas.snmp_version, port: nas.snmp_port
                    });
                    const mem = await snmpMonitor.getMemoryAndStorage({
                        host: nas.nasname, community: nas.snmp_community, version: nas.snmp_version, port: nas.snmp_port
                    });

                    if (cpuLoad !== null) results.snmp.data.cpu = cpuLoad;
                    if (mem && mem.mem) results.snmp.data.memory = mem.mem.usedPct;
                } catch (ign) { }

                // Update stats
                await query(`
                    UPDATE nas SET snmp_status = 'online', snmp_last_checked = NOW(),
                    snmp_cpu_usage = $1, snmp_memory_usage = $2, snmp_uptime = $3
                    WHERE id = $4
                `, [results.snmp.data.cpu, results.snmp.data.memory, results.snmp.data.uptime, id]);

            } catch (e) {
                results.snmp = { success: false, message: e.message };
                // Update status to offline if SNMP fails
                await query(`UPDATE nas SET snmp_status = 'offline', snmp_last_checked = NOW() WHERE id = $1`, [id]);
            }
        } else {
            // SNMP not enabled - update status based on ping result
            const newStatus = results.radius.success ? 'online' : 'offline';
            await query(`UPDATE nas SET snmp_status = $1, snmp_last_checked = NOW() WHERE id = $2`, [newStatus, id]);
        }

        return results;
    }

    /**
     * Get Connection Status of a User
     */
    async getUserConnectionStatus(username) {
        return await radiusDb.getUserConnectionStatus(username);
    }

    /**
     * Get NAS Stats (Detail)
     */
    async getNasStats(id) {
        const nas = await this.getNasById(id);
        if (!nas) return null;

        return {
            cpu_usage: nas.snmp_cpu_usage || 0,
            memory_usage: nas.snmp_memory_usage || 0,
            interface_count: nas.snmp_interface_count || 0,
            active_connections: nas.snmp_active_connections || 0,
            uptime: nas.snmp_uptime || 0,
            last_checked: nas.snmp_last_checked,
            system_description: nas.snmp_system_description,
            contact: nas.snmp_contact,
            location: nas.snmp_location,
            status: nas.snmp_status || 'unknown'
        };
    }

    /**
     * Get NAS Interfaces
     */
    async getNasInterfaces(id) {
        const nas = await this.getNasById(id);
        if (!nas || !nas.snmp_enabled) return [];

        try {
            return await snmpMonitor.listInterfaces({
                host: nas.nasname,
                community: nas.snmp_community || 'public',
                version: nas.snmp_version || '2c',
                port: nas.snmp_port || 161
            });
        } catch (e) {
            logger.warn(`Failed to get interfaces for NAS ${id}: ${e.message}`);
            return [];
        }
    }

    /**
     * Get NAS Traffic History
     */
    async getNasTraffic(id, range = '1h') {
        const result = await query(
            "SELECT * FROM traffic_logs WHERE nas_id = $1 AND timestamp > NOW() - INTERVAL '1 hour'",
            [id]
        );
        return result.rows.length > 0 ? result.rows : [];
    }

    /**
     * Get Active Sessions (from radacct)
     */
    async getActiveSessions() {
        const result = await query("SELECT * FROM radacct WHERE acctstoptime IS NULL ORDER BY acctstarttime DESC");
        return result.rows;
    }
}

module.exports = new RadiusService();

