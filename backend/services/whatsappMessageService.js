const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class WhatsAppMessageService {
    // Save a new message to database
    async saveMessage(messageData) {
        try {
            const {
                recipient,
                message,
                status = 'pending',
                messageType = 'Direct Message',
                broadcastId,
                templateId,
                scheduledAt,
                maxAttempts = 3
            } = messageData;

            // Check if we need auto-cleanup before saving new message
            await this.autoCleanup();

            const result = await query(`
                INSERT INTO whatsapp_messages (
                    id, recipient, message, status, message_type,
                    broadcast_id, template_id, scheduled_at, max_attempts, created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP
                ) RETURNING *
            `, [
                uuidv4(),
                recipient,
                message,
                status,
                messageType,
                broadcastId || null,
                templateId || null,
                scheduledAt || null,
                maxAttempts
            ]);

            console.log(`💾 [DB] Message saved to database: ${result.rows[0].id}`);
            return result.rows[0];
        } catch (error) {
            console.error('❌ [DB] Failed to save message:', error);
            throw error;
        }
    }

    // Update message status
    async updateMessageStatus(messageId, updates) {
        try {
            const setClause = [];
            const values = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(updates)) {
                if (value !== undefined) {
                    setClause.push(`${key} = $${paramIndex}`);
                    values.push(value);
                    paramIndex++;
                }
            }

            if (setClause.length === 0) return null;

            setClause.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(messageId);

            const result = await query(`
                UPDATE whatsapp_messages
                SET ${setClause.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *
            `, values);

            if (result.rows.length > 0) {
                console.log(`🔄 [DB] Message ${messageId} updated:`, updates);
                return result.rows[0];
            }
            return null;
        } catch (error) {
            console.error(`❌ [DB] Failed to update message ${messageId}:`, error);
            throw error;
        }
    }

    // Get message history with pagination and filters
    async getMessageHistory(filters = {}) {
        try {
            const {
                page = 1,
                limit = 20,
                status,
                template,
                dateFrom,
                dateTo,
                recipient
            } = filters;

            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            const offset = (pageNum - 1) * limitNum;

            let whereClause = 'WHERE 1=1';
            let queryParams = [];
            let paramIndex = 1;

            // Add filters
            if (status && status !== 'all') {
                whereClause += ` AND status = $${paramIndex}`;
                queryParams.push(status);
                paramIndex++;
            }

            if (template) {
                whereClause += ` AND template_id ILIKE $${paramIndex}`;
                queryParams.push(`%${template}%`);
                paramIndex++;
            }

            if (recipient) {
                whereClause += ` AND recipient ILIKE $${paramIndex}`;
                queryParams.push(`%${recipient}%`);
                paramIndex++;
            }

            if (dateFrom) {
                whereClause += ` AND created_at >= $${paramIndex}`;
                queryParams.push(dateFrom);
                paramIndex++;
            }

            if (dateTo) {
                whereClause += ` AND created_at <= $${paramIndex}`;
                queryParams.push(dateTo);
                paramIndex++;
            }

            // Count query
            const countQuery = `SELECT COUNT(*) as total FROM whatsapp_messages ${whereClause}`;
            const countResult = await query(countQuery, queryParams);
            const total = parseInt(countResult.rows[0].total);

            // Data query
            const dataQuery = `
                SELECT
                    id,
                    recipient,
                    message,
                    status,
                    message_type,
                    broadcast_id,
                    template_id,
                    error_message,
                    attempts,
                    scheduled_at,
                    sent_at,
                    failed_at,
                    created_at,
                    updated_at
                FROM whatsapp_messages
                ${whereClause}
                ORDER BY created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;

            queryParams.push(limitNum, offset);
            const dataResult = await query(dataQuery, queryParams);

            // Format messages for API compatibility
            const messages = dataResult.rows.map(msg => ({
                id: msg.id,
                time: this.getTimeAgo(msg.sent_at || msg.failed_at || msg.created_at),
                type: msg.message_type,
                recipient: msg.recipient,
                status: msg.status === 'sent' ? 'success' : msg.status,
                message: msg.message,
                error: msg.error_message,
                attempts: msg.attempts,
                sentAt: msg.sent_at,
                failedAt: msg.failed_at,
                scheduledAt: msg.scheduled_at,
                createdAt: msg.created_at,
                broadcastId: msg.broadcast_id,
                templateId: msg.template_id
            }));

            return {
                messages,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum),
                    hasNext: pageNum < Math.ceil(total / limitNum),
                    hasPrev: pageNum > 1
                }
            };
        } catch (error) {
            console.error('❌ [DB] Failed to get message history:', error);
            throw error;
        }
    }

    // Get messages for queue management
    async getQueueMessages() {
        try {
            const result = await query(`
                SELECT
                    id,
                    recipient,
                    message,
                    status,
                    message_type,
                    broadcast_id,
                    template_id,
                    attempts,
                    max_attempts,
                    scheduled_at,
                    created_at
                FROM whatsapp_messages
                WHERE status IN ('pending', 'processing', 'scheduled')
                ORDER BY
                    CASE
                        WHEN status = 'processing' THEN 1
                        WHEN status = 'pending' THEN 2
                        WHEN status = 'scheduled' THEN 3
                    END,
                    created_at ASC
            `);

            const pending = [];
            const processing = [];
            const scheduled = [];

            result.rows.forEach(msg => {
                const messageObj = {
                    id: msg.id,
                    recipient: msg.recipient,
                    message: msg.message,
                    status: msg.status,
                    type: msg.message_type,
                    broadcastId: msg.broadcast_id,
                    templateId: msg.template_id,
                    attempts: msg.attempts,
                    maxAttempts: msg.max_attempts,
                    scheduledAt: msg.scheduled_at,
                    createdAt: msg.created_at
                };

                switch (msg.status) {
                    case 'pending':
                        pending.push(messageObj);
                        break;
                    case 'processing':
                        processing.push(messageObj);
                        break;
                    case 'scheduled':
                        scheduled.push(messageObj);
                        break;
                }
            });

            return {
                pending,
                processing,
                scheduled,
                summary: {
                    pending: pending.length,
                    processing: processing.length,
                    scheduled: scheduled.length,
                    total: pending.length + processing.length + scheduled.length
                }
            };
        } catch (error) {
            console.error('❌ [DB] Failed to get queue messages:', error);
            throw error;
        }
    }

    // Get scheduled messages that need to be sent
    async getPendingScheduledMessages() {
        try {
            const result = await query(`
                SELECT * FROM whatsapp_messages
                WHERE status = 'scheduled'
                AND scheduled_at <= CURRENT_TIMESTAMP
                ORDER BY scheduled_at ASC
            `);

            return result.rows.map(msg => ({
                id: msg.id,
                recipient: msg.recipient,
                message: msg.message,
                status: msg.status,
                type: msg.message_type,
                broadcastId: msg.broadcast_id,
                templateId: msg.template_id,
                attempts: msg.attempts,
                maxAttempts: msg.max_attempts,
                scheduledAt: msg.scheduled_at,
                createdAt: msg.created_at
            }));
        } catch (error) {
            console.error('❌ [DB] Failed to get pending scheduled messages:', error);
            throw error;
        }
    }

    // Get queue statistics
    async getQueueStats() {
        try {
            const result = await query(`
                SELECT
                    status,
                    COUNT(*) as count
                FROM whatsapp_messages
                GROUP BY status
            `);

            const stats = {
                pending: 0,
                processing: 0,
                sent: 0,
                failed: 0,
                scheduled: 0
            };

            result.rows.forEach(row => {
                if (stats.hasOwnProperty(row.status)) {
                    stats[row.status] = parseInt(row.count);
                }
            });

            return stats;
        } catch (error) {
            console.error('❌ [DB] Failed to get queue stats:', error);
            throw error;
        }
    }

    // Clear queue by status
    async clearQueue(status = 'pending') {
        try {
            let whereClause = 'WHERE status = $1';
            let clearedCount = 0;

            if (status === 'all') {
                whereClause = 'WHERE status IN ($1, $2, $3)';
                const result = await query(`
                    DELETE FROM whatsapp_messages
                    WHERE status IN ('pending', 'processing', 'failed')
                    RETURNING id
                `, ['pending', 'processing', 'failed']);
                clearedCount = result.rows.length;
            } else {
                const result = await query(`
                    DELETE FROM whatsapp_messages
                    ${whereClause}
                    RETURNING id
                `, [status]);
                clearedCount = result.rows.length;
            }

            console.log(`🧹 [DB] Cleared ${clearedCount} messages from ${status} queue`);
            return clearedCount;
        } catch (error) {
            console.error('❌ [DB] Failed to clear queue:', error);
            throw error;
        }
    }

    // Check message history count and provide cleanup suggestions
    async getMessageHistoryStats() {
        try {
            const result = await query(`
                SELECT
                    COUNT(*) as total_messages,
                    COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_messages,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_messages,
                    COUNT(CASE WHEN status = 'pending' OR status = 'processing' THEN 1 END) as active_messages,
                    COUNT(CASE WHEN status = 'scheduled' THEN 1 END) as scheduled_messages,
                    MIN(created_at) as oldest_message,
                    MAX(created_at) as newest_message
                FROM whatsapp_messages
            `);

            const stats = result.rows[0];
            const totalMessages = parseInt(stats.total_messages);

            // Define limits and warnings
            const WARNING_THRESHOLD = 800;
            const CRITICAL_THRESHOLD = 950;
            const MAX_MESSAGES = 1000;

            let storageLevel = 'normal';
            let warningMessage = null;
            let needsCleanup = false;

            if (totalMessages >= MAX_MESSAGES) {
                storageLevel = 'critical';
                warningMessage = `Storage capacity reached (${totalMessages}/${MAX_MESSAGES} messages). Cleanup required immediately.`;
                needsCleanup = true;
            } else if (totalMessages >= CRITICAL_THRESHOLD) {
                storageLevel = 'warning';
                warningMessage = `Storage almost full (${totalMessages}/${MAX_MESSAGES} messages). Consider cleaning up soon.`;
                needsCleanup = true;
            } else if (totalMessages >= WARNING_THRESHOLD) {
                storageLevel = 'caution';
                warningMessage = `Storage getting full (${totalMessages}/${MAX_MESSAGES} messages). Plan cleanup soon.`;
            }

            return {
                totalMessages,
                sentMessages: parseInt(stats.sent_messages),
                failedMessages: parseInt(stats.failed_messages),
                activeMessages: parseInt(stats.active_messages),
                scheduledMessages: parseInt(stats.scheduled_messages),
                oldestMessage: stats.oldest_message,
                newestMessage: stats.newest_message,
                storageLevel,
                warningMessage,
                needsCleanup,
                limits: {
                    max: MAX_MESSAGES,
                    warning: WARNING_THRESHOLD,
                    critical: CRITICAL_THRESHOLD
                },
                storagePercentage: Math.round((totalMessages / MAX_MESSAGES) * 100)
            };
        } catch (error) {
            console.error('❌ [DB] Failed to get message history stats:', error);
            throw error;
        }
    }

    // Clean up old messages (keep most recent N messages)
    async cleanupOldMessages(keepCount = 500) {
        try {
            console.log(`🧹 [DB] Starting cleanup - keeping latest ${keepCount} messages`);

            // Get the cutoff date (keep the most recent N messages)
            const cutoffResult = await query(`
                WITH ordered_messages AS (
                    SELECT created_at
                    FROM whatsapp_messages
                    ORDER BY created_at DESC
                    OFFSET $1
                    LIMIT 1
                )
                SELECT created_at as cutoff_date
                FROM ordered_messages
            `, [keepCount]);

            if (cutoffResult.rows.length === 0) {
                console.log('ℹ️ [DB] No messages to cleanup');
                return { deletedCount: 0, keptCount: 0 };
            }

            const cutoffDate = cutoffResult.rows[0].cutoff_date;

            // Delete older messages
            const deleteResult = await query(`
                DELETE FROM whatsapp_messages
                WHERE created_at < $1
                RETURNING id, status, created_at
            `, [cutoffDate]);

            const deletedCount = deleteResult.rows.length;

            // Get remaining count
            const remainingResult = await query('SELECT COUNT(*) as count FROM whatsapp_messages');
            const remainingCount = parseInt(remainingResult.rows[0].count);

            console.log(`✅ [DB] Cleanup completed: ${deletedCount} messages deleted, ${remainingCount} messages remaining`);

            return {
                deletedCount,
                keptCount: remainingCount,
                cutoffDate,
                deletedMessages: deleteResult.rows
            };
        } catch (error) {
            console.error('❌ [DB] Failed to cleanup old messages:', error);
            throw error;
        }
    }

    // Auto cleanup when approaching limit
    async autoCleanup() {
        try {
            const stats = await this.getMessageHistoryStats();

            if (stats.needsCleanup && stats.totalMessages >= 900) {
                console.log(`🔄 [DB] Auto-cleanup triggered - ${stats.totalMessages} messages, cleaning up to 800`);
                return await this.cleanupOldMessages(800);
            }

            return { deletedCount: 0, message: 'No cleanup needed' };
        } catch (error) {
            console.error('❌ [DB] Auto-cleanup failed:', error);
            throw error;
        }
    }

    // Helper function to convert timestamp to "time ago" format
    getTimeAgo(timestamp) {
        if (!timestamp) return 'Unknown time';

        const now = new Date();
        const past = new Date(timestamp);
        const diffMs = now - past;

        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMinutes < 1) {
            return 'Just now';
        } else if (diffMinutes < 60) {
            return `${diffMinutes} min ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else if (diffDays < 7) {
            return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        } else {
            return past.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: past.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
            });
        }
    }
}

module.exports = new WhatsAppMessageService();