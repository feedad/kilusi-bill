const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// GET /api/v1/mitra - List all mitra
router.get('/', async (req, res) => {
  try {
    const { search, include_disabled = 'false', page = 1, limit = 100 } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'WHERE 1=1';
    let params = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (name ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length})`;
    }
    if (include_disabled === 'false') {
      whereClause += ` AND disabled_at IS NULL`;
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM mitra ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);

    params.push(limitNum, offset);
    const result = await query(
      `SELECT * FROM mitra ${whereClause} ORDER BY name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    logger.error('Error fetching mitra:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/v1/mitra/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM mitra WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mitra not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching mitra:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/v1/mitra - Create mitra
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, address, notes } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Nama mitra harus diisi' });
    }

    const existing = await query('SELECT id FROM mitra WHERE name ILIKE $1', [name.trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Mitra dengan nama ini sudah ada' });
    }

    const result = await query(
      `INSERT INTO mitra (name, phone, email, address, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name.trim(), phone || null, email || null, address || null, notes || null]
    );

    res.status(201).json({ success: true, data: result.rows[0], message: 'Mitra berhasil dibuat' });
  } catch (error) {
    logger.error('Error creating mitra:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/v1/mitra/:id - Update mitra
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, address, notes } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Nama mitra harus diisi' });
    }

    const existing = await query('SELECT id FROM mitra WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mitra not found' });
    }

    const duplicate = await query('SELECT id FROM mitra WHERE name ILIKE $1 AND id != $2', [name.trim(), id]);
    if (duplicate.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Mitra dengan nama ini sudah ada' });
    }

    const result = await query(
      `UPDATE mitra SET name=$1, phone=$2, email=$3, address=$4, notes=$5, updated_at=NOW() WHERE id=$6 RETURNING *`,
      [name.trim(), phone || null, email || null, address || null, notes || null, id]
    );

    res.json({ success: true, data: result.rows[0], message: 'Mitra berhasil diperbarui' });
  } catch (error) {
    logger.error('Error updating mitra:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// DELETE /api/v1/mitra/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await query('SELECT id FROM mitra WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mitra not found' });
    }

    // Check if any region is linked to this mitra
    const linkedRegions = await query('SELECT COUNT(*) as cnt FROM regions WHERE mitra_id = $1', [req.params.id]);
    if (parseInt(linkedRegions.rows[0].cnt) > 0) {
      return res.status(400).json({ success: false, message: 'Mitra masih digunakan oleh area, lepaskan dulu' });
    }

    await query('DELETE FROM mitra WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Mitra berhasil dihapus' });
  } catch (error) {
    logger.error('Error deleting mitra:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PATCH /api/v1/mitra/:id/disable
router.patch('/:id/disable', async (req, res) => {
  try {
    const result = await query(
      `UPDATE mitra SET disabled_at = NOW(), updated_at = NOW() WHERE id = $1 AND disabled_at IS NULL RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mitra not found or already disabled' });
    }
    res.json({ success: true, data: result.rows[0], message: 'Mitra dinonaktifkan' });
  } catch (error) {
    logger.error('Error disabling mitra:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PATCH /api/v1/mitra/:id/enable
router.patch('/:id/enable', async (req, res) => {
  try {
    const result = await query(
      `UPDATE mitra SET disabled_at = NULL, updated_at = NOW() WHERE id = $1 AND disabled_at IS NOT NULL RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mitra not found or already enabled' });
    }
    res.json({ success: true, data: result.rows[0], message: 'Mitra diaktifkan' });
  } catch (error) {
    logger.error('Error enabling mitra:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/v1/mitra/dropdown - Simple list for dropdowns
router.get('/dropdown', async (req, res) => {
  try {
    const result = await query('SELECT id, name FROM mitra WHERE disabled_at IS NULL ORDER BY name ASC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching mitra dropdown:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
