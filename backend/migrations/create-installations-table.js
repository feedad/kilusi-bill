const { transaction } = require('../config/database');
const { logger } = require('../config/logger');

async function up() {
    try {
        await transaction(async (client) => {
            // Create installations table
            await client.query(`
                CREATE TABLE IF NOT EXISTS installations (
                    id SERIAL PRIMARY KEY,
                    customer_id VARCHAR(20) REFERENCES customers(id) ON DELETE SET NULL, -- Adjusted to VARCHAR(20) to be safe or match customers.id type
                    technician_id INTEGER REFERENCES users(id),
                    scheduled_date TIMESTAMP,
                    completed_date TIMESTAMP,
                    status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // I need to check customer_id type. tickets migration used VARCHAR(5). 
            // `migrations/change-customers-id-to-5digit.js` suggests it might be 5 digits.
            // checking `create-tickets-table.js` it uses VARCHAR(5).
            // Let's stick to VARCHAR(20) to be safe for now, referencing keys usually should match exactly but Postgres allows different varchar lengths if content fits.
            // Ideally should check customers table definition. 

            // Create indexes
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_installations_status ON installations(status);
                CREATE INDEX IF NOT EXISTS idx_installations_technician_id ON installations(technician_id);
                CREATE INDEX IF NOT EXISTS idx_installations_scheduled_date ON installations(scheduled_date);
            `);

            // Add trigger for updated_at
            await client.query(`
                DROP TRIGGER IF EXISTS update_installations_updated_at ON installations;
                CREATE TRIGGER update_installations_updated_at
                BEFORE UPDATE ON installations
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
            `);

            console.log('Installations table created successfully');
        });
    } catch (error) {
        console.error('Error creating installations table:', error);
        throw error;
    }
}

async function down() {
    try {
        await transaction(async (client) => {
            await client.query('DROP TABLE IF EXISTS installations');
            console.log('Installations table dropped successfully');
        });
    } catch (error) {
        console.error('Error dropping installations table:', error);
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
