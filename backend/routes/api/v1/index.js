const express = require('express');
const router = express.Router();

// Import middleware
const { jwtAuth } = require('../../../middleware/jwtAuth');

// Import API management tracking
const { trackApiCall } = require('./api-management');

// Apply tracking middleware to all API routes
router.use(trackApiCall);

// Import route modules
router.use('/auth', require('./auth'));
router.use('/admins', jwtAuth, require('./admins'));
router.use('/customers', jwtAuth, require('./customers'));
router.use('/packages', jwtAuth, require('./packages'));
router.use('/billing', jwtAuth, require('./billing'));
router.use('/customer-billing', require('./customer-billing'));
router.use('/regions', jwtAuth, require('./regions'));
router.use('/dashboard', require('./dashboard'));
router.use('/settings', jwtAuth, require('./settings'));
router.use('/realtime', jwtAuth, require('./realtime'));
router.use('/radius', jwtAuth, require('./radius'));
router.use('/genieacs', require('./genieacs'));
router.use('/technician', jwtAuth, require('./technician'));
router.use('/whatsapp', require('./whatsapp')); // Re-enabled WhatsApp functionality
// Separate auth and non-auth billing cycle routes
router.use('/billing-cycles', require('./billing-cycles-public'));
router.use('/billing-cycles', jwtAuth, require('./billing-cycles'));
router.use('/odp', jwtAuth, require('./odp'));
router.use('/cable-routes', jwtAuth, require('./cable-routes'));
router.use('/customer-settings', require('./customer-settings'));
router.use('/financial', jwtAuth, require('./financial'));
router.use('/accounting', jwtAuth, require('./accounting'));
router.use('/installation-fees', require('./installation-fees')); // Temporarily remove auth for testing
router.use('/auto-expenses', jwtAuth, require('./auto-expenses'));
router.use('/referrals', jwtAuth, require('./referrals'));
router.use('/customer-referrals', require('./customer-referrals'));
router.use('/discounts', jwtAuth, require('./discounts'));
router.use('/discounts-public', require('./discounts-public'));
router.use('/whatsapp-test', jwtAuth, require('./whatsapp-test'));
router.use('/customer-auth', require('./customer-auth'));
router.use('/customer-auth-nextjs', require('./customer-auth-nextjs'));
router.use('/support', jwtAuth, require('./support'));
router.use('/customer-support', require('./customer-support'));
router.use('/customer-radius', require('./customer-radius'));
router.use('/customer-traffic', require('./customer-traffic'));
router.use('/simple-customer', require('./simple-customer'));
router.use('/broadcasts', jwtAuth, require('./broadcast'));
router.use('/broadcast-public', require('./broadcast-public'));
router.use('/maintenance', jwtAuth, require('./maintenance')); // New maintenance route
router.use('/services', jwtAuth, require('./services'));
router.use('/radius-comments', jwtAuth, require('./radius-comments'));
router.use('/branding-public', require('./branding-public'));
router.use('/branding', jwtAuth, require('./branding'));
router.use('/system', require('./system'));
router.use('/monitoring', jwtAuth, require('./monitoring'));
router.use('/landing', require('./landing-page'));
router.use('/notifications', jwtAuth, require('./notifications'));
router.use('/blog', require('./blog')); // Blog Routes
router.use('/public', require('./public-registration')); // Public Registration
// Import payments routes
const { router: paymentsRouter, webhookRouter } = require('./payments');

// Webhook routes (no auth required for external payment gateways) - mounted first
router.use('/payments/webhook', webhookRouter);

// Payment routes (with auth for admin operations) - mounted after webhook routes
router.use('/payments', jwtAuth, paymentsRouter);

router.use('/customer-payments', require('./customer-payments'));
router.use('/payment-upload', require('./payment-upload'));
router.use('/payment-test', require('./payment-test'));

// API Management routes (admin only)
router.use('/api-management', require('./api-management').router);

// Development-only endpoints
router.use('/dev-generate-token', require('./dev-generate-token'));

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Public Settings Route
const publicSettingsRouter = require('./public-settings');
router.use('/public', publicSettingsRouter);

module.exports = router;