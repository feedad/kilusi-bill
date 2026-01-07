const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { query, transaction } = require('../../../config/database');

// GET /api/v1/technician/dashboard - Get dashboard stats
router.get('/dashboard', async (req, res) => {
    try {
        const userId = req.user.id;

        // Get open tickets count (assigned to user)
        const openTickets = await query(
            `SELECT COUNT(*) as count FROM tickets 
             WHERE assigned_to = $1 AND status IN ('open', 'in_progress')`,
            [userId]
        );

        // Get today's scheduled installations (assigned to user)
        const todayInstallations = await query(
            `SELECT COUNT(*) as count FROM installations 
             WHERE technician_id = $1 
             AND status = 'scheduled' 
             AND DATE(scheduled_date) = CURRENT_DATE`,
            [userId]
        );

        // Get completed tasks today (tickets + installations)
        const completedToday = await query(
            `SELECT 
                (SELECT COUNT(*) FROM tickets 
                 WHERE assigned_to = $1 AND status = 'resolved' AND DATE(updated_at) = CURRENT_DATE) +
                (SELECT COUNT(*) FROM installations 
                 WHERE technician_id = $1 AND status = 'completed' AND DATE(completed_date) = CURRENT_DATE) 
             as count`,
            [userId]
        );

        res.json({
            success: true,
            data: {
                openTickets: parseInt(openTickets.rows[0].count),
                todayInstallations: parseInt(todayInstallations.rows[0].count),
                completedToday: parseInt(completedToday.rows[0].count)
            }
        });

    } catch (error) {
        logger.error('Error fetching technician dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data dashboard'
        });
    }
});

// GET /api/v1/technician/tickets - Get assigned tickets
router.get('/tickets', async (req, res) => {
    try {
        const userId = req.user.id;
        const { status } = req.query;

        let sql = `
            SELECT t.*, c.name as customer_name, c.address as customer_address, c.phone as customer_phone
            FROM tickets t
            LEFT JOIN customers c ON t.customer_id = c.id
            WHERE t.assigned_to = $1
        `;
        const params = [userId];

        if (status) {
            sql += ` AND t.status = $2`;
            params.push(status);
        }

        sql += ` ORDER BY t.created_at DESC`;

        const result = await query(sql, params);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        logger.error('Error fetching technician tickets:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil tiket'
        });
    }
});

// PUT /api/v1/technician/tickets/:id - Update ticket
router.put('/tickets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, resolution } = req.body;
        const userId = req.user.id;

        // Verify assignment
        const check = await query(
            `SELECT id FROM tickets WHERE id = $1 AND assigned_to = $2`,
            [id, userId]
        );

        if (check.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tiket tidak ditemukan atau bukan tugas Anda'
            });
        }

        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (status) {
            updates.push(`status = $${paramIndex++}`);
            values.push(status);
        }
        if (resolution) {
            updates.push(`description = description || E'\nResolution: ' || $${paramIndex++}`);
            values.push(resolution);
        }

        updates.push(`updated_at = NOW()`);
        values.push(id);

        await query(
            `UPDATE tickets SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
            values
        );

        res.json({
            success: true,
            message: 'Tiket berhasil diperbarui'
        });

    } catch (error) {
        logger.error('Error updating ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memperbarui tiket'
        });
    }
});

// POST /api/v1/technician/customers/:id/activate - Activate Service
router.post('/customers/:id/activate', async (req, res) => {
    const { id } = req.params;
    const {
        ont_sn,
        odp_id,
        odp_name, // fallback/manual
        port_no,
        package_id,
        coordinates, // { lat, lng }
        region_id
    } = req.body;

    try {
        await transaction(async (client) => {
            // 1. Update Customer Technical details & Status
            const updateCustomerResult = await client.query(`
                UPDATE customers 
                SET device_id = $1, -- ONT SN
                    package_id = $2,
                    latitude = $3,
                    longitude = $4,
                    region_id = $5,
                    status = 'active',
                    odp_name = $6,
                    odp_port = $7,
                    odp_id = $8,
                    active_date = NOW(),
                    install_date = NOW()
                WHERE id = $9
                RETURNING id, name
            `, [
                ont_sn,
                package_id,
                coordinates?.lat || null,
                coordinates?.lng || null,
                region_id || null,
                odp_name || (odp_id ? (await getOdpName(client, odp_id)) : null),
                port_no,
                odp_id || null,
                id
            ]);

            if (updateCustomerResult.rowCount === 0) {
                throw new Error('Customer ID not found: ' + id);
            }

            // 2. Link to ODP via cable_routes (if ODP selected)
            if (odp_id) {
                // Check if port already used
                const portCheck = await client.query(`
                    SELECT id FROM cable_routes WHERE odp_id = $1 AND port_number = $2 AND status = 'connected'
                `, [odp_id, port_no]);

                if (portCheck.rows.length > 0) {
                    // Maybe warn or error? For now, we allow overwrite or handle it? 
                    // Let's assume strict port enforcement:
                    throw new Error(`Port ${port_no} pada ODP selected sudah digunakan.`);
                }

                await client.query(`
                    INSERT INTO cable_routes (odp_id, customer_id, port_number, status, installation_date)
                    VALUES ($1, $2, $3, 'connected', CURRENT_DATE)
                `, [odp_id, id, port_no]);

                // Trigger on cable_routes should update used_ports count on ODPs table automatically
            }

            logger.info(`Technician ${req.user.username} activated customer ${id}`);
        });

        res.json({
            success: true,
            message: 'Layanan pelanggan berhasil diaktifkan'
        });

    } catch (error) {
        logger.error('Error activating service:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Gagal mengaktifkan layanan'
        });
    }
});

// POST /api/v1/technician/odps - Create ODP
router.post('/odps', async (req, res) => {
    try {
        const { name, code, coordinates, capacity, address } = req.body;

        // Validation
        if (!name || !code || !coordinates) {
            return res.status(400).json({
                success: false,
                message: 'Nama, Kode, dan Koordinat wajib diisi'
            });
        }

        const result = await query(`
            INSERT INTO odps (name, code, latitude, longitude, capacity, address, status, used_ports)
            VALUES ($1, $2, $3, $4, $5, $6, 'active', 0)
            RETURNING id, name
        `, [
            name,
            code,
            coordinates.lat,
            coordinates.lng,
            capacity || 8,
            address || 'Lokasi Baru'
        ]);

        res.json({
            success: true,
            message: 'ODP berhasil dibuat',
            data: result.rows[0]
        });

    } catch (error) {
        logger.error('Error creating ODP:', error);
        // Duplicate code error handling
        if (error.code === '23505') { // unique_violation
            return res.status(409).json({
                success: false,
                message: 'Kode ODP sudah digunakan'
            });
        }
        res.status(500).json({
            success: false,
            message: 'Gagal membuat ODP'
        });
    }
});

// GET /api/v1/technician/onu-status/:customer_id - Get ONU Status
router.get('/onu-status/:customer_id', async (req, res) => {
    try {
        const { customer_id } = req.params;

        const customerResult = await query(
            `SELECT device_id, olt_ip, olt_community FROM customers WHERE id = $1`,
            [customer_id]
        );

        if (customerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pelanggan tidak ditemukan'
            });
        }

        const { device_id: ont_sn, olt_ip, olt_community } = customerResult.rows[0];

        if (!ont_sn || !olt_ip || !olt_community) {
            return res.status(400).json({
                success: false,
                message: 'Informasi ONT SN, OLT IP, atau OLT Community tidak lengkap untuk pelanggan ini.'
            });
        }

        const onuStatus = await oltMonitor.getOnuStatus(olt_ip, olt_community, ont_sn);

        res.json({
            success: true,
            data: onuStatus
        });

    } catch (error) {
        logger.error(`Error fetching ONU status for customer ${req.params.customer_id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil status ONU'
        });
    }
});

// Preserve existing system routes as legacy/monitoring (optional, simplified)
// GET /api/v1/technician/system-status (Simplified placeholder)
router.get('/system-status', (req, res) => {
    res.json({ success: true, data: { status: 'operational' } });
});
// ... other existing routes can be kept if needed or removed. 
// For cleanliness, I'm focusing on the requested features.

// GET /api/v1/technician/customers/:id/onu-status
router.get('/customers/:id/onu-status', async (req, res) => {
    const { id } = req.params;

    try {
        // 1. Get Customer ONT SN
        const customerResult = await query('SELECT device_id, name FROM customers WHERE id = $1', [id]);
        if (customerResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }

        const { device_id: ontSn, name } = customerResult.rows[0];

        if (!ontSn) {
            return res.json({
                success: false,
                message: 'ONT Serial Number not found for this customer',
                data: { status: 'unknown', reason: 'no_sn' }
            });
        }

        // 2. Get All SNMP-enabled OLTs
        // We now use the dedicated 'olts' table
        const oltList = await query(`
            SELECT host, snmp_community as community, snmp_version as version, snmp_port as port, type, description, name
            FROM olts 
            WHERE status = 'active'
        `);

        if (oltList.rows.length === 0) {
            // Fallback to NAS if OLTs table empty (for migration period)?
            // Or just return empty
            // Let's keep it strict to new table as requested
            return res.json({
                success: false,
                message: 'No active OLTs configured',
                data: { status: 'unknown', reason: 'no_olt' }
            });
        }

        // 3. Search for ONU on each OLT
        let foundOnu = null;
        let usedOlt = null;

        for (const olt of oltList.rows) {
            const config = {
                host: olt.host,
                community: olt.community || 'public',
                version: olt.version || '2c',
                port: olt.port || 161,
                vendor: olt.type
            };

            try {
                const result = await oltMonitor.findOnuBySn(config, ontSn);
                if (result.success) {
                    foundOnu = result;
                    usedOlt = olt;
                    break;
                }
            } catch (e) {
                logger.warn(`Failed to check OLT ${olt.host}: ${e.message}`);
                continue;
            }
        }

        if (foundOnu) {
            // Determine signal quality
            let signalQuality = 'good';
            const rx = parseFloat(foundOnu.rxPower);
            if (rx < -27) signalQuality = 'critical';
            else if (rx < -25) signalQuality = 'warning';

            return res.json({
                success: true,
                data: {
                    status: foundOnu.status, // online/offline
                    rxPower: foundOnu.rxPower,
                    signalQuality,
                    oltParam: {
                        name: usedOlt.description || usedOlt.host,
                        ip: usedOlt.host
                    },
                    onuIndex: foundOnu.index,
                    rawRx: foundOnu.rawRx
                }
            });
        } else {
            return res.json({
                success: false,
                message: 'ONU not found on any active OLT',
                data: { status: 'offline', reason: 'not_found' }
            });
        }

    } catch (error) {
        logger.error(`Error checking ONU status for customer ${id}:`, error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// GET /api/v1/technician/olts - Get List of OLTs
router.get('/olts', async (req, res) => {
    try {
        const result = await query(`
            SELECT id, name as shortname, host as nasname, type, description, status
            FROM olts 
            -- WHERE status = 'active'
            ORDER BY name ASC
        `);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        logger.error('Error fetching OLT list for technician:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data OLT' });
    }
});

// POST /api/v1/technician/customers/:id/sync-olt-name
// Sync Customer Name to OLT ONU Name/Description
router.post('/customers/:id/sync-olt-name', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query('SELECT * FROM customers WHERE id = $1', [id]);

        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Customer not found' });

        const customer = result.rows[0];

        // Use device_id as SN (fallback to existing logic)
        // Note: In real world, we might want a dedicated serial_number column
        const ontSn = customer.device_id || customer.notes?.match(/SN:([A-Z0-9]+)/)?.[1];

        if (!ontSn) {
            return res.status(400).json({ success: false, message: 'Customer has no Serial Number (device_id)' });
        }

        // 1. Find the ONU first to get OLT and Index
        const oltList = await query(`
            SELECT host, snmp_community as community, snmp_write_community, snmp_version as version, snmp_port as port, type, description, name
            FROM olts 
            WHERE status = 'active'
        `);

        let foundOnu = null;
        let usedOlt = null;

        for (const olt of oltList.rows) {
            const config = {
                host: olt.host,
                community: olt.community || 'public',
                version: olt.version || '2c',
                port: olt.port || 161,
                vendor: olt.type
            };

            try {
                const res = await oltMonitor.findOnuBySn(config, ontSn);
                if (res.success) {
                    foundOnu = res;
                    usedOlt = olt;
                    break;
                }
            } catch (ignored) { }
        }

        if (!foundOnu) {
            return res.status(404).json({ success: false, message: 'ONU not found on any OLT' });
        }

        // 2. Perform Write
        const config = {
            host: usedOlt.host,
            community: usedOlt.snmp_write_community || 'private', // Use dedicated write community
            version: usedOlt.version || '2c',
            port: usedOlt.port || 161,
            vendor: usedOlt.type
        };

        const newName = `${customer.name} - ${customer.id}`; // Format: "Budi - 1001"
        const writeResult = await oltMonitor.setOnuName(config, foundOnu.index, newName);

        if (writeResult.success) {
            res.json({ success: true, message: writeResult.message, currentName: newName });
        } else {
            res.status(500).json({ success: false, message: writeResult.message });
        }

    } catch (error) {
        logger.error('Error syncing OLT name:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;