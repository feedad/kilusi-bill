/**
 * Cable Routes API Routes
 * RESTful API endpoints for cable route management
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { jwtAuth } = require('../../../middleware/jwtAuth');

// Import settings
const settings = require('../../../settings.json');

// Database connection using settings.json
const pool = new Pool({
  user: settings.postgres_user,
  host: settings.postgres_host,
  database: settings.postgres_database,
  password: settings.postgres_password,
  port: settings.postgres_port,
  ssl: false,
  max: settings.postgres_pool_max || 20,
  idleTimeoutMillis: settings.postgres_idle_timeout || 30000,
  connectionTimeoutMillis: settings.postgres_connection_timeout || 5000
});

/**
 * GET /api/v1/cable-routes
 * Get all cable routes with ODP and customer information
 * Now queries from network_infrastructure which stores actual customer-ODP connections
 */
router.get('/', jwtAuth, async (req, res) => {
  try {
    const {
      search,
      status,
      odp_id,
      customer_id,
      page = 1,
      limit = 50
    } = req.query;

    let query = `
      SELECT
        n.id,
        n.odp_code::integer as odp_id,
        cv.id as customer_id,
        n.cable_length_meters as cable_length,
        n.port_number,
        CASE WHEN cv.status = 'active' THEN 'connected' ELSE 'disconnected' END as status,
        s.installation_date,
        '' as notes,
        n.created_at,
        n.updated_at,
        o.name as odp_name,
        o.code as odp_code,
        o.latitude as odp_latitude,
        o.longitude as odp_longitude,
        cv.name as customer_name,
        cv.address as customer_address,
        cv.latitude as customer_latitude,
        cv.longitude as customer_longitude,
        cv.phone as customer_phone,
        cv.status as customer_status
      FROM network_infrastructure n
      JOIN services s ON n.service_id = s.id
      JOIN customers_view cv ON s.customer_id = cv.id
      LEFT JOIN odps o ON n.odp_code = o.id::text
      WHERE n.odp_code IS NOT NULL AND n.odp_code != ''
    `;

    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (
        cv.id ILIKE $${paramIndex} OR
        cv.name ILIKE $${paramIndex} OR
        o.name ILIKE $${paramIndex} OR
        o.code ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      if (status === 'connected') {
        query += ` AND cv.status = 'active'`;
      } else if (status === 'disconnected') {
        query += ` AND cv.status != 'active'`;
      }
    }

    if (odp_id) {
      query += ` AND n.odp_code = $${paramIndex}::text`;
      params.push(odp_id);
      paramIndex++;
    }

    if (customer_id) {
      query += ` AND cv.id = $${paramIndex}`;
      params.push(customer_id);
      paramIndex++;
    }

    // Add pagination and ordering
    query += ` ORDER BY n.created_at DESC`;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    // Get total count
    let countQuery = `
      SELECT COUNT(*)
      FROM network_infrastructure n
      JOIN services s ON n.service_id = s.id
      JOIN customers_view cv ON s.customer_id = cv.id
      LEFT JOIN odps o ON n.odp_code = o.id::text
      WHERE n.odp_code IS NOT NULL AND n.odp_code != ''
    `;

    const countParams = [];
    let countParamIndex = 1;

    if (search) {
      countQuery += ` AND (
        cv.id ILIKE $${countParamIndex} OR
        cv.name ILIKE $${countParamIndex} OR
        o.name ILIKE $${countParamIndex} OR
        o.code ILIKE $${countParamIndex}
      )`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    if (status) {
      if (status === 'connected') {
        countQuery += ` AND cv.status = 'active'`;
      } else if (status === 'disconnected') {
        countQuery += ` AND cv.status != 'active'`;
      }
    }

    if (odp_id) {
      countQuery += ` AND n.odp_code = $${countParamIndex}::text`;
      countParams.push(odp_id);
      countParamIndex++;
    }

    if (customer_id) {
      countQuery += ` AND cv.id = $${countParamIndex}`;
      countParams.push(customer_id);
      countParamIndex++;
    }

    const countResult = await pool.query(countQuery, countParams);

    const total = countResult.rows && countResult.rows[0] ? parseInt(countResult.rows[0].count) : 0;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error getting cable routes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve cable routes',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/cable-routes/stats
 * Get cable route statistics
 */
router.get('/stats', jwtAuth, async (req, res) => {
  try {
    const queries = await Promise.all([
      pool.query("SELECT COUNT(*) FROM network_infrastructure WHERE odp_code IS NOT NULL AND odp_code != ''"),
      pool.query("SELECT COUNT(*) FROM network_infrastructure n JOIN services s ON n.service_id = s.id JOIN customers_view cv ON s.customer_id = cv.id WHERE n.odp_code IS NOT NULL AND n.odp_code != '' AND cv.status = 'active'"),
      pool.query("SELECT COUNT(*) FROM network_infrastructure n JOIN services s ON n.service_id = s.id JOIN customers_view cv ON s.customer_id = cv.id WHERE n.odp_code IS NOT NULL AND n.odp_code != '' AND cv.status != 'active'"),
      pool.query('SELECT 0 as count'), // maintenance - not tracked
      pool.query('SELECT 0 as count'), // damaged - not tracked
      pool.query("SELECT COUNT(DISTINCT odp_code) FROM network_infrastructure WHERE odp_code IS NOT NULL AND odp_code != ''"),
      pool.query("SELECT COUNT(DISTINCT s.customer_id) FROM network_infrastructure n JOIN services s ON n.service_id = s.id WHERE n.odp_code IS NOT NULL AND n.odp_code != ''"),
      pool.query('SELECT AVG(cable_length_meters) FROM network_infrastructure WHERE cable_length_meters IS NOT NULL')
    ]);

    const stats = {
      total_cable_routes: parseInt(queries[0].rows[0].count),
      connected_routes: parseInt(queries[1].rows[0].count),
      disconnected_routes: parseInt(queries[2].rows[0].count),
      maintenance_routes: parseInt(queries[3].rows[0].count),
      damaged_routes: parseInt(queries[4].rows[0].count),
      active_odps: parseInt(queries[5].rows[0].count),
      connected_customers: parseInt(queries[6].rows[0].count),
      average_cable_length: parseFloat(queries[7].rows[0].avg || 0).toFixed(1)
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error getting cable route stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve cable route statistics',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/cable-routes/:id
 * Get specific cable route
 */
router.get('/:id', jwtAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        cr.id,
        cr.odp_id,
        cr.customer_id,
        cr.cable_length,
        cr.port_number,
        cr.status,
        cr.installation_date,
        cr.notes,
        cr.created_at,
        cr.updated_at,
        o.name as odp_name,
        o.code as odp_code,
        o.latitude as odp_latitude,
        o.longitude as odp_longitude,
        c.name as customer_name,
        c.address as customer_address,
        c.latitude as customer_latitude,
        c.longitude as customer_longitude,
        c.phone as customer_phone,
        c.status as customer_status
      FROM cable_routes cr
      LEFT JOIN odps o ON cr.odp_id = o.id
      LEFT JOIN customers_view c ON cr.customer_id = c.customer_code::text
      WHERE cr.id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cable route not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error getting cable route:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve cable route',
      error: error.message
    });
  }
});

/**
 * POST /api/v1/cable-routes
 * Create new cable route
 */
router.post('/', async (req, res) => {
  try {
    const {
      odp_id,
      customer_id,
      cable_length,
      port_number,
      status = 'connected',
      installation_date,
      notes
    } = req.body;

    // Validate required fields
    if (!odp_id || !customer_id) {
      return res.status(400).json({
        success: false,
        message: 'ODP ID and Customer ID are required'
      });
    }

    // Check if ODP exists
    const odpCheck = await pool.query('SELECT id, capacity, used_ports FROM odps WHERE id = $1', [odp_id]);
    if (odpCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ODP not found'
      });
    }

    // Check if customer exists
    const customerCheck = await pool.query('SELECT customer_id FROM customers WHERE customer_id = $1', [customer_id]);
    if (customerCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Check for duplicate routes
    const duplicateCheck = await pool.query(
      'SELECT id FROM cable_routes WHERE odp_id = $1 AND customer_id = $2',
      [odp_id, customer_id]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cable route already exists for this ODP and customer'
      });
    }

    // Check port availability if port_number is specified
    if (port_number) {
      const portCheck = await pool.query(
        'SELECT id FROM cable_routes WHERE odp_id = $1 AND port_number = $2 AND status != \'disconnected\'',
        [odp_id, port_number]
      );

      if (portCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Port ${port_number} is already in use`
        });
      }
    }

    const odp = odpCheck.rows[0];

    // Check capacity
    if (odp.used_ports >= odp.capacity) {
      return res.status(400).json({
        success: false,
        message: 'ODP has reached maximum capacity'
      });
    }

    // Create cable route
    const result = await pool.query(`
      INSERT INTO cable_routes (
        odp_id, customer_id, cable_length, port_number, status,
        installation_date, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `, [
      odp_id, customer_id, cable_length, port_number, status,
      installation_date, notes
    ]);

    // Update ODP used_ports count if route is connected
    if (status === 'connected') {
      await pool.query(
        'UPDATE odps SET used_ports = used_ports + 1 WHERE id = $1',
        [odp_id]
      );
    }

    // Get full details for response
    const fullQuery = `
      SELECT
        cr.id,
        cr.odp_id,
        cr.customer_id,
        cr.cable_length,
        cr.port_number,
        cr.status,
        cr.installation_date,
        cr.notes,
        cr.created_at,
        cr.updated_at,
        o.name as odp_name,
        o.code as odp_code,
        o.latitude as odp_latitude,
        o.longitude as odp_longitude,
        c.name as customer_name,
        c.address as customer_address,
        c.latitude as customer_latitude,
        c.longitude as customer_longitude,
        c.phone as customer_phone,
        c.status as customer_status
      FROM cable_routes cr
      LEFT JOIN odps o ON cr.odp_id = o.id
      LEFT JOIN customers_view c ON cr.customer_id = c.customer_code::text
      WHERE cr.id = $1
    `;

    const fullResult = await pool.query(fullQuery, [result.rows[0].id]);

    res.status(201).json({
      success: true,
      message: 'Cable route created successfully',
      data: fullResult.rows[0]
    });

  } catch (error) {
    console.error('Error creating cable route:', error);

    let statusCode = 500;
    let message = 'Failed to create cable route';

    // Handle specific validation errors
    if (error.message.includes('ODP not found')) {
      statusCode = 404;
      message = 'ODP not found';
    } else if (error.message.includes('Customer not found')) {
      statusCode = 404;
      message = 'Customer not found';
    } else if (error.message.includes('duplicate key')) {
      statusCode = 400;
      message = 'Cable route already exists for this ODP and customer';
    }

    res.status(statusCode).json({
      success: false,
      message,
      error: error.message
    });
  }
});

/**
 * PUT /api/v1/cable-routes/:id
 * Update cable route
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      odp_id,
      customer_id,
      cable_length,
      port_number,
      status,
      installation_date,
      notes
    } = req.body;

    // Get current route to check status change
    const currentRoute = await pool.query('SELECT * FROM cable_routes WHERE id = $1', [id]);

    if (currentRoute.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cable route not found'
      });
    }

    const current = currentRoute.rows[0];
    const statusChanged = status && status !== current.status;
    const odpChanged = odp_id && odp_id !== current.odp_id;

    // Validate ODP exists if changed
    if (odp_id) {
      const odpCheck = await pool.query('SELECT id FROM odps WHERE id = $1', [odp_id]);
      if (odpCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'ODP not found'
        });
      }
    }

    // Validate customer exists if changed
    if (customer_id && customer_id !== current.customer_id) {
      const customerCheck = await pool.query('SELECT customer_id FROM customers WHERE customer_id = $1', [customer_id]);
      if (customerCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Check for duplicate routes
      const duplicateCheck = await pool.query(
        'SELECT id FROM cable_routes WHERE odp_id = $1 AND customer_id = $2 AND id != $3',
        [odp_id || current.odp_id, customer_id, id]
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cable route already exists for this ODP and customer'
        });
      }
    }

    // Check port availability if port_number is changed
    if (port_number && port_number !== current.port_number) {
      const portCheck = await pool.query(
        'SELECT id FROM cable_routes WHERE odp_id = $1 AND port_number = $2 AND id != $3 AND status != \'disconnected\'',
        [odp_id || current.odp_id, port_number, id]
      );

      if (portCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Port ${port_number} is already in use`
        });
      }
    }

    // Update cable route
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (odp_id !== undefined) {
      updateFields.push(`odp_id = $${paramIndex}`);
      updateValues.push(odp_id);
      paramIndex++;
    }

    if (customer_id !== undefined) {
      updateFields.push(`customer_id = $${paramIndex}`);
      updateValues.push(customer_id);
      paramIndex++;
    }

    if (cable_length !== undefined) {
      updateFields.push(`cable_length = $${paramIndex}`);
      updateValues.push(cable_length);
      paramIndex++;
    }

    if (port_number !== undefined) {
      updateFields.push(`port_number = $${paramIndex}`);
      updateValues.push(port_number);
      paramIndex++;
    }

    if (status !== undefined) {
      updateFields.push(`status = $${paramIndex}`);
      updateValues.push(status);
      paramIndex++;
    }

    if (installation_date !== undefined) {
      updateFields.push(`installation_date = $${paramIndex}`);
      updateValues.push(installation_date);
      paramIndex++;
    }

    if (notes !== undefined) {
      updateFields.push(`notes = $${paramIndex}`);
      updateValues.push(notes);
      paramIndex++;
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(id);

    const result = await pool.query(`
      UPDATE cable_routes
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, updateValues);

    // Handle status change - update ODP port counts
    if (statusChanged) {
      const oldStatus = current.status;
      const newStatus = status;
      const routeOdpId = odp_id || current.odp_id;

      if (oldStatus === 'connected' && newStatus !== 'connected') {
        // Disconnecting - decrement port count
        await pool.query(
          'UPDATE odps SET used_ports = used_ports - 1 WHERE id = $1',
          [routeOdpId]
        );
      } else if (oldStatus !== 'connected' && newStatus === 'connected') {
        // Connecting - increment port count
        await pool.query(
          'UPDATE odps SET used_ports = used_ports + 1 WHERE id = $1',
          [routeOdpId]
        );
      }
    }

    // Handle ODP change - update port counts for old and new ODPs
    if (odpChanged && status !== 'disconnected') {
      // Decrement old ODP count
      await pool.query(
        'UPDATE odps SET used_ports = used_ports - 1 WHERE id = $1',
        [current.odp_id]
      );

      // Increment new ODP count
      await pool.query(
        'UPDATE odps SET used_ports = used_ports + 1 WHERE id = $1',
        [odp_id]
      );
    }

    // Get full details for response
    const fullQuery = `
      SELECT
        cr.id,
        cr.odp_id,
        cr.customer_id,
        cr.cable_length,
        cr.port_number,
        cr.status,
        cr.installation_date,
        cr.notes,
        cr.created_at,
        cr.updated_at,
        o.name as odp_name,
        o.code as odp_code,
        o.latitude as odp_latitude,
        o.longitude as odp_longitude,
        c.name as customer_name,
        c.address as customer_address,
        c.latitude as customer_latitude,
        c.longitude as customer_longitude,
        c.phone as customer_phone,
        c.status as customer_status
      FROM cable_routes cr
      LEFT JOIN odps o ON cr.odp_id = o.id
      LEFT JOIN customers_view c ON cr.customer_id = c.customer_code::text
      WHERE cr.id = $1
    `;

    const fullResult = await pool.query(fullQuery, [result.rows[0].id]);

    res.json({
      success: true,
      message: 'Cable route updated successfully',
      data: fullResult.rows[0]
    });

  } catch (error) {
    console.error('Error updating cable route:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cable route',
      error: error.message
    });
  }
});

/**
 * DELETE /api/v1/cable-routes/:id
 * Delete cable route
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get route details before deletion
    const routeQuery = await pool.query(
      'SELECT * FROM cable_routes WHERE id = $1',
      [id]
    );

    if (routeQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cable route not found'
      });
    }

    const route = routeQuery.rows[0];

    // Delete cable route
    await pool.query('DELETE FROM cable_routes WHERE id = $1', [id]);

    // Update ODP used_ports count if route was connected
    if (route.status === 'connected') {
      await pool.query(
        'UPDATE odps SET used_ports = used_ports - 1 WHERE id = $1',
        [route.odp_id]
      );
    }

    res.json({
      success: true,
      message: 'Cable route deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting cable route:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete cable route',
      error: error.message
    });
  }
});

module.exports = router;