const express = require('express');
const router = express.Router();
const { requireAdminAuth } = require('../config/middleware');
const settingsManager = require('../config/settingsManager');
const { logger } = require('../config/logger');

// GET WhatsApp Settings Page
router.get('/', requireAdminAuth, (req, res) => {
  try {
    const settings = settingsManager.getSettingsWithCache();
    res.render('admin-whatsapp-settings', {
      page: 'whatsapp-settings',
      settings,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    logger.error(`Error loading WhatsApp settings: ${error.message}`);
    res.status(500).send('Error loading settings');
  }
});

// POST Update WhatsApp Settings
router.post('/update', requireAdminAuth, (req, res) => {
  try {
    const {
      whatsapp_enabled,
      whatsapp_number,
      whatsapp_api_key,
      whatsapp_api_url,
      whatsapp_session_name,
      whatsapp_auto_reply,
      whatsapp_keep_alive,
      whatsapp_welcome_message,
      whatsapp_payment_reminder,
      whatsapp_invoice_template,
      whatsapp_payment_confirmation
    } = req.body;

    const settings = settingsManager.getSettingsWithCache();
    
    // Update WhatsApp settings
    settings.whatsapp_enabled = whatsapp_enabled === 'on';
    settings.whatsapp_number = whatsapp_number || settings.whatsapp_number;
    settings.whatsapp_api_key = whatsapp_api_key || settings.whatsapp_api_key;
    settings.whatsapp_api_url = whatsapp_api_url || settings.whatsapp_api_url;
    settings.whatsapp_session_name = whatsapp_session_name || settings.whatsapp_session_name;
    settings.whatsapp_auto_reply = whatsapp_auto_reply === 'on';
    settings.whatsapp_keep_alive = whatsapp_keep_alive === 'true' || whatsapp_keep_alive === 'on';
    
    // Update templates
    if (whatsapp_welcome_message) settings.whatsapp_welcome_message = whatsapp_welcome_message;
    if (whatsapp_payment_reminder) settings.whatsapp_payment_reminder = whatsapp_payment_reminder;
    if (whatsapp_invoice_template) settings.whatsapp_invoice_template = whatsapp_invoice_template;
    if (whatsapp_payment_confirmation) settings.whatsapp_payment_confirmation = whatsapp_payment_confirmation;

    settingsManager.saveSettings(settings);
    
    logger.info(`WhatsApp settings updated by admin`);
    res.redirect('/admin/whatsapp-settings?success=' + encodeURIComponent('Pengaturan WhatsApp berhasil diperbarui'));
  } catch (error) {
    logger.error(`Error updating WhatsApp settings: ${error.message}`);
    res.redirect('/admin/whatsapp-settings?error=' + encodeURIComponent('Gagal memperbarui pengaturan WhatsApp'));
  }
});

module.exports = router;
