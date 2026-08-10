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
        const { customer_id, service_number } = req.query;
        const { query } = require('../../../config/database');
        const company = await getSetting('company') || {};
        const paymentSettings = await getSetting('payment_settings') || {};
        const branding = await getSetting('branding') || {};

        let customerMitraId = null;
        if (customer_id || service_number) {
            let whereClause = 'WHERE s.customer_id = $1';
            let params = [customer_id];
            if (service_number) {
                whereClause = 'WHERE s.service_number = $1';
                params = [service_number];
            }
            const mitraRes = await query(`
                SELECT m.id as mitra_id
                FROM services s
                JOIN regions r ON r.id = s.region_id
                JOIN mitra m ON m.id = r.mitra_id
                ${whereClause}
                LIMIT 1
            `, params);
            customerMitraId = mitraRes.rows[0]?.mitra_id || null;
        }

        const filterAccountForMitra = (acc) => {
            if (acc.isActive === false) return false;
            if (acc.is_company === true) return true;
            if (!acc.mitra_id) return true;
            return customerMitraId && String(acc.mitra_id) === String(customerMitraId);
        };

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
                bankAccounts: (paymentSettings.bank_accounts || []).filter(filterAccountForMitra),
                ewallets: (paymentSettings.ewallets || []).filter(filterAccountForMitra)
            }
        });
    } catch (error) {
        logger.error('Error fetching bank accounts:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat data pembayaran' });
    }
});

module.exports = router;
