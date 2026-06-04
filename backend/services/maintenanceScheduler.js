const { query } = require('../config/database');
const { logger } = require('../config/logger');
const { sendBroadcastNotification, broadcastWebSocket } = require('./broadcast-whatsapp-service');

class MaintenanceScheduler {
  constructor() {
    this.isRunning = false;
    this.checkInterval = 60000; // Check every minute
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Maintenance scheduler is already running');
      return;
    }

    this.isRunning = true;
    logger.info('🕐 Maintenance scheduler started');

    // Run immediately on start
    await this.checkScheduledMessages();

    // Set up interval for regular checks
    this.interval = setInterval(async () => {
      try {
        await this.checkScheduledMessages();
      } catch (error) {
        logger.error('Error in maintenance scheduler:', error);
      }
    }, this.checkInterval);
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.interval) {
      clearInterval(this.interval);
    }
    logger.info('⏹️ Maintenance scheduler stopped');
  }

  async checkScheduledMessages() {
    const now = new Date();

    try {
      // Check for messages to activate
      const activateQuery = `
        UPDATE broadcast_messages
        SET is_active = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE is_scheduled = true
        AND auto_activate = true
        AND is_active = false
        AND scheduled_start_time <= $1
        AND (scheduled_end_time IS NULL OR scheduled_end_time > $1)
        RETURNING *
      `;

      const activateResult = await query(activateQuery, [now]);

      if (activateResult.rows.length > 0) {
        logger.info(`🚀 Activated ${activateResult.rows.length} scheduled broadcast messages`);

        // TODO: Send push notifications for activated messages
        for (const message of activateResult.rows) {
          await this.broadcastActivatedMessage(message);
        }
      }

      // Check for messages to deactivate
      const deactivateQuery = `
        UPDATE broadcast_messages
        SET is_active = false,
            updated_at = CURRENT_TIMESTAMP
        WHERE is_scheduled = true
        AND auto_deactivate = true
        AND is_active = true
        AND (
          scheduled_end_time <= $1
          OR (scheduled_end_time IS NULL AND expires_at <= $1)
        )
        RETURNING id, title
      `;

      const deactivateResult = await query(deactivateQuery, [now]);

      if (deactivateResult.rows.length > 0) {
        logger.info(`🔌 Deactivated ${deactivateResult.rows.length} scheduled broadcast messages`);
      }

      // Check for expired messages
      const expiredQuery = `
        UPDATE broadcast_messages
        SET is_active = false,
            updated_at = CURRENT_TIMESTAMP
        WHERE is_active = true
        AND expires_at <= $1
        RETURNING id, title
      `;

      const expiredResult = await query(expiredQuery, [now]);

      if (expiredResult.rows.length > 0) {
        logger.info(`⏰ Expired ${expiredResult.rows.length} broadcast messages`);
      }

    } catch (error) {
      logger.error('Error checking scheduled messages:', error);
    }
  }

  async broadcastActivatedMessage(message) {
    try {
      logger.info(`📢 Broadcasting message: ${message.title}`);

      // Get full message details including WhatsApp settings
      const messageDetails = await query(
        'SELECT * FROM broadcast_messages WHERE id = $1',
        [message.id]
      );

      if (messageDetails.rows.length === 0) {
        logger.warn(`Message not found: ${message.id}`);
        return;
      }

      const fullMessage = messageDetails.rows[0];

      // Send WhatsApp notification if enabled
      if (fullMessage.send_whatsapp_notification) {
        try {
          const result = await sendBroadcastNotification({
            title: fullMessage.title,
            message: fullMessage.message,
            type: fullMessage.type,
            target_all: fullMessage.target_all,
            target_areas: fullMessage.target_areas,
            whatsapp_template_id: fullMessage.whatsapp_template_id,
            scheduled_start_time: fullMessage.scheduled_start_time,
            scheduled_end_time: fullMessage.scheduled_end_time,
            estimated_duration: fullMessage.estimated_duration
          });

          logger.info(`📱 WhatsApp broadcast completed for ${fullMessage.title}: ${result.sent} sent, ${result.failed} failed`);
        } catch (waError) {
          logger.error('WhatsApp broadcast error:', waError);
          // Don't fail the activation if WhatsApp fails
        }
      }

      // Broadcast to WebSocket for real-time banner updates
      broadcastWebSocket(fullMessage, 'new');

    } catch (error) {
      logger.error('Error broadcasting activated message:', error);
    }
  }

  async getScheduledMaintenance() {
    try {
      const scheduledQuery = `
        SELECT
          bm.*,
          u.name as created_by_name
        FROM broadcast_messages bm
        LEFT JOIN users u ON bm.created_by = u.id
        WHERE bm.is_scheduled = true
        ORDER BY bm.scheduled_start_time ASC
      `;

      const result = await query(scheduledQuery);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching scheduled maintenance:', error);
      return [];
    }
  }

  async getUpcomingMaintenance(days = 7) {
    try {
      const upcomingQuery = `
        SELECT
          bm.*,
          u.name as created_by_name,
          CASE
            WHEN bm.scheduled_start_time > CURRENT_TIMESTAMP THEN
              EXTRACT(EPOCH FROM (bm.scheduled_start_time - CURRENT_TIMESTAMP))/3600
            ELSE 0
          END as hours_until_start,
          CASE
            WHEN bm.scheduled_end_time > CURRENT_TIMESTAMP THEN
              EXTRACT(EPOCH FROM (bm.scheduled_end_time - CURRENT_TIMESTAMP))/3600
            WHEN bm.expires_at > CURRENT_TIMESTAMP THEN
              EXTRACT(EPOCH FROM (bm.expires_at - CURRENT_TIMESTAMP))/3600
            ELSE 0
          END as hours_until_end
        FROM broadcast_messages bm
        LEFT JOIN users u ON bm.created_by = u.id
        WHERE bm.is_scheduled = true
        AND bm.scheduled_start_time <= CURRENT_TIMESTAMP + INTERVAL '${days} days'
        ORDER BY bm.scheduled_start_time ASC
      `;

      const result = await query(upcomingQuery);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching upcoming maintenance:', error);
      return [];
    }
  }

  async createMaintenanceSchedule(maintenanceData) {
    try {
      const {
        title,
        message,
        target_areas,
        target_all,
        scheduled_start_time,
        scheduled_end_time,
        maintenance_type,
        estimated_duration,
        affected_services,
        contact_person,
        backup_plan,
        auto_activate = true,
        auto_deactivate = true,
        send_push_notification = true,
        send_whatsapp_notification = false,
        whatsapp_template_id = null,
        priority = 'high'
      } = maintenanceData;

      const insertQuery = `
        INSERT INTO broadcast_messages (
          title, message, type, priority, target_areas, target_all,
          is_scheduled, scheduled_start_time, scheduled_end_time,
          auto_activate, auto_deactivate, send_push_notification,
          send_whatsapp_notification, whatsapp_template_id,
          maintenance_type, estimated_duration, affected_services,
          contact_person, backup_plan, created_by
        ) VALUES ($1, $2, 'maintenance', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING *
      `;

      const values = [
        title,
        message,
        priority,
        target_all ? null : JSON.stringify(target_areas || []),
        target_all,
        true,
        scheduled_start_time,
        scheduled_end_time,
        auto_activate,
        auto_deactivate,
        send_push_notification,
        send_whatsapp_notification,
        whatsapp_template_id,
        maintenance_type || 'general',
        estimated_duration,
        affected_services || [],
        contact_person,
        backup_plan,
        maintenanceData.created_by
      ];

      const result = await query(insertQuery, values);
      const maintenance = result.rows[0];

      logger.info(`📋 Created maintenance schedule: ${title} starting at ${scheduled_start_time}`);

      return maintenance;
    } catch (error) {
      logger.error('Error creating maintenance schedule:', error);
      throw error;
    }
  }
}

// Create singleton instance
const maintenanceScheduler = new MaintenanceScheduler();

module.exports = maintenanceScheduler;