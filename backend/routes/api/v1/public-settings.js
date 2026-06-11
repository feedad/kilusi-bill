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

// GET /api/v1/public/bank-accounts
// Returns bank accounts + company info for the isolir page
router.get('/bank-accounts', async (req, res) => {
    try {
        const company = await getSetting('company') || {};
        const paymentSettings = await getSetting('payment_settings') || {};
        const branding = await getSetting('branding') || {};

        res.json({
            success: true,
            data: {
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
                    logoUrl: branding.logoUrl || '',
                    faviconUrl: branding.faviconUrl || ''
                },
                bankAccounts: (paymentSettings.bank_accounts || []).filter(b => b.isActive !== false),
                ewallets: (paymentSettings.ewallets || []).filter(e => e.isActive !== false)
            }
        });
    } catch (error) {
        logger.error('Error fetching bank accounts:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat data pembayaran' });
    }
});

module.exports = router;
