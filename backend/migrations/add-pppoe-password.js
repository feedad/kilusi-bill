/**
 * Migration: Add pppoe_password column to customers table
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

console.log('🔄 Adding pppoe_password column to customers table...\n');

async function addPppoePassword() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        console.log('📊 Adding pppoe_password column...');
        
        await client.query(`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS pppoe_password VARCHAR(255)
        `);
        console.log('✅ Added "pppoe_password" column');

        await client.query('COMMIT');
        console.log('\n✅ Migration completed successfully!\n');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

addPppoePassword().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
