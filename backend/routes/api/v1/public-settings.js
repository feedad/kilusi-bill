const express = require('express');
const router = express.Router();
const { getSetting } = require('../../../config/settingsManager');
const { logger } = require('../../../config/logger');

// GET /api/v1/public/settings
// Returns publicly safe settings (Company Info, Branding, Support Contacts)
router.get('/settings', async (req, res) => {
    try {
        // Fetch specific settings we want to expose
        const company = await getSetting('company') || {};
        const branding = await getSetting('branding') || {};

        // Construct safe response
        const publicSettings = {
            company: {
                name: company.name || 'Kilusi Bill',
                address: company.address || '',
                phone: company.phone || '',
                email: company.email || '',
                website: company.website || '',
                supportContacts: company.supportContacts || [],
                operatingHours: company.operatingHours || {}
            },
            branding: {
                siteTitle: branding.siteTitle || 'Kilusi Bill',
                titleType: branding.titleType || 'text',
                logoUrl: branding.logoUrl || '',
                faviconUrl: branding.faviconUrl || ''
            }
        };

        res.json({
            success: true,
            data: publicSettings
        });

    } catch (error) {
        logger.error('Error fetching public settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch public settings'
        });
    }
});

module.exports = router;
