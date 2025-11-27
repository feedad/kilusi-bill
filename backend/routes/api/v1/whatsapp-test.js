const express = require('express');
const router = express.Router();
const whatsappAPI = require('../../../services/whatsapp-cloud-api');
const { sendBillingNotification, sendPaymentConfirmation } = require('../../../webhook/whatsapp');

/**
 * Test WhatsApp Cloud API connection
 * GET /api/v1/whatsapp-test/status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await whatsappAPI.getPhoneNumberStatus();
    res.json({
      success: true,
      message: 'WhatsApp Cloud API status check',
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check WhatsApp status',
      error: error.message
    });
  }
});

/**
 * Send test message
 * POST /api/v1/whatsapp-test/send
 */
router.post('/send', async (req, res) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and message are required'
      });
    }

    const result = await whatsappAPI.sendTextMessage(to, message);
    res.json({
      success: true,
      message: 'Test message sent',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send test message',
      error: error.message
    });
  }
});

/**
 * Send test billing notification
 * POST /api/v1/whatsapp-test/billing
 */
router.post('/billing', async (req, res) => {
  try {
    const { to, billingData } = req.body;

    if (!to || !billingData) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and billing data are required'
      });
    }

    const result = await sendBillingNotification(to, billingData);
    res.json({
      success: true,
      message: 'Billing notification sent',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send billing notification',
      error: error.message
    });
  }
});

/**
 * Send test payment confirmation
 * POST /api/v1/whatsapp-test/payment
 */
router.post('/payment', async (req, res) => {
  try {
    const { to, paymentData } = req.body;

    if (!to || !paymentData) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and payment data are required'
      });
    }

    const result = await sendPaymentConfirmation(to, paymentData);
    res.json({
      success: true,
      message: 'Payment confirmation sent',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send payment confirmation',
      error: error.message
    });
  }
});

/**
 * Send test template message
 * POST /api/v1/whatsapp-test/template
 */
router.post('/template', async (req, res) => {
  try {
    const { to, templateName, components } = req.body;

    if (!to || !templateName) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and template name are required'
      });
    }

    const result = await whatsappAPI.sendTemplateMessage(to, templateName, components || []);
    res.json({
      success: true,
      message: 'Template message sent',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send template message',
      error: error.message
    });
  }
});

/**
 * Send test media message
 * POST /api/v1/whatsapp-test/media
 */
router.post('/media', async (req, res) => {
  try {
    const { to, mediaUrl, mediaType, caption } = req.body;

    if (!to || !mediaUrl || !mediaType) {
      return res.status(400).json({
        success: false,
        message: 'Phone number, media URL, and media type are required'
      });
    }

    const result = await whatsappAPI.sendMediaMessage(to, mediaUrl, mediaType, caption);
    res.json({
      success: true,
      message: 'Media message sent',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send media message',
      error: error.message
    });
  }
});

/**
 * Get usage statistics
 * GET /api/v1/whatsapp-test/usage
 */
router.get('/usage', async (req, res) => {
  try {
    const stats = await whatsappAPI.getUsageStats();
    res.json({
      success: true,
      message: 'Usage statistics',
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get usage statistics',
      error: error.message
    });
  }
});

/**
 * WhatsApp Cloud API Setup Information
 * GET /api/v1/whatsapp-test/setup-info
 */
router.get('/setup-info', (req, res) => {
  res.json({
    success: true,
    message: 'WhatsApp Cloud API Setup Information',
    data: {
      required_env_vars: {
        WHATSAPP_ACCESS_TOKEN: 'EAADKQZC... (Get from Meta for Developers)',
        WHATSAPP_PHONE_NUMBER_ID: '123456789 (Get from WhatsApp Business App)',
        WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'mysecrettoken123 (Custom token for webhook verification)',
        WHATSAPP_API_VERSION: 'v18.0 (Default API version)',
        ADMIN_WHATSAPP_NUMBER: '6281947215703 (Admin phone for notifications)'
      },
      webhook_url: 'https://your-domain.com/webhook/whatsapp',
      setup_steps: [
        '1. Create Meta Business Account',
        '2. Create WhatsApp Business App in Meta for Developers',
        '3. Get Phone Number ID and Access Token',
        '4. Configure webhook URL in Meta for Developers',
        '5. Update environment variables',
        '6. Test with this API endpoint'
      ],
      rate_limits: {
        free_tier: '1000 conversations/month',
        rate_limit: '1 message/second',
        business_window: '24 hours for customer service'
      },
      message_types: [
        'Text messages',
        'Template messages (business initiated)',
        'Media messages (image, document, audio, video)',
        'Interactive messages (buttons, lists)'
      ],
      test_endpoints: [
        'GET /api/v1/whatsapp-test/status - Check API connection',
        'POST /api/v1/whatsapp-test/send - Send test text message',
        'POST /api/v1/whatsapp-test/billing - Send billing notification',
        'POST /api/v1/whatsapp-test/payment - Send payment confirmation',
        'POST /api/v1/whatsapp-test/template - Send template message',
        'POST /api/v1/whatsapp-test/media - Send media message',
        'GET /api/v1/whatsapp-test/usage - Get usage statistics'
      ]
    }
  });
});

module.exports = router;