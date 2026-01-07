/**
 * Create Blog Posts Table
 */
const { query } = require('../config/database');
const { logger } = require('../config/logger');

(async () => {
    try {
        console.log('Creating blog_posts table...');
        await query(`
            CREATE TABLE IF NOT EXISTS blog_posts (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                slug VARCHAR(255) UNIQUE NOT NULL,
                content TEXT,
                excerpt TEXT,
                cover_image VARCHAR(255),
                is_published BOOLEAN DEFAULT false,
                author_id INTEGER,
                views INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_posts_slug ON blog_posts(slug);
            CREATE INDEX IF NOT EXISTS idx_posts_published ON blog_posts(is_published);
        `);
        console.log('✅ blog_posts table created successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to create blog_posts table:', error);
        process.exit(1);
    }
})();
