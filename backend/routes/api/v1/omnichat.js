/**
 * Kilusi Omnichat API Routes
 *
 * Routes for managing Omnichat WhatsApp Business API integration
 *
 * @module routes/api/v1/omnichat
 */

const express = require('express');
const router = express.Router();
const kilusiOmnichat = require('../../../config/kilusi-whatsapp');
const omnichatContactSync = require('../../../services/omnichat-contact-sync');
const { getSetting, updateSetting } = require('../../../config/settingsManager');
const { logger } = require('../../../config/logger');

// Note: JWT authentication is handled at the router level in index.js
// No need for additional requireAdmin middleware here

// ===========================
// STATUS & CONNECTION
// ===========================

/**
 * GET /api/v1/omnichat/status
 * Check Omnichat connection and API status
 */
router.get('/status', async (req, res) => {
    try {
        logger.info('[OmnichatAPI] Checking connection status');

        const result = await kilusiOmnichat.testConnection();

        if (result.success) {
            res.json({
                success: true,
                data: {
                    connected: result.connected,
                    api_key_valid: result.apiKeyValid,
                    whatsapp_connected: result.whatsappConnected,
                    status: result.status,
                    provider: getSetting('whatsapp_provider', 'omnichat'),
                    fallback_enabled: getSetting('baileys_fallback_enabled', false)
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to check Omnichat status',
                error: result.error
            });
        }
    } catch (error) {
        logger.error('[OmnichatAPI] Error checking status:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengecek status koneksi',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/omnichat/stats
 * Get Omnichat message statistics for today
 */
router.get('/stats', async (req, res) => {
    try {
        logger.info('[OmnichatAPI] Fetching message statistics');

        const messageLogger = require('../../../services/omnichat-message-logger');

        // Get today's date range (start of day to now)
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        const stats = await messageLogger.getStatistics({
            date_from: startOfDay,
            date_to: today
        });

        // Calculate delivery rate
        const totalMessages = stats.total_messages || 0;
        const successMessages = (stats.sent || 0) + (stats.delivered || 0) + (stats.read || 0);
        const deliveryRate = totalMessages > 0 ? Math.round((successMessages / totalMessages) * 100) : 0;

        res.json({
            success: true,
            data: {
                daily_messages: totalMessages,
                delivery_rate: deliveryRate,
                sent: stats.sent || 0,
                delivered: stats.delivered || 0,
                read: stats.read || 0,
                failed: stats.failed || 0
            }
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil statistik',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/omnichat/phone-numbers
 * Get available WhatsApp phone numbers from Omnichat
 */
router.get('/phone-numbers', async (req, res) => {
    try {
        logger.info('[OmnichatAPI] Fetching phone numbers');

        const result = await kilusiOmnichat.getPhoneNumbers();

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error fetching phone numbers:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil daftar nomor telepon',
            error: error.message
        });
    }
});

// ===========================
// TEMPLATES
// ===========================

/**
 * GET /api/v1/omnichat/templates
 * Get available WhatsApp templates from Omnichat
 */
router.get('/templates', async (req, res) => {
    try {
        const { status } = req.query;
        logger.info('[OmnichatAPI] Fetching templates', { status });

        const options = {};
        if (status) options.status = status;

        const result = await kilusiOmnichat.getWhatsAppTemplates(options);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error fetching templates:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil daftar template',
            error: error.message
        });
    }
});

/**
 * POST /api/v1/omnichat/templates/sync
 * Sync template status from Meta (Omnichat)
 */
router.post('/templates/sync', async (req, res) => {
    try {
        logger.info('[OmnichatAPI] Syncing template status from Meta');

        const result = await kilusiOmnichat.getWhatsAppTemplates();

        // Update local cache if needed
        // This could be stored in database or settings

        res.json({
            success: true,
            data: result,
            message: 'Template status berhasil di-sync'
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error syncing templates:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat sync template',
            error: error.message
        });
    }
});

// ===========================
// MESSAGING
// ===========================

/**
 * POST /api/v1/omnichat/send
 * Send a test message
 * Body: { phone: string, message: string, templateName?: string }
 */
router.post('/send', async (req, res) => {
    try {
        const { phone, message, templateName } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Nomor telepon wajib diisi'
            });
        }

        if (!message && !templateName) {
            return res.status(400).json({
                success: false,
                message: 'Message atau template name wajib diisi'
            });
        }

        // === DEDUPLICATION CHECK ===
        // Prevent duplicate sends within 5 seconds
        const dedupeKey = `${phone}_${templateName || message.substring(0, 50)}`;
        const now = Date.now();

        // Initialize dedupe cache if not exists
        if (!req.app.sendDedupe) {
            req.app.sendDedupe = new Map();
        }

        // Check if same message was sent recently (within 5 seconds)
        const lastSend = req.app.sendDedupe.get(dedupeKey);
        if (lastSend && (now - lastSend < 5000)) {
            logger.warn('[OmnichatAPI] Duplicate message blocked', {
                phone,
                templateName,
                timeSinceLastSend: `${now - lastSend}ms`
            });
            return res.status(429).json({
                success: false,
                message: 'Pesan yang sama baru saja dikirim. Silakan tunggu beberapa detik.',
                retryAfter: 5
            });
        }

        // Clean up old entries (older than 10 seconds)
        for (const [key, timestamp] of req.app.sendDedupe.entries()) {
            if (now - timestamp > 10000) {
                req.app.sendDedupe.delete(key);
            }
        }

        // Store this send attempt
        req.app.sendDedupe.set(dedupeKey, now);
        // ===========================

        logger.info('[OmnichatAPI] Sending test message', { phone, templateName });

        let result;
        if (templateName) {
            // Send using template
            const parameters = req.body.parameters || [];
            result = await kilusiOmnichat.sendTemplate(phone, templateName, 'id', parameters);
        } else {
            // Send custom message
            result = await kilusiOmnichat.sendMessage(phone, message);
        }

        res.json({
            success: true,
            data: result,
            message: 'Pesan berhasil dikirim'
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error sending message:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengirim pesan',
            error: error.message
        });
    }
});

// ===========================
// BILLING NOTIFICATIONS
// ===========================

/**
 * POST /api/v1/omnichat/billing/send
 * Send single billing notification
 * Body: { phoneNumber, customerName, invoiceNumber, amount, dueDate, templateName }
 */
router.post('/billing/send', async (req, res) => {
    try {
        const {
            phoneNumber,
            customerName,
            invoiceNumber,
            amount,
            dueDate,
            templateName
        } = req.body;

        // Validate required fields
        if (!phoneNumber || !customerName || !invoiceNumber || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Field wajib: phoneNumber, customerName, invoiceNumber, amount'
            });
        }

        logger.info('[OmnichatAPI] Sending billing notification', { phoneNumber, invoiceNumber });

        const result = await kilusiOmnichat.sendBillingNotification({
            phone_number: phoneNumber,
            customer_name: customerName,
            invoice_number: invoiceNumber,
            amount: parseFloat(amount),
            due_date: dueDate,
            template_name: templateName
        });

        res.json({
            success: true,
            data: result,
            message: 'Notifikasi tagihan berhasil dikirim'
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error sending billing notification:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengirim notifikasi tagihan',
            error: error.message
        });
    }
});

/**
 * POST /api/v1/omnichat/billing/bulk
 * Send bulk billing notifications
 * Body: { recipients: [], templateName }
 */
router.post('/billing/bulk', async (req, res) => {
    try {
        const { recipients, templateName } = req.body;

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Recipients harus berupa array yang tidak kosong'
            });
        }

        if (!templateName) {
            return res.status(400).json({
                success: false,
                message: 'Template name wajib diisi'
            });
        }

        logger.info('[OmnichatAPI] Sending bulk billing notifications', { count: recipients.length });

        const result = await kilusiOmnichat.sendBulkBillingNotifications(recipients, templateName);

        res.json({
            success: true,
            data: result,
            message: `${result.sent} notifikasi berhasil dikirim`
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error sending bulk billing notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengirim notifikasi bulk',
            error: error.message
        });
    }
});

/**
 * POST /api/v1/omnichat/billing/payment-confirmed
 * Send payment confirmation
 * Body: { phoneNumber, customerName, paymentAmount, paymentDate, invoiceNumber, templateName }
 */
router.post('/billing/payment-confirmed', async (req, res) => {
    try {
        const {
            phoneNumber,
            customerName,
            paymentAmount,
            paymentDate,
            invoiceNumber,
            templateName
        } = req.body;

        if (!phoneNumber || !customerName || !paymentAmount) {
            return res.status(400).json({
                success: false,
                message: 'Field wajib: phoneNumber, customerName, paymentAmount'
            });
        }

        logger.info('[OmnichatAPI] Sending payment confirmation', { phoneNumber, paymentAmount });

        const result = await kilusiOmnichat.sendPaymentConfirmation({
            phone_number: phoneNumber,
            customer_name: customerName,
            payment_amount: parseFloat(paymentAmount),
            payment_date: paymentDate,
            invoice_number: invoiceNumber,
            template_name: templateName
        });

        res.json({
            success: true,
            data: result,
            message: 'Konfirmasi pembayaran berhasil dikirim'
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error sending payment confirmation:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengirim konfirmasi pembayaran',
            error: error.message
        });
    }
});

/**
 * POST /api/v1/omnichat/billing/overdue
 * Send overdue notice
 * Body: { phoneNumber, customerName, invoiceNumber, amount, overdueDays, templateName }
 */
router.post('/billing/overdue', async (req, res) => {
    try {
        const {
            phoneNumber,
            customerName,
            invoiceNumber,
            amount,
            overdueDays,
            templateName
        } = req.body;

        if (!phoneNumber || !customerName || !invoiceNumber || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Field wajib: phoneNumber, customerName, invoiceNumber, amount'
            });
        }

        logger.info('[OmnichatAPI] Sending overdue notice', { phoneNumber, overdueDays });

        const result = await kilusiOmnichat.sendOverdueNotice({
            phone_number: phoneNumber,
            customer_name: customerName,
            invoice_number: invoiceNumber,
            amount: parseFloat(amount),
            overdue_days: parseInt(overdueDays) || 0,
            template_name: templateName
        });

        res.json({
            success: true,
            data: result,
            message: 'Notifikasi overdue berhasil dikirim'
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error sending overdue notice:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengirim notifikasi overdue',
            error: error.message
        });
    }
});

// ===========================
// CONTACT SYNC
// ===========================

/**
 * POST /api/v1/omnichat/sync-contacts
 * Sync customers to Omnichat contacts
 * Body: { customerIds?: string[] } - If not provided, sync all active customers
 */
router.post('/sync-contacts', async (req, res) => {
    try {
        const { customerIds } = req.body;

        logger.info('[OmnichatAPI] Syncing contacts to Omnichat', { customerIds });

        const result = await omnichatContactSync.syncContacts(customerIds);

        res.json({
            success: true,
            data: result,
            message: `${result.synced} kontak berhasil di-sync${result.failed > 0 ? `, ${result.failed} gagal` : ''}`
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error syncing contacts:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat sync kontak',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/omnichat/sync-status
 * Get last contact sync status
 */
router.get('/sync-status', async (req, res) => {
    try {
        const lastSync = await omnichatContactSync.getLastSyncStatus();
        const statistics = await omnichatContactSync.getSyncStatistics();
        const syncEnabled = getSetting('omnichat_sync_enabled', false);
        const syncSchedule = getSetting('omnichat_sync_schedule', 'manual');

        res.json({
            success: true,
            data: {
                enabled: syncEnabled,
                schedule: syncSchedule,
                last_sync: lastSync,
                statistics: {
                    total_syncs: statistics.total_syncs,
                    total_synced: statistics.total_synced,
                    total_failed: statistics.total_failed,
                    total_customers: statistics.total_customers
                }
            }
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error fetching sync status:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil status sync',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/omnichat/sync-history
 * Get sync history
 */
router.get('/sync-history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;

        const history = await omnichatContactSync.getSyncHistory(limit);

        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error fetching sync history:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil riwayat sync',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/omnichat/sync-statistics
 * Get sync statistics
 */
router.get('/sync-statistics', async (req, res) => {
    try {
        const statistics = await omnichatContactSync.getSyncStatistics();

        res.json({
            success: true,
            data: statistics
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error fetching sync statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil statistik sync',
            error: error.message
        });
    }
});

// ===========================
// SETTINGS
// ===========================

/**
 * GET /api/v1/omnichat/settings
 * Get Omnichat settings
 */
router.get('/settings', async (req, res) => {
    try {
        const settings = {
            provider: getSetting('whatsapp_provider', 'omnichat'),
            api_url: getSetting('kilusi_omnichat_api_url', 'https://whatsapp.kilusi.id/api'),
            timeout: getSetting('kilusi_omnichat_timeout', 30000),
            retry_count: getSetting('kilusi_omnichat_retry_count', 3),
            retry_delay: getSetting('kilusi_omnichat_retry_delay', 1000),
            fallback_enabled: getSetting('baileys_fallback_enabled', false),
            sync_enabled: getSetting('omnichat_sync_enabled', false),
            sync_schedule: getSetting('omnichat_sync_schedule', 'manual'),
            sync_time: getSetting('omnichat_sync_time', '02:00'),
            sync_tags_enabled: getSetting('omnichat_sync_tags_enabled', true),
            templates: {
                invoice_created: getSetting('kilusi_template_invoice_created'),
                payment_received: getSetting('kilusi_template_payment_received'),
                overdue_notice: getSetting('kilusi_template_overdue_notice'),
                service_suspension: getSetting('kilusi_template_service_suspension'),
                service_restoration: getSetting('kilusi_template_service_restoration'),
                welcome_message: getSetting('kilusi_template_welcome_message'),
                due_date_reminder: getSetting('kilusi_template_due_date_reminder')
            }
        };

        // Don't expose API key in full
        const apiKey = getSetting('kilusi_omnichat_api_key', '');
        if (apiKey) {
            settings.api_key_configured = true;
            settings.api_key_prefix = apiKey.substring(0, 10) + '...';
        } else {
            settings.api_key_configured = false;
            settings.api_key_prefix = '';
        }

        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error fetching settings:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil pengaturan Omnichat',
            error: error.message
        });
    }
});

/**
 * PUT /api/v1/omnichat/settings
 * Update Omnichat settings
 */
router.put('/settings', async (req, res) => {
    try {
        const settings = req.body;

        // Validate provider
        if (settings.provider && !['omnichat', 'baileys', 'dual'].includes(settings.provider)) {
            return res.status(400).json({
                success: false,
                message: 'Provider harus salah satu dari: omnichat, baileys, dual'
            });
        }

        // Update settings
        const updatedSettings = {};
        const settingsMap = {
            'provider': 'whatsapp_provider',
            'api_url': 'kilusi_omnichat_api_url',
            'api_key': 'kilusi_omnichat_api_key',
            'timeout': 'kilusi_omnichat_timeout',
            'retry_count': 'kilusi_omnichat_retry_count',
            'retry_delay': 'kilusi_omnichat_retry_delay',
            'fallback_enabled': 'baileys_fallback_enabled',
            'sync_enabled': 'omnichat_sync_enabled',
            'sync_schedule': 'omnichat_sync_schedule',
            'sync_time': 'omnichat_sync_time',
            'sync_tags_enabled': 'omnichat_sync_tags_enabled'
        };

        for (const [key, value] of Object.entries(settings)) {
            if (value !== undefined && settingsMap[key]) {
                await updateSetting(settingsMap[key], value);
                updatedSettings[settingsMap[key]] = value;
            }

            // Handle template names
            if (key.startsWith('template_') && value) {
                const templateKey = key.replace('template_', '');
                const settingKey = `kilusi_template_${templateKey}`;
                await updateSetting(settingKey, value);
                updatedSettings[settingKey] = value;
            }
        }

        logger.info('[OmnichatAPI] Settings updated', updatedSettings);

        res.json({
            success: true,
            data: updatedSettings,
            message: 'Pengaturan Omnichat berhasil diperbarui'
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error updating settings:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui pengaturan Omnichat',
            error: error.message
        });
    }
});

// ===========================
// EMERGENCY FALLBACK MANAGEMENT
// ===========================

const emergencyFallback = require('../../../services/emergency-fallback');

/**
 * GET /api/v1/omnichat/fallback/status
 * Get fallback status and statistics
 */
router.get('/fallback/status', async (req, res) => {
    try {
        const status = await emergencyFallback.getStatus();

        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error getting fallback status:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil status fallback',
            error: error.message
        });
    }
});

/**
 * POST /api/v1/omnichat/fallback/enable
 * Enable emergency fallback
 */
router.post('/fallback/enable', async (req, res) => {
    try {
        const result = await emergencyFallback.enableFallback();

        logger.info('[OmnichatAPI] Emergency fallback enabled');

        res.json({
            success: true,
            data: result,
            message: 'Emergency fallback berhasil diaktifkan'
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error enabling fallback:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengaktifkan fallback',
            error: error.message
        });
    }
});

/**
 * POST /api/v1/omnichat/fallback/disable
 * Disable emergency fallback
 */
router.post('/fallback/disable', async (req, res) => {
    try {
        const result = await emergencyFallback.disableFallback();

        logger.info('[OmnichatAPI] Emergency fallback disabled');

        res.json({
            success: true,
            data: result,
            message: 'Emergency fallback berhasil dinonaktifkan'
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error disabling fallback:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menonaktifkan fallback',
            error: error.message
        });
    }
});

/**
 * POST /api/v1/omnichat/fallback/manual-failover
 * Manually trigger failover to Baileys
 */
router.post('/fallback/manual-failover', async (req, res) => {
    try {
        const result = await emergencyFallback.manualFailover();

        logger.info('[OmnichatAPI] Manual failover triggered');

        res.json({
            success: true,
            data: result,
            message: 'Manual failover berhasil dilakukan'
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error triggering manual failover:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat melakukan manual failover',
            error: error.message
        });
    }
});

/**
 * POST /api/v1/omnichat/fallback/manual-recovery
 * Manually trigger recovery to Omnichat
 */
router.post('/fallback/manual-recovery', async (req, res) => {
    try {
        const result = await emergencyFallback.manualRecovery();

        logger.info('[OmnichatAPI] Manual recovery triggered');

        res.json({
            success: true,
            data: result,
            message: 'Manual recovery berhasil dilakukan'
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error triggering manual recovery:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat melakukan manual recovery',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/omnichat/fallback/events
 * Get fallback event history
 */
router.get('/fallback/events', async (req, res) => {
    try {
        const { limit = 50 } = req.query;

        const events = await emergencyFallback.getEventHistory(parseInt(limit));

        res.json({
            success: true,
            data: events,
            message: `${events.length} events ditemukan`
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error fetching fallback events:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil event history',
            error: error.message
        });
    }
});

/**
 * GET /api/v1/omnichat/fallback/statistics
 * Get fallback statistics
 */
router.get('/fallback/statistics', async (req, res) => {
    try {
        const stats = await emergencyFallback.getStatistics();

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error fetching fallback statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil statistik',
            error: error.message
        });
    }
});

/**
 * PUT /api/v1/omnichat/fallback/settings
 * Update fallback settings
 */
router.put('/fallback/settings', async (req, res) => {
    try {
        const {
            failureThreshold,
            recoveryThreshold,
            autoRecoveryEnabled,
            healthCheckInterval
        } = req.body;

        const settings = {};
        if (failureThreshold !== undefined) settings.failureThreshold = parseInt(failureThreshold);
        if (recoveryThreshold !== undefined) settings.recoveryThreshold = parseInt(recoveryThreshold);
        if (autoRecoveryEnabled !== undefined) settings.autoRecoveryEnabled = autoRecoveryEnabled;
        if (healthCheckInterval !== undefined) settings.healthCheckInterval = parseInt(healthCheckInterval);

        const result = await emergencyFallback.updateSettings(settings);

        logger.info('[OmnichatAPI] Fallback settings updated', settings);

        res.json({
            success: true,
            data: result,
            message: 'Pengaturan fallback berhasil diperbarui'
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error updating fallback settings:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui pengaturan fallback',
            error: error.message
        });
    }
});

/**
 * POST /api/v1/omnichat/fallback/health-check
 * Trigger manual health check
 */
router.post('/fallback/health-check', async (req, res) => {
    try {
        const result = await emergencyFallback.performHealthCheck();

        logger.info('[OmnichatAPI] Manual health check triggered');

        res.json({
            success: true,
            data: result,
            message: 'Health check berhasil dilakukan'
        });
    } catch (error) {
        logger.error('[OmnichatAPI] Error performing health check:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat melakukan health check',
            error: error.message
        });
    }
});

module.exports = router;

/**
 * DEBUG: Test endpoint to check auth
 */
router.get('/debug-auth', (req, res) => {
    res.json({
        message: 'Debug auth',
        user: req.user || null,
        headers: req.headers.authorization || null
    });
});
