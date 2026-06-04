/**
 * Omnichat Message Logs API Routes
 *
 * Routes for accessing WhatsApp message logs and statistics
 *
 * @module routes/api/v1/omnichat-logs
 */

const express = require('express');
const router = express.Router();
const messageLogger = require('../../../services/omnichat-message-logger');
const { logger } = require('../../../config/logger');
const { getPool } = require('../../../config/database');

// Note: JWT authentication is handled at the router level in index.js

/**
 * GET /api/v1/omnichat/logs
 * Get message logs with filtering
 */
router.get('/logs', async (req, res) => {
    try {
        const {
            phone_number,
            customer_id,
            status,
            notification_type,
            date_from,
            date_to,
            limit = 100,
            offset = 0
        } = req.query;

        const filters = {
            phone_number,
            customer_id: customer_id ? parseInt(customer_id) : undefined,
            status,
            notification_type,
            date_from: date_from ? new Date(date_from) : undefined,
            date_to: date_to ? new Date(date_to) : undefined,
            limit: parseInt(limit),
            offset: parseInt(offset)
        };

        // Remove undefined values
        Object.keys(filters).forEach(key => {
            if (filters[key] === undefined) delete filters[key];
        });

        logger.info('[OmnichatLogs] Fetching message logs', filters);

        const result = await messageLogger.getMessageLogs(filters);

        res.json({
            success: true,
            data: result.logs,
            pagination: {
                total: result.total,
                limit: result.limit,
                offset: result.offset
            }
        });
    } catch (error) {
        logger.error('[OmnichatLogs] Error fetching logs:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil riwayat pesan',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/omnichat/logs/statistics
 * Get message statistics
 */
router.get('/logs/statistics', async (req, res) => {
    try {
        const { date_from, date_to } = req.query;

        const filters = {
            date_from: date_from ? new Date(date_from) : undefined,
            date_to: date_to ? new Date(date_to) : undefined
        };

        logger.info('[OmnichatLogs] Fetching statistics', filters);

        const stats = await messageLogger.getStatistics(filters);

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error('[OmnichatLogs] Error fetching statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil statistik',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/omnichat/logs/message/:messageId
 * Get specific message by WhatsApp message ID
 */
router.get('/logs/message/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;

        logger.info('[OmnichatLogs] Fetching message by ID', { messageId });

        const message = await messageLogger.getByMessageId(messageId);

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Pesan tidak ditemukan'
            });
        }

        res.json({
            success: true,
            data: message
        });
    } catch (error) {
        logger.error('[OmnichatLogs] Error fetching message:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil pesan',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/omnichat/logs/customer/:customerId
 * Get all messages for a customer
 */
router.get('/logs/customer/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;
        const { limit = 50, offset = 0 } = req.query;

        logger.info('[OmnichatLogs] Fetching messages for customer', { customerId });

        const result = await messageLogger.getMessageLogs({
            customer_id: parseInt(customerId),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            data: result.logs,
            pagination: {
                total: result.total,
                limit: result.limit,
                offset: result.offset
            }
        });
    } catch (error) {
        logger.error('[OmnichatLogs] Error fetching customer messages:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil pesan pelanggan',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/omnichat/logs/:messageId
 * Get specific message by internal ID (not WhatsApp message ID)
 */
router.get('/logs/:id', async (req, res) => {
    try {
        const { id } = req.params;

        logger.info('[OmnichatLogs] Fetching message by internal ID', { id });

        const message = await messageLogger.getById(id);

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Pesan tidak ditemukan'
            });
        }

        res.json({
            success: true,
            data: message
        });
    } catch (error) {
        logger.error('[OmnichatLogs] Error fetching message:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil pesan',
            error: error.message
        });
    }
});

/**
 * POST /api/v1/omnichat/logs/:messageId/resend
 * Resend a message (optionally to a new phone number)
 */
router.post('/logs/:messageId/resend', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { phone_number } = req.body;

        logger.info('[OmnichatLogs] Resending message', { messageId, phone_number });

        // Get the original message
        const message = await messageLogger.getByMessageId(messageId);

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Pesan tidak ditemukan'
            });
        }

        // Use new phone number if provided, otherwise use original
        const targetPhone = phone_number || message.phone_number;

        // Send the message using provider routing (Meta template if available)
        const whatsappNotifications = require('../../../config/whatsapp-notifications');
        const result = await whatsappNotifications.sendNotification(targetPhone, message.message_content, {
            notification_type: message.notification_type || 'general',
            customer_id: message.customer_id,
            customer_name: message.customer_name,
            billing_context: message.billing_context
        });

        // Log the new message
        if (result.success) {
            const newMessageId = result.data?.messageId || result.data?.data?.messages?.[0]?.id || `resend_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Check if message with this ID already exists (duplicate from WhatsApp API)
            const existing = await messageLogger.getByMessageId(newMessageId);

            // Only log if this is a new message (not duplicate)
            if (!existing) {
                await messageLogger.logMessage({
                    message_id: newMessageId,
                    phone_number: targetPhone,
                    customer_id: message.customer_id,
                    customer_name: message.customer_name,
                    message_type: message.message_type,
                    message_content: message.message_content,
                    notification_type: message.notification_type,
                    billing_context: message.billing_context,
                    status: 'sent',
                    provider: 'omnichat',
                    original_message_id: messageId,
                    is_resend: true
                });
            }
        }

        res.json({
            success: result.success,
            message: result.success
                ? phone_number
                  ? `Pesan berhasil dikirim ulang ke ${targetPhone}`
                  : 'Pesan berhasil dikirim ulang'
                : 'Gagal mengirim pesan',
            data: result.data
        });
    } catch (error) {
        logger.error('[OmnichatLogs] Error resending message:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengirim ulang pesan',
            error: error.message
        });
    }
});

/**
 * POST /api/v1/omnichat/logs/webhook
 * Webhook endpoint for status updates from Omnichat/WhatsApp
 * This should be called by Omnichat when message status changes
 */
router.post('/logs/webhook', async (req, res) => {
    try {
        const { message_id, status, webhook_data } = req.body;

        if (!message_id || !status) {
            return res.status(400).json({
                success: false,
                message: 'message_id dan status wajib diisi'
            });
        }

        logger.info('[OmnichatLogs] Webhook received', { message_id, status });

        const updated = await messageLogger.updateMessageStatus(
            message_id,
            status,
            webhook_data
        );

        if (!updated) {
            return res.status(404).json({
                success: false,
                message: 'Pesan tidak ditemukan'
            });
        }

        res.json({
            success: true,
            data: updated
        });
    } catch (error) {
        logger.error('[OmnichatLogs] Error processing webhook:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memproses webhook',
            error: error.message
        });
    }
});

/**
 * DELETE /api/v1/omnichat/logs
 * Cleanup old message logs. Query params: older_than_days (default 30)
 */
router.delete('/logs', async (req, res) => {
  try {
    const days = parseInt(req.query.older_than_days) || 30;
    const pool = getPool();
    if (!pool) throw new Error('Database pool not initialized');

    const result = await pool.query(
      `DELETE FROM omnichat_message_logs WHERE created_at < NOW() - INTERVAL '${days} days'`
    );

    res.json({
      success: true,
      message: `${result.rowCount} pesan log berhasil dibersihkan (lebih dari ${days} hari)`,
      deleted: result.rowCount,
      older_than_days: days
    });
  } catch (error) {
    logger.error('[OmnichatLogs] Error cleaning up logs:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal membersihkan log',
      error: error.message
    });
  }
});

module.exports = router;
