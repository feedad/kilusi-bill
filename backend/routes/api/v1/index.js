const express = require('express');
const router = express.Router();

// Import middleware
const { jwtAuth } = require('../../../middleware/jwtAuth');

// Import route modules
router.use('/auth', require('./auth'));
router.use('/customers', jwtAuth, require('./customers'));
router.use('/packages', jwtAuth, require('./packages'));
router.use('/billing', jwtAuth, require('./billing'));
router.use('/dashboard', require('./dashboard'));
router.use('/settings', jwtAuth, require('./settings'));
router.use('/realtime', jwtAuth, require('./realtime'));
router.use('/radius', jwtAuth, require('./radius'));
router.use('/genieacs', require('./genieacs'));
router.use('/technician', jwtAuth, require('./technician'));

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

module.exports = router;