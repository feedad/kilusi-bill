/**
 * Migration Runner for License Tables
 * Run with: node migrations/run-license-migration.js
 */

const fs = require('fs');
const path = require('path');

async function runMigration() {
    const { getPool } = require('../config/database');
    const pool = getPool();

    console.log('🔄 Starting License System migration...');

    try {
        // Read the SQL file
        const sqlFile = path.join(__dirname, 'create-license-tables.sql');
        const sql = fs.readFileSync(sqlFile, 'utf8');

        console.log('📄 SQL file loaded, executing...');

        // Execute the migration
        await pool.query(sql);

        console.log('✅ License system tables created successfully!');

        // Verify tables were created
        const tables = await pool.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN (
                'licenses',
                'license_usage',
                'license_activations',
                'license_transactions',
                'tenant_isps',
                'license_activity_log'
            )
            ORDER BY table_name;
        `);

        console.log('📊 Tables created:');
        tables.rows.forEach(row => {
            console.log(`   ✓ ${row.table_name}`);
        });

        // Check if superadmin license was created
        const superadminLicense = await pool.query(`
            SELECT license_key, customer_name, tier, status
            FROM licenses
            WHERE license_key = 'KIL-SUPER-ADMIN-INTERNAL-0000'
        `);

        if (superadminLicense.rows.length > 0) {
            console.log('🔑 Superadmin license created:');
            console.log(`   Key: ${superadminLicense.rows[0].license_key}`);
            console.log(`   Name: ${superadminLicense.rows[0].customer_name}`);
            console.log(`   Tier: ${superadminLicense.rows[0].tier}`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error.detail);
        process.exit(1);
    }
}

runMigration();
