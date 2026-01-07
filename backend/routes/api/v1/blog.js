const express = require('express');
const router = express.Router();
const { query } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// ==========================================
// PUBLIC ENDPOINTS
// ==========================================

/**
 * GET /blog/posts
 * Fetch published posts
 */
router.get('/posts', async (req, res) => {
    try {
        const { limit = 10, page = 1 } = req.query;
        const offset = (page - 1) * limit;

        const result = await query(`
            SELECT id, title, slug, excerpt, cover_image, created_at 
            FROM blog_posts 
            WHERE is_published = true 
            ORDER BY created_at DESC 
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const countRes = await query(`SELECT COUNT(*) FROM blog_posts WHERE is_published = true`);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                total: parseInt(countRes.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        logger.error('Error fetching blog posts:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

/**
 * GET /blog/posts/:slug
 * Fetch single post by slug
 */
router.get('/posts/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const result = await query(`
            SELECT * FROM blog_posts WHERE slug = $1 AND is_published = true
        `, [slug]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        // Increment views
        await query('UPDATE blog_posts SET views = views + 1 WHERE id = $1', [result.rows[0].id]);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Error fetching post:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});


// ==========================================
// ADMIN ENDPOINTS (Protected)
// ==========================================
// Note: Ensure admin middleware is applied in parent route or here

/**
 * GET /blog/admin/posts
 * List all posts (including drafts)
 */
router.get('/admin/posts', async (req, res) => {
    try {
        const result = await query('SELECT * FROM blog_posts ORDER BY created_at DESC');
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Error fetching admin posts:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

/**
 * POST /blog/admin/posts
 * Create new post
 */
router.post('/admin/posts', async (req, res) => {
    try {
        const { title, slug, content, excerpt, cover_image, is_published } = req.body;

        // Simple validation
        if (!title || !slug) return res.status(400).json({ success: false, message: 'Title and Slug required' });

        const result = await query(`
            INSERT INTO blog_posts (title, slug, content, excerpt, cover_image, is_published)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [title, slug, content, excerpt, cover_image, is_published || false]);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Error creating post:', error);
        if (error.code === '23505') return res.status(400).json({ success: false, message: 'Slug already exists' });
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

/**
 * PUT /blog/admin/posts/:id
 * Update post
 */
router.put('/admin/posts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, slug, content, excerpt, cover_image, is_published } = req.body;

        const result = await query(`
            UPDATE blog_posts 
            SET title = $1, slug = $2, content = $3, excerpt = $4, cover_image = $5, is_published = $6, updated_at = CURRENT_TIMESTAMP
            WHERE id = $7
            RETURNING *
        `, [title, slug, content, excerpt, cover_image, is_published, id]);

        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Post not found' });

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Error updating post:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

/**
 * DELETE /blog/admin/posts/:id
 * Delete post
 */
router.delete('/admin/posts/:id', async (req, res) => {
    try {
        await query('DELETE FROM blog_posts WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Post deleted' });
    } catch (error) {
        logger.error('Error deleting post:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;
