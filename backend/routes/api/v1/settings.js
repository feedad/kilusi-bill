const express = require('express');
const router = express.Router();
const { getSetting, updateSetting, getAllSettings, initialize } = require('../../../config/settingsManager');
const { query } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// GET /api/v1/settings/available-methods - Get payment methods (same as customer endpoint but for admin)
// Uses same logic as /api/v1/customer-payments/methods
router.get('/available-methods', async (req, res) => {
    try {
        logger.info('[AVAILABLE-METHODS] Fetching payment methods...');
        const settings = getAllSettings();
        const paymentSettings = settings.payment_settings || {};
        logger.info('[AVAILABLE-METHODS] payment_settings:', JSON.stringify(paymentSettings));

        let methods = [];

        // Manual payment methods
        // Cash
        methods.push({
            id: 'cash',
            code: 'cash',
            method: 'TUNAI',
            name: 'Tunai',
            displayName: 'Tunai',
            type: 'manual',
            icon: 'banknote',
            active: true
        });

        // Bank accounts
        if (paymentSettings.bank_accounts && Array.isArray(paymentSettings.bank_accounts)) {
            paymentSettings.bank_accounts
                .filter(acc => acc.isActive !== false)
                .forEach(acc => {
                    methods.push({
                        id: `bank_${acc.id}`,
                        code: acc.bankName?.toLowerCase() || 'bank',
                        method: acc.bankName?.toUpperCase() || 'BANK',
                        name: acc.bankName || 'Bank',
                        displayName: `${acc.bankName} - ${acc.accountNumber}`,
                        bankName: acc.bankName,
                        accountNumber: acc.accountNumber,
                        accountName: acc.accountName,
                        type: 'bank',
                        icon: 'building',
                        active: true
                    });
                });
        }

        // E-wallets
        if (paymentSettings.ewallets && Array.isArray(paymentSettings.ewallets)) {
            const providerLabels = {
                'gopay': 'GoPay', 'GoPay': 'GoPay',
                'ovo': 'OVO', 'OVO': 'OVO',
                'dana': 'DANA', 'DANA': 'DANA',
                'shopeepay': 'ShopeePay', 'ShopeePay': 'ShopeePay',
                'linkaja': 'LinkAja', 'LinkAja': 'LinkAja',
                'QRIS': 'QRIS', 'qris': 'QRIS'
            };

            paymentSettings.ewallets
                .filter(wallet => wallet.isActive !== false)
                .forEach(wallet => {
                    const label = providerLabels[wallet.provider] || wallet.provider || 'E-Wallet';
                    methods.push({
                        id: `ewallet_${wallet.id}`,
                        code: wallet.provider || 'ewallet',
                        method: label,
                        name: label,
                        displayName: `${label} - ${wallet.phoneNumber}`,
                        provider: wallet.provider,
                        phoneNumber: wallet.phoneNumber,
                        accountName: wallet.accountName,
                        type: 'ewallet',
                        icon: 'smartphone',
                        active: true
                    });
                });
        }

        logger.info(`[AVAILABLE-METHODS] Returning ${methods.length} methods`);
        res.json({
            success: true,
            data: {
                payment_methods: methods,
                total_count: methods.length
            }
        });

    } catch (error) {
        logger.error('[AVAILABLE-METHODS] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil metode pembayaran'
        });
    }
});

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

// GET /api/v1/settings/prefix/:prefix - Get all settings with prefix
router.get('/prefix/:prefix', async (req, res) => {
    try {
        const { prefix } = req.params;
        const allSettings = getAllSettings();

        // Filter settings that start with the prefix
        const filteredSettings = {};
        Object.entries(allSettings).forEach(([key, value]) => {
            if (key.startsWith(prefix)) {
                filteredSettings[key] = value;
            }
        });

        res.json({
            success: true,
            data: filteredSettings
        });

    } catch (error) {
        logger.error('Error fetching settings by prefix:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil pengaturan'
        });
    }
});

// GET /api/v1/settings/omnichat - Get all Omnichat-related settings
router.get('/omnichat', async (req, res) => {
    try {
        const allSettings = getAllSettings();

        // Get all Omnichat-related settings
        const omnichatSettings = {};
        const omnichatKeys = [
            'kilusi_omnichat_api_url',
            'kilusi_omnichat_api_key',
            'kilusi_omnichat_timeout',
            'kilusi_omnichat_retry_count',
            'kilusi_omnichat_retry_delay',
            'omnichat_sync_enabled',
            'omnichat_sync_schedule',
            'omnichat_sync_time',
            'omnichat_sync_tags_enabled',
            'whatsapp_provider',
            'baileys_fallback_enabled'
        ];

        omnichatKeys.forEach(key => {
            if (allSettings[key] !== undefined) {
                omnichatSettings[key] = allSettings[key];
            }
        });

        res.json({
            success: true,
            data: omnichatSettings
        });

    } catch (error) {
        logger.error('Error fetching Omnichat settings:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil pengaturan Omnichat'
        });
    }
});

// GET /api/v1/settings/payment-methods - Get active payment methods for admin use
// MUST be defined BEFORE /:key to avoid route matching issues
router.get('/payment-methods', async (req, res) => {
    try {
        logger.info('[PAYMENT-METHODS] Fetching payment methods...');

        // Fetch directly from database to avoid any caching issues
        const result = await query('SELECT value FROM app_config WHERE key = $1', ['payment_settings']);

        if (result.rows.length === 0) {
            logger.info('[PAYMENT-METHODS] No payment settings found in database');
            return res.json({
                success: true,
                data: {
                    payment_methods: [{
                        id: 'cash',
                        code: 'cash',
                        method: 'TUNAI',
                        name: 'Tunai',
                        displayName: 'Tunai',
                        type: 'manual',
                        icon: 'banknote',
                        active: true
                    }],
                    total_count: 1
                }
            });
        }

        const paymentSettings = JSON.parse(result.rows[0].value);
        logger.info('[PAYMENT-METHODS] Payment settings from DB:', JSON.stringify(paymentSettings));

        let methods = [];

        // Manual payment methods
        // Cash
        methods.push({
            id: 'cash',
            code: 'cash',
            method: 'TUNAI',
            name: 'Tunai',
            displayName: 'Tunai',
            type: 'manual',
            icon: 'banknote',
            active: true
        });

        // Bank accounts
        if (paymentSettings.bank_accounts && Array.isArray(paymentSettings.bank_accounts)) {
            paymentSettings.bank_accounts
                .filter(acc => acc.isActive !== false)
                .forEach(acc => {
                    methods.push({
                        id: `bank_${acc.id}`,
                        code: acc.bankName?.toLowerCase() || 'bank',
                        method: acc.bankName?.toUpperCase() || 'BANK',
                        name: acc.bankName || 'Bank',
                        displayName: `${acc.bankName} - ${acc.accountNumber}`,
                        bankName: acc.bankName,
                        accountNumber: acc.accountNumber,
                        accountName: acc.accountName,
                        type: 'bank',
                        icon: 'building',
                        active: true
                    });
                });
        }

        // E-wallets
        if (paymentSettings.ewallets && Array.isArray(paymentSettings.ewallets)) {
            const providerLabels = {
                'gopay': 'GoPay', 'GoPay': 'GoPay',
                'ovo': 'OVO', 'OVO': 'OVO',
                'dana': 'DANA', 'DANA': 'DANA',
                'shopeepay': 'ShopeePay', 'ShopeePay': 'ShopeePay',
                'linkaja': 'LinkAja', 'LinkAja': 'LinkAja',
                'QRIS': 'QRIS', 'qris': 'QRIS'
            };

            paymentSettings.ewallets
                .filter(wallet => wallet.isActive !== false)
                .forEach(wallet => {
                    const label = providerLabels[wallet.provider] || wallet.provider || 'E-Wallet';
                    methods.push({
                        id: `ewallet_${wallet.id}`,
                        code: wallet.provider || 'ewallet',
                        method: label,
                        name: label,
                        displayName: `${label} - ${wallet.phoneNumber}`,
                        provider: wallet.provider,
                        phoneNumber: wallet.phoneNumber,
                        accountName: wallet.accountName,
                        type: 'ewallet',
                        icon: 'smartphone',
                        active: true
                    });
                });
        }

        logger.info(`[PAYMENT-METHODS] Returning ${methods.length} methods from DB`);
        res.json({
            success: true,
            data: {
                payment_methods: methods,
                total_count: methods.length
            }
        });

    } catch (error) {
        logger.error('[PAYMENT-METHODS] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil metode pembayaran'
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

// POST /api/v1/settings - Create/update single setting
router.post('/', async (req, res) => {
    try {
        const { key, value } = req.body;
        logger.info(`[SETTINGS] Received POST payload: ${JSON.stringify(req.body)}`);

        if (!key) {
            return res.status(400).json({
                success: false,
                message: 'Key harus diisi'
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
            message: 'Pengaturan berhasil disimpan'
        });

    } catch (error) {
        logger.error('Error saving setting:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menyimpan pengaturan'
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

// GET /api/v1/settings/payment-cleanup-retention - Get payment proof retention days
router.get('/payment-cleanup-retention', async (req, res) => {
    try {
        const result = await query(`
            SELECT value FROM app_config WHERE key = 'payment_cleanup_retention'
        `);

        const retentionDays = result.rows.length > 0
            ? parseInt(result.rows[0].value)
            : 35; // Default

        res.json({
            success: true,
            data: { retentionDays }
        });
    } catch (error) {
        logger.error('Error fetching payment cleanup retention:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil pengaturan'
        });
    }
});

// PUT /api/v1/settings/payment-cleanup-retention - Update payment proof retention days
router.put('/payment-cleanup-retention', async (req, res) => {
    try {
        const { retentionDays } = req.body;

        // Validate
        const days = parseInt(retentionDays);
        if (isNaN(days) || days < 7 || days > 365) {
            return res.status(400).json({
                success: false,
                message: 'Jumlah hari harus antara 7 dan 365'
            });
        }

        // Update or insert setting
        await query(`
            INSERT INTO app_config (key, value, type, category, description, updated_at)
            VALUES ('payment_cleanup_retention', $1, 'number', 'payments',
                    'Jumlah hari menyimpan bukti pembayaran setelah verifikasi', NOW())
            ON CONFLICT (key)
            DO UPDATE SET value = $1, updated_at = NOW()
        `, [days]);

        logger.info(`Payment cleanup retention updated to ${days} days`);

        res.json({
            success: true,
            data: { retentionDays: days },
            message: 'Pengaturan berhasil disimpan'
        });
    } catch (error) {
        logger.error('Error updating payment cleanup retention:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menyimpan pengaturan'
        });
    }
});

module.exports = router;