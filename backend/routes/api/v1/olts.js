const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const logger = require('../../../config/logger');
const oltMonitor = require('../../../config/olt-snmp-monitor');

// GET /api/v1/olts
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT * FROM olts ORDER BY name ASC');
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Error fetching OLTs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch OLTs' });
    }
});

// GET /api/v1/olts/:id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query('SELECT * FROM olts WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'OLT not found' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Error fetching OLT:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch OLT' });
    }
});

// POST /api/v1/olts
router.post('/', async (req, res) => {
    try {
        const { name, host, snmp_community, snmp_write_community, snmp_version, snmp_port, type, description } = req.body;

        const result = await query(`
            INSERT INTO olts (name, host, snmp_community, snmp_write_community, snmp_version, snmp_port, type, description, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            name,
            host,
            snmp_community || 'public',
            snmp_write_community || 'private',
            snmp_version || '2c',
            snmp_port || 161,
            type || 'zte',
            description,
            'active'
        ]);

        res.json({ success: true, message: 'OLT created', data: result.rows[0] });
    } catch (error) {
        logger.error('Error creating OLT:', error);
        res.status(500).json({ success: false, message: 'Failed to create OLT' });
    }
});

// PUT /api/v1/olts/:id
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, host, snmp_community, snmp_write_community, snmp_version, snmp_port, type, description, status } = req.body;

        const result = await query(`
            UPDATE olts 
            SET name = $1, host = $2, snmp_community = $3, snmp_write_community = $4, snmp_version = $5, snmp_port = $6, 
                type = $7, description = $8, status = $9, updated_at = NOW()
            WHERE id = $10
            RETURNING *
        `, [name, host, snmp_community, snmp_write_community, snmp_version, snmp_port, type, description, status, id]);

        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'OLT not found' });

        res.json({ success: true, message: 'OLT updated', data: result.rows[0] });
    } catch (error) {
        logger.error('Error updating OLT:', error);
        res.status(500).json({ success: false, message: 'Failed to update OLT' });
    }
});

// DELETE /api/v1/olts/:id
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM olts WHERE id = $1', [id]);
        res.json({ success: true, message: 'OLT deleted' });
    } catch (error) {
        logger.error('Error deleting OLT:', error);
        res.status(500).json({ success: false, message: 'Failed to delete OLT' });
    }
});

// POST /api/v1/olts/:id/test
router.post('/:id/test', async (req, res) => {
    try {
        const { id } = req.params;
        const oltResult = await query('SELECT * FROM olts WHERE id = $1', [id]);

        if (oltResult.rows.length === 0) return res.status(404).json({ success: false, message: 'OLT not found' });

        const olt = oltResult.rows[0];

        // Simple Test: Get OLT Device Info
        const config = {
            host: olt.host,
            community: olt.snmp_community,
            version: olt.snmp_version,
            port: olt.snmp_port,
            vendor: olt.type
        };

        const info = await oltMonitor.getOLTDeviceInfo(config);

        if (info.uptime) {
            res.json({ success: true, message: 'Connection Successful', data: info });
        } else {
            res.status(400).json({ success: false, message: 'Connection Test Failed (No Response)' });
        }

    } catch (error) {
        logger.error('Error testing OLT:', error);
        res.status(500).json({ success: false, message: error.message || 'Test Failed' });
    }
});


// GET /api/v1/olts/:id/onus
router.get('/:id/onus', async (req, res) => {
    try {
        const { id } = req.params;
        const oltResult = await query('SELECT * FROM olts WHERE id = $1', [id]);

        if (oltResult.rows.length === 0) return res.status(404).json({ success: false, message: 'OLT not found' });

        const olt = oltResult.rows[0];
        const config = {
            host: olt.host,
            community: olt.snmp_community,
            version: olt.snmp_version,
            port: olt.snmp_port,
            vendor: olt.type
        };

        const onus = await oltMonitor.getOnuList(config);
        res.json({ success: true, data: onus });

    } catch (error) {
        logger.error('Error fetching ONU list:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to fetch ONU list' });
    }
});

// POST /api/v1/olts/:id/onus/:index/reboot
router.post('/:id/onus/:index/reboot', async (req, res) => {
    try {
        const { id, index } = req.params;
        const { sn } = req.body; // Optional, required for HSGQ

        const oltResult = await query('SELECT * FROM olts WHERE id = $1', [id]);
        if (oltResult.rows.length === 0) return res.status(404).json({ success: false, message: 'OLT not found' });

        const olt = oltResult.rows[0];
        const config = {
            host: olt.host,
            community: olt.snmp_write_community || 'private', // Use write community
            version: olt.snmp_version,
            port: olt.snmp_port,
            vendor: olt.type
        };

        const result = await oltMonitor.rebootOnu(config, index, sn);
        if (result.success) {
            res.json({ success: true, message: result.message });
        } else {
            res.status(400).json({ success: false, message: result.message });
        }

    } catch (error) {
        logger.error('Error rebooting ONU:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to reboot ONU' });
    }
});

// POST /api/v1/olts/:id/onus/:index/sync-name
router.post('/:id/onus/:index/sync-name', async (req, res) => {
    try {
        const { id, index } = req.params;
        const { name } = req.body;

        const oltResult = await query('SELECT * FROM olts WHERE id = $1', [id]);
        if (oltResult.rows.length === 0) return res.status(404).json({ success: false, message: 'OLT not found' });

        const olt = oltResult.rows[0];
        const config = {
            host: olt.host,
            community: olt.snmp_write_community || 'private', // Use write community
            version: olt.snmp_version,
            port: olt.snmp_port,
            vendor: olt.type
        };

        const result = await oltMonitor.setOnuName(config, index, name);
        if (result.success) {
            res.json({ success: true, message: result.message });
        } else {
            res.status(400).json({ success: false, message: result.message });
        }

    } catch (error) {
        logger.error('Error syncing ONU name:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to sync ONU name' });
    }
});

module.exports = router;
