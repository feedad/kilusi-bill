
const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const { jwtAuth } = require('../../../middleware/jwtAuth');
const { asyncHandler } = require('../../../middleware/response');

// GET /api/v1/notifications
// Fetch recent notifications
router.get('/', jwtAuth, asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;

    // Fetch unread notifications + read ones up to limit
    const sql = `
        SELECT * FROM admin_notifications 
        ORDER BY created_at DESC 
        LIMIT $1
    `;

    const result = await query(sql, [limit]);

    // Count unread
    const countSql = `SELECT COUNT(*) as unread FROM admin_notifications WHERE is_read = false`;
    const countResult = await query(countSql);

    // Parse data JSON
    const data = result.rows.map(row => ({
        ...row,
        data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data
    }));

    return res.sendSuccess(data, {
        unreadCount: parseInt(countResult.rows[0].unread),
        total: result.rowCount
    });
}));

// PUT /api/v1/notifications/:id/read
// Mark as read
router.put('/:id/read', jwtAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;

    await query(`UPDATE admin_notifications SET is_read = true WHERE id = $1`, [id]);

    return res.sendSuccess({ success: true });
}));

// PUT /api/v1/notifications/read-all
// Mark all as read
router.put('/read-all', jwtAuth, asyncHandler(async (req, res) => {
    await query(`UPDATE admin_notifications SET is_read = true WHERE is_read = false`);

    return res.sendSuccess({ success: true });
}));

module.exports = router;
