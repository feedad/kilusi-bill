/**
 * Telegram Notification Service
 * Sends notifications to admin via Telegram Bot API
 */

const { logger } = require('../config/logger');
const { query } = require('../config/database');

class TelegramService {
    constructor() {
        this.baseUrl = 'https://api.telegram.org/bot';
        this.config = null;
    }

    /**
     * Load configuration from database
     */
    async loadConfig() {
        try {
            const result = await query(`
        SELECT key, value FROM app_config 
        WHERE key IN ('telegram_bot_token', 'telegram_chat_id', 'telegram_enabled')
      `);

            this.config = {};
            for (const row of result.rows) {
                this.config[row.key] = row.value;
            }

            return this.config;
        } catch (error) {
            logger.error('Failed to load Telegram config:', error);
            return null;
        }
    }

    /**
     * Check if Telegram is enabled and configured
     */
    async isEnabled() {
        if (!this.config) {
            await this.loadConfig();
        }

        return this.config &&
            this.config.telegram_enabled === 'true' &&
            this.config.telegram_bot_token &&
            this.config.telegram_chat_id;
    }

    /**
     * Send a text message via Telegram
     * @param {string} message - Message text (supports Markdown)
     */
    async sendMessage(message) {
        if (!await this.isEnabled()) {
            logger.debug('Telegram notifications disabled or not configured');
            return { success: false, reason: 'disabled' };
        }

        try {
            const url = `${this.baseUrl}${this.config.telegram_bot_token}/sendMessage`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.config.telegram_chat_id,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });

            const data = await response.json();

            if (data.ok) {
                logger.info(`✅ Telegram message sent to chat ${this.config.telegram_chat_id}`);
                return { success: true, message_id: data.result.message_id };
            } else {
                logger.error('Telegram API error:', data);
                return { success: false, error: data.description };
            }
        } catch (error) {
            logger.error('Failed to send Telegram message:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send a photo with caption via Telegram
     * @param {string} caption - Photo caption (supports Markdown)
     * @param {string} photoPath - Local file path or URL
     */
    async sendPhoto(caption, photoPath) {
        if (!await this.isEnabled()) {
            logger.debug('Telegram notifications disabled or not configured');
            return { success: false, reason: 'disabled' };
        }

        try {
            const url = `${this.baseUrl}${this.config.telegram_bot_token}/sendPhoto`;
            const fs = require('fs');
            const path = require('path');
            const FormData = require('form-data');

            const form = new FormData();
            form.append('chat_id', this.config.telegram_chat_id);
            form.append('caption', caption);
            form.append('parse_mode', 'Markdown');

            // Check if photoPath is a URL or local file
            if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) {
                form.append('photo', photoPath);
            } else {
                // Local file
                const absolutePath = path.isAbsolute(photoPath) ? photoPath : path.join(process.cwd(), photoPath);
                if (fs.existsSync(absolutePath)) {
                    form.append('photo', fs.createReadStream(absolutePath));
                } else {
                    logger.error('Photo file not found:', absolutePath);
                    return { success: false, error: 'File not found' };
                }
            }

            const response = await fetch(url, {
                method: 'POST',
                body: form
            });

            const data = await response.json();

            if (data.ok) {
                logger.info(`✅ Telegram photo sent to chat ${this.config.telegram_chat_id}`);
                return { success: true, message_id: data.result.message_id };
            } else {
                logger.error('Telegram API error:', data);
                return { success: false, error: data.description };
            }
        } catch (error) {
            logger.error('Failed to send Telegram photo:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send payment proof notification
     * @param {Object} data - Payment data
     */
    async sendPaymentProofNotification(data) {
        const message = `
💳 *BUKTI PEMBAYARAN BARU*

*Customer:* ${data.customerName}
*No. Invoice:* ${data.invoiceNumber}
*Jumlah:* Rp ${parseInt(data.amount).toLocaleString('id-ID')}
*Tanggal:* ${new Date().toLocaleString('id-ID')}

_Silakan verifikasi di dashboard admin._
`;

        if (data.proofUrl) {
            return await this.sendPhoto(message, data.proofUrl);
        } else {
            return await this.sendMessage(message);
        }
    }

    /**
     * Send system alert notification
     * @param {string} title - Alert title
     * @param {string} message - Alert message
     */
    async sendSystemAlert(title, message) {
        const alertMessage = `
🚨 *SYSTEM ALERT*

*${title}*

${message}

_${new Date().toLocaleString('id-ID')}_
`;

        return await this.sendMessage(alertMessage);
    }

    /**
     * Send new ticket notification
     * @param {Object} ticket - Ticket data
     */
    async sendNewTicketNotification(ticket) {
        const message = `
🎫 *TIKET BARU*

*ID:* #${ticket.id}
*Customer:* ${ticket.customerName}
*Subjek:* ${ticket.subject}
*Prioritas:* ${ticket.priority}

_${ticket.message ? ticket.message.substring(0, 100) + '...' : ''}_
`;

        return await this.sendMessage(message);
    }

    /**
     * Store notification in database for history
     */
    async storeNotification(type, title, message, data = {}) {
        try {
            await query(`
        INSERT INTO admin_notifications (type, title, message, data)
        VALUES ($1, $2, $3, $4)
      `, [type, title, message, JSON.stringify(data)]);
        } catch (error) {
            logger.error('Failed to store notification:', error);
        }
    }
}

// Export singleton instance
module.exports = new TelegramService();
