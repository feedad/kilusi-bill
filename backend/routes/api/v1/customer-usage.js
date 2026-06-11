const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// GET /api/v1/customer-usage/:serviceId - Accumulated traffic for current billing cycle
router.get('/:serviceId', async (req, res) => {
    try {
        const { serviceId } = req.params;

        const usage = await query(`
            SELECT bytes_in, bytes_out, period_start, period_end
            FROM customer_usage
            WHERE service_id = $1
              AND period_start <= CURRENT_DATE
              AND period_end > CURRENT_DATE
            ORDER BY period_start DESC
            LIMIT 1
        `, [serviceId]);

        if (usage.rows.length === 0) {
            return res.json({ bytes_in: 0, bytes_out: 0, total_bytes: 0, period_start: null, period_end: null });
        }

        const row = usage.rows[0];
        res.json({
            bytes_in: Number(row.bytes_in),
            bytes_out: Number(row.bytes_out),
            total_bytes: Number(row.bytes_in) + Number(row.bytes_out),
            period_start: row.period_start,
            period_end: row.period_end
        });
    } catch (error) {
        logger.error('Error fetching customer usage:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
