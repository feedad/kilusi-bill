const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const PaymentGatewayManager = require('../../../config/paymentGateway');

// Initialize payment gateway manager
const paymentGateway = new PaymentGatewayManager();

// GET /api/v1/payment-test/gateways - Test gateway status
router.get('/gateways', async (req, res) => {
  try {
    const gatewayStatus = paymentGateway.getGatewayStatus();

    res.json({
      success: true,
      data: gatewayStatus,
      message: 'Payment gateways status retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching payment gateways:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/v1/payment-test/methods - Test payment methods
router.get('/methods', async (req, res) => {
  try {
    const methods = await paymentGateway.getAvailablePaymentMethods();

    res.json({
      success: true,
      data: methods,
      message: 'Payment methods retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching payment methods:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/v1/payment-test/database - Test database connection and tables
router.get('/database', async (req, res) => {
  try {
    const { query } = require('../../../config/database');

    // Test payment_transactions table
    const transactionsResult = await query(`
      SELECT COUNT(*) as count FROM payment_transactions
    `);

    // Test invoices table with payment columns
    const invoicesResult = await query(`
      SELECT COUNT(*) as count FROM invoices WHERE payment_gateway IS NOT NULL
    `);

    // Test payment_gateway_settings table
    const settingsResult = await query(`
      SELECT COUNT(*) as count FROM payment_gateway_settings
    `);

    res.json({
      success: true,
      data: {
        payment_transactions_count: transactionsResult.rows[0].count,
        invoices_with_payment_count: invoicesResult.rows[0].count,
        gateway_settings_count: settingsResult.rows[0].count
      },
      message: 'Database tables tested successfully'
    });
  } catch (error) {
    logger.error('Error testing database:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/v1/payment-test/tripay-config - Test Tripay configuration
router.get('/tripay-config', async (req, res) => {
  try {
    const { getSetting } = require('../../../config/settingsManager');

    const config = {
      api_key: getSetting('tripay_api_key', ''),
      private_key: getSetting('tripay_private_key', ''),
      merchant_code: getSetting('tripay_merchant_code', ''),
      mode: getSetting('tripay_mode', 'sandbox'),
      has_credentials: !!(getSetting('tripay_api_key') && getSetting('tripay_private_key') && getSetting('tripay_merchant_code')),
      webhook_url: `${req.protocol}://${req.get('host')}/api/v1/payments/webhook/tripay`
    };

    res.json({
      success: true,
      data: config,
      message: 'Tripay configuration retrieved'
    });
  } catch (error) {
    logger.error('Error fetching Tripay config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;