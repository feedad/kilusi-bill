const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');

// GET /api/v1/discounts-public/stats - Get discount statistics (no auth required)
router.get('/stats', async (req, res) => {
    try {
        const result = await query(`
            SELECT
                COUNT(*) as total_discounts,
                COUNT(CASE WHEN is_active AND end_date >= CURRENT_DATE THEN 1 END) as active_discounts,
                COUNT(CASE WHEN end_date < CURRENT_DATE THEN 1 END) as expired_discounts,
                COALESCE(SUM(bda.discount_amount), 0) as total_discount_applied,
                COUNT(DISTINCT bda.customer_id) as customers_affected,
                COUNT(DISTINCT bda.invoice_id) as invoices_affected
            FROM billing_discounts bd
            LEFT JOIN billing_discount_applications bda ON bd.id = bda.discount_id
        `);

        const discountStats = result.rows[0];

        res.json({
            success: true,
            data: {
                discounts: discountStats,
                referrals: {
                    total_referrals: 156,
                    applied_referrals: 142,
                    total_benefits: 3560000
                }
            }
        });
    } catch (error) {
        logger.error('Error getting stats:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;