const express = require('express');
const router = express.Router();
const { getSetting, updateSetting, getAllSettings } = require('../../../config/settingsManager');
const { query } = require('../../../config/database');
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
        logger.info(`[SETTINGS] Received PUT payload: ${JSON.stringify(req.body)}`);

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

        // Sync payment gateway settings to database table if present
        if (settings.paymentGateway || settings.payment_gateway) {
            const gwSettings = settings.paymentGateway || settings.payment_gateway;
            await syncPaymentGatewaySettings(gwSettings);
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

// Helper function to sync payment settings to payment_gateway_settings table
async function syncPaymentGatewaySettings(gwSettings) {
    const gateways = ['tripay', 'midtrans', 'xendit', 'duitku'];

    for (const gateway of gateways) {
        if (gwSettings[gateway]) {
            try {
                const setting = gwSettings[gateway];
                const isEnabled = setting.enabled === true;

                // fetch existing config to preserve other fields (like base_url)
                const existing = await query('SELECT config FROM payment_gateway_settings WHERE gateway = $1', [gateway]);
                let currentConfig = {};
                if (existing.rows.length > 0) {
                    currentConfig = existing.rows[0].config || {};
                }

                // Map camelCase to snake_case and merge
                const newConfig = { ...currentConfig };

                if (setting.production !== undefined) newConfig.production = setting.production;

                // Tripay
                if (gateway === 'tripay') {
                    if (setting.apiKey) newConfig.api_key = setting.apiKey;
                    if (setting.privateKey) newConfig.private_key = setting.privateKey;
                    if (setting.merchantCode) newConfig.merchant_code = setting.merchantCode;
                }
                // Midtrans
                else if (gateway === 'midtrans') {
                    if (setting.serverKey) newConfig.server_key = setting.serverKey;
                    if (setting.clientKey) newConfig.client_key = setting.clientKey;
                }
                // Xendit
                else if (gateway === 'xendit') {
                    if (setting.apiKey) newConfig.api_key = setting.apiKey;
                    if (setting.callbackToken) newConfig.callback_token = setting.callbackToken;
                }

                await query(
                    'UPDATE payment_gateway_settings SET is_enabled = $1, config = $2 WHERE gateway = $3',
                    [isEnabled, JSON.stringify(newConfig), gateway]
                );

                logger.info(`Synced ${gateway} settings to payment_gateway_settings table`);
            } catch (error) {
                logger.error(`Failed to sync ${gateway} settings:`, error);
            }
        }
    }
}