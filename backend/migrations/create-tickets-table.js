const { transaction } = require('../config/database');
const logger = require('../config/logger');

async function up() {
    try {
        await transaction(async (client) => {
            // Create tickets table
            await client.query(`
                CREATE TABLE IF NOT EXISTS tickets (
                    id SERIAL PRIMARY KEY,
                    customer_id VARCHAR(5) REFERENCES customers(id) ON DELETE SET NULL,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    status VARCHAR(50) DEFAULT 'open', -- open, in_progress, resolved, closed
                    priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, critical
                    assigned_to INTEGER REFERENCES users(id), -- technician
                    created_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Create indexes
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
                CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
                CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON tickets(customer_id);
            `);

            // Add trigger for updated_at
            await client.query(`
                DROP TRIGGER IF EXISTS update_tickets_updated_at ON tickets;
                CREATE TRIGGER update_tickets_updated_at
                BEFORE UPDATE ON tickets
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
            `);

            logger.info('Tickets table created successfully');
        });
    } catch (error) {
        logger.error('Error creating tickets table:', error);
        throw error;
    }
}

async function down() {
    try {
        await transaction(async (client) => {
            await client.query('DROP TABLE IF EXISTS tickets');
            logger.info('Tickets table dropped successfully');
        });
    } catch (error) {
        logger.error('Error dropping tickets table:', error);
        throw error;
    }
}

// Execute if run directly
if (require.main === module) {
    up().catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
}

module.exports = { up, down };
