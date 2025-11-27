const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');
const snmpMonitor = require('../../../config/snmp-monitor');

// Auto-check SNMP status every 3 minutes
let autoCheckInterval;
const AUTO_CHECK_INTERVAL = 3 * 60 * 1000; // 3 minutes

// Function to check single NAS SNMP status with timeout
const checkSNMPStatus = async (nas) => {
    if (!nas.snmp_enabled) return nas;

    try {
        // Add timeout to SNMP request
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('SNMP timeout')), 10000); // 10 second timeout
        });

        const snmpPromise = snmpMonitor.getSystemInfo({
            host: nas.nasname,
            community: nas.snmp_community || 'kilusibill',
            version: nas.snmp_version || '2c',
            port: nas.snmp_port || 161
        });

        const snmpData = await Promise.race([snmpPromise, timeoutPromise]);

        if (snmpData && snmpData.success) {
            // Update NAS with successful SNMP data
            await query(`
                UPDATE nas_servers SET
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

            nas.status = 'online';
            nas.snmp_status = 'online';
            nas.snmp_last_checked = new Date();
            nas.snmp_cpu_usage = snmpData.data.cpu_usage;
            nas.snmp_memory_usage = snmpData.data.memory_usage;
            nas.snmp_interface_count = snmpData.data.interface_count;
            nas.snmp_uptime = snmpData.data.uptime;
        } else {
            throw new Error('SNMP failed');
        }
    } catch (error) {
        // Update NAS with error
        await query(`
            UPDATE nas_servers SET
                snmp_status = 'offline',
                snmp_last_checked = NOW(),
                snmp_error = $1
            WHERE id = $2
        `, [error.message, nas.id]);

        nas.status = 'offline';
        nas.snmp_status = 'offline';
        nas.snmp_last_checked = new Date();
        nas.snmp_error = error.message;

        logger.warn(`SNMP check failed for NAS ${nas.shortname}: ${error.message}`);
    }

    return nas;
};

// Auto-check all enabled NAS servers
const autoCheckAllNAS = async () => {
    try {
        const nasQuery = `
            SELECT id, short_name as shortname, ip_address as nasname,
                   snmp_enabled, snmp_community, snmp_version, snmp_port,
                   snmp_status, snmp_last_checked
            FROM nas_servers
            WHERE snmp_enabled = true
            ORDER BY snmp_last_checked ASC NULLS FIRST
        `;

        const result = await query(nasQuery);
        const nasList = result.rows;

        logger.info(`Auto-checking SNMP for ${nasList.length} NAS servers`);

        // Check NAS in parallel with limited concurrency
        const batchSize = 5;
        for (let i = 0; i < nasList.length; i += batchSize) {
            const batch = nasList.slice(i, i + batchSize);
            await Promise.all(batch.map(nas => checkSNMPStatus(nas)));

            // Small delay between batches
            if (i + batchSize < nasList.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        logger.info('Auto-check SNMP completed');
    } catch (error) {
        logger.error('Error in auto-check SNMP:', error);
    }
};

// Start auto-check interval
const startAutoCheck = () => {
    if (autoCheckInterval) {
        clearInterval(autoCheckInterval);
    }

    // Run immediately on start
    autoCheckAllNAS();

    // Then run every 3 minutes
    autoCheckInterval = setInterval(autoCheckAllNAS, AUTO_CHECK_INTERVAL);

    logger.info(`SNMP auto-check started (interval: ${AUTO_CHECK_INTERVAL/1000} seconds)`);
};

// Stop auto-check interval
const stopAutoCheck = () => {
    if (autoCheckInterval) {
        clearInterval(autoCheckInterval);
        autoCheckInterval = null;
        logger.info('SNMP auto-check stopped');
    }
};

// Start auto-check when module loads
startAutoCheck();

// Cleanup on process exit
process.on('SIGTERM', stopAutoCheck);
process.on('SIGINT', stopAutoCheck);

// GET /api/v1/radius/nas - Get all NAS servers with SNMP stats
router.get('/nas', async (req, res) => {
    try {
        // Get all NAS servers
        const nasQuery = `
            SELECT
                id,
                short_name as shortname,
                ip_address as nasname,
                secret,
                type,
                description,
                created_at,
                updated_at,
                COALESCE(ports, 0) as ports,
                snmp_enabled,
                snmp_community,
                snmp_community_trap,
                snmp_version,
                snmp_port,
                snmp_username,
                snmp_auth_protocol,
                snmp_auth_password,
                snmp_priv_protocol,
                snmp_priv_password,
                snmp_security_level,
                snmp_cpu_usage,
                snmp_memory_usage,
                snmp_interface_count,
                snmp_active_connections,
                snmp_last_checked,
                snmp_status
            FROM nas_servers
            WHERE is_active = true
            ORDER BY short_name ASC
        `;

        const nasResult = await query(nasQuery);
        const nasList = nasResult.rows;

        // Get SNMP stats for each NAS
        const snmpStats = {};

        // Check SNMP status for each NAS
        for (const nas of nasList) {
            try {
                // Determine status based on last check
                if (nas.snmp_enabled && nas.snmp_last_checked) {
                    const lastChecked = new Date(nas.snmp_last_checked);
                    const now = new Date();
                    const minutesSinceLastCheck = (now - lastChecked) / (1000 * 60);

                    if (nas.snmp_status === 'online' && minutesSinceLastCheck < 5) {
                        nas.status = 'online';
                        nas.last_seen = nas.snmp_last_checked;

                        // Include SNMP stats
                        snmpStats[nas.id] = {
                            cpu_usage: nas.snmp_cpu_usage,
                            memory_usage: nas.snmp_memory_usage,
                            interface_count: nas.snmp_interface_count,
                            active_connections: nas.snmp_active_connections,
                            last_checked: nas.snmp_last_checked
                        };
                    } else {
                        nas.status = 'offline';
                        nas.last_seen = nas.snmp_last_checked;
                    }
                } else {
                    nas.status = 'unknown'; // No SNMP monitoring
                    nas.last_seen = null;
                }
            } catch (snmpError) {
                logger.warn(`Error checking SNMP status for NAS ${nas.shortname}:`, snmpError.message);
                nas.status = 'unknown';
                nas.last_seen = null;
            }
        }

        res.json({
            success: true,
            data: {
                nas: nasList,
                snmpStats: snmpStats
            }
        });

    } catch (error) {
        logger.error('Error fetching NAS servers:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data NAS'
        });
    }
});

// GET /api/v1/radius/nas/:id - Get specific NAS server details
router.get('/nas/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const nasQuery = `
            SELECT
                id,
                short_name as shortname,
                ip_address as nasname,
                secret,
                type,
                description,
                ports,
                snmp_enabled,
                snmp_community,
                snmp_community_trap,
                snmp_version,
                snmp_port,
                snmp_username,
                snmp_auth_protocol,
                snmp_auth_password,
                snmp_priv_protocol,
                snmp_priv_password,
                snmp_security_level,
                snmp_cpu_usage,
                snmp_memory_usage,
                snmp_interface_count,
                snmp_active_connections,
                snmp_last_checked,
                snmp_status,
                created_at,
                updated_at
            FROM nas_servers
            WHERE id = $1
        `;

        const result = await query(nasQuery, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'NAS server not found'
            });
        }

        const nas = result.rows[0];

        // Get SNMP stats if enabled
        let snmpStats = null;
        if (nas.snmp_enabled) {
            snmpStats = {
                cpu_usage: nas.snmp_cpu_usage,
                memory_usage: nas.snmp_memory_usage,
                interface_count: nas.snmp_interface_count,
                active_connections: nas.snmp_active_connections,
                last_checked: nas.snmp_last_checked
            };
        }

        res.json({
            success: true,
            data: {
                nas: nas,
                snmpStats: snmpStats
            }
        });

    } catch (error) {
        logger.error('Error fetching NAS server:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data NAS'
        });
    }
});

// POST /api/v1/radius/nas - Create new NAS server
router.post('/nas', async (req, res) => {
    try {
        const {
            shortname,
            nasname,
            secret,
            type = 'other',
            description = '',
            snmp_enabled = false,
            snmp_community = 'public',
            snmp_community_trap = 'public',
            snmp_version = '2c',
            snmp_port = 161,
            snmp_username = '',
            snmp_auth_protocol = 'SHA',
            snmp_auth_password = '',
            snmp_priv_protocol = 'AES',
            snmp_priv_password = '',
            snmp_security_level = 'authPriv'
        } = req.body;

        if (!shortname || !nasname || !secret) {
            return res.status(400).json({
                success: false,
                message: 'Short name, IP address, and secret are required'
            });
        }

        // Check if NAS with same name or IP already exists
        const checkQuery = `
            SELECT id FROM nas_servers
            WHERE short_name = $1 OR ip_address = $2
        `;
        const checkResult = await query(checkQuery, [shortname, nasname]);

        if (checkResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'NAS with this name or IP address already exists'
            });
        }

        const insertQuery = `
            INSERT INTO nas_servers (
                short_name, ip_address, secret, type, description,
                snmp_enabled, snmp_community, snmp_community_trap, snmp_version, snmp_port,
                snmp_username, snmp_auth_protocol, snmp_auth_password, snmp_priv_protocol, snmp_priv_password, snmp_security_level,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW()
            )
            RETURNING id, short_name as shortname, ip_address as nasname, type, description, snmp_enabled, snmp_version
        `;

        const result = await query(insertQuery, [
            shortname, nasname, secret, type, description,
            snmp_enabled, snmp_community, snmp_community_trap, snmp_version, snmp_port,
            snmp_username, snmp_auth_protocol, snmp_auth_password, snmp_priv_protocol, snmp_priv_password, snmp_security_level
        ]);

        const newNAS = result.rows[0];

        logger.info(`NAS server created: ${newNAS.shortname} (${newNAS.nasname})`);

        res.status(201).json({
            success: true,
            message: 'NAS server created successfully',
            data: { nas: newNAS }
        });

    } catch (error) {
        logger.error('Error creating NAS server:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat membuat NAS server'
        });
    }
});

// POST /api/v1/radius/nas/bulk - Create multiple NAS servers
router.post('/nas/bulk', async (req, res) => {
    const client = await require('../../../config/database').getClient();

    try {
        await client.query('BEGIN');

        const {
            groupName,
            groupDescription,
            nasConfigs
        } = req.body;

        if (!nasConfigs || !Array.isArray(nasConfigs) || nasConfigs.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'NAS configurations are required'
            });
        }

        const results = [];
        const errors = [];

        // Validate each NAS config
        for (let i = 0; i < nasConfigs.length; i++) {
            const config = nasConfigs[i];

            if (!config.shortname || !config.nasname || !config.secret) {
                errors.push(`NAS #${i + 1}: Short name, IP address, and secret are required`);
                continue;
            }

            // Check for duplicates within the batch
            const duplicateInBatch = nasConfigs.some((other, index) =>
                index !== i && (other.shortname === config.shortname || other.nasname === config.nasname)
            );

            if (duplicateInBatch) {
                errors.push(`NAS #${i + 1}: Duplicate name or IP address in batch`);
                continue;
            }

            // Check if NAS already exists in database
            const checkQuery = `
                SELECT id FROM nas_servers
                WHERE short_name = $1 OR ip_address = $2
            `;
            const checkResult = await client.query(checkQuery, [config.shortname, config.nasname]);

            if (checkResult.rows.length > 0) {
                errors.push(`NAS #${i + 1}: NAS with this name or IP already exists`);
                continue;
            }

            // Insert NAS
            const insertQuery = `
                INSERT INTO nas_servers (
                    short_name, ip_address, secret, type, description, ports,
                    snmp_enabled, snmp_community, snmp_version, snmp_port,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
                )
                RETURNING id, short_name as shortname, ip_address as nasname, type, description, snmp_enabled
            `;

            try {
                const result = await client.query(insertQuery, [
                    config.shortname,
                    config.nasname,
                    config.secret,
                    config.type || 'other',
                    config.description || '',
                    config.ports || 0,
                    config.snmp_enabled || false,
                    config.snmp_community || 'public',
                    config.snmp_version || '2c',
                    config.snmp_port || 161
                ]);

                results.push(result.rows[0]);
                logger.info(`NAS server created: ${config.shortname} (${config.nasname})`);

            } catch (insertError) {
                errors.push(`NAS #${i + 1}: Failed to insert - ${insertError.message}`);
            }
        }

        if (results.length > 0) {
            await client.query('COMMIT');

            res.status(201).json({
                success: true,
                message: `${results.length} NAS server(s) created successfully`,
                data: {
                    created: results,
                    errors: errors,
                    total: nasConfigs.length,
                    successful: results.length,
                    failed: errors.length
                }
            });
        } else {
            await client.query('ROLLBACK');
            res.status(400).json({
                success: false,
                message: 'No NAS servers were created',
                data: {
                    errors: errors,
                    total: nasConfigs.length,
                    successful: 0,
                    failed: errors.length
                }
            });
        }

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error creating bulk NAS servers:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat membuat NAS server secara bulk'
        });
    } finally {
        client.release();
    }
});

// PUT /api/v1/radius/nas/:id - Update NAS server
router.put('/nas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            shortname,
            nasname,
            secret,
            type,
            description,
            snmp_enabled,
            snmp_community,
            snmp_community_trap,
            snmp_version,
            snmp_port,
            snmp_username,
            snmp_auth_protocol,
            snmp_auth_password,
            snmp_priv_protocol,
            snmp_priv_password,
            snmp_security_level
        } = req.body;

        if (!shortname || !nasname || !secret) {
            return res.status(400).json({
                success: false,
                message: 'Short name, IP address, and secret are required'
            });
        }

        // Check if NAS exists
        const checkQuery = `SELECT id FROM nas_servers WHERE id = $1`;
        const checkResult = await query(checkQuery, [id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'NAS server not found'
            });
        }

        // Check for duplicates (excluding current NAS)
        const duplicateQuery = `
            SELECT id FROM nas_servers
            WHERE (short_name = $1 OR ip_address = $2) AND id != $3
        `;
        const duplicateResult = await query(duplicateQuery, [shortname, nasname, id]);

        if (duplicateResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'NAS with this name or IP address already exists'
            });
        }

        const updateQuery = `
            UPDATE nas_servers SET
                short_name = $1,
                ip_address = $2,
                secret = $3,
                type = $4,
                description = $5,
                snmp_enabled = $6,
                snmp_community = $7,
                snmp_community_trap = $8,
                snmp_version = $9,
                snmp_port = $10,
                snmp_username = $11,
                snmp_auth_protocol = $12,
                snmp_auth_password = $13,
                snmp_priv_protocol = $14,
                snmp_priv_password = $15,
                snmp_security_level = $16,
                updated_at = NOW()
            WHERE id = $17
            RETURNING id, short_name as shortname, ip_address as nasname, type, description, snmp_enabled, snmp_version
        `;

        const result = await query(updateQuery, [
            shortname, nasname, secret, type, description,
            snmp_enabled, snmp_community, snmp_community_trap, snmp_version, snmp_port,
            snmp_username, snmp_auth_protocol, snmp_auth_password, snmp_priv_protocol, snmp_priv_password, snmp_security_level, id
        ]);

        const updatedNAS = result.rows[0];

        logger.info(`NAS server updated: ${updatedNAS.shortname} (${updatedNAS.nasname})`);

        res.json({
            success: true,
            message: 'NAS server updated successfully',
            data: { nas: updatedNAS }
        });

    } catch (error) {
        logger.error('Error updating NAS server:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengupdate NAS server'
        });
    }
});

// DELETE /api/v1/radius/nas/:id - Delete NAS server
router.delete('/nas/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if NAS exists
        const checkQuery = `SELECT short_name as shortname, ip_address as nasname FROM nas_servers WHERE id = $1`;
        const checkResult = await query(checkQuery, [id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'NAS server not found'
            });
        }

        const nas = checkResult.rows[0];

        // Delete NAS server
        const deleteQuery = `DELETE FROM nas_servers WHERE id = $1`;
        const deleteResult = await query(deleteQuery, [id]);

        if (deleteResult.rowCount > 0) {
            logger.info(`NAS server deleted: ${nas.shortname} (${nas.nasname})`);

            res.json({
                success: true,
                message: 'NAS server deleted successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'NAS server not found'
            });
        }

    } catch (error) {
        logger.error('Error deleting NAS server:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menghapus NAS server'
        });
    }
});

// DELETE /api/v1/radius/nas/bulk - Delete multiple NAS servers
router.delete('/nas/bulk', async (req, res) => {
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'NAS IDs are required'
            });
        }

        // Get NAS details before deletion for logging
        const checkQuery = `SELECT id, short_name as shortname, ip_address as nasname FROM nas_servers WHERE id = ANY($1)`;
        const checkResult = await query(checkQuery, [ids]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No NAS servers found'
            });
        }

        const deleteQuery = `DELETE FROM nas_servers WHERE id = ANY($1)`;
        const deleteResult = await query(deleteQuery, [ids]);

        const deletedCount = deleteResult.rowCount;
        const foundCount = checkResult.rows.length;

        // Log deleted servers
        checkResult.rows.forEach(nas => {
            logger.info(`NAS server deleted: ${nas.shortname} (${nas.nasname})`);
        });

        res.json({
            success: true,
            message: `${deletedCount} NAS server(s) deleted successfully`,
            data: {
                deleted: deletedCount,
                requested: ids.length,
                found: foundCount
            }
        });

    } catch (error) {
        logger.error('Error deleting bulk NAS servers:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menghapus NAS server secara bulk'
        });
    }
});

// POST /api/v1/radius/nas/bulk/test - Test multiple NAS connections
router.post('/nas/bulk/test', async (req, res) => {
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'NAS IDs are required'
            });
        }

        // Get NAS details
        const nasQuery = `
            SELECT id, short_name as shortname, ip_address as nasname, secret,
                   snmp_enabled, snmp_community, snmp_version, snmp_port
            FROM nas_servers
            WHERE id = ANY($1)
        `;
        const nasResult = await query(nasQuery, [ids]);

        if (nasResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No NAS servers found'
            });
        }

        const results = [];

        // Test each NAS concurrently
        const testPromises = nasResult.rows.map(async (nas) => {
            const testResults = {
                radius: { success: false, message: 'Not tested' },
                snmp: { success: false, message: 'Not tested', data: null }
            };

            try {
                // Test SNMP if enabled
                if (nas.snmp_enabled) {
                    try {
                        const snmpData = await snmpMonitor.getSystemInfo({
                            host: nas.nasname,
                            community: nas.snmp_community,
                            version: nas.snmp_version,
                            port: nas.snmp_port
                        });

                        if (snmpData.success) {
                            testResults.snmp = {
                                success: true,
                                message: 'SNMP connection successful',
                                data: {
                                    uptime: snmpData.data.uptime,
                                    cpu_usage: snmpData.data.cpu_usage,
                                    memory_usage: snmpData.data.memory_usage,
                                    interface_count: snmpData.data.interface_count
                                }
                            };

                            // Update SNMP stats in database
                            await query(`
                                UPDATE nas_servers SET
                                    snmp_cpu_usage = $1,
                                    snmp_memory_usage = $2,
                                    snmp_interface_count = $3,
                                    snmp_last_checked = NOW(),
                                    snmp_status = 'online',
                                    updated_at = NOW()
                                WHERE id = $4
                            `, [snmpData.data.cpu_usage, snmpData.data.memory_usage, snmpData.data.interface_count, nas.id]);

                        } else {
                            testResults.snmp = {
                                success: false,
                                message: snmpData.message || 'SNMP connection failed'
                            };

                            // Update status to offline
                            await query(`
                                UPDATE nas_servers SET
                                    snmp_status = 'offline',
                                    snmp_last_checked = NOW(),
                                    updated_at = NOW()
                                WHERE id = $1
                            `, [nas.id]);
                        }

                    } catch (snmpError) {
                        testResults.snmp = {
                            success: false,
                            message: `SNMP error: ${snmpError.message}`
                        };

                        // Update status to offline
                        await query(`
                            UPDATE nas_servers SET
                                snmp_status = 'offline',
                                snmp_last_checked = NOW(),
                                updated_at = NOW()
                            WHERE id = $1
                        `, [nas.id]);
                    }
                }

                // Test RADIUS (ping test)
                try {
                    const { exec } = require('child_process');
                    const util = require('util');
                    const execPromise = util.promisify(exec);

                    const { stdout, stderr } = await execPromise(`ping -c 3 -W 2 ${nas.nasname}`);

                    if (stdout.includes('bytes from')) {
                        testResults.radius = {
                            success: true,
                            message: 'RADIUS server reachable'
                        };
                    } else {
                        testResults.radius = {
                            success: false,
                            message: 'RADIUS server unreachable'
                        };
                    }
                } catch (pingError) {
                    testResults.radius = {
                        success: false,
                        message: 'RADIUS server unreachable'
                    };
                }

            } catch (error) {
                logger.warn(`Error testing NAS ${nas.shortname}:`, error.message);
            }

            return {
                id: nas.id,
                shortname: nas.shortname,
                nasname: nas.nasname,
                test_results: testResults
            };
        });

        const testResults = await Promise.all(testPromises);

        logger.info(`Bulk connection test completed for ${testResults.length} NAS servers`);

        res.json({
            success: true,
            message: 'Bulk connection test completed',
            data: {
                results: testResults,
                total: testResults.length,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('Error testing bulk NAS connections:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat testing koneksi NAS secara bulk'
        });
    }
});

// POST /api/v1/radius/nas/:id/test - Test NAS connection and SNMP
router.post('/nas/:id/test', async (req, res) => {
    try {
        const { id } = req.params;

        // Get NAS details
        const nasQuery = `
            SELECT short_name as shortname, ip_address as nasname, secret, snmp_enabled, snmp_community, snmp_version, snmp_port
            FROM nas_servers WHERE id = $1
        `;
        const nasResult = await query(nasQuery, [id]);

        if (nasResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'NAS server not found'
            });
        }

        const nas = nasResult.rows[0];
        const testResults = {
            radius: { success: false, message: 'Not tested' },
            snmp: { success: false, message: 'Not tested', data: null }
        };

        // Test SNMP if enabled
        if (nas.snmp_enabled) {
            try {
                // Add timeout to SNMP request
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('SNMP timeout after 15 seconds')), 15000);
                });

                const snmpPromise = snmpMonitor.getSystemInfo({
                    host: nas.nasname,
                    community: nas.snmp_community || 'kilusibill',
                    version: nas.snmp_version || '2c',
                    port: nas.snmp_port || 161
                });

                const snmpData = await Promise.race([snmpPromise, timeoutPromise]);

                if (snmpData.success) {
                    testResults.snmp = {
                        success: true,
                        message: 'SNMP connection successful',
                        data: {
                            uptime: snmpData.data.uptime,
                            cpu_usage: snmpData.data.cpu_usage,
                            memory_usage: snmpData.data.memory_usage,
                            interface_count: snmpData.data.interface_count
                        }
                    };

                    // Update SNMP stats in database
                    const updateSnmpQuery = `
                        UPDATE nas_servers SET
                            snmp_cpu_usage = $1,
                            snmp_memory_usage = $2,
                            snmp_interface_count = $3,
                            snmp_uptime = $4,
                            snmp_system_description = $5,
                            snmp_contact = $6,
                            snmp_location = $7,
                            snmp_last_checked = NOW(),
                            snmp_status = 'online',
                            updated_at = NOW()
                        WHERE id = $8
                    `;

                    await query(updateSnmpQuery, [
                        snmpData.data.cpu_usage,
                        snmpData.data.memory_usage,
                        snmpData.data.interface_count,
                        snmpData.data.uptime,
                        snmpData.data.sysDescr || null,
                        snmpData.data.sysContact || null,
                        snmpData.data.sysLocation || null,
                        id
                    ]);

                } else {
                    testResults.snmp = {
                        success: false,
                        message: snmpData.message || 'SNMP connection failed'
                    };

                    // Update status to offline
                    await query(`
                        UPDATE nas_servers SET
                            snmp_status = 'offline',
                            snmp_last_checked = NOW(),
                            updated_at = NOW()
                        WHERE id = $1
                    `, [id]);
                }

            } catch (snmpError) {
                testResults.snmp = {
                    success: false,
                    message: `SNMP error: ${snmpError.message}`
                };

                // Update status to offline
                await query(`
                    UPDATE nas_servers SET
                        snmp_status = 'offline',
                        snmp_last_checked = NOW(),
                        updated_at = NOW()
                    WHERE id = $1
                `, [id]);
            }
        }

        // Test RADIUS (ping test)
        try {
            // Simple ping test using child_process
            const { exec } = require('child_process');
            const util = require('util');
            const execPromise = util.promisify(exec);

            const { stdout, stderr } = await execPromise(`ping -c 3 -W 2 ${nas.nasname}`);

            if (stdout.includes('bytes from')) {
                testResults.radius = {
                    success: true,
                    message: 'RADIUS server reachable'
                };
            } else {
                testResults.radius = {
                    success: false,
                    message: 'RADIUS server unreachable'
                };
            }
        } catch (pingError) {
            testResults.radius = {
                success: false,
                message: 'RADIUS server unreachable'
            };
        }

        logger.info(`Connection test completed for NAS: ${nas.shortname}`);

        res.json({
            success: true,
            message: 'Connection test completed',
            data: {
                nas: { shortname: nas.shortname, nasname: nas.nasname },
                test_results: testResults
            }
        });

    } catch (error) {
        logger.error('Error testing NAS connection:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat testing koneksi NAS'
        });
    }
});

// GET /api/v1/radius/nas/:id/stats - Get detailed SNMP stats for a NAS
router.get('/nas/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;

        const nasQuery = `
            SELECT
                short_name as shortname,
                ip_address as nasname,
                secret,
                snmp_enabled,
                snmp_community,
                snmp_version,
                snmp_port,
                snmp_status,
                snmp_last_checked,
                snmp_cpu_usage,
                snmp_memory_usage,
                snmp_interface_count,
                snmp_uptime,
                snmp_active_connections,
                snmp_system_description,
                snmp_contact,
                snmp_location
            FROM nas_servers
            WHERE id = $1
        `;
        const nasResult = await query(nasQuery, [id]);

        if (nasResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'NAS server not found'
            });
        }

        const nas = nasResult.rows[0];
        const stats = {
            cpu_usage: nas.snmp_cpu_usage || 0,
            memory_usage: nas.snmp_memory_usage || 0,
            interface_count: nas.snmp_interface_count || 0,
            active_connections: nas.snmp_active_connections || 0,
            uptime: nas.snmp_uptime || 0,
            last_checked: nas.snmp_last_checked,
            system_description: nas.snmp_system_description,
            contact: nas.snmp_contact,
            location: nas.snmp_location
        };

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        logger.error('Error fetching NAS stats:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data statistik NAS'
        });
    }
});

// GET /api/v1/radius/nas/:id/interfaces - Get network interfaces info
router.get('/nas/:id/interfaces', async (req, res) => {
    try {
        const { id } = req.params;

        // Get NAS details first
        const nasQuery = `
            SELECT ip_address as nasname, snmp_enabled, snmp_community, snmp_version, snmp_port
            FROM nas_servers
            WHERE id = $1 AND snmp_enabled = true
        `;
        const nasResult = await query(nasQuery, [id]);

        if (nasResult.rows.length === 0) {
            return res.json({
                success: true,
                data: []
            });
        }

        const nas = nasResult.rows[0];

        try {
            // Get interface information from SNMP
            const interfaces = await snmpMonitor.getInterfaces({
                host: nas.nasname,
                community: nas.snmp_community || 'kilusibill',
                version: nas.snmp_version || '2c',
                port: nas.snmp_port || 161
            });

            res.json({
                success: true,
                data: interfaces || []
            });

        } catch (snmpError) {
            logger.warn(`Failed to get interfaces for NAS ${id}:`, snmpError.message);
            res.json({
                success: true,
                data: []
            });
        }

    } catch (error) {
        logger.error('Error fetching NAS interfaces:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data interface NAS'
        });
    }
});

// GET /api/v1/radius/nas/:id/traffic - Get traffic history
router.get('/nas/:id/traffic', async (req, res) => {
    try {
        const { id } = req.params;
        const { range = '1h' } = req.query;

        let timeRangeHours = 1;
        switch (range) {
            case '6h': timeRangeHours = 6; break;
            case '24h': timeRangeHours = 24; break;
            case '7d': timeRangeHours = 168; break;
            case '1h':
            default: timeRangeHours = 1; break;
        }

        // Get traffic history from database (you would need to create a traffic_history table)
        const trafficQuery = `
            SELECT timestamp, bandwidth_in, bandwidth_out, packets_in, packets_out
            FROM traffic_history
            WHERE nas_id = $1 AND timestamp >= NOW() - INTERVAL '${timeRangeHours} hours'
            ORDER BY timestamp DESC
            LIMIT 100
        `;

        // For now, return sample data
        const sampleData = Array.from({ length: 10 }, (_, i) => ({
            timestamp: new Date(Date.now() - (i * 3600000)).toISOString(),
            bandwidth_in: Math.floor(Math.random() * 1000000000),
            bandwidth_out: Math.floor(Math.random() * 1000000000),
            packets_in: Math.floor(Math.random() * 10000),
            packets_out: Math.floor(Math.random() * 10000)
        }));

        res.json({
            success: true,
            data: sampleData
        });

    } catch (error) {
        logger.error('Error fetching NAS traffic:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data traffic NAS'
        });
    }
});

/**
 * GET /radius/connection-status/:username
 * Get user connection status from RADIUS
 */
router.get('/connection-status/:username', async (req, res) => {
    try {
        const { username } = req.params;

        if (!username) {
            return res.status(400).json({
                success: false,
                message: 'Username is required'
            });
        }

        console.log(`[DEBUG] API: Getting connection status for ${username}`);

        // Get connection status from RADIUS
        const radiusDb = require('../../../config/radius-postgres');
        const connectionStatus = await radiusDb.getUserConnectionStatus(username);

        console.log(`[DEBUG] API: Connection status for ${username}:`, connectionStatus);

        res.json({
            success: true,
            data: {
                connectionStatus: connectionStatus
            }
        });

    } catch (error) {
        logger.error(`Error getting connection status for ${req.params.username}: ${error.message}`);
        res.status(500).json({
            success: false,
            message: 'Failed to get connection status'
        });
    }
});

/**
 * GET /radius/connection-status-public/:username (no auth required for testing)
 * Get user connection status from RADIUS - PUBLIC VERSION
 */
router.get('/connection-status-public/:username', async (req, res) => {
    try {
        const { username } = req.params;

        if (!username) {
            return res.status(400).json({
                success: false,
                message: 'Username is required'
            });
        }

        console.log(`[DEBUG] PUBLIC API: Getting connection status for ${username}`);

        // Get connection status from RADIUS
        const radiusDb = require('../../../config/radius-postgres');
        const connectionStatus = await radiusDb.getUserConnectionStatus(username);

        console.log(`[DEBUG] PUBLIC API: Connection status for ${username}:`, connectionStatus);

        res.json({
            success: true,
            data: {
                connectionStatus: connectionStatus
            }
        });

    } catch (error) {
        logger.error(`Error getting connection status for ${req.params.username}: ${error.message}`);
        res.status(500).json({
            success: false,
            message: 'Failed to get connection status'
        });
    }
});

module.exports = router;