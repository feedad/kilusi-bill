/**
 * Migration: Add Profile Fields to Packages Table
 * Adds: group, rate_limit, shared, hpp, commission
 */

const { Pool } = require('pg');

const config = {
    host: process.env.POSTGRES_HOST || '172.22.10.28',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DATABASE || 'kilusi_bill',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'Bismillah28',
};

const pool = new Pool(config);

console.log('🔄 Adding profile fields to packages table...\n');

async function addProfileFields() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        console.log('📊 Adding new columns...');
        
        // Add group column (for RADIUS group)
        await client.query(`
            ALTER TABLE packages 
            ADD COLUMN IF NOT EXISTS "group" VARCHAR(100)
        `);
        console.log('✅ Added "group" column');

        // Add rate_limit column (for bandwidth limit, e.g., "10M/10M")
        await client.query(`
            ALTER TABLE packages 
            ADD COLUMN IF NOT EXISTS rate_limit VARCHAR(50)
        `);
        console.log('✅ Added "rate_limit" column');

        // Add shared column (shared bandwidth: 0=tidak, 1=ya)
        await client.query(`
            ALTER TABLE packages 
            ADD COLUMN IF NOT EXISTS shared INTEGER DEFAULT 0
        `);
        console.log('✅ Added "shared" column');

        // Add hpp column (harga pokok penjualan/cost)
        await client.query(`
            ALTER TABLE packages 
            ADD COLUMN IF NOT EXISTS hpp DECIMAL(10,2) DEFAULT 0
        `);
        console.log('✅ Added "hpp" column');

        // Add commission column (komisi teknisi)
        await client.query(`
            ALTER TABLE packages 
            ADD COLUMN IF NOT EXISTS commission DECIMAL(10,2) DEFAULT 0
        `);
        console.log('✅ Added "commission" column');

        // Update existing packages to set group based on package name
        await client.query(`
            UPDATE packages 
            SET "group" = CONCAT('package_', id)
            WHERE "group" IS NULL
        `);
        console.log('✅ Updated existing packages with default group names');

        await client.query('COMMIT');
        console.log('\n✅ Migration completed successfully!\n');
        
        // Show updated structure
        const result = await client.query(`
            SELECT column_name, data_type, character_maximum_length, column_default
            FROM information_schema.columns
            WHERE table_name = 'packages'
            ORDER BY ordinal_position
        `);
        
        console.log('📋 Updated packages table structure:');
        console.table(result.rows);
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

addProfileFields().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
