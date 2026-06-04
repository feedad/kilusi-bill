/**
 * Meta Templates API Routes
 *
 * Routes for managing WhatsApp Business API templates via Meta
 *
 * @module routes/api/v1/meta-templates
 */

const express = require('express');
const router = express.Router();
const metaTemplateManager = require('../../../services/meta-template-manager');
const { logger } = require('../../../config/logger');

// ===========================
// GET ALL TEMPLATES
// ===========================

/**
 * GET /api/v1/meta-templates
 * Get all WhatsApp templates
 * Query params: status, limit
 */
router.get('/', async (req, res) => {
    try {
        const { status, limit } = req.query;

        logger.info('[MetaTemplates] Fetching templates', { status, limit });

        const options = {};
        if (status) options.status = status;
        if (limit) options.limit = parseInt(limit);

        const result = await metaTemplateManager.getTemplates(options);

        if (result.success) {
            res.json({
                success: true,
                data: result.data,
                message: 'Template berhasil diambil'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Gagal mengambil daftar template',
                error: result.error
            });
        }
    } catch (error) {
        logger.error('[MetaTemplates] Error fetching templates:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil daftar template',
            error: error.message
        });
    }
});

// ===========================
// SPECIFIC ROUTES (must be before :name)
// ===========================

/**
 * GET /api/v1/meta-templates/component-types
 * Get available component types and formats
 */
router.get('/component-types', async (req, res) => {
    try {
        const { COMPONENT_TYPES, HEADER_FORMATS, BUTTON_TYPES, TEMPLATE_CATEGORIES } =
            require('../../../services/meta-template-manager');

        res.json({
            success: true,
            data: {
                componentTypes: COMPONENT_TYPES,
                headerFormats: HEADER_FORMATS,
                buttonTypes: BUTTON_TYPES,
                templateCategories: TEMPLATE_CATEGORIES
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/v1/meta-templates/examples/list
 * Get example billing templates
 */
router.get('/examples/list', async (req, res) => {
    try {
        logger.info('[MetaTemplates] Fetching example templates');

        const examples = metaTemplateManager.getExampleBillingTemplates();

        res.json({
            success: true,
            data: examples,
            message: 'Contoh template berhasil diambil'
        });
    } catch (error) {
        logger.error('[MetaTemplates] Error fetching examples:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil contoh template',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/meta-templates/status/:status
 * Get status description
 */
router.get('/status/:status', async (req, res) => {
    try {
        const { status } = req.params;

        const description = metaTemplateManager.getStatusDescription(status);

        res.json({
            success: true,
            data: {
                status,
                description
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ===========================
// GET SPECIFIC TEMPLATE
// ===========================

/**
 * GET /api/v1/meta-templates/:name
 * Get specific template details
 */
router.get('/:name', async (req, res) => {
    try {
        const { name } = req.params;

        logger.info('[MetaTemplates] Fetching template:', name);

        const result = await metaTemplateManager.getTemplate(name);

        if (result.success) {
            res.json({
                success: true,
                data: result.data,
                message: 'Template ditemukan'
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Template tidak ditemukan',
                error: result.error
            });
        }
    } catch (error) {
        logger.error('[MetaTemplates] Error fetching template:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil template',
            error: error.message
        });
    }
});

// ===========================
// CREATE/SUBMIT TEMPLATE
// ===========================

/**
 * POST /api/v1/meta-templates
 * Submit new template to Meta
 * Body: { name, category, language, components }
 */
router.post('/', async (req, res) => {
    try {
        const { name, category, language, components } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Nama template wajib diisi'
            });
        }

        if (!components || !Array.isArray(components) || components.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Komponen template wajib diisi'
            });
        }

        logger.info('[MetaTemplates] Submitting template:', name);

        const templateData = {
            name,
            category: category || 'UTILITY',
            language: language || 'id',
            components
        };

        // Validate first
        const validation = metaTemplateManager.validateTemplate(templateData);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Validasi template gagal',
                errors: validation.errors,
                warnings: validation.warnings
            });
        }

        // Submit to Meta
        const result = await metaTemplateManager.submitTemplate(templateData);

        if (result.success) {
            res.json({
                success: true,
                data: result.data,
                message: `Template "${name}" berhasil dikirim ke Meta untuk persetujuan`,
                warnings: validation.warnings
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Gagal mengirim template ke Meta',
                error: result.error,
                details: result.details
            });
        }
    } catch (error) {
        logger.error('[MetaTemplates] Error submitting template:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengirim template',
            error: error.message
        });
    }
});

// ===========================
// DELETE TEMPLATE
// ===========================

/**
 * DELETE /api/v1/meta-templates/:name
 * Delete a template
 */
router.delete('/:name', async (req, res) => {
    try {
        const { name } = req.params;

        logger.info('[MetaTemplates] Deleting template:', name);

        const result = await metaTemplateManager.deleteTemplate(name);

        if (result.success) {
            res.json({
                success: true,
                message: result.message || `Template "${name}" berhasil dihapus`
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Gagal menghapus template',
                error: result.error
            });
        }
    } catch (error) {
        logger.error('[MetaTemplates] Error deleting template:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menghapus template',
            error: error.message
        });
    }
});

// ===========================
// VALIDATE TEMPLATE
// ===========================

/**
 * POST /api/v1/meta-templates/validate
 * Validate template without submitting
 * Body: { name, category, language, components }
 */
router.post('/validate', async (req, res) => {
    try {
        const { name, category, language, components } = req.body;

        const templateData = {
            name,
            category,
            language,
            components
        };

        logger.info('[MetaTemplates] Validating template:', name);

        const validation = metaTemplateManager.validateTemplate(templateData);

        res.json({
            success: validation.valid,
            valid: validation.valid,
            errors: validation.errors,
            warnings: validation.warnings,
            message: validation.valid ?
                'Template valid' :
                'Template tidak valid, silakan perbaiki error'
        });
    } catch (error) {
        logger.error('[MetaTemplates] Error validating template:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat validasi template',
            error: error.message
        });
    }
});

// ===========================
// SUBMIT EXAMPLE TEMPLATE
// ===========================

/**
 * POST /api/v1/meta-templates/examples/:templateName
 * Submit an example template
 */
router.post('/examples/:templateName', async (req, res) => {
    try {
        const { templateName } = req.params;

        logger.info('[MetaTemplates] Submitting example template:', templateName);

        // Get example templates
        const examples = metaTemplateManager.getExampleBillingTemplates();
        const example = examples.find(t => t.name === templateName);

        if (!example) {
            return res.status(404).json({
                success: false,
                message: `Contoh template "${templateName}" tidak ditemukan`,
                available: examples.map(t => t.name)
            });
        }

        // Validate
        const validation = metaTemplateManager.validateTemplate(example);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Validasi template gagal',
                errors: validation.errors,
                warnings: validation.warnings
            });
        }

        // Submit
        const result = await metaTemplateManager.submitTemplate(example);

        if (result.success) {
            res.json({
                success: true,
                data: result.data,
                message: `Template "${templateName}" berhasil dikirim ke Meta`,
                warnings: validation.warnings
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Gagal mengirim template ke Meta',
                error: result.error,
                details: result.details
            });
        }
    } catch (error) {
        logger.error('[MetaTemplates] Error submitting example:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengirim contoh template',
            error: error.message
        });
    }
});

// ===========================
// CREATE COMPONENT HELPERS
// ===========================

/**
 * POST /api/v1/meta-templates/components/header
 * Create HEADER component
 */
router.post('/components/header', async (req, res) => {
    try {
        const { format = 'TEXT', text } = req.body;

        const component = metaTemplateManager.createHeaderComponent(format, text);

        res.json({
            success: true,
            data: component,
            message: 'HEADER component berhasil dibuat'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/v1/meta-templates/components/body
 * Create BODY component
 */
router.post('/components/body', async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'Body text is required'
            });
        }

        const component = metaTemplateManager.createBodyComponent(text);

        res.json({
            success: true,
            data: component,
            message: 'BODY component berhasil dibuat'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/v1/meta-templates/components/footer
 * Create FOOTER component
 */
router.post('/components/footer', async (req, res) => {
    try {
        const { text } = req.body;

        const component = metaTemplateManager.createFooterComponent(text);

        res.json({
            success: true,
            data: component,
            message: 'FOOTER component berhasil dibuat'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/v1/meta-templates/components/buttons
 * Create BUTTONS component
 */
router.post('/components/buttons', async (req, res) => {
    try {
        const { buttons } = req.body;

        if (!buttons || !Array.isArray(buttons) || buttons.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Buttons array is required'
            });
        }

        const component = metaTemplateManager.createButtonsComponent(buttons);

        res.json({
            success: true,
            data: component,
            message: 'BUTTONS component berhasil dibuat'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
