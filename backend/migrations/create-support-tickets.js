const { query } = require('../config/database');

async function createSupportTicketsTable() {
    try {
        // Create support_tickets table
        await query(`
            CREATE TABLE IF NOT EXISTS support_tickets (
                id SERIAL PRIMARY KEY,
                ticket_number VARCHAR(50) UNIQUE NOT NULL,
                customer_id VARCHAR(255) REFERENCES customers(id),
                subject VARCHAR(255) NOT NULL,
                description TEXT,
                category VARCHAR(50) DEFAULT 'general',
                priority VARCHAR(20) DEFAULT 'medium',
                status VARCHAR(20) DEFAULT 'open',
                assigned_agent VARCHAR(255),
                resolution_time INTEGER,
                customer_rating INTEGER CHECK (customer_rating >= 1 AND customer_rating <= 5),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create support_ticket_messages table for message threads
        await query(`
            CREATE TABLE IF NOT EXISTS support_ticket_messages (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE CASCADE,
                sender_type VARCHAR(20) NOT NULL, -- 'customer' or 'agent'
                sender_name VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                attachments TEXT[], -- JSON array of file info
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for performance
        await query(`
            CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_id
            ON support_tickets(customer_id)
        `);

        await query(`
            CREATE INDEX IF NOT EXISTS idx_support_tickets_status
            ON support_tickets(status)
        `);

        await query(`
            CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
            ON support_tickets(created_at DESC)
        `);

        await query(`
            CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_id
            ON support_ticket_messages(ticket_id)
        `);

        console.log('✅ Support tickets tables created successfully');
        return true;
    } catch (error) {
        console.error('❌ Error creating support tickets tables:', error);
        return false;
    }
}

module.exports = {
    createSupportTicketsTable
};

// Run migration if called directly
if (require.main === module) {
    createSupportTicketsTable().then(success => {
        if (success) {
            console.log('Migration completed successfully');
            process.exit(0);
        } else {
            console.log('Migration failed');
            process.exit(1);
        }
    });
}