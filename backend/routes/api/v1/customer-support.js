const express = require('express');
const router = express.Router();
const supportRouter = require('./support');

// Copy support routes but without authentication requirement
router.use('/', supportRouter);

// Add notifications endpoint
router.get('/notifications', async (req, res) => {
    try {
        // For now, return empty notifications array
        // This can be implemented later when notification system is ready
        res.json({
            success: true,
            data: []
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notifications'
        });
    }
});

module.exports = router;