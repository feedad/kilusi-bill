/**
 * Admin Mikrotik Server Management Routes
 * Manage multiple Mikrotik PPPoE servers
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
            WHERE table_name = 'mikrotik_servers'
        `);
        
        const existingColumns = result.rows.map(r => r.column_name);
        const toAdd = [];
        
        if (!existingColumns.includes('snmp_community')) {
            toAdd.push("ALTER TABLE mikrotik_servers ADD COLUMN IF NOT EXISTS snmp_community VARCHAR(255)");
        }
        if (!existingColumns.includes('snmp_version')) {
            toAdd.push("ALTER TABLE mikrotik_servers ADD COLUMN IF NOT EXISTS snmp_version VARCHAR(10) DEFAULT '2c'");
        }
        if (!existingColumns.includes('snmp_port')) {
            toAdd.push("ALTER TABLE mikrotik_servers ADD COLUMN IF NOT EXISTS snmp_port INTEGER DEFAULT 161");
        }
        if (!existingColumns.includes('is_pppoe_server')) {
            toAdd.push("ALTER TABLE mikrotik_servers ADD COLUMN IF NOT EXISTS is_pppoe_server BOOLEAN DEFAULT true");
        }
        
        for (const sql of toAdd) {
            await query(sql);
        }
    } catch (error) {
        logger.warn('Error checking SNMP columns:', error);
    }
}

// GET /admin/mikrotik-servers - List all Mikrotik servers
router.get('/', adminAuth, async (req, res) => {
    try {
        await ensureSnmpColumns();
        const mikrotikServers = await dbAll('SELECT * FROM mikrotik_servers ORDER BY id');
        const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
        res.render('admin-mikrotik-servers', { mikrotikServers, settings });
    } catch (error) {
        console.error('Error fetching Mikrotik servers:', error);
        const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
        res.status(500).render('error', {
            title: 'Error',
            message: 'Gagal mengambil data Mikrotik servers',
            error: error.message,
            statusCode: 500,
            settings
        });
    }
});

// POST /admin/mikrotik-servers/add - Add new Mikrotik server
router.post('/add', adminAuth, async (req, res) => {
    const { name, host, port, username, password, description, is_pppoe_server, snmp_community, snmp_version, snmp_port } = req.body;
    
    try {
        await ensureSnmpColumns();
        await query(
            'INSERT INTO mikrotik_servers (name, host, port, username, password, main_interface, is_active, snmp_community, snmp_version, snmp_port, is_pppoe_server) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10)',
            [name, host, port || 8728, username, password, description, snmp_community || null, snmp_version || '2c', snmp_port || 161, is_pppoe_server ? true : false]
        );
        res.redirect('/admin/mikrotik-servers');
    } catch (error) {
        logger.error('Error adding Mikrotik server:', error);
        res.status(500).send('Error adding Mikrotik server');
    }
});

// POST /admin/mikrotik-servers/:id/edit - Update Mikrotik server
router.post('/:id/edit', adminAuth, async (req, res) => {
    const { id } = req.params;
    const { name, host, port, username, password, description, is_pppoe_server, is_active, snmp_community, snmp_version, snmp_port } = req.body;
    
    try {
        await ensureSnmpColumns();
        await query(
            'UPDATE mikrotik_servers SET name=$1, host=$2, port=$3, username=$4, password=$5, main_interface=$6, is_pppoe_server=$7, is_active=$8, snmp_community=$9, snmp_version=$10, snmp_port=$11 WHERE id=$12',
            [name, host, port || 8728, username, password, description, is_pppoe_server ? true : false, is_active ? true : false, snmp_community || null, snmp_version || '2c', snmp_port || 161, id]
        );
        res.redirect('/admin/mikrotik-servers');
    } catch (error) {
        logger.error('Error updating Mikrotik server:', error);
        res.status(500).send('Error updating Mikrotik server');
    }
});

// POST /admin/mikrotik-servers/:id/delete - Delete Mikrotik server
router.post('/:id/delete', adminAuth, async (req, res) => {
    const { id } = req.params;
    
    try {
        // Check if Mikrotik server is being used by customers
        const customers = await dbAll('SELECT COUNT(*) as count FROM customers WHERE mikrotik_server_id=$1', [id]);
        
        if (customers[0] && customers[0].count > 0) {
            return res.status(400).send(`Cannot delete Mikrotik server. ${customers[0].count} customers are using this server.`);
        }
        
        await query('DELETE FROM mikrotik_servers WHERE id=$1', [id]);
        res.redirect('/admin/mikrotik-servers');
    } catch (error) {
        logger.error('Error deleting Mikrotik server:', error);
        res.status(500).send('Error deleting Mikrotik server');
    }
});

// POST /admin/mikrotik-servers/:id/toggle - Toggle Mikrotik server active status
router.post('/:id/toggle', adminAuth, async (req, res) => {
    const { id } = req.params;
    
    try {
        await query(
            'UPDATE mikrotik_servers SET is_active = NOT is_active WHERE id=$1',
            [id]
        );
        res.json({ success: true });
    } catch (error) {
        logger.error('Error toggling Mikrotik server:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
