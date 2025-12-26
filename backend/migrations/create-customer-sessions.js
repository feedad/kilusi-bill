/**
 * Create customer_sessions table for tracking active customer sessions
 * This table will store customer connection/session information
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function getSetting(key, defaultValue) {
  try {
    const settingsPath = path.join(__dirname, '../settings.json');
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(raw);
    return settings[key] !== undefined ? settings[key] : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

const config = {
    host: getSetting('postgres_host', 'localhost'),
    port: parseInt(getSetting('postgres_port', '5432')),
    database: getSetting('postgres_database', 'kilusi_bill'),
    user: getSetting('postgres_user', 'postgres'),
    password: getSetting('postgres_password', ''),
};

const pool = new Pool(config);

console.log('🔄 Creating customer_sessions table...\n');

async function createCustomerSessionsTable() {
    const client = await pool.connect();

    try {
        // Start transaction
        await client.query('BEGIN');

        // Create customer_sessions table
        console.log('📊 Creating customer_sessions table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS customer_sessions (
                id SERIAL PRIMARY KEY,
                customer_id VARCHAR(255) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                session_id VARCHAR(255) UNIQUE NOT NULL,
                username VARCHAR(255) NOT NULL,
                ip_address INET,
                mac_address VARCHAR(17),
                nas_ip_address INET,
                nas_port INTEGER,
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                active BOOLEAN DEFAULT true,
                session_time INTERVAL DEFAULT '0 seconds',
                upload_bytes BIGINT DEFAULT 0,
                download_bytes BIGINT DEFAULT 0,
                connection_type VARCHAR(50) DEFAULT 'pppoe',
                disconnect_reason VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_connection_type CHECK (connection_type IN ('pppoe', 'hotspot', 'static', 'dhcp'))
            )
        `);

        // Create indexes for customer_sessions
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer ON customer_sessions(customer_id);
            CREATE INDEX IF NOT EXISTS idx_customer_sessions_active ON customer_sessions(active);
            CREATE INDEX IF NOT EXISTS idx_customer_sessions_last_seen ON customer_sessions(last_seen DESC);
            CREATE INDEX IF NOT EXISTS idx_customer_sessions_username ON customer_sessions(username);
            CREATE INDEX IF NOT EXISTS idx_customer_sessions_session_id ON customer_sessions(session_id);
        `);

        // Create trigger for updated_at
        await client.query(`
            DROP TRIGGER IF EXISTS update_customer_sessions_updated_at ON customer_sessions;
            CREATE TRIGGER update_customer_sessions_updated_at
            BEFORE UPDATE ON customer_sessions
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        `);

        console.log('✅ customer_sessions table created\n');

        // Commit transaction
        await client.query('COMMIT');

        console.log('✅ customer_sessions table migration completed successfully!');
        console.log('\n📋 Table features:');
        console.log('  - Tracks active customer sessions');
        console.log('  - Stores connection details (IP, MAC, NAS)');
        console.log('  - Monitors session duration and data usage');
        console.log('  - Updates last_seen timestamp automatically');
        console.log('\n🎉 customer_sessions table is now ready!');

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
createCustomerSessionsTable().catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
});