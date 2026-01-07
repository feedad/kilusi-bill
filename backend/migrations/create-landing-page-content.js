const { query } = require('../config/database');
const { logger } = require('../config/logger');

async function runMigration() {
    const client = await require('pg').Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    }).connect();

    try {
        await client.query('BEGIN');

        // Create landing_page_content table
        await client.query(`
            CREATE TABLE IF NOT EXISTS landing_page_content (
                id SERIAL PRIMARY KEY,
                section_key VARCHAR(50) UNIQUE NOT NULL,
                content JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Insert Default Content (Hero)
        await client.query(`
            INSERT INTO landing_page_content (section_key, content)
            VALUES ('hero', '{"headline": "Internet Cepat & Stabil", "subheadline": "Jaringan Fiber Optic Premium untuk Keluarga Anda", "ctaText": "Daftar Sekarang"}')
            ON CONFLICT (section_key) DO NOTHING;
        `);

        // Insert Default Content (Features)
        await client.query(`
            INSERT INTO landing_page_content (section_key, content)
            VALUES ('features', '[
                {"icon": "Speed", "title": "Kecepatan Tinggi", "description": "Nikmati streaming dan gaming tanpa lag."},
                {"icon": "Support", "title": "Support 24/7", "description": "Tim teknis kami siap membantu kapan saja."},
                {"icon": "Stable", "title": "Koneksi Stabil", "description": "Menggunakan teknologi Fiber Optic terbaru."}
            ]')
            ON CONFLICT (section_key) DO NOTHING;
        `);

        // Insert Default Content (Testimonials)
        await client.query(`
            INSERT INTO landing_page_content (section_key, content)
            VALUES ('testimonials', '[]')
            ON CONFLICT (section_key) DO NOTHING;
        `);

        // Insert Default Content (Banners)
        await client.query(`
            INSERT INTO landing_page_content (section_key, content)
            VALUES ('banners', '[]')
            ON CONFLICT (section_key) DO NOTHING;
        `);

        await client.query('COMMIT');
        logger.info('Migration for landing_page_content executed successfully');
    } catch (e) {
        await client.query('ROLLBACK');
        logger.error('Migration failed:', e);
    } finally {
        client.release();
    }
}

runMigration().then(() => process.exit(0));
