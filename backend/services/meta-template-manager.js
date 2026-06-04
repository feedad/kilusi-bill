/**
 * Meta Template Manager Service
 *
 * Service for creating and managing WhatsApp Business API templates
 * Templates must be submitted to Meta (Facebook) for approval before use
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/business-management-api/
 *
 * @module services/meta-template-manager
 */

const { logger } = require('../config/logger');
const { getSetting } = require('../config/settingsManager');
const kilusiOmnichat = require('../config/kilusi-whatsapp');

/**
 * Template Component Types
 */
const COMPONENT_TYPES = {
    HEADER: 'HEADER',
    BODY: 'BODY',
    FOOTER: 'FOOTER',
    BUTTONS: 'BUTTONS'
};

/**
 * Header Format Types
 */
const HEADER_FORMATS = {
    TEXT: 'TEXT',
    IMAGE: 'IMAGE',
    VIDEO: 'VIDEO',
    DOCUMENT: 'DOCUMENT',
    LOCATION: 'LOCATION',
    CATALOG: 'CATALOG'
};

/**
 * Button Types
 */
const BUTTON_TYPES = {
    QUICK_REPLY: 'QUICK_REPLY',
    URL: 'URL',
    CALL: 'CALL',
    COPY_CODE: 'COPY_CODE',
    CATALOG: 'CATALOG',
    MPN: 'MPN',
    NONE: 'NONE'
};

/**
 * Template Categories (for Meta submission)
 */
const TEMPLATE_CATEGORIES = {
    MARKETING: 'MARKETING',
    UTILITY: 'UTILITY',
    AUTHENTICATION: 'AUTHENTICATION'
};

/**
 * Meta Template Manager Service
 */
class MetaTemplateManager {
    constructor() {
        this.apiBaseURL = 'https://graph.facebook.com/v18.0';
        this.whatsAppBusinessAccountId = null;
        this.phoneNumberId = null;
        this.accessToken = null;
        this.initialized = false;
    }

    /**
     * Initialize the template manager with credentials
     */
    async initialize() {
        try {
            // Get WhatsApp Business Account ID from settings
            this.whatsAppBusinessAccountId = getSetting('meta_waba_id', process.env.META_WABA_ID);
            this.phoneNumberId = getSetting('meta_phone_number_id', process.env.META_PHONE_NUMBER_ID);
            this.accessToken = getSetting('meta_access_token', process.env.META_ACCESS_TOKEN);

            // Try to get from Omnichat settings if not set
            if (!this.whatsAppBusinessAccountId) {
                try {
                    const phoneNumbers = await kilusiOmnichat.getPhoneNumbers();
                    if (phoneNumbers.success && phoneNumbers.phoneNumbers && phoneNumbers.phoneNumbers.length > 0) {
                        this.phoneNumberId = phoneNumbers.phoneNumbers[0].id;
                        logger.info('[MetaTemplateManager] Got phone number ID from Omnichat:', this.phoneNumberId);
                    }
                } catch (error) {
                    logger.warn('[MetaTemplateManager] Could not get phone number ID from Omnichat:', error.message);
                }
            }

            if (this.accessToken || this.phoneNumberId) {
                this.initialized = true;
                logger.info('[MetaTemplateManager] Initialized successfully');
            } else {
                logger.warn('[MetaTemplateManager] Not fully initialized - missing credentials');
            }
        } catch (error) {
            logger.error('[MetaTemplateManager] Initialization error:', error);
        }
    }

    /**
     * Ensure manager is initialized
     */
    async _ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }

    /**
     * Build template object for Meta API submission
     * @param {object} templateData - Template configuration
     * @returns {object} Meta API format template
     */
    buildTemplateObject(templateData) {
        const {
            name,
            category = 'UTILITY',
            language = 'id',
            components = []
        } = templateData;

        // Validate required fields
        if (!name) {
            throw new Error('Template name is required');
        }

        if (!components || components.length === 0) {
            throw new Error('At least one component is required (BODY)');
        }

        // Check if BODY component exists
        const hasBody = components.some(c => c.type === 'BODY');
        if (!hasBody) {
            throw new Error('BODY component is required');
        }

        return {
            name: this.sanitizeTemplateName(name),
            category: category,
            language: language,
            components: components
        };
    }

    /**
     * Sanitize template name according to Meta rules
     * - Lowercase
     - Alphanumeric and underscores only
     - Max 512 characters
     * @param {string} name - Template name
     * @returns {string} Sanitized name
     */
    sanitizeTemplateName(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 512);
    }

    /**
     * Create HEADER component
     * @param {string} format - Header format (TEXT, IMAGE, VIDEO, DOCUMENT)
     * @param {string} text - Header text (for TEXT format)
     * @returns {object} HEADER component
     */
    createHeaderComponent(format = 'TEXT', text = null) {
        const component = {
            type: COMPONENT_TYPES.HEADER
        };

        if (format === 'TEXT') {
            component.format = HEADER_FORMATS.TEXT;
            if (text) {
                component.text = text;
            }
        } else {
            component.format = HEADER_FORMATS[format] || format;
        }

        return component;
    }

    /**
     * Create BODY component with parameters
     * @param {string} text - Body text with {{1}}, {{2}} placeholders
     * @returns {object} BODY component
     */
    createBodyComponent(text) {
        if (!text) {
            throw new Error('Body text is required');
        }

        // Count parameters
        const matches = text.match(/\{\{\d+\}\}/g);
        const parameterCount = matches ? matches.length : 0;

        const component = {
            type: COMPONENT_TYPES.BODY,
            text: text
        };

        // Add example values for parameters
        if (parameterCount > 0) {
            const examples = [];
            for (let i = 1; i <= parameterCount; i++) {
                examples.push(`parameter_${i}`);
            }

            component.example = {
                header_handle: [],
                body_text_example: {
                    body_text: [
                        examples
                    ]
                }
            };
        }

        return component;
    }

    /**
     * Create FOOTER component
     * @param {string} text - Footer text (max 60 characters)
     * @returns {object} FOOTER component
     */
    createFooterComponent(text) {
        if (!text || text.length > 60) {
            throw new Error('Footer text is required and must be max 60 characters');
        }

        return {
            type: COMPONENT_TYPES.FOOTER,
            text: text
        };
    }

    /**
     * Create BUTTONS component
     * @param {Array} buttons - Array of button objects
     * @returns {object} BUTTONS component
     */
    createButtonsComponent(buttons) {
        if (!buttons || buttons.length === 0 || buttons.length > 3) {
            throw new Error('Buttons array is required and must have 1-3 buttons');
        }

        const componentButtons = buttons.map(button => {
            const btn = {
                type: button.type || BUTTON_TYPES.QUICK_REPLY,
                text: button.text
            };

            if (btn.type === BUTTON_TYPES.URL) {
                btn.url = button.url;
            } else if (btn.type === BUTTON_TYPES.CALL) {
                btn.phone_number = button.phone_number;
            } else if (btn.type === BUTTON_TYPES.COPY_CODE) {
                btn.example = button.example;
            }

            return btn;
        });

        return {
            type: COMPONENT_TYPES.BUTTONS,
            buttons: componentButtons
        };
    }

    /**
     * Submit template to Meta for approval
     * POST /{whatsapp-business-account-id}/message_templates
     *
     * @param {object} templateData - Template configuration
     * @returns {Promise<object>} Submission result
     */
    async submitTemplate(templateData) {
        await this._ensureInitialized();

        try {
            logger.info('[MetaTemplateManager] Submitting template to Meta:', templateData.name);

            const template = this.buildTemplateObject(templateData);

            // If using Omnichat proxy
            if (getSetting('use_omnichat_for_templates', true)) {
                return await this.submitViaOmnichat(template);
            }

            // Direct Meta API submission
            if (!this.whatsAppBusinessAccountId) {
                throw new Error('WhatsApp Business Account ID is required');
            }

            const axios = require('axios');
            const url = `${this.apiBaseURL}/${this.whatsAppBusinessAccountId}/message_templates`;

            const response = await axios.post(url, {
                messaging_product: 'whatsapp',
                ...template
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            logger.info('[MetaTemplateManager] Template submitted successfully:', response.data);

            return {
                success: true,
                data: response.data,
                templateName: template.name
            };

        } catch (error) {
            logger.error('[MetaTemplateManager] Template submission failed:', error);

            const errorMessage = this._extractMetaError(error);

            return {
                success: false,
                error: errorMessage,
                details: error.response?.data
            };
        }
    }

    /**
     * Submit template via Omnichat API
     * @param {object} template - Template object
     * @returns {Promise<object>} Submission result
     */
    async submitViaOmnichat(template) {
        try {
            const result = await kilusiOmnichat.createTemplate(template);

            return {
                success: true,
                data: result,
                templateName: template.name
            };
        } catch (error) {
            logger.error('[MetaTemplateManager] Omnichat template submission failed:', error);

            return {
                success: false,
                error: error.message,
                details: error.response?.data
            };
        }
    }

    /**
     * Get all templates from Meta/Omnichat
     * @param {object} options - Query options
     * @returns {Promise<object>} Templates list
     */
    async getTemplates(options = {}) {
        await this._ensureInitialized();

        try {
            const { status, limit = 100 } = options;

            // Use Omnichat API
            const result = await kilusiOmnichat.getWhatsAppTemplates({
                status,
                limit
            });

            return {
                success: true,
                data: result
            };

        } catch (error) {
            logger.error('[MetaTemplateManager] Error fetching templates:', error);

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get specific template details
     * @param {string} templateName - Template name
     * @returns {Promise<object>} Template details
     */
    async getTemplate(templateName) {
        await this._ensureInitialized();

        try {
            // Get all templates and filter
            const result = await this.getTemplates();

            if (!result.success || !result.data?.templates) {
                throw new Error('Could not fetch templates');
            }

            const template = result.data.templates.find(t => t.name === templateName);

            if (!template) {
                return {
                    success: false,
                    error: 'Template not found'
                };
            }

            return {
                success: true,
                data: template
            };

        } catch (error) {
            logger.error('[MetaTemplateManager] Error fetching template:', error);

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Delete template from Meta
     * DELETE /{template-id}
     *
     * @param {string} templateName - Template name
     * @returns {Promise<object>} Deletion result
     */
    async deleteTemplate(templateName) {
        await this._ensureInitialized();

        try {
            logger.info('[MetaTemplateManager] Deleting template:', templateName);

            // Use Omnichat API
            const result = await kilusiOmnichat.deleteTemplate(templateName);

            return {
                success: true,
                data: result,
                message: `Template ${templateName} deleted successfully`
            };

        } catch (error) {
            logger.error('[MetaTemplateManager] Template deletion failed:', error);

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate template before submission
     * @param {object} templateData - Template configuration
     * @returns {object} Validation result
     */
    validateTemplate(templateData) {
        const errors = [];
        const warnings = [];

        // Check required fields
        if (!templateData.name) {
            errors.push('Template name is required');
        } else {
            // Validate name format
            if (templateData.name.length > 512) {
                errors.push('Template name must be max 512 characters');
            }
            if (!/^[a-zA-Z0-9_]+$/.test(templateData.name)) {
                errors.push('Template name must contain only letters, numbers, and underscores');
            }
        }

        if (!templateData.category) {
            warnings.push('Category not specified, will default to UTILITY');
        } else if (!Object.values(TEMPLATE_CATEGORIES).includes(templateData.category)) {
            errors.push(`Invalid category. Must be one of: ${Object.values(TEMPLATE_CATEGORIES).join(', ')}`);
        }

        if (!templateData.components || templateData.components.length === 0) {
            errors.push('At least one component is required');
        } else {
            // Validate components
            const hasBody = templateData.components.some(c => c.type === 'BODY');
            if (!hasBody) {
                errors.push('BODY component is required');
            }

            templateData.components.forEach((component, index) => {
                if (!component.type) {
                    errors.push(`Component ${index + 1}: type is required`);
                }

                if (component.type === 'BODY') {
                    if (!component.text) {
                        errors.push('BODY component: text is required');
                    } else if (component.text.length > 1024) {
                        errors.push('BODY text must be max 1024 characters');
                    }
                }

                if (component.type === 'FOOTER') {
                    if (!component.text) {
                        errors.push('FOOTER component: text is required');
                    } else if (component.text.length > 60) {
                        errors.push('FOOTER text must be max 60 characters');
                    }
                }

                if (component.type === 'HEADER') {
                    if (!component.format) {
                        errors.push('HEADER component: format is required');
                    }
                    if (component.format === 'TEXT' && !component.text) {
                        errors.push('HEADER component: text is required for TEXT format');
                    }
                    if (component.text && component.text.length > 60) {
                        errors.push('HEADER text must be max 60 characters');
                    }
                }

                if (component.type === 'BUTTONS') {
                    if (!component.buttons || component.buttons.length === 0) {
                        errors.push('BUTTONS component: buttons array is required');
                    } else if (component.buttons.length > 3) {
                        errors.push('BUTTONS component: max 3 buttons allowed');
                    }
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Extract error message from Meta API response
     * @param {object} error - Error object
     * @returns {string} Formatted error message
     */
    _extractMetaError(error) {
        if (error.response?.data?.error) {
            const metaError = error.response.data.error;
            return `Meta API Error: ${metaError.message} (code: ${metaError.code})`;
        }

        if (error.response?.data?.error?.message) {
            return error.response.data.error.message;
        }

        return error.message || 'Unknown error';
    }

    /**
     * Create example billing templates
     * @returns {Array} Example template configurations
     */
    getExampleBillingTemplates() {
        return [
            {
                name: 'invoice_created',
                category: 'UTILITY',
                language: 'id',
                components: [
                    this.createHeaderComponent('TEXT', 'Tagihan Baru'),
                    this.createBodyComponent(
                        'Halo {{1}},\n\n' +
                        'Tagihan Anda untuk periode {{2}} telah tersedia.\n\n' +
                        'Nomor Invoice: {{3}}\n' +
                        'Jumlah: Rp {{4}}\n' +
                        'Jatuh Tempo: {{5}}\n\n' +
                        'Silakan lakukan pembayaran sebelum tanggal jatuh tempo.'
                    ),
                    this.createFooterComponent('Terima kasih telah berlangganan layanan kami')
                ]
            },
            {
                name: 'payment_received',
                category: 'UTILITY',
                language: 'id',
                components: [
                    this.createHeaderComponent('TEXT', 'Pembayaran Diterima'),
                    this.createBodyComponent(
                        'Halo {{1}},\n\n' +
                        'Terima kasih! Pembayaran Anda telah kami terima.\n\n' +
                        'Nomor Invoice: {{2}}\n' +
                        'Jumlah: Rp {{3}}\n' +
                        'Tanggal Bayar: {{4}}\n\n' +
                        'Status pembayaran: LUNAS'
                    ),
                    this.createFooterComponent('Terima kasih atas kepercayaan Anda')
                ]
            },
            {
                name: 'payment_reminder',
                category: 'UTILITY',
                language: 'id',
                components: [
                    this.createHeaderComponent('TEXT', 'Pengingat Pembayaran'),
                    this.createBodyComponent(
                        'Halo {{1}},\n\n' +
                        'Ini adalah pengingat pembayaran untuk tagihan Anda.\n\n' +
                        'Nomor Invoice: {{2}}\n' +
                        'Jumlah: Rp {{3}}\n' +
                        'Jatuh Tempo: {{4}}\n' +
                        'Terlambat: {{5}} hari\n\n' +
                        'Silakan segera lakukan pembayaran untuk menghindari penangguhan layanan.'
                    ),
                    this.createFooterComponent('Hubungi kami jika sudah melakukan pembayaran')
                ]
            },
            {
                name: 'service_suspended',
                category: 'UTILITY',
                language: 'id',
                components: [
                    this.createHeaderComponent('TEXT', 'Layanan Ditangguhkan'),
                    this.createBodyComponent(
                        'Halo {{1}},\n\n' +
                        'Mohon maaf, layanan internet Anda telah ditangguhkan karena pembayaran tertunggak.\n\n' +
                        'Nomor Invoice: {{2}}\n' +
                        'Jumlah Tertunggak: Rp {{3}}\n\n' +
                        'Silakan lakukan pembayaran untuk mengaktifkan kembali layanan Anda.'
                    ),
                    this.createButtonsComponent([
                        { type: 'QUICK_REPLY', text: 'Hubungi Support' }
                    ])
                ]
            },
            {
                name: 'service_restored',
                category: 'UTILITY',
                language: 'id',
                components: [
                    this.createHeaderComponent('TEXT', 'Layanan Aktif Kembali'),
                    this.createBodyComponent(
                        'Halo {{1}},\n\n' +
                        'Terima kasih telah melakukan pembayaran.\n\n' +
                        'Layanan internet Anda telah AKTIF kembali.\n\n' +
                        'Nomor Invoice: {{2}}\n' +
                        'Tanggal Bayar: {{3}}\n\n' +
                        'Jika masih mengalami kendala, silakan restart modem Anda.'
                    ),
                    this.createFooterComponent('Terima kasih atas kerjasamanya')
                ]
            },
            {
                name: 'welcome_message',
                category: 'MARKETING',
                language: 'id',
                components: [
                    this.createHeaderComponent('TEXT', 'Selamat Datang!'),
                    this.createBodyComponent(
                        'Halo {{1}},\n\n' +
                        'Selamat datang di layanan internet kami!\n\n' +
                        'Paket: {{2}}\n' +
                        'Kecepatan: {{3}}\n\n' +
                        'Jika ada pertanyaan atau kendala, jangan ragu untuk menghubungi kami.'
                    ),
                    this.createButtonsComponent([
                        { type: 'QUICK_REPLY', text: 'Hubungi Support' },
                        { type: 'QUICK_REPLY', text: 'Cek Tagihan' }
                    ])
                ]
            }
        ];
    }

    /**
     * Get template status description
     * @param {string} status - Template status code
     * @returns {string} Status description
     */
    getStatusDescription(status) {
        const statusMap = {
            'PENDING': 'Menunggu persetujuan dari Meta',
            'APPROVED': 'Template disetujui dan siap digunakan',
            'REJECTED': 'Template ditolak oleh Meta',
            'DISABLED': 'Template dinonaktifkan',
            'PENDING_DELETION': 'Template dalam proses penghapusan',
            'LIMIT_EXCEEDED': 'Batas template terlampaui'
        };

        return statusMap[status] || status;
    }
}

// Export singleton instance
const metaTemplateManager = new MetaTemplateManager();

module.exports = metaTemplateManager;
module.exports.MetaTemplateManager = MetaTemplateManager;
module.exports.COMPONENT_TYPES = COMPONENT_TYPES;
module.exports.HEADER_FORMATS = HEADER_FORMATS;
module.exports.BUTTON_TYPES = BUTTON_TYPES;
module.exports.TEMPLATE_CATEGORIES = TEMPLATE_CATEGORIES;
