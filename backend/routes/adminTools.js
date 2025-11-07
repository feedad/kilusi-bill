const express = require('express');
const router = express.Router();
const { requireAdminAuth } = require('../config/middleware');
const settingsManager = require('../config/settingsManager');

// GET: Halaman Admin Tools
router.get('/', requireAdminAuth, async (req, res) => {
    try {
        const settings = settingsManager.getSettingsWithCache();
        
        res.render('admin-tools', {
            title: 'Network Tools - Admin',
            settings: settings,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('Error rendering admin tools:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
