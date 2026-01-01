const express = require('express');
const router = express.Router();
const { getSetting, updateSetting, getAllSettings } = require('../../../config/settingsManager');
const { logger } = require('../../../config/logger');

// GET /api/v1/settings - Get all settings
router.get('/', async (req, res) => {
    try {
        const settings = getAllSettings();

        res.json({
            success: true,
            data: { settings }
        });

    } catch (error) {
        logger.error('Error fetching settings:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil pengaturan'
        });
    }
});

// GET /api/v1/settings/:key - Get specific setting
router.get('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const value = getSetting(key);

        res.json({
            success: true,
            data: { key, value }
        });

    } catch (error) {
        logger.error('Error fetching setting:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil pengaturan'
        });
    }
});

// PUT /api/v1/settings - Update multiple settings
router.put('/', async (req, res) => {
    try {
        const { settings } = req.body;

        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Data settings harus berupa object'
            });
        }

        // Update each setting
        const updatedSettings = {};
        for (const [key, value] of Object.entries(settings)) {
            updateSetting(key, value);
            updatedSettings[key] = value;
        }

        // Emit settings update event
        if (global.appEvents) {
            global.appEvents.emit('settings:updated', updatedSettings);
        }

        logger.info(`Settings updated by API: ${Object.keys(settings).length} settings changed`);

        res.json({
            success: true,
            data: { settings: updatedSettings },
            message: 'Pengaturan berhasil diperbarui'
        });

    } catch (error) {
        logger.error('Error updating settings:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui pengaturan'
        });
    }
});

// PUT /api/v1/settings/:key - Update specific setting
router.put('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        if (value === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Value harus diisi'
            });
        }

        updateSetting(key, value);

        // Emit settings update event
        if (global.appEvents) {
            global.appEvents.emit('settings:updated', { [key]: value });
        }

        logger.info(`Setting updated by API: ${key} = ${value}`);

        res.json({
            success: true,
            data: { key, value },
            message: 'Pengaturan berhasil diperbarui'
        });

    } catch (error) {
        logger.error('Error updating setting:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui pengaturan'
        });
    }
});

module.exports = router;