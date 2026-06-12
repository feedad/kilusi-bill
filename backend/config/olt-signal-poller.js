const { query } = require('./database');
const { logger } = require('./logger');
const oltSnmpMonitor = require('./olt-snmp-monitor');

async function pollOltSignal() {
    try {
        // 1. Get active OLTs and sessions
        const [oltsResult, sessionsResult] = await Promise.all([
            query(`SELECT id, name, host, type, snmp_community, snmp_port, snmp_version FROM olts WHERE status = $1`, ['active']),
            query(`
                SELECT DISTINCT ON (username) username,
                    framedipaddress as ip_address, callingstationid as mac_address
                FROM radacct WHERE acctstoptime IS NULL
                ORDER BY username, acctstarttime DESC
            `)
        ]);

        if (oltsResult.rows.length === 0 || sessionsResult.rows.length === 0) {
            logger.debug('[OLT Signal] No OLTs or sessions found, skipping poll');
            return;
        }

        // 2. Call matchSignalToCustomers (uses in-memory cache + SNMP walks)
        const signalResult = await oltSnmpMonitor.matchSignalToCustomers(
            sessionsResult.rows, oltsResult.rows
        );

        // 3. Save to database cache
        let saved = 0;
        for (const [uname, signal] of signalResult) {
            await query(`
                INSERT INTO olt_signal_cache (pppoe_username, rx_power, tx_power, distance, olt_name, onu_index, polled_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (pppoe_username) DO UPDATE SET
                    rx_power = EXCLUDED.rx_power, tx_power = EXCLUDED.tx_power,
                    distance = EXCLUDED.distance, olt_name = EXCLUDED.olt_name,
                    onu_index = EXCLUDED.onu_index, polled_at = NOW()
            `, [uname, signal.rx_power, signal.tx_power, signal.distance, signal.olt_name, signal.onu_index]);
            saved++;
        }

        logger.info(`[OLT Signal] Cache updated: ${saved} customers`);
    } catch (e) {
        logger.error(`[OLT Signal] Poll error: ${e.message}`);
    }
}

module.exports = { pollOltSignal };
