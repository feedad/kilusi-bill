const express = require('express');
const router = express.Router();

// Import middleware
const { jwtAuth } = require('../../../middleware/jwtAuth');

// Import route modules
router.use('/auth', require('./auth'));
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

module.exports = router;