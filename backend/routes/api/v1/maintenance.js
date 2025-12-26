const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const maintenanceScheduler = require('../../../services/maintenanceScheduler');
const { logger } = require('../../../config/logger');

// GET / - Get all maintenance schedules
router.get('/', async (req, res) => {
  try {
    const maintenanceQuery = `
      SELECT
        id,
        title,
        message as description,
        scheduled_start_time as "startTime",
        scheduled_end_time as "endTime",
        target_areas as "affectedAreas",
        send_push_notification as "notifyCustomers",
        created_at as "createdAt",
        is_active,
        is_scheduled
      FROM broadcast_messages
      WHERE type = 'maintenance'
      ORDER BY scheduled_start_time DESC
    `;

    const result = await query(maintenanceQuery);

    // Map database results to frontend interface
    const maintenances = result.rows.map(row => {
      let status = 'scheduled';
      const now = new Date();
      const start = new Date(row.startTime);
      const end = new Date(row.endTime);

      if (row.is_active) {
        status = 'in_progress';
      } else if (end < now) {
        status = 'completed';
      } else if (!row.is_scheduled) {
        status = 'cancelled';
      }

      // Parse target_areas if string
      let affectedAreas = [];
      if (typeof row.affectedAreas === 'string') {
        try {
          affectedAreas = JSON.parse(row.affectedAreas);
        } catch (e) {
          affectedAreas = []; // or split by comma if CSV
        }
      } else if (Array.isArray(row.affectedAreas)) {
        affectedAreas = row.affectedAreas;
      }

      return {
        id: row.id.toString(),
        title: row.title,
        description: row.description,
        startTime: row.startTime,
        endTime: row.endTime,
        affectedAreas: affectedAreas,
        status: status,
        notifyCustomers: row.notifyCustomers,
        notificationSent: false, // TODO: Track this in DB
        createdAt: row.createdAt
      };
    });

    res.json({
      success: true,
      maintenances
    });
  } catch (error) {
    logger.error('Error fetching maintenances:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil jadwal maintenance'
    });
  }
});

// POST / - Create new maintenance
router.post('/', async (req, res) => {
  try {
    const {
      title,
      description,
      startTime,
      endTime,
      affectedAreas,
      status, // ignored for creation, defaults to scheduled logic
      notifyCustomers
    } = req.body;

    const maintenanceData = {
      title,
      message: description,
      scheduled_start_time: startTime,
      scheduled_end_time: endTime,
      target_areas: affectedAreas,
      target_all: !affectedAreas || affectedAreas.length === 0,
      send_push_notification: notifyCustomers,
      maintenance_type: 'general',
      created_by: req.user.id || 1, // Fallback to admin ID 1
      auto_activate: true,
      auto_deactivate: true
    };

    const newMaintenance = await maintenanceScheduler.createMaintenanceSchedule(maintenanceData);

    res.status(201).json({
      success: true,
      message: 'Jadwal maintenance berhasil dibuat',
      data: newMaintenance
    });
  } catch (error) {
    logger.error('Error creating maintenance:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat membuat jadwal maintenance'
    });
  }
});

// PUT /:id - Update maintenance
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      startTime,
      endTime,
      affectedAreas,
      notifyCustomers
    } = req.body;

    const updateQuery = `
      UPDATE broadcast_messages
      SET
        title = $1,
        message = $2,
        scheduled_start_time = $3,
        scheduled_end_time = $4,
        target_areas = $5,
        target_all = $6,
        send_push_notification = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND type = 'maintenance'
      RETURNING *
    `;

    const targetAreasJson = JSON.stringify(affectedAreas || []);
    const targetAll = !affectedAreas || affectedAreas.length === 0;

    const result = await query(updateQuery, [
      title,
      description,
      startTime,
      endTime,
      targetAreasJson,
      targetAll,
      notifyCustomers,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Jadwal maintenance tidak ditemukan'
      });
    }

    res.json({
      success: true,
      message: 'Jadwal maintenance berhasil diperbarui',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error updating maintenance:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memperbarui jadwal maintenance'
    });
  }
});

// PUT /:id/status - Update maintenance status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    let isActive = false;
    let isScheduled = true;

    if (status === 'in_progress') {
      isActive = true;
    } else if (status === 'completed') {
      isActive = false;
      isScheduled = true; // Still scheduled record
    } else if (status === 'cancelled') {
      isActive = false;
      isScheduled = false;
    }

    const updateQuery = `
      UPDATE broadcast_messages
      SET
        is_active = $1,
        is_scheduled = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND type = 'maintenance'
      RETURNING *
    `;

    const result = await query(updateQuery, [isActive, isScheduled, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Jadwal maintenance tidak ditemukan'
      });
    }

    res.json({
      success: true,
      message: 'Status maintenance berhasil diperbarui',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error updating maintenance status:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memperbarui status maintenance'
    });
  }
});

// DELETE /:id - Delete maintenance
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deleteQuery = `
      DELETE FROM broadcast_messages
      WHERE id = $1 AND type = 'maintenance'
    `;

    const result = await query(deleteQuery, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Jadwal maintenance tidak ditemukan'
      });
    }

    res.json({
      success: true,
      message: 'Jadwal maintenance berhasil dihapus'
    });
  } catch (error) {
    logger.error('Error deleting maintenance:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menghapus jadwal maintenance'
    });
  }
});

// POST /:id/notify - Send notification manually
router.post('/:id/notify', async (req, res) => {
  try {
    const { id } = req.params;

    // TODO: Implement actual notification sending via WhatsApp service
    // For now, just mark it as possibly handled or log it
    
    // Check if exists
    const checkQuery = `SELECT * FROM broadcast_messages WHERE id = $1 AND type = 'maintenance'`;
    const checkResult = await query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Jadwal maintenance tidak ditemukan'
      });
    }

    const maintenance = checkResult.rows[0];
    logger.info(`🔔 Sending manual notification for maintenance: ${maintenance.title}`);

    res.json({
      success: true,
      message: 'Notifikasi sedang dikirim'
    });
  } catch (error) {
    logger.error('Error sending notification:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengirim notifikasi'
    });
  }
});

module.exports = router;
