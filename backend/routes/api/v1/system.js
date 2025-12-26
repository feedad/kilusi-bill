const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// GET /api/v1/system/status - Get system status
router.get('/status', async (req, res) => {
  try {
    // Check for active maintenance schedules
    const maintenanceQuery = `
      SELECT
        id,
        title,
        message,
        scheduled_start_time,
        scheduled_end_time,
        maintenance_type,
        affected_services,
        created_at,
        is_active,
        priority
      FROM broadcast_messages
      WHERE type = 'maintenance'
        AND is_active = true
        AND (
          scheduled_start_time <= NOW()
          AND (scheduled_end_time >= NOW() OR scheduled_end_time IS NULL)
        )
      ORDER BY priority DESC, scheduled_start_time DESC
    `;

    const maintenanceResult = await query(maintenanceQuery);

    // Check database connection health
    let dbHealth = 'healthy';
    let dbError = null;
    try {
      await query('SELECT 1');
    } catch (err) {
      dbHealth = 'down';
      dbError = err.message;
      logger.error('Database health check failed:', err);
    }

    // Check for critical system errors (you can expand this based on your needs)
    const criticalErrors = [];

    // Example: Check for failed billing operations
    const failedJobsQuery = `
      SELECT COUNT(*) as failed_count
      FROM invoices
      WHERE status = 'failed'
        AND created_at > NOW() - INTERVAL '1 hour'
    `;

    const failedJobsResult = await query(failedJobsQuery);
    if (parseInt(failedJobsResult.rows[0].failed_count) > 10) {
      criticalErrors.push({
        id: 1,
        message: 'High number of failed billing operations detected',
        service: 'billing',
        timestamp: new Date().toISOString()
      });
    }

    // Example: Check for RADIUS service health
    let radiusHealth = 'healthy';
    try {
      // This is a placeholder - you'd implement actual RADIUS health check
      const radiusCheck = await query('SELECT 1 LIMIT 1');
      if (radiusCheck.rows.length > 0) {
        radiusHealth = 'healthy';
      }
    } catch (err) {
      radiusHealth = 'down';
      criticalErrors.push({
        id: 2,
        message: 'RADIUS authentication service unavailable',
        service: 'radius',
        timestamp: new Date().toISOString()
      });
    }

    // Check for active maintenance mode
    const maintenanceMode = maintenanceResult.rows.length > 0;
    const activeMaintenance = maintenanceResult.rows[0] || null;

    // Determine overall system health
    let systemHealth = 'healthy';
    if (criticalErrors.length > 0 || dbHealth === 'down' || radiusHealth === 'down') {
      systemHealth = 'down';
    } else if (maintenanceMode) {
      systemHealth = 'degraded';
    }

    // Service status details
    const services = [
      {
        name: 'Database',
        status: dbHealth === 'healthy' ? 'online' : dbHealth === 'down' ? 'offline' : 'degraded',
        last_check: new Date().toISOString(),
        description: dbError || 'Operating normally'
      },
      {
        name: 'RADIUS',
        status: radiusHealth === 'healthy' ? 'online' : radiusHealth === 'down' ? 'offline' : 'degraded',
        last_check: new Date().toISOString(),
        description: 'Authentication service'
      },
      {
        name: 'Billing',
        status: criticalErrors.some(e => e.service === 'billing') ? 'degraded' : 'online',
        last_check: new Date().toISOString(),
        description: 'Invoice and payment processing'
      },
      {
        name: 'WhatsApp',
        status: 'online', // You could implement actual WhatsApp service health check
        last_check: new Date().toISOString(),
        description: 'Notification service'
      },
      {
        name: 'Web Service',
        status: 'online',
        last_check: new Date().toISOString(),
        description: 'Customer portal and admin dashboard'
      }
    ];

    const response = {
      success: true,
      data: {
        maintenance_mode: maintenanceMode,
        maintenance_message: activeMaintenance?.message,
        maintenance_start: activeMaintenance?.scheduled_start_time,
        maintenance_end: activeMaintenance?.scheduled_end_time,
        maintenance_type: activeMaintenance?.maintenance_type,
        affected_services: activeMaintenance?.affected_services || [],
        system_health: systemHealth,
        services: services,
        critical_errors: criticalErrors.length > 0 ? criticalErrors : undefined,
        last_updated: new Date().toISOString()
      }
    };

    res.json(response);

  } catch (error) {
    logger.error('Error getting system status:', error);

    // Return degraded status if we can't get full status
    res.json({
      success: true,
      data: {
        maintenance_mode: false,
        system_health: 'degraded',
        services: [
          {
            name: 'System Monitor',
            status: 'degraded',
            last_check: new Date().toISOString(),
            description: 'Unable to fetch complete system status'
          }
        ],
        last_updated: new Date().toISOString()
      }
    });
  }
});

// POST /api/v1/system/maintenance/enable - Enable maintenance mode
router.post('/maintenance/enable', async (req, res) => {
  try {
    const { message, start_time, end_time, maintenance_type, affected_services } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Maintenance message is required'
      });
    }

    // Create maintenance broadcast message
    const insertQuery = `
      INSERT INTO broadcast_messages (
        title, message, type, priority, target_all, is_active,
        scheduled_start_time, scheduled_end_time, maintenance_type,
        affected_services, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      'Scheduled Maintenance',
      message,
      'maintenance',
      'high',
      true,
      true,
      start_time || new Date().toISOString(),
      end_time,
      maintenance_type || 'scheduled',
      affected_services || [],
      1 // System user ID
    ];

    const result = await query(insertQuery, values);
    const maintenance = result.rows[0];

    logger.info(`Maintenance mode enabled: ${message}`);

    res.json({
      success: true,
      message: 'Maintenance mode enabled successfully',
      data: maintenance
    });

  } catch (error) {
    logger.error('Error enabling maintenance mode:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to enable maintenance mode'
    });
  }
});

// POST /api/v1/system/maintenance/disable - Disable maintenance mode
router.post('/maintenance/disable', async (req, res) => {
  try {
    // Deactivate all maintenance messages
    const updateQuery = `
      UPDATE broadcast_messages
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE type = 'maintenance' AND is_active = true
    `;

    await query(updateQuery);

    logger.info('Maintenance mode disabled');

    res.json({
      success: true,
      message: 'Maintenance mode disabled successfully'
    });

  } catch (error) {
    logger.error('Error disabling maintenance mode:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disable maintenance mode'
    });
  }
});

// GET /api/v1/system/health - Simple health check endpoint
router.get('/health', async (req, res) => {
  try {
    // Basic health check
    await query('SELECT 1');

    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      }
    });

  } catch (error) {
    res.status(503).json({
      success: false,
      data: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      }
    });
  }
});

module.exports = router;