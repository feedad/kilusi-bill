const express = require('express');
const { Pool } = require('pg');
const { getSetting } = require('../../../config/settingsManager');
const router = express.Router();

// Initialize PostgreSQL connection
const pool = new Pool({
  host: getSetting('postgres_host') || 'localhost',
  port: parseInt(getSetting('postgres_port')) || 5432,
  database: getSetting('postgres_database') || 'kilusi_bill',
  user: getSetting('postgres_user') || 'kilusi_user',
  password: getSetting('postgres_password') || 'kilusi1234'
});

// Get all regions
router.get('/', async (req, res) => {
  try {
    const {
      search,
      include_disabled = 'false',
      page = 1,
      limit = 10
    } = req.query;

    // Convert page and limit to numbers
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    let countQuery = `SELECT COUNT(*) as total FROM regions`;
    let dataQuery = `
      SELECT id, name, district, regency, province, created_at, updated_at, disabled_at
      FROM regions
    `;

    let params = [];
    let conditions = [];

    // Add search condition
    if (search) {
      conditions.push(`(name ILIKE $${params.length + 1} OR district ILIKE $${params.length + 1} OR regency ILIKE $${params.length + 1} OR province ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    // Add disabled filter condition (default: exclude disabled)
    if (include_disabled === 'false') {
      conditions.push(`disabled_at IS NULL`);
    }

    if (conditions.length > 0) {
      const whereClause = ` WHERE ${conditions.join(' AND ')}`;
      countQuery += whereClause;
      dataQuery += whereClause;
    }

    dataQuery += ` ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limitNum, offset);

    // Execute both queries
    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, params.slice(0, -2)), // Exclude limit and offset for count
      pool.query(dataQuery, params)
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      },
      message: 'Regions retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching regions:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get region by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT id, name, district, regency, province, created_at, updated_at, disabled_at FROM regions WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Region not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Region retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching region:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Create new region
router.post('/', async (req, res) => {
  try {
    const { name, district, regency, province } = req.body;

    // Validation
    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Region name is required'
      });
    }

    // Check if region with same name already exists
    const existingRegion = await pool.query(
      'SELECT id FROM regions WHERE name ILIKE $1',
      [name.trim()]
    );

    if (existingRegion.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Region with this name already exists'
      });
    }

    // Insert new region
    const result = await pool.query(
      `INSERT INTO regions (name, district, regency, province, disabled_at)
       VALUES ($1, $2, $3, $4, NULL)
       RETURNING id, name, district, regency, province, created_at, updated_at, disabled_at`,
      [name.trim(), district?.trim() || null, regency?.trim() || null, province?.trim() || null]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Region created successfully'
    });
  } catch (error) {
    console.error('Error creating region:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update region
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, district, regency, province } = req.body;

    // Validation
    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Region name is required'
      });
    }

    // Check if region exists
    const existingRegion = await pool.query('SELECT id FROM regions WHERE id = $1', [id]);

    if (existingRegion.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Region not found'
      });
    }

    // Check if another region with same name already exists
    const duplicateRegion = await pool.query(
      'SELECT id FROM regions WHERE name ILIKE $1 AND id != $2',
      [name.trim(), id]
    );

    if (duplicateRegion.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Region with this name already exists'
      });
    }

    // Update region
    const result = await pool.query(
      `UPDATE regions
       SET name = $1, district = $2, regency = $3, province = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, name, district, regency, province, created_at, updated_at, disabled_at`,
      [name.trim(), district?.trim() || null, regency?.trim() || null, province?.trim() || null, id]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Region updated successfully'
    });
  } catch (error) {
    console.error('Error updating region:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Delete region
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if region exists
    const existingRegion = await pool.query('SELECT id FROM regions WHERE id = $1', [id]);

    if (existingRegion.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Region not found'
      });
    }

    // TODO: Add check if region is being used by customers before allowing deletion
    // For now, we'll allow deletion

    // Delete region
    await pool.query('DELETE FROM regions WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Region deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting region:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Disable a region (soft delete)
router.patch('/:id/disable', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if region exists and is not already disabled
    const existingRegion = await pool.query(
      'SELECT id, disabled_at FROM regions WHERE id = $1',
      [id]
    );

    if (existingRegion.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Region not found'
      });
    }

    if (existingRegion.rows[0].disabled_at) {
      return res.status(400).json({
        success: false,
        message: 'Region is already disabled'
      });
    }

    // Disable region
    const result = await pool.query(
      `UPDATE regions
       SET disabled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, name, district, regency, province, created_at, updated_at, disabled_at`,
      [id]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Region disabled successfully'
    });
  } catch (error) {
    console.error('Error disabling region:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Enable a region
router.patch('/:id/enable', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if region exists
    const existingRegion = await pool.query(
      'SELECT id, disabled_at FROM regions WHERE id = $1',
      [id]
    );

    if (existingRegion.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Region not found'
      });
    }

    if (!existingRegion.rows[0].disabled_at) {
      return res.status(400).json({
        success: false,
        message: 'Region is already enabled'
      });
    }

    // Enable region
    const result = await pool.query(
      `UPDATE regions
       SET disabled_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, name, district, regency, province, created_at, updated_at, disabled_at`,
      [id]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Region enabled successfully'
    });
  } catch (error) {
    console.error('Error enabling region:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Bulk operations
router.post('/bulk', async (req, res) => {
  try {
    const { action, region_ids } = req.body;

    if (!action || !region_ids || !Array.isArray(region_ids) || region_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request. Action and region_ids array are required.'
      });
    }

    if (!['disable', 'enable', 'delete'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Supported actions: disable, enable, delete'
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const results = [];
      let successCount = 0;
      let errorCount = 0;

      for (const id of region_ids) {
        try {
          let query, params;

          switch (action) {
            case 'disable':
              query = `UPDATE regions
                       SET disabled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                       WHERE id = $1 AND disabled_at IS NULL
                       RETURNING id, name, disabled_at`;
              break;
            case 'enable':
              query = `UPDATE regions
                       SET disabled_at = NULL, updated_at = CURRENT_TIMESTAMP
                       WHERE id = $1 AND disabled_at IS NOT NULL
                       RETURNING id, name, disabled_at`;
              break;
            case 'delete':
              // TODO: Add check if region is being used by customers before allowing deletion
              query = `DELETE FROM regions WHERE id = $1 RETURNING id, name`;
              break;
          }

          params = [id];
          const result = await client.query(query, params);

          if (result.rows.length > 0) {
            results.push(result.rows[0]);
            successCount++;
          }
        } catch (err) {
          errorCount++;
          console.error(`Error processing region ${id}:`, err);
        }
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Bulk ${action} operation completed`,
        summary: {
          total: region_ids.length,
          success: successCount,
          errors: errorCount,
          results: results
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in bulk operation:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;