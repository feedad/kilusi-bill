/**
 * Add missing ODP columns to customers table
 * This migration adds odp_name, odp_address, and odp_port columns
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

console.log('🔄 Adding ODP columns to customers table...\n');

async function addODPColumns() {
    const client = await pool.connect();

    try {
        // Start transaction
        await client.query('BEGIN');

        console.log('📊 Adding odp_name column...');
        await client.query(`
            ALTER TABLE customers
            ADD COLUMN IF NOT EXISTS odp_name VARCHAR(255)
        `);

        console.log('📊 Adding odp_address column...');
        await client.query(`
            ALTER TABLE customers
            ADD COLUMN IF NOT EXISTS odp_address TEXT
        `);

        console.log('📊 Adding odp_port column...');
        await client.query(`
            ALTER TABLE customers
            ADD COLUMN IF NOT EXISTS odp_port VARCHAR(50)
        `);

        // Create indexes for better performance
        console.log('📊 Creating indexes for ODP columns...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_customers_odp_name
            ON customers(odp_name) WHERE odp_name IS NOT NULL
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_customers_odp_port
            ON customers(odp_port) WHERE odp_port IS NOT NULL
        `);

        // Commit transaction
        await client.query('COMMIT');

        console.log('✅ ODP columns added successfully!');
        console.log('\n📋 Added columns:');
        console.log('  - odp_name: VARCHAR(255) - ODP name reference');
        console.log('  - odp_address: TEXT - ODP location address');
        console.log('  - odp_port: VARCHAR(50) - ODP port number');
        console.log('\n🎉 Customers table now has all ODP columns!');

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
addODPColumns().catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
});