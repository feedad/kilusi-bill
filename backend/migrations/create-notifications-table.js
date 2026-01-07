const { query } = require('../config/database');
const { logger } = require('../config/logger');

async function run() {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS admin_notifications (
                id SERIAL PRIMARY KEY,
                type VARCHAR(50) NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT,
                data JSONB,
                is_read BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at ON admin_notifications(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_admin_notifications_is_read ON admin_notifications(is_read);
        `);
        logger.info('✅ admin_notifications table created');
    } catch (error) {
        logger.error('❌ Failed to create admin_notifications table:', error);
        throw error;
    }
}

run();
