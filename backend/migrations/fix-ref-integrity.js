/**
 * Fix Reference Integrity
 * Move Foreign Keys from 'customers_legacy_backup' to 'customers'
 */
require('dotenv').config();
const { Pool } = require('pg');

const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'kilusi_bill',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
};

const pool = new Pool(config);

async function fixIntegrity() {
    const client = await pool.connect();
    console.log('🔧 Fixing Foreign Key Integrity...');
    
    try {
        await client.query('BEGIN');

        // Find all FKs pointing to backup table
        const res = await client.query(`
            SELECT 
                tc.table_name, 
                kcu.column_name, 
                tc.constraint_name
            FROM information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu 
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' 
            AND ccu.table_name = 'customers_legacy_backup'
        `);

        console.log(`Found ${res.rowCount} constraints to migrate.`);

        for (const row of res.rows) {
            console.log(`Processing ${row.table_name}.${row.column_name} (${row.constraint_name})...`);
            
            // 1. Drop old constraint
            await client.query(`ALTER TABLE "${row.table_name}" DROP CONSTRAINT "${row.constraint_name}"`);
            
            // 2. Add new constraint (Pointing to 'customers')
            // Using same name if possible, or auto-generated
            await client.query(`
                ALTER TABLE "${row.table_name}" 
                ADD CONSTRAINT "${row.constraint_name}" 
                FOREIGN KEY ("${row.column_name}") 
                REFERENCES customers(id) 
                ON DELETE CASCADE
            `); // Assessing ON DELETE CASCADE is safe here, mostly yes for customer data
        }

        await client.query('COMMIT');
        console.log('✅ Integrity Fixed Successfully!');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Failed:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

fixIntegrity();
