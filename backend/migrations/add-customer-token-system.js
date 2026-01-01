/**
 * Add Customer Token Authentication System
 * Creates token-based direct login system for customers
 */

const { Pool } = require('pg');
const path = require('path');

// Database configuration from settings.json
const { getSetting } = require('../config/settingsManager');
const config = {
    host: getSetting('postgres_host', 'localhost'),
    port: parseInt(getSetting('postgres_port', '5432')),
    database: getSetting('postgres_database', 'kilusi_bill'),
    user: getSetting('postgres_user', 'postgres'),
    password: getSetting('postgres_password', ''),
};

const pool = new Pool(config);

console.log('🔄 Adding Customer Token Authentication System...\n');

async function addCustomerTokenSystem() {
    const client = await pool.connect();

    try {
        // Start transaction
        await client.query('BEGIN');

        // ============================================
        // 1. CUSTOMER TOKENS TABLE
        // ============================================
        console.log('📊 Creating customer_tokens table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS customer_tokens (
                id SERIAL PRIMARY KEY,
                customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
                token VARCHAR(255) UNIQUE NOT NULL,
                token_type VARCHAR(50) DEFAULT 'portal_access',
                expires_at TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used_at TIMESTAMP,
                usage_count INTEGER DEFAULT 0,
                created_by INTEGER,
                metadata JSONB
            )
        `);

        // Create indexes for customer_tokens
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_customer_tokens_customer ON customer_tokens(customer_id);
            CREATE INDEX IF NOT EXISTS idx_customer_tokens_token ON customer_tokens(token);
            CREATE INDEX IF NOT EXISTS idx_customer_tokens_active ON customer_tokens(is_active, expires_at);
            CREATE INDEX IF NOT EXISTS idx_customer_tokens_type ON customer_tokens(token_type);
        `);
        console.log('✅ customer_tokens table created\n');

        // ============================================
        // 2. ADD TOKEN FIELDS TO CUSTOMERS TABLE
        // ============================================
        console.log('📊 Adding token fields to customers table...');

        // Check if columns exist before adding
        const columnsResult = await client.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'customers'
            AND column_name IN ('portal_access_token', 'token_expires_at')
        `);
        const existingColumns = columnsResult.rows.map(row => row.column_name);

        if (!existingColumns.includes('portal_access_token')) {
            await client.query(`
                ALTER TABLE customers
                ADD COLUMN portal_access_token VARCHAR(255) UNIQUE
            `);
            console.log('✅ Added portal_access_token column');
        }

        if (!existingColumns.includes('token_expires_at')) {
            await client.query(`
                ALTER TABLE customers
                ADD COLUMN token_expires_at TIMESTAMP
            `);
            console.log('✅ Added token_expires_at column');
        }

        console.log('✅ customers table enhanced\n');

        // ============================================
        // 3. ANNOUNCEMENTS TABLE
        // ============================================
        console.log('📊 Creating announcements table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS announcements (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                type VARCHAR(50) DEFAULT 'info',
                priority VARCHAR(20) DEFAULT 'normal',
                target_type VARCHAR(50) DEFAULT 'all',
                target_customers TEXT[],
                start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_date TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE,
                created_by INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_announcement_type CHECK (type IN ('maintenance', 'outage', 'promo', 'info', 'warning')),
                CONSTRAINT chk_announcement_priority CHECK (priority IN ('critical', 'high', 'normal', 'low')),
                CONSTRAINT chk_announcement_target CHECK (target_type IN ('all', 'active', 'overdue', 'suspended', 'specific'))
            )
        `);

        // Create indexes for announcements
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, start_date, end_date);
            CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type);
            CREATE INDEX IF NOT EXISTS idx_announcements_priority ON announcements(priority DESC);
            CREATE INDEX IF NOT EXISTS idx_announcements_target ON announcements(target_type);
        `);
        console.log('✅ announcements table created\n');

        // ============================================
        // 4. CUSTOMER ANNOUNCEMENT READS TABLE
        // ============================================
        console.log('📊 Creating customer_announcement_reads table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS customer_announcement_reads (
                id SERIAL PRIMARY KEY,
                customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
                announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE,
                read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(customer_id, announcement_id)
            )
        `);

        // Create indexes for customer_announcement_reads
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_customer_reads_customer ON customer_announcement_reads(customer_id);
            CREATE INDEX IF NOT EXISTS idx_customer_reads_announcement ON customer_announcement_reads(announcement_id);
            CREATE INDEX IF NOT EXISTS idx_customer_reads_read_at ON customer_announcement_reads(read_at);
        `);
        console.log('✅ customer_announcement_reads table created\n');

        // ============================================
        // 5. ENHANCE TROUBLE REPORTS TABLE
        // ============================================
        console.log('📊 Enhancing trouble_reports table...');

        // Check existing columns in trouble_reports
        const troubleColumnsResult = await client.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'trouble_reports'
            AND column_name IN ('priority', 'category', 'assigned_to', 'first_response_at', 'resolved_at')
        `);
        const existingTroubleColumns = troubleColumnsResult.rows.map(row => row.column_name);

        const enhancements = [
            { column: 'priority', sql: 'VARCHAR(20) DEFAULT \'normal\'', constraint: "CONSTRAINT chk_trouble_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent'))" },
            { column: 'category', sql: 'VARCHAR(50) DEFAULT \'general\'', constraint: "CONSTRAINT chk_trouble_category CHECK (category IN ('internet', 'speed', 'billing', 'equipment', 'installation', 'other'))" },
            { column: 'assigned_to', sql: 'INTEGER REFERENCES admin_users(id)', constraint: null },
            { column: 'first_response_at', sql: 'TIMESTAMP', constraint: null },
            { column: 'resolved_at', sql: 'TIMESTAMP', constraint: null },
            { column: 'resolution_rating', sql: 'INTEGER CHECK (resolution_rating >= 1 AND resolution_rating <= 5)', constraint: null },
            { column: 'customer_feedback', sql: 'TEXT', constraint: null },
            { column: 'internal_notes', sql: 'TEXT', constraint: null }
        ];

        for (const enhancement of enhancements) {
            if (!existingTroubleColumns.includes(enhancement.column)) {
                const sql = enhancement.constraint
                    ? `ALTER TABLE trouble_reports ADD COLUMN ${enhancement.column} ${enhancement.sql} ${enhancement.constraint}`
                    : `ALTER TABLE trouble_reports ADD COLUMN ${enhancement.column} ${enhancement.sql}`;
                await client.query(sql);
                console.log(`✅ Added ${enhancement.column} to trouble_reports`);
            }
        }
        console.log('✅ trouble_reports table enhanced\n');

        // ============================================
        // 6. TICKET RESPONSES TABLE
        // ============================================
        console.log('📊 Creating ticket_responses table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS ticket_responses (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER REFERENCES trouble_reports(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                responder_type VARCHAR(20) CHECK (responder_type IN ('customer', 'admin', 'technician')),
                responder_id INTEGER,
                is_internal BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for ticket_responses
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_ticket_responses_ticket ON ticket_responses(ticket_id);
            CREATE INDEX IF NOT EXISTS idx_ticket_responses_responder ON ticket_responses(responder_type, responder_id);
            CREATE INDEX IF NOT EXISTS idx_ticket_responses_created ON ticket_responses(created_at DESC);
        `);
        console.log('✅ ticket_responses table created\n');

        // ============================================
        // 7. TICKET ATTACHMENTS TABLE
        // ============================================
        console.log('📊 Creating ticket_attachments table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS ticket_attachments (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER REFERENCES trouble_reports(id) ON DELETE CASCADE,
                filename VARCHAR(255) NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                file_size INTEGER,
                file_type VARCHAR(50),
                uploaded_by VARCHAR(20) CHECK (uploaded_by IN ('customer', 'admin', 'technician')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for ticket_attachments
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id);
            CREATE INDEX IF NOT EXISTS idx_ticket_attachments_uploaded ON ticket_attachments(uploaded_by);
        `);
        console.log('✅ ticket_attachments table created\n');

        // ============================================
        // 8. CREATE TRIGGERS FOR updated_at
        // ============================================
        console.log('📊 Creating update triggers...');

        // Create trigger function for announcements
        await client.query(`
            CREATE OR REPLACE FUNCTION update_announcements_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        await client.query(`
            DROP TRIGGER IF EXISTS update_announcements_updated_at ON announcements;
            CREATE TRIGGER update_announcements_updated_at
            BEFORE UPDATE ON announcements
            FOR EACH ROW
            EXECUTE FUNCTION update_announcements_updated_at();
        `);

        console.log('✅ Update triggers created\n');

        // ============================================
        // 9. CREATE SAMPLE ANNOUNCEMENTS
        // ============================================
        console.log('📊 Creating sample announcements...');

        // Insert sample announcements
        const sampleAnnouncements = [
            {
                title: 'Selamat Datang di Portal Pelanggan',
                content: 'Terima kasih telah menjadi pelanggan setia kami. Anda dapat mengakses informasi tagihan, mengelola layanan, dan melaporkan gangguan melalui portal ini.',
                type: 'info',
                priority: 'normal',
                target_type: 'all'
            },
            {
                title: 'Cara Pembayaran Tagihan',
                content: 'Anda dapat melakukan pembayaran tagihan melalui transfer bank, QRIS, atau e-wallet. Hubungi admin untuk informasi lebih lanjut.',
                type: 'info',
                priority: 'high',
                target_type: 'overdue'
            }
        ];

        for (const announcement of sampleAnnouncements) {
            await client.query(`
                INSERT INTO announcements (title, content, type, priority, target_type)
                SELECT $1, $2, $3, $4, $5
                WHERE NOT EXISTS (
                    SELECT 1 FROM announcements WHERE title = $1
                )
            `, [announcement.title, announcement.content, announcement.type, announcement.priority, announcement.target_type]);
        }
        console.log('✅ Sample announcements created\n');

        // Commit transaction
        await client.query('COMMIT');

        console.log('✅ Customer Token Authentication System created successfully!\n');
        console.log('📋 Summary:');
        console.log('  - customer_tokens table: Ready');
        console.log('  - customers table: Enhanced with token fields');
        console.log('  - announcements table: Ready');
        console.log('  - customer_announcement_reads table: Ready');
        console.log('  - trouble_reports table: Enhanced');
        console.log('  - ticket_responses table: Ready');
        console.log('  - ticket_attachments table: Ready');
        console.log('  - Sample announcements: Created');
        console.log('\n🎉 Client Area enhancement is now ready!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

// Run migration
addCustomerTokenSystem().catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
});