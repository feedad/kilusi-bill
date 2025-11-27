const { query } = require('../config/database');
const { logger } = require('../config/logger');

async function addCustomerInfoToSupportTickets() {
    try {
        logger.info('Adding customer info columns to support_tickets table...');

        // Check if columns already exist
        const checkColumns = await query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'support_tickets'
            AND column_name IN ('customer_name', 'customer_phone', 'customer_email', 'customer_address', 'customer_code')
        `);

        const existingColumns = checkColumns.rows.map(row => row.column_name);

        const columnsToAdd = [];

        if (!existingColumns.includes('customer_name')) {
            columnsToAdd.push("customer_name VARCHAR(255)");
        }
        if (!existingColumns.includes('customer_phone')) {
            columnsToAdd.push("customer_phone VARCHAR(50)");
        }
        if (!existingColumns.includes('customer_email')) {
            columnsToAdd.push("customer_email VARCHAR(255)");
        }
        if (!existingColumns.includes('customer_address')) {
            columnsToAdd.push("customer_address TEXT");
        }
        if (!existingColumns.includes('customer_code')) {
            columnsToAdd.push("customer_code VARCHAR(50)");
        }

        if (columnsToAdd.length > 0) {
            const alterQuery = `ALTER TABLE support_tickets ADD COLUMN ${columnsToAdd.join(', ADD COLUMN ')}`;
            await query(alterQuery);
            logger.info(`Added columns: ${columnsToAdd.join(', ')}`);
        } else {
            logger.info('Customer info columns already exist in support_tickets table');
        }

        logger.info('✅ Customer info columns added successfully to support_tickets table');
        return true;
    } catch (error) {
        logger.error('❌ Error adding customer info columns to support_tickets table:', error);
        throw error;
    }
}

module.exports = addCustomerInfoToSupportTickets;