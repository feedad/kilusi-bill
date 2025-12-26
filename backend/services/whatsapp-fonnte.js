/**
 * Fonnte WhatsApp Gateway Service
 * API Documentation: https://fonnte.com/api
 * 
 * This service provides integration with Fonnte WhatsApp API
 * for sending notifications and messages.
 */

const axios = require('axios');
const { logger } = require('../config/logger');

class WhatsAppFonnte {
    constructor(config = {}) {
        this.apiToken = config.api_token || process.env.FONNTE_API_TOKEN;
        this.baseUrl = 'https://api.fonnte.com';
        this.countryCode = config.country_code || '62'; // Indonesia default
    }

    /**
     * Check if the gateway is properly configured
     * @returns {boolean}
     */
    isConfigured() {
        return !!(this.apiToken && this.apiToken.length > 0);
    }

    /**
     * Format phone number for Fonnte
     * @param {string} phoneNumber - Phone number to format
     * @returns {string} Formatted phone number
     */
    formatPhoneNumber(phoneNumber) {
        if (!phoneNumber) return '';

        // Remove all non-digit characters
        let cleaned = phoneNumber.replace(/\D/g, '');

        // Handle Indonesian format
        if (cleaned.startsWith('0')) {
            cleaned = this.countryCode + cleaned.slice(1);
        } else if (!cleaned.startsWith(this.countryCode)) {
            cleaned = this.countryCode + cleaned;
        }

        return cleaned;
    }

    /**
     * Send text message via Fonnte
     * @param {string} to - Recipient phone number
     * @param {string} message - Message content
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} API response
     */
    async sendTextMessage(to, message, options = {}) {
        try {
            if (!this.isConfigured()) {
                throw new Error('Fonnte API token not configured');
            }

            const target = this.formatPhoneNumber(to);

            const data = {
                target: target,
                message: message,
                countryCode: this.countryCode,
                ...options
            };

            const response = await axios.post(`${this.baseUrl}/send`, data, {
                headers: {
                    'Authorization': this.apiToken,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            if (response.data.status === true || response.data.status === 'true') {
                logger.info(`[FONNTE] Message sent to ${target}`);
                return {
                    success: true,
                    data: response.data,
                    messageId: response.data.id || null
                };
            } else {
                logger.warn(`[FONNTE] Failed to send message: ${response.data.reason || 'Unknown error'}`);
                return {
                    success: false,
                    error: response.data.reason || response.data.detail || 'Failed to send message'
                };
            }
        } catch (error) {
            logger.error(`[FONNTE] Error sending message to ${to}:`, error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.reason || error.message
            };
        }
    }

    /**
     * Send media message via Fonnte
     * @param {string} to - Recipient phone number
     * @param {string} mediaUrl - Public URL of the media
     * @param {string} caption - Caption for the media
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} API response
     */
    async sendMediaMessage(to, mediaUrl, caption = '', options = {}) {
        try {
            if (!this.isConfigured()) {
                throw new Error('Fonnte API token not configured');
            }

            const target = this.formatPhoneNumber(to);

            const data = {
                target: target,
                url: mediaUrl,
                message: caption,
                countryCode: this.countryCode,
                ...options
            };

            const response = await axios.post(`${this.baseUrl}/send`, data, {
                headers: {
                    'Authorization': this.apiToken,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            if (response.data.status === true || response.data.status === 'true') {
                logger.info(`[FONNTE] Media sent to ${target}`);
                return {
                    success: true,
                    data: response.data,
                    messageId: response.data.id || null
                };
            } else {
                logger.warn(`[FONNTE] Failed to send media: ${response.data.reason || 'Unknown error'}`);
                return {
                    success: false,
                    error: response.data.reason || response.data.detail || 'Failed to send media'
                };
            }
        } catch (error) {
            logger.error(`[FONNTE] Error sending media to ${to}:`, error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.reason || error.message
            };
        }
    }

    /**
     * Send bulk messages via Fonnte
     * @param {Array<{to: string, message: string}>} messages - Array of messages
     * @param {Object} options - Additional options like delay
     * @returns {Promise<Object>} API response
     */
    async sendBulkMessages(messages, options = {}) {
        try {
            if (!this.isConfigured()) {
                throw new Error('Fonnte API token not configured');
            }

            // Fonnte supports comma-separated targets for bulk send
            const targets = messages.map(m => this.formatPhoneNumber(m.to)).join(',');

            // For bulk with same message
            if (messages.every(m => m.message === messages[0].message)) {
                const data = {
                    target: targets,
                    message: messages[0].message,
                    countryCode: this.countryCode,
                    delay: options.delay || '2-5', // Random delay between messages
                    ...options
                };

                const response = await axios.post(`${this.baseUrl}/send`, data, {
                    headers: {
                        'Authorization': this.apiToken,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000
                });

                logger.info(`[FONNTE] Bulk messages sent to ${messages.length} recipients`);
                return {
                    success: response.data.status === true || response.data.status === 'true',
                    data: response.data,
                    count: messages.length
                };
            } else {
                // Different messages - send individually
                const results = [];
                for (const msg of messages) {
                    const result = await this.sendTextMessage(msg.to, msg.message);
                    results.push({ ...result, to: msg.to });

                    // Add small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                const successCount = results.filter(r => r.success).length;
                return {
                    success: successCount > 0,
                    data: results,
                    successCount,
                    failedCount: results.length - successCount
                };
            }
        } catch (error) {
            logger.error('[FONNTE] Error sending bulk messages:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Check device/connection status
     * @returns {Promise<Object>} Device status
     */
    async getDeviceStatus() {
        try {
            if (!this.isConfigured()) {
                return {
                    success: false,
                    connected: false,
                    error: 'API token not configured'
                };
            }

            const response = await axios.post(`${this.baseUrl}/device`, {}, {
                headers: {
                    'Authorization': this.apiToken,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            return {
                success: true,
                connected: response.data.status === true || response.data.device?.status === 'connect',
                data: response.data
            };
        } catch (error) {
            logger.error('[FONNTE] Error getting device status:', error.message);
            return {
                success: false,
                connected: false,
                error: error.message
            };
        }
    }
}

module.exports = WhatsAppFonnte;
