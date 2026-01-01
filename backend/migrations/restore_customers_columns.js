
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function runMigration() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('🔄 Restoring missing columns to customers table...');

        // 1. Add missing columns to customers table
        console.log('➕ Adding region_id, area, and customer_id columns...');
        await client.query(`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS region_id INTEGER,
            ADD COLUMN IF NOT EXISTS area VARCHAR(255),
            ADD COLUMN IF NOT EXISTS customer_id VARCHAR(255);
        `);

        // 2. Restore data from backup
        // Check if backup table exists
        const checkBackup = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'customers_legacy_backup'
            );
        `);

        if (checkBackup.rows[0].exists) {
            console.log('📦 Restoring data from customers_legacy_backup...');
            await client.query(`
                UPDATE customers c
                SET 
                    region_id = b.region_id,
                    area = b.area,
                    customer_id = b.customer_id
                FROM customers_legacy_backup b
                WHERE c.id = b.id;
            `);
            console.log('✅ Customer data restored.');

            // RESTORE ODP DATA to network_infrastructure
            // Map odp_id -> odp_code using odps table
            console.log('📦 Restoring ODP data...');
            await client.query(`
                UPDATE network_infrastructure n
                SET odp_code = o.code
                FROM services s
                JOIN customers_legacy_backup b ON s.customer_id = b.id
                JOIN odps o ON b.odp_id = o.id
                WHERE n.service_id = s.id;
            `);
            // Also restore port_number if missing? 
            // normalize-customer-schema already migrated port_number.
            
            console.log('✅ ODP data restored.');

        } else {
            console.log('⚠️ customers_legacy_backup table not found. Skipping data restoration.');
        }

        // 3. Update customers_view
        console.log('👓 Updating customers_view definition...');
        await client.query(`DROP VIEW IF EXISTS customers_view`);
        
        // We need to recreate the VIEW with ALL necessary columns
        // Including aliasing status as isolir_status for backward compatibility
        await client.query(`
            CREATE OR REPLACE VIEW customers_view AS
            SELECT 
                c.id, c.name, c.phone, c.email, c.address, c.latitude, c.longitude,
                c.region_id, c.area, -- Restored columns
                c.created_at, c.updated_at,
                
                -- Service details
                s.package_id, 
                s.status, 
                s.status as isolir_status, -- Alias for backward compatibility
                s.installation_date,
                
                -- Technical details
                t.pppoe_username, t.pppoe_password, t.pppoe_profile, 
                t.device_model as device_id,
                
                -- Network Infrastructure
                n.cable_type, n.cable_length_meters as cable_length, n.port_number,
                n.odp_code, 
                n.port_number as odp_port, -- Alias for backward compatibility
                
                -- Derived columns (helpers)
                c.id as username, -- Mapping ID to username if needed for 5-digit code usage
                c.customer_id as customer_code -- Restored legacy customer_id
                
            FROM customers c
            JOIN services s ON c.id = s.customer_id
            LEFT JOIN technical_details t ON s.id = t.service_id
            LEFT JOIN network_infrastructure n ON s.id = n.service_id;
        `);

        await client.query('COMMIT');
        console.log('✅ Restoration Completed Successfully!');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration Failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

// Only run if called directly
if (require.main === module) {
    runMigration();
}

module.exports = runMigration;
