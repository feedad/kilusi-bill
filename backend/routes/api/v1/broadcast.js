const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const maintenanceScheduler = require('../../../services/maintenanceScheduler');
const { logger } = require('../../../config/logger');

// GET / - Get all broadcast messages
router.get('/', async (req, res) => {
  try {
    const messagesQuery = `
      SELECT
        bm.*,
        u.username as created_by_name
      FROM broadcast_messages bm
      LEFT JOIN users u ON bm.created_by = u.id
      ORDER BY bm.priority ASC, bm.created_at DESC
    `;

    const result = await query(messagesQuery);
    
    // Map fields to frontend expected format
    const broadcasts = result.rows.map(row => ({
      id: row.id.toString(),
      title: row.title,
      content: row.message,
      type: row.type === 'informasi' ? 'info' : row.type === 'gangguan' ? 'error' : row.type === 'maintenance' ? 'warning' : row.type === 'selesai' ? 'success' : row.type,
      isActive: row.is_active,
      startDate: row.created_at,
      endDate: row.expires_at,
      priority: row.priority || 99,
      createdAt: row.created_at,
      target_all: row.target_all,
      target_areas: row.target_areas
    }));

    res.json({
      success: true,
      broadcasts: broadcasts,
      data: {
        messages: result.rows
      }
    });
  } catch (error) {
    console.error('Error fetching broadcast messages:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil data pesan broadcast'
    });
  }
});

// GET /messages - Alias for GET / (frontend compatibility)
router.get('/messages', async (req, res) => {
  try {
    const messagesQuery = `
      SELECT
        bm.*,
        u.username as created_by_name
      FROM broadcast_messages bm
      LEFT JOIN users u ON bm.created_by = u.id
      ORDER BY bm.created_at DESC
    `;

    const result = await query(messagesQuery);

    res.json({
      success: true,
      data: {
        messages: result.rows
      }
    });
  } catch (error) {
    console.error('Error fetching broadcast messages:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil data pesan broadcast'
    });
  }
});

// POST / - Create new broadcast message
router.post('/', async (req, res) => {
  try {
    const {
      title,
      message,
      type,
      priority,
      target_areas,
      target_all,
      is_active,
      send_push_notification,
      expires_at,
      content // Destructure content from request body
    } = req.body;

    // Map content to message if present
    const messageContent = message || content;

    // Validate required fields
    if (!title || !messageContent) {
      return res.status(400).json({
        success: false,
        message: 'Judul dan pesan harus diisi'
      });
    }

    const createdBy = parseInt(req.user.id) || 1; // Default to admin user ID 1 if conversion fails
    const expiresAt = expires_at ? new Date(expires_at) : null;

    const insertQuery = `
      INSERT INTO broadcast_messages (
        title, message, type, priority, target_areas, target_all,
        is_active, send_push_notification, expires_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const values = [
      title,
      messageContent,
      type || 'info',
      priority || 'medium',
      target_all ? null : JSON.stringify(target_areas || []),
      target_all !== undefined ? target_all : true, // Default to true (broadcast to all)
      is_active !== undefined ? is_active : true,   // Default to active
      send_push_notification || false,              // Default to false
      expiresAt,
      createdBy
    ];

    const result = await query(insertQuery, values);
    const newMessage = result.rows[0];

    // WebSocket Broadcasting
    try {
      const io = global.io;
      if (io) {
        const broadcastEvent = {
          type: 'new',
          message: newMessage,
          timestamp: new Date().toISOString()
        };

        // Broadcast to all customer rooms
        io.emit('broadcast:new', broadcastEvent);

        // Broadcast to specific regions if targeted
        if (target_areas && !target_all) {
          target_areas.forEach(region => {
            io.to(`region-${region}`).emit('broadcast:new', broadcastEvent);
          });
        }

        // Broadcast to all customers if target_all is true
        if (target_all) {
          io.emit('broadcast:new', broadcastEvent);
        }

        logger.info(`📡 Broadcast message sent to ${target_all ? 'all customers' : target_areas?.length + ' regions'}: ${title}`);
      }
    } catch (wsError) {
      logger.error('WebSocket broadcast error:', wsError);
    }

    // Send Push Notifications if enabled
    if (send_push_notification) {
      try {
        // This would integrate with a push notification service
        // For now, we'll just log it
        logger.info(`📱 Push notification enabled for broadcast: ${title}`);
        // TODO: Implement actual push notification service
      } catch (pnError) {
        logger.error('Push notification error:', pnError);
      }
    }

    // Log the broadcast event
    logger.info(`📢 New broadcast message created: ID=${newMessage.id}, Type=${type}, Priority=${priority}`);

    res.status(201).json({
      success: true,
      message: 'Pesan broadcast berhasil dibuat',
      data: {
        message: newMessage
      }
    });
  } catch (error) {
    console.error('Error creating broadcast message:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat membuat pesan broadcast'
    });
  }
});

// PUT /:id - Update broadcast message
router.put('/:id', async (req, res) => {
  try {
    const messageId = req.params.id;
    const {
      title,
      message,
      content, // Allow content as alias for message
      type,
      priority,
      target_areas,
      target_all,
      is_active,
      send_push_notification,
      expires_at
    } = req.body;

    // Check if message exists
    const existingMessageQuery = `SELECT * FROM broadcast_messages WHERE id = $1`;
    const existingResult = await query(existingMessageQuery, [messageId]);

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pesan broadcast tidak ditemukan'
      });
    }

    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updateFields.push(`title = $${paramIndex++}`);
      values.push(title);
    }

    const messageContent = message || content;
    if (messageContent !== undefined) {
      updateFields.push(`message = $${paramIndex++}`);
      values.push(messageContent);
    }
    if (type !== undefined) {
      updateFields.push(`type = $${paramIndex++}`);
      values.push(type);
    }
    if (priority !== undefined) {
      updateFields.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }
    if (target_areas !== undefined) {
      updateFields.push(`target_areas = $${paramIndex++}`);
      values.push(target_all ? null : JSON.stringify(target_areas));
    }
    if (target_all !== undefined) {
      updateFields.push(`target_all = $${paramIndex++}`);
      values.push(target_all);
    }
    if (is_active !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }
    if (send_push_notification !== undefined) {
      updateFields.push(`send_push_notification = $${paramIndex++}`);
      values.push(send_push_notification);
    }
    if (expires_at !== undefined) {
      updateFields.push(`expires_at = $${paramIndex++}`);
      values.push(expires_at ? new Date(expires_at) : null);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada field yang akan diperbarui'
      });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(messageId);

    const updateQuery = `
      UPDATE broadcast_messages
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(updateQuery, values);
    const updatedMessage = result.rows[0];

    // WebSocket Broadcasting for updates
    try {
      const io = global.io;
      if (io) {
        const broadcastEvent = {
          type: 'update',
          message: updatedMessage,
          timestamp: new Date().toISOString()
        };

        // Broadcast to all customers
        io.emit('broadcast:update', broadcastEvent);

        // Broadcast to specific regions if targeted
        if (updatedMessage.target_areas && !updatedMessage.target_all) {
          const targetAreas = Array.isArray(updatedMessage.target_areas)
            ? updatedMessage.target_areas
            : JSON.parse(updatedMessage.target_areas || '[]');

          targetAreas.forEach(region => {
            io.to(`region-${region}`).emit('broadcast:update', broadcastEvent);
          });
        }

        logger.info(`📡 Broadcast message updated: ID=${updatedMessage.id}, Active=${updatedMessage.is_active}`);
      }
    } catch (wsError) {
      logger.error('WebSocket update broadcast error:', wsError);
    }

    res.json({
      success: true,
      message: 'Pesan broadcast berhasil diperbarui',
      data: {
        message: updatedMessage
      }
    });
  } catch (error) {
    console.error('Error updating broadcast message:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memperbarui pesan broadcast'
    });
  }
});

// DELETE /:id - Delete broadcast message
router.delete('/:id', async (req, res) => {
  try {
    const messageId = req.params.id;

    // Check if message exists
    const existingMessageQuery = `SELECT * FROM broadcast_messages WHERE id = $1`;
    const existingResult = await query(existingMessageQuery, [messageId]);

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pesan broadcast tidak ditemukan'
      });
    }

    // Delete the message
    const deleteQuery = `DELETE FROM broadcast_messages WHERE id = $1`;
    await query(deleteQuery, [messageId]);

    // WebSocket Broadcasting for deletion
    try {
      const io = global.io;
      if (io) {
        const broadcastEvent = {
          type: 'delete',
          message: { id: messageId }, // Send minimal data since message is deleted
          timestamp: new Date().toISOString()
        };

        // Broadcast to all customers
        io.emit('broadcast:delete', broadcastEvent);

        logger.info(`📡 Broadcast message deleted: ID=${messageId}`);
      }
    } catch (wsError) {
      logger.error('WebSocket delete broadcast error:', wsError);
    }

    res.json({
      success: true,
      message: 'Pesan broadcast berhasil dihapus'
    });
  } catch (error) {
    console.error('Error deleting broadcast message:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menghapus pesan broadcast'
    });
  }
});

// GET /active - Get active messages for customer display
router.get('/active', async (req, res) => {
  try {
    const customerId = req.query.customer_id;
    const customerRegion = req.query.region;

    let whereClause = `
      WHERE is_active = true
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `;
    const queryParams = [];
    let paramIndex = 1;

    if (customerId) {
      // Get customer's region from database
      const customerQuery = `SELECT area FROM customers WHERE id = $1`;
      const customerResult = await query(customerQuery, [customerId]);

      if (customerResult.rows.length > 0) {
        const customerRegionName = customerResult.rows[0].area;

        whereClause += ` AND (
          target_all = true
          OR target_areas IS NULL
          OR $${paramIndex} = ANY(string_to_array(replace(target_areas::text, '"', ''), ','))
        `;
        queryParams.push(customerRegionName);
        paramIndex++;
      }
    } else if (customerRegion) {
      whereClause += ` AND (
        target_all = true
        OR target_areas IS NULL
        OR $${paramIndex} = ANY(string_to_array(replace(target_areas::text, '"', ''), ','))
      )`;
      queryParams.push(customerRegion);
      paramIndex++;
    }

    const messagesQuery = `
      SELECT *
      FROM broadcast_messages
      ${whereClause}
      ORDER BY
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        created_at DESC
    `;

    const result = await query(messagesQuery, queryParams);

    res.json({
      success: true,
      data: {
        messages: result.rows
      }
    });
  } catch (error) {
    console.error('Error fetching active broadcast messages:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil pesan aktif'
    });
  }
});

// Maintenance Scheduling Endpoints

// POST /api/v1/broadcast/maintenance/schedule - Schedule maintenance
router.post('/maintenance/schedule', async (req, res) => {
  try {
    const maintenanceData = {
      ...req.body,
      created_by: req.user.id
    };

    // Validate required fields
    if (!maintenanceData.title || !maintenanceData.message || !maintenanceData.scheduled_start_time) {
      return res.status(400).json({
        success: false,
        message: 'Judul, pesan, dan waktu mulai harus diisi'
      });
    }

    const maintenance = await maintenanceScheduler.createMaintenanceSchedule(maintenanceData);

    res.status(201).json({
      success: true,
      message: 'Jadwal maintenance berhasil dibuat',
      data: {
        maintenance
      }
    });
  } catch (error) {
    console.error('Error creating maintenance schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat membuat jadwal maintenance'
    });
  }
});

// GET /api/v1/broadcast/maintenance/scheduled - Get all scheduled maintenance
router.get('/maintenance/scheduled', async (req, res) => {
  try {
    const scheduledMaintenance = await maintenanceScheduler.getScheduledMaintenance();

    res.json({
      success: true,
      data: {
        scheduled_maintenance: scheduledMaintenance
      }
    });
  } catch (error) {
    console.error('Error fetching scheduled maintenance:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil jadwal maintenance'
    });
  }
});

// GET /api/v1/broadcast/maintenance/upcoming - Get upcoming maintenance
router.get('/maintenance/upcoming', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const upcomingMaintenance = await maintenanceScheduler.getUpcomingMaintenance(days);

    res.json({
      success: true,
      data: {
        upcoming_maintenance: upcomingMaintenance
      }
    });
  } catch (error) {
    console.error('Error fetching upcoming maintenance:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil maintenance yang akan datang'
    });
  }
});

// POST /schedule - Schedule any broadcast message
router.post('/schedule', async (req, res) => {
  try {
    const {
      title,
      message,
      type,
      priority,
      target_areas,
      target_all,
      scheduled_start_time,
      scheduled_end_time,
      auto_activate,
      auto_deactivate,
      send_push_notification,
      expires_at,
      maintenance_type,
      estimated_duration,
      affected_services,
      contact_person,
      backup_plan
    } = req.body;

    // Validate required fields
    if (!title || !message || !scheduled_start_time) {
      return res.status(400).json({
        success: false,
        message: 'Judul, pesan, dan waktu mulai harus diisi'
      });
    }

    const insertQuery = `
      INSERT INTO broadcast_messages (
        title, message, type, priority, target_areas, target_all,
        is_scheduled, scheduled_start_time, scheduled_end_time,
        auto_activate, auto_deactivate, send_push_notification,
        expires_at, maintenance_type, estimated_duration, affected_services,
        contact_person, backup_plan, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `;

    const values = [
      title,
      message,
      type || 'info',
      priority || 'medium',
      target_all ? null : JSON.stringify(target_areas || []),
      target_all,
      true,
      scheduled_start_time,
      scheduled_end_time,
      auto_activate !== undefined ? auto_activate : true,
      auto_deactivate !== undefined ? auto_deactivate : true,
      send_push_notification !== undefined ? send_push_notification : true,
      expires_at ? new Date(expires_at) : null,
      maintenance_type,
      estimated_duration,
      affected_services || [],
      contact_person,
      backup_plan,
      req.user.id
    ];

    const result = await query(insertQuery, values);
    const scheduledMessage = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'Pesan broadcast berhasil dijadwalkan',
      data: {
        message: scheduledMessage
      }
    });
  } catch (error) {
    console.error('Error scheduling broadcast message:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menjadwalkan pesan broadcast'
    });
  }
});

module.exports = router;