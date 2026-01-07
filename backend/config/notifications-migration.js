
const { query } = require('./database');
const { logger } = require('./logger');

async function runMigration() {
    try {
        const sql = `
            CREATE TABLE IF NOT EXISTS admin_notifications (
                id SERIAL PRIMARY KEY,
                type VARCHAR(50) NOT NULL, -- 'registration', 'payment', 'system', 'ticket'
                title VARCHAR(255) NOT NULL,
                message TEXT,
                data JSONB DEFAULT '{}',
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await query(sql);
        logger.info('✅ admin_notifications table ensured');
    } catch (error) {
        logger.error('❌ Failed to ensure admin_notifications table:', error);
    }
}

module.exports = runMigration;
