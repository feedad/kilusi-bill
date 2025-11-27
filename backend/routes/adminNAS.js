/**
 * Admin NAS Server Management Routes
 * Manage multiple NAS devices for RADIUS authentication
 */

const express = require('express');
const router = express.Router();
const { query, getAll } = require('../config/database');
const path = require('path');
const fs = require('fs');
const { adminAuth } = require('./adminAuth');
const { logger } = require('../config/logger');

// Helper function for database operations
async function dbAll(sql, params = []) {
    return await getAll(sql, params);
}

async function dbRun(sql, params = []) {
    const result = await query(sql, params);
    return { lastID: result.rows[0]?.id, changes: result.rowCount };
}

// Ensure SNMP columns exist for per-device SNMP configuration
async function ensureSnmpColumns() {
    try {
        // Check if columns exist in PostgreSQL
        const result = await query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'nas_servers'
        `);
        
        const existingColumns = result.rows.map(r => r.column_name);
        const toAdd = [];
        
        if (!existingColumns.includes('snmp_community')) {
            toAdd.push("ALTER TABLE nas_servers ADD COLUMN IF NOT EXISTS snmp_community VARCHAR(255)");
        }
        if (!existingColumns.includes('snmp_version')) {
            toAdd.push("ALTER TABLE nas_servers ADD COLUMN IF NOT EXISTS snmp_version VARCHAR(10) DEFAULT '2c'");
        }
        if (!existingColumns.includes('snmp_port')) {
            toAdd.push("ALTER TABLE nas_servers ADD COLUMN IF NOT EXISTS snmp_port INTEGER DEFAULT 161");
        }
        
        for (const sql of toAdd) {
            await query(sql);
        }
    } catch (error) {
        logger.warn('Error checking SNMP columns:', error);
    }
}

// GET /admin/nas - List all NAS servers
router.get('/', adminAuth, async (req, res) => {
    try {
        await ensureSnmpColumns();
        const nasServers = await dbAll('SELECT * FROM nas_servers ORDER BY id');
        const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
        res.render('admin-nas', { nasServers, settings });
    } catch (error) {
        console.error('Error fetching NAS servers:', error);
        const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
        res.status(500).render('error', {
            title: 'Error',
            message: 'Gagal mengambil data NAS servers',
            error: error.message,
            statusCode: 500,
            settings
        });
    }
});

// POST /admin/nas/add - Add new NAS server
router.post('/add', adminAuth, async (req, res) => {
    const { name, type, host, secret, description, snmp_community, snmp_version, snmp_port } = req.body;
    
    try {
        await ensureSnmpColumns();
        await query(
            'INSERT INTO nas_servers (nas_name, short_name, type, ip_address, secret, description, is_active, snmp_community, snmp_version, snmp_port) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9)',
            [name, name, type, host, secret, description, snmp_community || null, snmp_version || '2c', snmp_port || 161]
        );
        res.redirect('/admin/nas');
    } catch (error) {
        logger.error('Error adding NAS server:', error);
        res.status(500).send('Error adding NAS server');
    }
});

// POST /admin/nas/:id/edit - Update NAS server
router.post('/:id/edit', adminAuth, async (req, res) => {
    const { id } = req.params;
    const { name, type, host, secret, description, is_active, snmp_community, snmp_version, snmp_port } = req.body;
    
    try {
        await ensureSnmpColumns();
        await query(
            'UPDATE nas_servers SET nas_name=$1, short_name=$2, type=$3, ip_address=$4, secret=$5, description=$6, is_active=$7, snmp_community=$8, snmp_version=$9, snmp_port=$10 WHERE id=$11',
            [name, name, type, host, secret, description, is_active ? true : false, snmp_community || null, snmp_version || '2c', snmp_port || 161, id]
        );
        res.redirect('/admin/nas');
    } catch (error) {
        logger.error('Error updating NAS server:', error);
        res.status(500).send('Error updating NAS server');
    }
});

// POST /admin/nas/:id/delete - Delete NAS server
router.post('/:id/delete', adminAuth, async (req, res) => {
    const { id } = req.params;
    
    try {
        // Check if NAS is being used by customers
        const customers = await dbAll('SELECT COUNT(*) as count FROM customers WHERE nas_server_id=$1', [id]);
        
        if (customers[0] && customers[0].count > 0) {
            return res.status(400).send(`Cannot delete NAS server. ${customers[0].count} customers are using this NAS.`);
        }
        
        await query('DELETE FROM nas_servers WHERE id=$1', [id]);
        res.redirect('/admin/nas');
    } catch (error) {
        logger.error('Error deleting NAS server:', error);
        res.status(500).send('Error deleting NAS server');
    }
});

// POST /admin/nas/:id/toggle - Toggle NAS server active status
router.post('/:id/toggle', adminAuth, async (req, res) => {
    const { id } = req.params;
    
    try {
        await query(
            'UPDATE nas_servers SET is_active = NOT is_active WHERE id=$1',
            [id]
        );
        res.json({ success: true });
    } catch (error) {
        logger.error('Error toggling NAS server:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
