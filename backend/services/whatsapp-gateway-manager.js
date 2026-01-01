/**
 * WhatsApp Gateway Manager
 * 
 * Unified interface for multiple WhatsApp gateways:
 * - Baileys (unofficial, for commands/interaction)
 * - Cloud API (official Meta API, for notifications)
 * - Fonnte (third-party, for notifications)
 * 
 * Strategy:
 * - Baileys: Interactive commands, real-time chat
 * - Cloud API / Fonnte: Outbound notifications (billing, payments, etc.)
 */

const { logger } = require('../config/logger');
const { getSettingsWithCache, getSetting } = require('../config/settingsManager');

// Import gateway services
const WhatsAppFonnte = require('./whatsapp-fonnte');
const WhatsAppCloudAPI = require('./whatsapp-cloud-api');

// Gateway types
const GATEWAY_TYPES = {
    BAILEYS: 'baileys',
    CLOUD_API: 'cloud_api',
    FONNTE: 'fonnte'
};

class WhatsAppGatewayManager {
    constructor() {
        this.gateways = {};
        this.activeGateway = GATEWAY_TYPES.BAILEYS; // Default
        this.notificationGateway = null; // For outbound notifications

        this.initializeGateways();
    }

    /**
     * Initialize available gateways based on settings
     */
    initializeGateways() {
        try {
            const settings = getSettingsWithCache();
            const waSettings = settings.whatsapp_gateway || {};

            // Set active gateway for notifications
            this.notificationGateway = waSettings.notification_gateway || null;

            // Initialize Fonnte if configured
            if (waSettings.fonnte?.enabled && waSettings.fonnte?.api_token) {
                try {
                    this.gateways.fonnte = new WhatsAppFonnte({
                        api_token: waSettings.fonnte.api_token,
                        country_code: waSettings.fonnte.country_code || '62'
                    });
                    logger.info('[WA_GATEWAY] Fonnte gateway initialized');
                } catch (error) {
                    logger.error('[WA_GATEWAY] Failed to initialize Fonnte:', error.message);
                }
            }

            // Initialize Cloud API if configured
            if (waSettings.cloud_api?.enabled) {
                try {
                    // Cloud API uses environment variables or settings
                    this.gateways.cloud_api = WhatsAppCloudAPI;
                    logger.info('[WA_GATEWAY] Cloud API gateway initialized');
                } catch (error) {
                    logger.error('[WA_GATEWAY] Failed to initialize Cloud API:', error.message);
                }
            }

            // Baileys is initialized separately in whatsapp.js
            // We just mark it as available
            this.gateways.baileys = { type: 'baileys', external: true };

            logger.info(`[WA_GATEWAY] Active gateways: ${Object.keys(this.gateways).join(', ')}`);
            logger.info(`[WA_GATEWAY] Notification gateway: ${this.notificationGateway || 'baileys (default)'}`);
        } catch (error) {
            logger.error('[WA_GATEWAY] Error initializing gateways:', error.message);
        }
    }

    /**
     * Reload gateway configuration
     */
    reload() {
        this.gateways = {};
        this.initializeGateways();
        return this.getStatus();
    }

    /**
     * Get the best available gateway for notifications
     * @returns {string} Gateway type
     */
    getNotificationGateway() {
        // If notification gateway is set and available, use it
        if (this.notificationGateway && this.gateways[this.notificationGateway]) {
            return this.notificationGateway;
        }

        // Fallback priority: fonnte > cloud_api > baileys
        if (this.gateways.fonnte?.isConfigured?.()) return GATEWAY_TYPES.FONNTE;
        if (this.gateways.cloud_api) return GATEWAY_TYPES.CLOUD_API;
        return GATEWAY_TYPES.BAILEYS;
    }

    /**
     * Send notification message via configured notification gateway
     * Falls back to baileys if other gateways fail
     * @param {string} to - Recipient phone number
     * @param {string} message - Message content
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Result
     */
    async sendNotification(to, message, options = {}) {
        const gateway = options.gateway || this.getNotificationGateway();

        logger.info(`[WA_GATEWAY] Sending notification via ${gateway} to ${to}`);

        try {
            switch (gateway) {
                case GATEWAY_TYPES.FONNTE:
                    if (this.gateways.fonnte?.sendTextMessage) {
                        return await this.gateways.fonnte.sendTextMessage(to, message, options);
                    }
                    break;

                case GATEWAY_TYPES.CLOUD_API:
                    if (this.gateways.cloud_api?.sendTextMessage) {
                        return await this.gateways.cloud_api.sendTextMessage(to, message);
                    }
                    break;

                case GATEWAY_TYPES.BAILEYS:
                default:
                    // Baileys is handled externally
                    return await this.sendViaBaileys(to, message);
            }
        } catch (error) {
            logger.error(`[WA_GATEWAY] Error sending via ${gateway}:`, error.message);

            // Try fallback to baileys
            if (gateway !== GATEWAY_TYPES.BAILEYS && options.fallback !== false) {
                logger.info('[WA_GATEWAY] Falling back to Baileys');
                return await this.sendViaBaileys(to, message);
            }

            return {
                success: false,
                error: error.message,
                gateway
            };
        }

        // If no gateway available
        return {
            success: false,
            error: 'No gateway available',
            gateway
        };
    }

    /**
     * Send message via Baileys (external)
     * This integrates with the existing whatsapp.js
     * @param {string} to - Recipient phone number
     * @param {string} message - Message content
     * @returns {Promise<Object>} Result
     */
    async sendViaBaileys(to, message) {
        try {
            // Import sock from whatsapp.js
            const whatsappModule = require('../config/whatsapp');
            const sock = whatsappModule.getSock?.() || whatsappModule.sock;

            if (!sock) {
                return {
                    success: false,
                    error: 'Baileys not connected',
                    gateway: GATEWAY_TYPES.BAILEYS
                };
            }

            // Format phone number for Baileys
            let formattedNumber = to.replace(/\D/g, '');
            if (formattedNumber.startsWith('0')) {
                formattedNumber = '62' + formattedNumber.slice(1);
            }
            const jid = formattedNumber + '@s.whatsapp.net';

            await sock.sendMessage(jid, { text: message });

            return {
                success: true,
                gateway: GATEWAY_TYPES.BAILEYS
            };
        } catch (error) {
            logger.error('[WA_GATEWAY] Baileys send error:', error.message);
            return {
                success: false,
                error: error.message,
                gateway: GATEWAY_TYPES.BAILEYS
            };
        }
    }

    /**
     * Send media notification
     * @param {string} to - Recipient phone number
     * @param {string} mediaUrl - Public URL of media
     * @param {string} caption - Caption text
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Result
     */
    async sendMediaNotification(to, mediaUrl, caption = '', options = {}) {
        const gateway = options.gateway || this.getNotificationGateway();

        logger.info(`[WA_GATEWAY] Sending media via ${gateway} to ${to}`);

        try {
            switch (gateway) {
                case GATEWAY_TYPES.FONNTE:
                    if (this.gateways.fonnte?.sendMediaMessage) {
                        return await this.gateways.fonnte.sendMediaMessage(to, mediaUrl, caption, options);
                    }
                    break;

                case GATEWAY_TYPES.CLOUD_API:
                    if (this.gateways.cloud_api?.sendMediaMessage) {
                        const mediaType = options.mediaType || 'image';
                        return await this.gateways.cloud_api.sendMediaMessage(to, mediaUrl, mediaType, caption);
                    }
                    break;

                case GATEWAY_TYPES.BAILEYS:
                default:
                    return await this.sendMediaViaBaileys(to, mediaUrl, caption, options);
            }
        } catch (error) {
            logger.error(`[WA_GATEWAY] Error sending media via ${gateway}:`, error.message);
            return {
                success: false,
                error: error.message,
                gateway
            };
        }

        return {
            success: false,
            error: 'No gateway available for media',
            gateway
        };
    }

    /**
     * Send media via Baileys
     */
    async sendMediaViaBaileys(to, mediaUrl, caption, options = {}) {
        try {
            const whatsappModule = require('../config/whatsapp');
            const sock = whatsappModule.getSock?.() || whatsappModule.sock;

            if (!sock) {
                return { success: false, error: 'Baileys not connected' };
            }

            let formattedNumber = to.replace(/\D/g, '');
            if (formattedNumber.startsWith('0')) {
                formattedNumber = '62' + formattedNumber.slice(1);
            }
            const jid = formattedNumber + '@s.whatsapp.net';

            const messageContent = {
                image: { url: mediaUrl },
                caption: caption
            };

            await sock.sendMessage(jid, messageContent);

            return { success: true, gateway: GATEWAY_TYPES.BAILEYS };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Send bulk notifications
     * @param {Array<{to: string, message: string}>} messages - Messages to send
     * @param {Object} options - Options including gateway preference
     * @returns {Promise<Object>} Results
     */
    async sendBulkNotifications(messages, options = {}) {
        const gateway = options.gateway || this.getNotificationGateway();

        logger.info(`[WA_GATEWAY] Sending ${messages.length} bulk notifications via ${gateway}`);

        // Fonnte has native bulk support
        if (gateway === GATEWAY_TYPES.FONNTE && this.gateways.fonnte?.sendBulkMessages) {
            return await this.gateways.fonnte.sendBulkMessages(messages, options);
        }

        // For other gateways, send individually with delay
        const results = [];
        const delay = options.delay || 1500;

        for (const msg of messages) {
            const result = await this.sendNotification(msg.to, msg.message, { ...options, gateway });
            results.push({ ...result, to: msg.to });

            if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        const successCount = results.filter(r => r.success).length;
        return {
            success: successCount > 0,
            results,
            successCount,
            failedCount: results.length - successCount,
            gateway
        };
    }

    /**
     * Get status of all gateways
     * @returns {Object} Status of each gateway
     */
    getStatus() {
        const status = {
            notificationGateway: this.getNotificationGateway(),
            gateways: {}
        };

        // Baileys status
        try {
            const whatsappModule = require('../config/whatsapp');
            const whatsappStatus = whatsappModule.getWhatsAppStatus?.() || {};
            status.gateways.baileys = {
                enabled: true,
                connected: whatsappStatus.connected || false,
                type: 'interactive',
                description: 'For commands and real-time chat'
            };
        } catch {
            status.gateways.baileys = { enabled: false, connected: false };
        }

        // Fonnte status
        if (this.gateways.fonnte) {
            status.gateways.fonnte = {
                enabled: true,
                configured: this.gateways.fonnte.isConfigured?.() || false,
                type: 'notification',
                description: 'For outbound notifications'
            };
        } else {
            status.gateways.fonnte = { enabled: false, configured: false };
        }

        // Cloud API status
        if (this.gateways.cloud_api) {
            const hasToken = !!(process.env.WHATSAPP_ACCESS_TOKEN);
            status.gateways.cloud_api = {
                enabled: true,
                configured: hasToken,
                type: 'notification',
                description: 'Official Meta WhatsApp API'
            };
        } else {
            status.gateways.cloud_api = { enabled: false, configured: false };
        }

        return status;
    }
}

// Export singleton instance and class
const gatewayManager = new WhatsAppGatewayManager();

module.exports = {
    WhatsAppGatewayManager,
    gatewayManager,
    GATEWAY_TYPES
};
