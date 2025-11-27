/**
 * Simple Token Columns Migration
 * Adds portal_access_token and token_expires_at columns to customers table
 */

const { Pool } = require('pg');

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

console.log('🔄 Adding simple token columns to customers table...\n');

async function addSimpleTokenColumns() {
    const client = await pool.connect();

    try {
        // Start transaction
        await client.query('BEGIN');

        // Check if columns exist
        console.log('📊 Checking existing columns...');
        const columnsResult = await client.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'customers'
            AND column_name IN ('portal_access_token', 'token_expires_at')
        `);
        const existingColumns = columnsResult.rows.map(row => row.column_name);

        console.log('Existing columns:', existingColumns);

        // Add portal_access_token column if it doesn't exist
        if (!existingColumns.includes('portal_access_token')) {
            console.log('➕ Adding portal_access_token column...');
            await client.query(`
                ALTER TABLE customers
                ADD COLUMN portal_access_token VARCHAR(255) UNIQUE
            `);
            console.log('✅ Added portal_access_token column');
        } else {
            console.log('⏭️ portal_access_token column already exists');
        }

        // Add token_expires_at column if it doesn't exist
        if (!existingColumns.includes('token_expires_at')) {
            console.log('➕ Adding token_expires_at column...');
            await client.query(`
                ALTER TABLE customers
                ADD COLUMN token_expires_at TIMESTAMP
            `);
            console.log('✅ Added token_expires_at column');
        } else {
            console.log('⏭️ token_expires_at column already exists');
        }

        // Create index for portal_access_token
        console.log('➕ Creating index for portal_access_token...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_customers_portal_access_token
            ON customers(portal_access_token)
        `);
        console.log('✅ Created portal_access_token index');

        // Commit transaction
        await client.query('COMMIT');
        console.log('\n✅ Migration completed successfully!');
        console.log('🎉 Simple token columns have been added to the customers table');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the migration
addSimpleTokenColumns().then(() => {
    console.log('\n🔄 Migration script finished');
    process.exit(0);
}).catch(error => {
    console.error('\n💥 Migration script failed:', error);
    process.exit(1);
});