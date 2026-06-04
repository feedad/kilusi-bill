const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const { logger } = require('../../../config/logger');
const { asyncHandler } = require('../../../middleware/response');

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

// POST /api/v1/technical-details/sync-mac-from-radius
// Sync all MAC addresses from RADIUS to technical_details
router.post('/sync-mac-from-radius', asyncHandler(async (req, res) => {
    const { dry_run = false } = req.body;

    logger.info(`Starting MAC sync from RADIUS (dry_run: ${dry_run})`);

    try {
        // Get all technical_details for Smart Update (all records, not just empty ones)
        const techDetailsQuery = `
            SELECT
                td.id,
                td.pppoe_username,
                td.mac_address,
                td.service_id,
                s.customer_id,
                c.name as customer_name
            FROM technical_details td
            LEFT JOIN services s ON td.service_id = s.id
            LEFT JOIN customers c ON s.customer_id = c.id
            WHERE td.pppoe_username IS NOT NULL
              AND td.pppoe_username != ''
            ORDER BY td.pppoe_username
        `;

        const techDetailsResult = await query(techDetailsQuery);
        const techDetails = techDetailsResult.rows;

        logger.info(`Found ${techDetails.length} technical_details for Smart MAC sync`);

        const results = [];
        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const tech of techDetails) {
            try {
                // Find MAC from radacct
                const radiusQuery = `
                    SELECT
                        callingstationid as mac_address,
                        MAX(acctstarttime) as last_seen
                    FROM radacct
                    WHERE username = $1
                      AND callingstationid IS NOT NULL
                      AND callingstationid != ''
                      AND LENGTH(callingstationid) >= 12
                    GROUP BY callingstationid
                    ORDER BY last_seen DESC
                    LIMIT 1
                `;

                const radiusResult = await query(radiusQuery, [tech.pppoe_username]);

                if (radiusResult.rows.length === 0) {
                    results.push({
                        pppoe_username: tech.pppoe_username,
                        customer_name: tech.customer_name,
                        status: 'skipped',
                        reason: 'No MAC found in RADIUS'
                    });
                    skippedCount++;
                    continue;
                }

                const radiusMac = formatMacAddress(radiusResult.rows[0].mac_address);

                if (!isValidMacAddress(radiusMac)) {
                    results.push({
                        pppoe_username: tech.pppoe_username,
                        customer_name: tech.customer_name,
                        status: 'skipped',
                        reason: 'Invalid MAC format in RADIUS'
                    });
                    skippedCount++;
                    continue;
                }

                // Get current MAC from database for comparison (fresh read for concurrency)
                const checkQuery = `SELECT mac_address FROM technical_details WHERE id = $1`;
                const checkResult = await query(checkQuery, [tech.id]);
                const currentMac = formatMacAddress(checkResult.rows[0].mac_address);

                // Smart Update: Update if MAC is different
                if (currentMac === radiusMac) {
                    // MAC sama, tidak perlu update
                    results.push({
                        pppoe_username: tech.pppoe_username,
                        customer_name: tech.customer_name,
                        status: 'unchanged',
                        reason: 'MAC already matches RADIUS',
                        mac_address: currentMac
                    });
                    skippedCount++; // Using skippedCount for unchanged
                    continue;
                }

                // MAC berbeda atau kosong, lakukan update
                const oldMac = currentMac || '(empty)';

                if (!dry_run) {
                    // Update MAC in technical_details
                    const updateQuery = `
                        UPDATE technical_details
                        SET mac_address = $1, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                        RETURNING id
                    `;
                    await query(updateQuery, [radiusMac, tech.id]);

                    if (currentMac && currentMac !== '') {
                        logger.info(`🔄 MAC Changed for ${tech.pppoe_username}: ${oldMac} → ${radiusMac}`);
                    } else {
                        logger.info(`✅ Set MAC for ${tech.pppoe_username}: ${radiusMac}`);
                    }
                }

                results.push({
                    pppoe_username: tech.pppoe_username,
                    customer_name: tech.customer_name,
                    status: 'updated',
                    old_mac: oldMac,
                    new_mac: radiusMac,
                    last_seen: radiusResult.rows[0].last_seen,
                    action: currentMac && currentMac !== '' ? 'changed' : 'set'
                });
                updatedCount++;

            } catch (err) {
                logger.error(`Error processing ${tech.pppoe_username}:`, err);
                results.push({
                    pppoe_username: tech.pppoe_username,
                    customer_name: tech.customer_name,
                    status: 'error',
                    error: err.message
                });
                errorCount++;
            }
        }

        res.json({
            success: true,
            data: {
                dry_run: dry_run,
                summary: {
                    total_processed: techDetails.length,
                    updated: updatedCount,
                    unchanged: skippedCount,
                    errors: errorCount
                },
                results: results
            },
            message: dry_run
                ? `Dry run completed. ${updatedCount} MAC addresses will be updated, ${skippedCount} unchanged.`
                : `Successfully processed. ${updatedCount} updated, ${skippedCount} unchanged.`
        });

    } catch (error) {
        logger.error('Error in MAC sync from RADIUS:', error);
        throw error;
    }
}));

// POST /api/v1/technical-details/:serviceId/sync-mac
// Sync MAC for a specific service
router.post('/:serviceId/sync-mac', asyncHandler(async (req, res) => {
    const { serviceId } = req.params;
    const { dry_run = false } = req.body;

    try {
        // Get technical details for this service
        const techQuery = `
            SELECT
                td.id,
                td.pppoe_username,
                td.mac_address,
                s.customer_id,
                c.name as customer_name
            FROM technical_details td
            LEFT JOIN services s ON td.service_id = s.id
            LEFT JOIN customers c ON s.customer_id = c.id
            WHERE td.service_id = $1
        `;

        const techResult = await query(techQuery, [serviceId]);

        if (techResult.rows.length === 0) {
            return res.json({
                success: false,
                message: 'Technical details not found for this service'
            });
        }

        const tech = techResult.rows[0];

        // If MAC already exists and is valid, return it
        if (tech.mac_address && isValidMacAddress(tech.mac_address)) {
            return res.json({
                success: true,
                data: {
                    service_id: serviceId,
                    pppoe_username: tech.pppoe_username,
                    mac_address: tech.mac_address,
                    source: 'database'
                },
                message: 'MAC address already exists in database'
            });
        }

        // Find MAC from radacct
        const radiusQuery = `
            SELECT
                callingstationid as mac_address,
                MAX(acctstarttime) as last_seen
            FROM radacct
            WHERE username = $1
              AND callingstationid IS NOT NULL
              AND callingstationid != ''
              AND LENGTH(callingstationid) >= 12
            GROUP BY callingstationid
            ORDER BY last_seen DESC
            LIMIT 1
        `;

        const radiusResult = await query(radiusQuery, [tech.pppoe_username]);

        if (radiusResult.rows.length === 0) {
            return res.json({
                success: false,
                message: 'No MAC address found in RADIUS for this user'
            });
        }

        const radiusMac = formatMacAddress(radiusResult.rows[0].mac_address);

        if (!isValidMacAddress(radiusMac)) {
            return res.json({
                success: false,
                message: 'Invalid MAC format in RADIUS'
            });
        }

        if (!dry_run) {
            // Update MAC in technical_details
            const updateQuery = `
                UPDATE technical_details
                SET mac_address = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING id
            `;
            await query(updateQuery, [radiusMac, tech.id]);

            logger.info(`✅ Synced MAC for ${tech.pppoe_username}: ${radiusMac}`);
        }

        res.json({
            success: true,
            data: {
                service_id: serviceId,
                pppoe_username: tech.pppoe_username,
                customer_name: tech.customer_name,
                mac_address: radiusMac,
                last_seen: radiusResult.rows[0].last_seen,
                source: 'radius',
                dry_run: dry_run
            },
            message: dry_run
                ? `Would sync MAC: ${radiusMac}`
                : `Successfully synced MAC: ${radiusMac}`
        });

    } catch (error) {
        logger.error('Error in sync MAC for service:', error);
        throw error;
    }
}));

// GET /api/v1/technical-details/mac-sync-status
// Get status of MAC sync
router.get('/mac-sync-status', asyncHandler(async (req, res) => {
    try {
        // Get overall statistics
        const statsQuery = `
            SELECT
                COUNT(*) as total,
                COUNT(CASE WHEN mac_address IS NOT NULL AND mac_address != '' AND LENGTH(mac_address) >= 12 THEN 1 END) as synced,
                COUNT(CASE WHEN mac_address IS NULL OR mac_address = '' OR LENGTH(mac_address) < 12 THEN 1 END) as empty
            FROM technical_details
        `;

        const statsResult = await query(statsQuery);
        const stats = statsResult.rows[0];

        // Get recent sync activity (from logs or recent updates)
        const recentQuery = `
            SELECT
                td.pppoe_username,
                td.mac_address,
                td.updated_at,
                c.name as customer_name
            FROM technical_details td
            LEFT JOIN services s ON td.service_id = s.id
            LEFT JOIN customers c ON s.customer_id = c.id
            WHERE td.mac_address IS NOT NULL
              AND td.mac_address != ''
              AND td.updated_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
            ORDER BY td.updated_at DESC
            LIMIT 20
        `;

        const recentResult = await query(recentQuery);

        res.json({
            success: true,
            data: {
                stats: {
                    total: parseInt(stats.total),
                    synced: parseInt(stats.synced),
                    empty: parseInt(stats.empty),
                    percentage: stats.total > 0
                        ? ((stats.synced / stats.total) * 100).toFixed(1)
                        : 0
                },
                recent_updates: recentResult.rows
            }
        });

    } catch (error) {
        logger.error('Error getting MAC sync status:', error);
        throw error;
    }
}));

// GET /api/v1/technical-details/lookup-customer-by-mac/:mac
// Look up customer name from ONU MAC via RADIUS + fuzzy matching
router.get('/lookup-customer-by-mac/:mac', asyncHandler(async (req, res) => {
    const { mac } = req.params;

    if (!mac || mac.length < 8) {
        return res.json({ success: false, data: null, message: 'MAC address terlalu pendek' });
    }

    const normalizedInput = mac.toLowerCase().replace(/[:-]/g, '');

    try {
        // Get active RADIUS sessions with MAC, joined to technical_details and customers
        const result = await query(`
            SELECT DISTINCT
                LOWER(TRIM(r.callingstationid)) as radius_mac,
                c.name as customer_name,
                c.id as customer_id,
                c.phone as customer_phone,
                td.pppoe_username
            FROM radacct r
            JOIN technical_details td ON td.pppoe_username = r.username
            JOIN services s ON td.service_id = s.id
            JOIN customers c ON s.customer_id = c.id
            WHERE r.acctstoptime IS NULL
              AND r.callingstationid IS NOT NULL
              AND TRIM(r.callingstationid) != ''
              AND LENGTH(TRIM(r.callingstationid)) >= 8
        `);

        if (result.rows.length === 0) {
            return res.json({ success: false, data: null, message: 'Tidak ada sesi RADIUS aktif' });
        }

        // Fuzzy match input MAC against RADIUS MACs
        let bestMatch = null;
        let minDiff = Infinity;
        const MAX_DIFF = 0x10;

        for (const row of result.rows) {
            const normalizedRadiusMac = row.radius_mac.replace(/[:-]/g, '');
            if (normalizedRadiusMac.length !== normalizedInput.length) continue;

            try {
                const inputInt = BigInt('0x' + normalizedInput);
                const radiusInt = BigInt('0x' + normalizedRadiusMac);
                const diff = inputInt > radiusInt ? inputInt - radiusInt : radiusInt - inputInt;

                if (diff <= BigInt(MAX_DIFF) && diff < minDiff) {
                    minDiff = diff;
                    bestMatch = row;
                }
            } catch (e) {
                continue;
            }
        }

        if (!bestMatch) {
            return res.json({ success: false, data: null, message: 'Tidak ada pelanggan yang cocok dengan MAC ini' });
        }

        res.json({
            success: true,
            data: {
                customer_name: bestMatch.customer_name,
                customer_id: bestMatch.customer_id,
                customer_phone: bestMatch.customer_phone,
                pppoe_username: bestMatch.pppoe_username,
                radius_mac: bestMatch.radius_mac
            }
        });
    } catch (error) {
        logger.error('Error looking up customer by MAC:', error);
        res.status(500).json({ success: false, data: null, message: error.message });
    }
}));

module.exports = router;
