const { query, getOne } = require('./database');
const { logger } = require('./logger');
const snmpMonitor = require('./snmp-monitor');

const CACHE = { lastPoll: 0 };

async function pollCustomerUsage() {
    try {
        if (Date.now() - CACHE.lastPoll < 30000) return; // min 30s between polls
        CACHE.lastPoll = Date.now();

        // 1. Get all active services with PPPoE + billing period
        //    Join NAS via radacct active session (primary) or services.nas_id (fallback)
        const services = await query(`
            SELECT s.id as service_id, td.pppoe_username,
                   s.active_date, s.isolir_date, s.siklus,
                   COALESCE(r.nasname, r2.nasname) as nasname,
                   COALESCE(r.snmp_community, r2.snmp_community) as snmp_community,
                   COALESCE(r.snmp_port, r2.snmp_port) as snmp_port,
                   COALESCE(r.snmp_version, r2.snmp_version) as snmp_version,
                   COALESCE(r.snmp_enabled, r2.snmp_enabled) as snmp_enabled
            FROM services s
            JOIN technical_details td ON td.service_id = s.id
            LEFT JOIN (
                SELECT DISTINCT ON (r2.username) r2.username, r2.nasipaddress
                FROM radacct r2
                WHERE r2.acctstoptime IS NULL
                ORDER BY r2.username, r2.acctstarttime DESC
            ) act ON act.username = td.pppoe_username
            LEFT JOIN nas r ON r.nasname = host(act.nasipaddress)
            LEFT JOIN nas r2 ON r2.shortname = s.nas_id
            WHERE s.status = 'active'
              AND td.pppoe_username IS NOT NULL
              AND td.pppoe_username != ''
        `);

        let updated = 0;
        const byNas = {};

        // 2. Group by NAS
        for (const svc of services.rows) {
            if (!svc.nasname || !svc.snmp_enabled) continue;
            const key = svc.nasname;
            if (!byNas[key]) byNas[key] = { config: svc, customers: [] };
            byNas[key].customers.push(svc);
        }

        const nasKeys = Object.keys(byNas);
        if (nasKeys.length === 0) {
            logger.debug('[UsagePoller] No SNMP-enabled NAS found');
            return;
        }

        // 3. Poll each NAS
        for (const key of nasKeys) {
            const { config, customers } = byNas[key];
            const snmpOpts = {
                host: config.nasname,
                community: config.snmp_community,
                port: config.snmp_port,
                version: config.snmp_version
            };

            let ifaces;
            try {
                ifaces = await snmpMonitor.listInterfaces(snmpOpts);
            } catch (e) {
                logger.warn(`[UsagePoller] SNMP listInterfaces failed for ${config.nasname}: ${e.message}`);
                continue;
            }

            // Build username → ifIndex map
            for (const cust of customers) {
                const nameLower = cust.pppoe_username.toLowerCase();
                const match = ifaces.find(i => i.name && i.name.toLowerCase() === nameLower);
                if (!match) continue;

                try {
                    const traffic = await snmpMonitor.getInterfaceTraffic({
                        ...snmpOpts,
                        interfaceName: match.index.toString()
                    });

                    const now = new Date();

                    // Get existing usage row or current billing period
                    const existing = await getOne(`
                        SELECT id, bytes_in, bytes_out, last_poll_bytes_in,
                               last_poll_bytes_out, period_start, period_end
                        FROM customer_usage
                        WHERE service_id = $1
                          AND period_start <= $2::date
                          AND period_end > $2::date
                        LIMIT 1
                    `, [cust.service_id, now]);

                    const currentIn = traffic.total_in_bytes || 0;
                    const currentOut = traffic.total_out_bytes || 0;

                    if (existing) {
                        // Calculate delta (handle NAS reboot)
                        const deltaIn = currentIn >= existing.last_poll_bytes_in
                            ? currentIn - existing.last_poll_bytes_in
                            : currentIn;
                        const deltaOut = currentOut >= existing.last_poll_bytes_out
                            ? currentOut - existing.last_poll_bytes_out
                            : currentOut;

                        await query(`
                            UPDATE customer_usage
                            SET bytes_in = bytes_in + $1,
                                bytes_out = bytes_out + $2,
                                last_poll_bytes_in = $3,
                                last_poll_bytes_out = $4,
                                last_polled_at = NOW()
                            WHERE id = $5
                        `, [deltaIn, deltaOut, currentIn, currentOut, existing.id]);
                        updated++;
                    } else {
                        // Check if billing period available from service dates
                    let periodStart = cust.active_date || now;
                    let periodEnd = cust.isolir_date;

                    // If active_date is in the future, use today as start
                    if (periodStart > now) periodStart = now;

                    if (!periodEnd || periodEnd <= now) {
                            // Past due or no invoicing yet — use smart defaults
                            periodEnd = new Date(periodStart);
                            periodEnd.setMonth(periodEnd.getMonth() + 1);
                        }

                        await query(`
                            INSERT INTO customer_usage
                                (service_id, period_start, period_end, bytes_in, bytes_out,
                                 last_poll_bytes_in, last_poll_bytes_out, last_polled_at)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                            ON CONFLICT (service_id, period_start)
                            DO UPDATE SET
                                bytes_in = EXCLUDED.bytes_in,
                                bytes_out = EXCLUDED.bytes_out,
                                last_poll_bytes_in = EXCLUDED.last_poll_bytes_in,
                                last_poll_bytes_out = EXCLUDED.last_poll_bytes_out,
                                last_polled_at = NOW()
                        `, [
                            cust.service_id,
                            periodStart instanceof Date ? periodStart.toISOString().split('T')[0] : periodStart,
                            periodEnd instanceof Date ? periodEnd.toISOString().split('T')[0] : periodEnd,
                            0, 0, currentIn, currentOut
                        ]);
                        updated++;
                    }
                } catch (e) {
                    logger.warn(`[UsagePoller] SNMP error for ${cust.pppoe_username}: ${e.message}`);
                }
            }
        }

        if (updated > 0) logger.info(`[UsagePoller] Updated ${updated} customer usage records`);
    } catch (e) {
        logger.error(`[UsagePoller] Error: ${e.message}`);
    }
}

module.exports = { pollCustomerUsage };
