/**
 * Omnichat Message Logger Service
 *
 * Logs all WhatsApp messages to database for tracking and analytics
 *
 * @module services/omnichat-message-logger
 */

const { Pool } = require('pg');
const { logger } = require('../config/logger');

// Database pool
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DATABASE || 'kilusi_bill',
  user: process.env.POSTGRES_USER || 'kilusi_user',
  password: process.env.POSTGRES_PASSWORD || 'kilusi17!'
});

/**
 * Log a message sent via Omnichat
 *
 * @param {Object} data - Message data
 * @param {string} data.message_id - WhatsApp message ID
 * @param {string} data.phone_number - Recipient phone number
 * @param {number} data.customer_id - Customer ID (optional)
 * @param {string} data.customer_name - Customer name (optional)
 * @param {string} data.message_type - Type: text, template, etc.
 * @param {string} data.message_content - Message content
 * @param {string} data.template_name - Template name (if applicable)
 * @param {Array} data.template_parameters - Template parameters (if applicable)
 * @param {Object} data.billing_context - Billing related data
 * @param {string} data.notification_type - Notification type
 * @param {string} data.provider - Provider name (default: omnichat)
 * @param {string} data.phone_number_id - WhatsApp phone number ID
 * @param {string} data.sent_via - How it was sent: api, dashboard, billing_system
 * @param {number} data.sent_by - User ID who sent (optional)
 * @param {Object} data.omnichat_response - Full Omnichat response
 * @returns {Promise<Object>} Created log record
 */
async function logMessage(data) {
  try {
    const query = `
      INSERT INTO omnichat_message_logs (
        message_id,
        phone_number,
        customer_id,
        customer_name,
        message_type,
        message_content,
        template_name,
        template_parameters,
        billing_context,
        notification_type,
        provider,
        phone_number_id,
        sent_via,
        sent_by,
        omnichat_response,
        status,
        sent_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW()
      )
      RETURNING *
    `;

    const values = [
      data.message_id,
      data.phone_number,
      data.customer_id || null,
      data.customer_name || null,
      data.message_type || 'text',
      data.message_content || null,
      data.template_name || null,
      data.template_parameters ? JSON.stringify(data.template_parameters) : null,
      data.billing_context ? JSON.stringify(data.billing_context) : null,
      data.notification_type || null,
      data.provider || 'omnichat',
      data.phone_number_id || null,
      data.sent_via || 'api',
      data.sent_by || null,
      data.omnichat_response ? JSON.stringify(data.omnichat_response) : null,
      data.status || 'sent'
    ];

    const result = await pool.query(query, values);

    logger.info('[MessageLogger] Message logged', {
      message_id: data.message_id,
      phone: data.phone_number,
      type: data.notification_type
    });

    return result.rows[0];
  } catch (error) {
    logger.error('[MessageLogger] Error logging message:', error);
    throw error;
  }
}

/**
 * Update message status (delivered, read, failed)
 *
 * @param {string} messageId - WhatsApp message ID
 * @param {string} status - New status
 * @param {Object} webhookData - Webhook data (optional)
 * @returns {Promise<Object>} Updated log record
 */
async function updateMessageStatus(messageId, status, webhookData = null) {
  try {
    const updateFields = ['status = $2'];
    const values = [messageId, status];
    let paramCount = 2;

    // Set timestamp based on status
    if (status === 'delivered') {
      updateFields.push(`delivered_at = NOW()`);
    } else if (status === 'read') {
      updateFields.push(`read_at = NOW()`);
      updateFields.push(`delivered_at = COALESCE(delivered_at, NOW())`);
    } else if (status === 'failed') {
      updateFields.push(`retry_count = retry_count + 1`);
    }

    // Add webhook data if provided
    if (webhookData) {
      paramCount++;
      updateFields.push(`webhook_received_at = NOW()`);
      updateFields.push(`webhook_data = $${paramCount}`);
      values.push(JSON.stringify(webhookData));
    }

    const query = `
      UPDATE omnichat_message_logs
      SET ${updateFields.join(', ')}
      WHERE message_id = $1
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      logger.warn('[MessageLogger] Message not found for status update', { messageId });
      return null;
    }

    logger.info('[MessageLogger] Message status updated', {
      message_id: messageId,
      status
    });

    return result.rows[0];
  } catch (error) {
    logger.error('[MessageLogger] Error updating message status:', error);
    throw error;
  }
}

/**
 * Log failed message
 *
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} errorMessage - Error message
 * @param {Object} context - Additional context
 * @returns {Promise<Object>} Created log record
 */
async function logFailedMessage(phoneNumber, errorMessage, context = {}) {
  try {
    const query = `
      INSERT INTO omnichat_message_logs (
        phone_number,
        customer_id,
        customer_name,
        message_type,
        message_content,
        notification_type,
        sent_via,
        status,
        error_message,
        sent_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'failed', $8, NOW()
      )
      RETURNING *
    `;

    const values = [
      phoneNumber,
      context.customer_id || null,
      context.customer_name || null,
      context.message_type || 'text',
      context.message_content || null,
      context.notification_type || null,
      context.sent_via || 'api',
      errorMessage
    ];

    const result = await pool.query(query, values);

    logger.warn('[MessageLogger] Failed message logged', {
      phone: phoneNumber,
      error: errorMessage
    });

    return result.rows[0];
  } catch (error) {
    logger.error('[MessageLogger] Error logging failed message:', error);
    throw error;
  }
}

/**
 * Get message logs with filtering
 *
 * @param {Object} filters - Filter criteria
 * @param {string} filters.phone_number - Filter by phone number
 * @param {number} filters.customer_id - Filter by customer ID
 * @param {string} filters.status - Filter by status
 * @param {string} filters.notification_type - Filter by notification type
 * @param {Date} filters.date_from - Start date
 * @param {Date} filters.date_to - End date
 * @param {number} filters.limit - Max records (default: 100)
 * @param {number} filters.offset - Offset for pagination
 * @returns {Promise<Array>} Array of message logs
 */
async function getMessageLogs(filters = {}) {
  try {
    const conditions = [];
    const values = [];
    let paramCount = 0;

    // Build conditions
    if (filters.phone_number) {
      paramCount++;
      conditions.push(`phone_number = $${paramCount}`);
      values.push(filters.phone_number);
    }

    if (filters.customer_id) {
      paramCount++;
      conditions.push(`customer_id = $${paramCount}`);
      values.push(filters.customer_id);
    }

    if (filters.status) {
      paramCount++;
      conditions.push(`status = $${paramCount}`);
      values.push(filters.status);
    }

    if (filters.notification_type) {
      paramCount++;
      conditions.push(`notification_type = $${paramCount}`);
      values.push(filters.notification_type);
    }

    if (filters.date_from) {
      paramCount++;
      conditions.push(`created_at >= $${paramCount}`);
      values.push(filters.date_from);
    }

    if (filters.date_to) {
      paramCount++;
      conditions.push(`created_at <= $${paramCount}`);
      values.push(filters.date_to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const query = `
      SELECT
        id,
        message_id,
        phone_number,
        customer_id,
        customer_name,
        message_type,
        message_content,
        template_name,
        notification_type,
        status,
        error_message,
        sent_via,
        created_at,
        sent_at,
        delivered_at,
        read_at
      FROM omnichat_message_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const result = await pool.query(query, values);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM omnichat_message_logs
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, values);

    return {
      logs: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    };
  } catch (error) {
    logger.error('[MessageLogger] Error getting message logs:', error);
    throw error;
  }
}

/**
 * Get message statistics
 *
 * @param {Object} filters - Date filters
 * @param {Date} filters.date_from - Start date
 * @param {Date} filters.date_to - End date
 * @returns {Promise<Object>} Statistics
 */
async function getStatistics(filters = {}) {
  try {
    const conditions = [];
    const values = [];
    let paramCount = 0;

    if (filters.date_from) {
      paramCount++;
      conditions.push(`created_at >= $${paramCount}`);
      values.push(filters.date_from);
    }

    if (filters.date_to) {
      paramCount++;
      conditions.push(`created_at <= $${paramCount}`);
      values.push(filters.date_to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        COUNT(*) as total_messages,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status = 'read' THEN 1 END) as read,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN notification_type = 'invoice_created' THEN 1 END) as invoice_created,
        COUNT(CASE WHEN notification_type = 'payment_received' THEN 1 END) as payment_received,
        COUNT(CASE WHEN notification_type = 'payment_reminder' THEN 1 END) as payment_reminder,
        COUNT(CASE WHEN message_type = 'template' THEN 1 END) as template_messages,
        COUNT(CASE WHEN message_type = 'text' THEN 1 END) as text_messages
      FROM omnichat_message_logs
      ${whereClause}
    `;

    const result = await pool.query(query, values);

    return result.rows[0];
  } catch (error) {
    logger.error('[MessageLogger] Error getting statistics:', error);
    throw error;
  }
}

/**
 * Get message by internal database ID
 *
 * @param {number} id - Internal database ID
 * @returns {Promise<Object>} Message log
 */
async function getById(id) {
  try {
    const result = await pool.query(
      'SELECT * FROM omnichat_message_logs WHERE id = $1',
      [id]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error('[MessageLogger] Error getting message by internal ID:', error);
    throw error;
  }
}

/**
 * Get message by WhatsApp message ID
 *
 * @param {string} messageId - WhatsApp message ID
 * @returns {Promise<Object>} Message log
 */
async function getByMessageId(messageId) {
  try {
    const result = await pool.query(
      'SELECT * FROM omnichat_message_logs WHERE message_id = $1',
      [messageId]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error('[MessageLogger] Error getting message by ID:', error);
    throw error;
  }
}

module.exports = {
  logMessage,
  updateMessageStatus,
  logFailedMessage,
  getMessageLogs,
  getStatistics,
  getById,
  getByMessageId,

  // Close connection pool
  close: () => pool.end()
};
