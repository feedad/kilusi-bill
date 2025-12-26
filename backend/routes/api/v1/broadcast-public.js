const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');

// GET /api/v1/broadcast-public/messages/active - Get active messages for customer display
router.get('/messages/active', async (req, res) => {
  try {
    const customerId = req.query.customer_id;
    const customerRegion = req.query.region;

    let whereClause = `
      WHERE is_active = true
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `;
    const queryParams = [];
    let paramIndex = 1;

    if (customerId) {
      // Get customer's region from database
      const customerQuery = `SELECT area FROM customers WHERE id = $1`;
      const customerResult = await query(customerQuery, [customerId]);

      if (customerResult.rows.length > 0) {
        const customerRegionName = customerResult.rows[0].area;

        whereClause += ` AND (
          target_all = true
          OR target_areas IS NULL
          OR $${paramIndex} = ANY(string_to_array(replace(target_areas::text, '"', ''), ','))
        )`;
        queryParams.push(customerRegionName);
        paramIndex++;
      }
    } else if (customerRegion) {
      whereClause += ` AND (
        target_all = true
        OR target_areas IS NULL
        OR $${paramIndex} = ANY(string_to_array(replace(target_areas::text, '"', ''), ','))
      )`;
      queryParams.push(customerRegion);
      paramIndex++;
    }

    const messagesQuery = `
      SELECT id, title, message, type, priority, created_at, expires_at
      FROM broadcast_messages
      ${whereClause}
      ORDER BY
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        created_at DESC
      LIMIT 10
    `;

    const result = await query(messagesQuery, queryParams);

    res.json({
      success: true,
      data: {
        messages: result.rows,
        total: result.rows.length
      }
    });
  } catch (error) {
    console.error('Error fetching active broadcast messages:', error);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil pesan aktif'
    });
  }
});

module.exports = router;