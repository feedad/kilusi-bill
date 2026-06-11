/**
 * Kilusi Omnichat API Client Service
 *
 * Service for integrating with Kilusi Omnichat WhatsApp Business API
 * Base URL: https://whatsapp.kilusi.id/api
 *
 * @module config/kilusi-whatsapp
 */

const { getSetting } = require('./settingsManager');
const logger = require('./logger');
const axios = require('axios');
const messageLogger = require('../services/omnichat-message-logger');

/**
 * Kilusi Omnichat API Client
 * Handles all communication with the Kilusi Omnichat WhatsApp Business API
 */
class KilusiOmnichatClient {
    constructor() {
        this.baseURL = null;
        this.apiKey = null;
        this.timeout = 30000;
        this.retryCount = 3;
        this.retryDelay = 1000;
        this.initialized = false;
    }

    /**
     * Initialize the client with configuration
     */
    initialize() {
        // Always reload settings to get latest values
        this.baseURL = getSetting('kilusi_omnichat_api_url', 'https://whatsapp.kilusi.id/api');
        // Only use environment variable if explicitly set (not empty), otherwise prefer database
        const envKey = process.env.KILUSI_OMNICHAT_API_KEY;
        this.apiKey = getSetting('kilusi_omnichat_api_key', envKey && envKey.length > 10 ? envKey : undefined);
        this.timeout = getSetting('kilusi_omnichat_timeout', 30000);
        this.retryCount = getSetting('kilusi_omnichat_retry_count', 3);
        this.retryDelay = getSetting('kilusi_omnichat_retry_delay', 1000);

        if (!this.apiKey) {
            logger.warn('[KilusiOmnichat] API Key not configured');
            this.initialized = false;
        } else {
            this.initialized = true;
            logger.info('[KilusiOmnichat] Client initialized with API key');
        }
    }

    /**
     * Ensure client is initialized before making requests
     */
    _ensureInitialized() {
        if (!this.initialized) {
            this.initialize();
        }
    }

    /**
     * Get axios instance with default configuration
     */
    _getClient() {
        this._ensureInitialized();

        return axios.create({
            baseURL: this.baseURL,
            timeout: this.timeout,
            headers: {
                'X-API-Key': this.apiKey,
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Format phone number for Omnichat API
     * Converts: 08123456789 -> 628123456789
     *            +628123456789 -> 628123456789
     *
     * @param {string} phoneNumber - Phone number to format
     * @returns {string} Formatted phone number
     */
    formatPhoneNumber(phoneNumber) {
        if (!phoneNumber) return '';

        let cleaned = phoneNumber.toString().replace(/\D/g, '');

        // Remove leading 0 and add 62
        if (cleaned.startsWith('0')) {
            cleaned = '62' + cleaned.slice(1);
        }

        // Remove + if exists
        if (cleaned.startsWith('+')) {
            cleaned = cleaned.slice(1);
        }

        // Ensure starts with 62
        if (!cleaned.startsWith('62')) {
            cleaned = '62' + cleaned;
        }

        return cleaned;
    }

    /**
     * Validate phone number format
     *
     * @param {string} phoneNumber - Phone number to validate
     * @returns {boolean} True if valid
     */
    isValidPhoneNumber(phoneNumber) {
        const formatted = this.formatPhoneNumber(phoneNumber);
        // Indonesian phone numbers: 62 followed by 8-12 digits
        return /^62[0-9]{8,12}$/.test(formatted);
    }

    /**
     * Make HTTP request with retry logic
     *
     * @param {object} config - Axios request config
     * @param {string} operation - Operation description for logging
     * @returns {Promise<object>} Response data
     */
    async _makeRequest(config, operation = 'Request') {
        const client = this._getClient();
        let lastError = null;

        for (let attempt = 1; attempt <= this.retryCount; attempt++) {
            try {
                logger.debug(`[KilusiOmnichat] ${operation} (attempt ${attempt}/${this.retryCount})`);

                const response = await client(config);

                // Log rate limit headers if present
                const rateLimitRemaining = response.headers['x-ratelimit-remaining'];
                const rateLimitReset = response.headers['x-ratelimit-reset'];
                if (rateLimitRemaining !== undefined) {
                    logger.debug(`[KilusiOmnichat] Rate limit remaining: ${rateLimitRemaining}, reset: ${rateLimitReset}`);
                }

                return response.data;
            } catch (error) {
                lastError = error;

                // Check if error is retryable
                const isRetryable = this._isRetryableError(error);

                if (!isRetryable || attempt === this.retryCount) {
                    break;
                }

                // Exponential backoff
                const delay = this.retryDelay * Math.pow(2, attempt - 1);
                logger.warn(`[KilusiOmnichat] ${operation} failed, retrying in ${delay}ms...`, {
                    error: error.message,
                    attempt,
                    maxRetries: this.retryCount
                });
                await this._delay(delay);
            }
        }

        // All retries failed
        logger.error(`[KilusiOmnichat] ${operation} failed after ${this.retryCount} attempts`, {
            error: lastError?.message,
            code: lastError?.code,
            response: lastError?.response?.data,
            metaError: lastError?.response?.data?.data?.error
        });

        throw this._handleError(lastError);
    }

    /**
     * Check if error is retryable
     *
     * @param {object} error - Axios error
     * @returns {boolean} True if retryable
     */
    _isRetryableError(error) {
        // Network errors
        if (!error.response) {
            return true;
        }

        // Status codes that are retryable
        const retryableStatuses = [408, 429, 500, 502, 503, 504];
        return retryableStatuses.includes(error.response.status);
    }

    /**
     * Handle and format error
     *
     * @param {object} error - Axios error
     * @returns {Error} Formatted error
     */
    _handleError(error) {
        if (!error.response) {
            return new Error(`Network error: ${error.message}`);
        }

        const { status, data } = error.response;
        const errorMessage = data?.error || data?.message || `HTTP ${status}`;
        const errorCode = data?.code;

        const err = new Error(errorMessage);
        err.status = status;
        err.code = errorCode || data?.data?.error?.code;
        err.data = data;
        err.metaError = data?.data?.error;
        err.metaTraceId = data?.data?.error?.fbtrace_id;
        err.metaUserMsg = data?.data?.error?.error_user_msg;
        return err;
    }

    /**
     * Delay helper
     *
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ===========================
    // INTEGRATION STATUS
    // ===========================

    /**
     * Check integration status
     * GET /integration/status
     *
     * @returns {Promise<object>} Status information
     */
    async getStatus() {
        return this._makeRequest({
            method: 'GET',
            url: '/integration/status'
        }, 'Check integration status');
    }

    /**
     * Get available phone numbers
     * GET /integration/phone-numbers
     *
     * @returns {Promise<object>} Phone numbers list
     */
    async getPhoneNumbers() {
        return this._makeRequest({
            method: 'GET',
            url: '/integration/phone-numbers'
        }, 'Get phone numbers');
    }

    // ===========================
    // MESSAGING
    // ===========================

    /**
     * Send custom message
     * POST /integration/message/send
     *
     * @param {string} to - Phone number
     * @param {string} message - Message content
     * @param {object} options - Additional options
     * @returns {Promise<object>} Send result
     */
    async sendMessage(to, message, options = {}) {
        const formattedPhone = this.formatPhoneNumber(to);

        try {
            const result = await this._makeRequest({
                method: 'POST',
                url: '/integration/message/send',
                data: {
                    to: formattedPhone,
                    message: message,
                    phone_number_id: options.phone_number_id,
                    saveToHistory: options.saveToHistory !== false, // Default true
                    source: options.source || 'billing' // Default source for tracking
                }
            }, `Send message to ${formattedPhone}`);

            // Log message to database
            try {
                // Extract message ID from various response formats
                const messageId = result.messageId ||
                                  result.data?.messageId ||
                                  result.data?.messages?.[0]?.id ||
                                  result.phoneNumberId;

                await messageLogger.logMessage({
                    message_id: messageId,
                    phone_number: to,
                    customer_id: options.customer_id,
                    customer_name: options.customer_name,
                    message_type: 'text',
                    message_content: message,
                    notification_type: options.notification_type,
                    billing_context: options.billing_context,
                    sent_via: options.sent_via || 'api',
                    sent_by: options.sent_by,
                    phone_number_id: result.phoneNumberId || result.data?.phone_number_id,
                    omnichat_response: result,
                    status: 'sent'
                });
            } catch (logError) {
                // Don't fail the send if logging fails
                logger.warn('[KilusiOmnichat] Failed to log message:', logError);
            }

            return result;
        } catch (error) {
            // Log failed message
            try {
                await messageLogger.logFailedMessage(to, error.message, {
                    customer_id: options.customer_id,
                    customer_name: options.customer_name,
                    message_type: 'text',
                    message_content: message,
                    notification_type: options.notification_type,
                    sent_via: options.sent_via || 'api'
                });
            } catch (logError) {
                logger.warn('[KilusiOmnichat] Failed to log error:', logError);
            }

            throw error;
        }
    }

    /**
     * Send template message
     * POST /integration/template/send
     *
     * @param {string} to - Phone number
     * @param {string} templateName - Template name
     * @param {string} languageCode - Language code (default: 'id')
     * @param {Array} parameters - Template parameters
     * @param {object} options - Additional options
     * @returns {Promise<object>} Send result
     */
    async sendTemplate(to, templateName, languageCode = 'id', parameters = [], options = {}) {
        const formattedPhone = this.formatPhoneNumber(to);

        try {
            const result = await this._makeRequest({
                method: 'POST',
                url: '/integration/template/send',
                data: {
                    to: formattedPhone,
                    template_name: templateName,
                    language_code: languageCode,
                    parameters: parameters,
                    saveToHistory: options.saveToHistory !== false, // Default true
                    source: options.source || 'billing' // Default source for tracking
                }
            }, `Send template ${templateName} to ${formattedPhone}`);

            // Log message to database
            try {
                // Extract message ID from various response formats
                const messageId = result.messageId ||
                                  result.data?.messageId ||
                                  result.data?.messages?.[0]?.id ||
                                  result.phoneNumberId;

                await messageLogger.logMessage({
                    message_id: messageId,
                    phone_number: to,
                    customer_id: options.customer_id,
                    customer_name: options.customer_name,
                    message_type: 'template',
                    template_name: templateName,
                    template_parameters: parameters,
                    notification_type: options.notification_type || templateName,
                    billing_context: options.billing_context,
                    sent_via: options.sent_via || 'api',
                    sent_by: options.sent_by,
                    phone_number_id: result.phoneNumberId || result.data?.phone_number_id,
                    omnichat_response: result,
                    status: 'sent'
                });
            } catch (logError) {
                // Don't fail the send if logging fails
                logger.warn('[KilusiOmnichat] Failed to log message:', logError);
            }

            return result;
        } catch (error) {
            // Log failed message
            try {
                await messageLogger.logFailedMessage(to, error.message, {
                    customer_id: options.customer_id,
                    customer_name: options.customer_name,
                    message_type: 'template',
                    template_name: templateName,
                    notification_type: options.notification_type || templateName,
                    sent_via: options.sent_via || 'api'
                });
            } catch (logError) {
                logger.warn('[KilusiOmnichat] Failed to log error:', logError);
            }

            throw error;
        }
    }

    // ===========================
    // BILLING NOTIFICATIONS
    // ===========================

    /**
     * Send billing notification
     * POST /integration/billing/send
     *
     * @param {object} data - Billing notification data
     * @param {string} data.phone_number - Customer phone
     * @param {string} data.customer_name - Customer name
     * @param {string} data.invoice_number - Invoice number
     * @param {number} data.amount - Invoice amount
     * @param {string} data.due_date - Due date
     * @param {string} data.template_name - Template name
     * @returns {Promise<object>} Send result
     */
    async sendBillingNotification(data) {
        const formattedPhone = this.formatPhoneNumber(data.phone_number);

        return this._makeRequest({
            method: 'POST',
            url: '/integration/billing/send',
            data: {
                phone_number: formattedPhone,
                customer_name: data.customer_name,
                invoice_number: data.invoice_number,
                amount: data.amount,
                due_date: data.due_date,
                template_name: data.template_name
            }
        }, `Send billing notification to ${formattedPhone}`);
    }

    /**
     * Send bulk billing notifications
     * POST /integration/billing/bulk
     *
     * @param {Array} recipients - Array of recipient objects
     * @param {string} templateName - Template name
     * @returns {Promise<object>} Bulk send result
     */
    async sendBulkBillingNotifications(recipients, templateName) {
        const formattedRecipients = recipients.map(r => ({
            phone: this.formatPhoneNumber(r.phone),
            name: r.name,
            invoice_number: r.invoice_number,
            amount: r.amount,
            due_date: r.due_date
        }));

        return this._makeRequest({
            method: 'POST',
            url: '/integration/billing/bulk',
            data: {
                recipients: formattedRecipients,
                template_name: templateName
            }
        }, `Send bulk billing notifications (${recipients.length} recipients)`);
    }

    /**
     * Send payment confirmation
     * POST /integration/billing/payment-confirmed
     *
     * @param {object} data - Payment confirmation data
     * @returns {Promise<object>} Send result
     */
    async sendPaymentConfirmation(data) {
        const formattedPhone = this.formatPhoneNumber(data.phone_number);

        return this._makeRequest({
            method: 'POST',
            url: '/integration/billing/payment-confirmed',
            data: {
                phone_number: formattedPhone,
                customer_name: data.customer_name,
                payment_amount: data.payment_amount,
                payment_date: data.payment_date,
                invoice_number: data.invoice_number,
                template_name: data.template_name
            }
        }, `Send payment confirmation to ${formattedPhone}`);
    }

    /**
     * Send overdue notice
     * POST /integration/billing/overdue
     *
     * @param {object} data - Overdue notice data
     * @returns {Promise<object>} Send result
     */
    async sendOverdueNotice(data) {
        const formattedPhone = this.formatPhoneNumber(data.phone_number);

        return this._makeRequest({
            method: 'POST',
            url: '/integration/billing/overdue',
            data: {
                phone_number: formattedPhone,
                customer_name: data.customer_name,
                invoice_number: data.invoice_number,
                amount: data.amount,
                overdue_days: data.overdue_days,
                template_name: data.template_name
            }
        }, `Send overdue notice to ${formattedPhone}`);
    }

    // ===========================
    // CONTACT SYNC
    // ===========================

    /**
     * Sync contacts to Omnichat
     * POST /integration/contacts/sync
     *
     * @param {Array} contacts - Array of contact objects
     * @returns {Promise<object>} Sync result
     */
    async syncContacts(contacts) {
        const formattedContacts = contacts.map(c => ({
            phone: this.formatPhoneNumber(c.phone),
            name: c.name,
            email: c.email || undefined,
            tags: c.tags || []
        })).filter(c => c.phone && c.name);

        return this._makeRequest({
            method: 'POST',
            url: '/integration/contacts/sync',
            data: {
                contacts: formattedContacts
            }
        }, `Sync ${contacts.length} contacts`);
    }

    /**
     * Sync single contact
     *
     * @param {object} contact - Contact object
     * @returns {Promise<object>} Sync result
     */
    async syncContact(contact) {
        return this.syncContacts([contact]);
    }

    // ===========================
    // TEMPLATES
    // ===========================

    /**
     * Get available templates
     * GET /integration/templates
     *
     * @returns {Promise<object>} Templates list
     */
    async getTemplates() {
        return this._makeRequest({
            method: 'GET',
            url: '/integration/templates'
        }, 'Get templates');
    }

    /**
     * Get all WhatsApp templates (with status)
     * GET /integration/templates
     *
     * @param {object} options - Query options
     * @returns {Promise<object>} Templates list with status
     */
    async getWhatsAppTemplates(options = {}) {
        const params = {};
        if (options.status) params.status = options.status;
        if (options.limit) params.limit = options.limit;

        return this._makeRequest({
            method: 'GET',
            url: '/integration/templates',
            params: params
        }, 'Get WhatsApp templates');
    }

    /**
     * Create WhatsApp template
     * POST /whatsapp-templates
     *
     * @param {object} templateData - Template data
     * @returns {Promise<object>} Created template
     */
    async createTemplate(templateData) {
        return this._makeRequest({
            method: 'POST',
            url: '/whatsapp-templates',
            data: templateData
        }, `Create template ${templateData.name}`);
    }

    /**
     * Delete WhatsApp template
     * DELETE /whatsapp-templates/{templateName}
     *
     * @param {string} templateName - Template name
     * @returns {Promise<object>} Delete result
     */
    async deleteTemplate(templateName) {
        return this._makeRequest({
            method: 'DELETE',
            url: `/whatsapp-templates/${templateName}`
        }, `Delete template ${templateName}`);
    }

    /**
     * Broadcast with template
     * POST /whatsapp-templates/broadcast
     *
     * @param {Array} phoneNumbers - Array of phone numbers
     * @param {string} templateName - Template name
     * @param {string} languageCode - Language code
     * @param {Array} components - Template components with parameters
     * @returns {Promise<object>} Broadcast result
     */
    async broadcastTemplate(phoneNumbers, templateName, languageCode, components) {
        const formattedPhones = phoneNumbers.map(p => this.formatPhoneNumber(p));

        return this._makeRequest({
            method: 'POST',
            url: '/whatsapp-templates/broadcast',
            data: {
                phone_numbers: formattedPhones,
                template_name: templateName,
                language_code: languageCode,
                components: components
            }
        }, `Broadcast ${templateName} to ${phoneNumbers.length} recipients`);
    }

    // ===========================
    // QUICK BROADCAST
    // ===========================

    /**
     * Quick broadcast (no template)
     * POST /broadcast/quick
     *
     * @param {Array} phoneNumbers - Array of phone numbers
     * @param {string} message - Message to broadcast
     * @param {string} messageType - Message type (text, image, etc.)
     * @param {string} mediaUrl - Optional media URL
     * @returns {Promise<object>} Broadcast result
     */
    async quickBroadcast(phoneNumbers, message, messageType = 'text', mediaUrl = null) {
        const formattedPhones = phoneNumbers.map(p => this.formatPhoneNumber(p));

        const data = {
            phone_numbers: formattedPhones,
            message: message,
            message_type: messageType
        };

        if (mediaUrl) {
            data.media_url = mediaUrl;
        }

        return this._makeRequest({
            method: 'POST',
            url: '/broadcast/quick',
            data: data
        }, `Quick broadcast to ${phoneNumbers.length} recipients`);
    }

    // ===========================
    // TEST CONNECTION
    // ===========================

    /**
     * Test API connection
     *
     * @returns {Promise<object>} Connection test result
     */
    async testConnection() {
        try {
            const response = await this.getStatus();

            // Parse Omnichat API response format
            // Response: { success: true, data: { whatsapp: { status: "connected" }, ... } }
            const whatsappConnected = response?.data?.whatsapp?.status === 'connected';
            const databaseConnected = response?.data?.database?.status === 'connected';

            return {
                success: true,
                connected: response.success && whatsappConnected,
                apiKeyValid: response.success,
                whatsappConnected: whatsappConnected,
                databaseConnected: databaseConnected,
                status: response?.data?.whatsapp?.status || 'disconnected',
                phoneNumberId: response?.data?.whatsapp?.phoneNumberId,
                totalContacts: response?.data?.database?.totalContacts,
                todayStats: response?.data?.today
            };
        } catch (error) {
            return {
                success: false,
                connected: false,
                apiKeyValid: false,
                whatsappConnected: false,
                error: error.message
            };
        }
    }

    // ===========================
    // TEMPLATE MANAGEMENT
    // ===========================

    /**
     * Submit template to Meta for approval
     * POST /integration/template/submit
     *
     * @param {object} templateData - Template data
     * @returns {Promise<object>} Submit result
     */
    async submitTemplate(templateData) {
        const { name, category, language, components } = templateData;

        try {
            const result = await this._makeRequest({
                method: 'POST',
                url: '/integration/template/submit',
                data: {
                    name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                    category: category,
                    language: language,
                    components: components
                }
            }, 'Submit template to Meta');

            return result;
        } catch (error) {
            logger.error('[KilusiOmnichat] Submit template error:', error);
            throw error;
        }
    }

    /**
     * Send message using approved Meta template
     * POST /integration/template/send
     *
     * @param {string} to - Phone number
     * @param {object} options - Template options
     * @returns {Promise<object>} Send result
     */
    async sendTemplateMessage(to, options) {
        const formattedPhone = this.formatPhoneNumber(to);

        try {
            const result = await this._makeRequest({
                method: 'POST',
                url: '/integration/template/send',
                data: {
                    to: formattedPhone,
                    template_id: options.template_id,
                    template_name: options.template_name,
                    language: options.language || 'id',
                    components: options.components || []
                }
            }, `Send template message to ${formattedPhone}`);

            // Log message
            try {
                const messageId = result.messageId || result.data?.messageId;

                // Build preview text from body parameters if available, otherwise use raw options
                let previewText = options.preview_text || '';
                if (!previewText && options.components) {
                    const body = options.components.find(c => c.type === 'body');
                    if (body && body.parameters) {
                        previewText = body.parameters.map(p => p.text).join('\n');
                    }
                }

                await messageLogger.logMessage({
                    message_id: messageId,
                    phone_number: to,
                    message_type: 'template',
                    message_content: previewText || JSON.stringify(options),
                    notification_type: options.notification_type || 'template',
                    template_name: options.template_name,
                    sent_via: 'api',
                    phone_number_id: result.phoneNumberId || result.data?.phone_number_id,
                    omnichat_response: result,
                    status: 'sent'
                });
            } catch (logError) {
                logger.warn('[KilusiOmnichat] Failed to log template message:', logError);
            }

            return result;
        } catch (error) {
            logger.error('[KilusiOmnichat] Send template message error:', error);
            throw error;
        }
    }
}

// Export singleton instance
const kilusiOmnichatClient = new KilusiOmnichatClient();

module.exports = kilusiOmnichatClient;
module.exports.KilusiOmnichatClient = KilusiOmnichatClient;
