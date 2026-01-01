const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { query, getOne, getAll } = require('../../../config/database');

// Middleware for customer authentication using customer token
const customerAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Customer token required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Import CustomerTokenService to validate token
    const CustomerTokenService = require('../../../services/customer-token-service');

    const validation = await CustomerTokenService.validateToken(token);

    if (!validation.valid) {
      return res.status(401).json({
        success: false,
        message: validation.error || 'Invalid customer token'
      });
    }

    // Attach customer data to request
    req.customer = validation.customer;
    next();
  } catch (error) {
    logger.error('Customer auth error:', error);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// GET /api/v1/customer-settings/defaults - Get all default settings
router.get('/defaults', async (req, res) => {
  try {
    const result = await query(`
      SELECT field_name, default_value, field_type, description
      FROM customer_default_settings
      ORDER BY field_name
    `);

    // Convert to key-value object for easier frontend usage
    const defaults = {};
    result.rows.forEach(row => {
      defaults[row.field_name] = {
        value: row.default_value,
        type: row.field_type,
        description: row.description
      };
    });

    res.json({
      success: true,
      data: {
        defaults: defaults
      }
    });

  } catch (error) {
    logger.error('Error fetching customer default settings:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil default settings'
    });
  }
});

// PUT /api/v1/customer-settings/defaults - Update default settings
router.put('/defaults', async (req, res) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Settings data is required'
      });
    }

    const updatedSettings = [];
    const errors = [];

    // Update each setting
    for (const [fieldName, data] of Object.entries(settings)) {
      try {
        const value = typeof data === 'object' ? data.value : data;
        const type = typeof data === 'object' ? data.type : 'text';

        // Validate value based on type
        if (type === 'number' && (isNaN(value) || value < 0)) {
          errors.push(`${fieldName}: Invalid number value`);
          continue;
        }

        // For boolean fields, accept both boolean and string representations
        let finalValue = value;
        if (type === 'boolean') {
          if (typeof value === 'boolean') {
            finalValue = value;
          } else if (typeof value === 'string') {
            if (value === 'true' || value === '1' || value === 'yes') {
              finalValue = true;
            } else if (value === 'false' || value === '0' || value === 'no') {
              finalValue = false;
            } else {
              errors.push(`${fieldName}: Invalid boolean value`);
              continue;
            }
          } else {
            errors.push(`${fieldName}: Invalid boolean value`);
            continue;
          }
        }

        await query(`
          INSERT INTO customer_default_settings (field_name, default_value, field_type)
          VALUES ($1, $2, $3)
          ON CONFLICT (field_name)
          DO UPDATE SET
            default_value = $2,
            field_type = $3,
            updated_at = CURRENT_TIMESTAMP
        `, [fieldName, finalValue.toString(), type]);

        updatedSettings.push(fieldName);

      } catch (error) {
        logger.error(`Error updating setting ${fieldName}:`, error);
        errors.push(`${fieldName}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Some settings could not be updated',
        errors: errors
      });
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        updated: updatedSettings
      }
    });

  } catch (error) {
    logger.error('Error updating customer default settings:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengupdate default settings'
    });
  }
});

// GET /api/v1/customer-settings/defaults/:fieldName - Get specific default setting
router.get('/defaults/:fieldName', async (req, res) => {
  try {
    const { fieldName } = req.params;

    const result = await query(`
      SELECT field_name, default_value, field_type, description
      FROM customer_default_settings
      WHERE field_name = $1
    `, [fieldName]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found'
      });
    }

    const setting = result.rows[0];

    res.json({
      success: true,
      data: {
        field_name: setting.field_name,
        default_value: setting.default_value,
        field_type: setting.field_type,
        description: setting.description
      }
    });

  } catch (error) {
    logger.error('Error fetching customer default setting:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil default setting'
    });
  }
});

// POST /api/v1/customer-settings/defaults - Create new default setting
router.post('/defaults', async (req, res) => {
  try {
    const { field_name, default_value, field_type, description } = req.body;

    if (!field_name || !default_value || !field_type) {
      return res.status(400).json({
        success: false,
        message: 'Field name, default value, and field type are required'
      });
    }

    const result = await query(`
      INSERT INTO customer_default_settings (field_name, default_value, field_type, description)
      VALUES ($1, $2, $3, $4)
      RETURNING id, field_name, default_value, field_type, description
    `, [field_name, default_value, field_type, description || null]);

    res.status(201).json({
      success: true,
      message: 'Setting created successfully',
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Error creating customer default setting:', error);

    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        message: 'Setting with this field name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat membuat default setting'
    });
  }
});

// DELETE /api/v1/customer-settings/defaults/:fieldName - Delete default setting
router.delete('/defaults/:fieldName', async (req, res) => {
  try {
    const { fieldName } = req.params;

    const result = await query(`
      DELETE FROM customer_default_settings
      WHERE field_name = $1
      RETURNING field_name
    `, [fieldName]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found'
      });
    }

    res.json({
      success: true,
      message: 'Setting deleted successfully',
      data: {
        deleted_field: result.rows[0].field_name
      }
    });

  } catch (error) {
    logger.error('Error deleting customer default setting:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menghapus default setting'
    });
  }
});

// GET /api/v1/customer-settings/profile - Get customer profile data
router.get('/profile', customerAuth, async (req, res) => {
  try {
    const customer = req.customer;

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get detailed customer data from database
    const customerQuery = `
      SELECT
        c.*,
        p.name as package_name,
        p.price as package_price,
        p.speed as package_speed,
        p.description as package_description,
        r.name as region_name,
        COALESCE(nas.shortname, nas.nasname) as router_name,
        nas.nasname as router_ip
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      LEFT JOIN regions r ON c.region_id = r.id
      LEFT JOIN nas ON (c.router != 'all' AND c.router::text = nas.id::text)
      WHERE c.id = $1
    `;

    const result = await query(customerQuery, [customer.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer data not found'
      });
    }

    const customerData = result.rows[0];

    res.json({
      success: true,
      data: {
        customer: customerData
      }
    });

  } catch (error) {
    logger.error('Error fetching customer profile:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil data profil'
    });
  }
});

// PUT /api/v1/customer-settings/profile - Update customer profile
router.put('/profile', customerAuth, async (req, res) => {
  try {
    const customer = req.customer;
    const { name, email, phone, address } = req.body;

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const updateQuery = `
      UPDATE customers SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        address = COALESCE($4, address),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;

    const result = await query(updateQuery, [name, email, phone, address, customer.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Failed to update customer'
      });
    }

    res.json({
      success: true,
      data: {
        customer: result.rows[0]
      },
      message: 'Profile berhasil diperbarui'
    });

  } catch (error) {
    logger.error('Error updating customer profile:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memperbarui profil'
    });
  }
});

module.exports = router;