/**
 * Migration Script: Normalize Customer Schema
 * 
 * This script transforms the single 'customers' table into a normalized 3NF structure:
 * 1. customers (Identity only)
 * 2. services (Subscription details)
 * 3. technical_details (PPPoE/Auth)
 * 4. network_infrastructure (Physical layer)
 * 
 * It also creates a VIEW 'customers_view' to maintain backward compatibility for GET requests.
 */

require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');
const { getSetting } = require('../config/settingsManager');

// Config check
const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'kilusi_bill',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
};

const pool = new Pool(config);

async function runMigration() {
    const client = await pool.connect();
    console.log('🔄 Starting Database Normalization Migration...');
    
    try {
        await client.query('BEGIN');

        // 1. Create New Tables
        console.log('📦 Creating new normalized tables...');
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS services (
                id SERIAL PRIMARY KEY,
                customer_id VARCHAR(255) REFERENCES customers(id) ON DELETE CASCADE,
                package_id INTEGER REFERENCES packages(id),
                service_identifier VARCHAR(100),
                address_installation TEXT,
                status VARCHAR(50) DEFAULT 'active',
                installation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS technical_details (
                id SERIAL PRIMARY KEY,
                service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
                pppoe_username VARCHAR(255),
                pppoe_password VARCHAR(255),
                pppoe_profile VARCHAR(100),
                ip_address_static VARCHAR(50),
                mac_address VARCHAR(50),
                device_model VARCHAR(100),
                device_serial_number VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS network_infrastructure (
                id SERIAL PRIMARY KEY,
                service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
                odp_code VARCHAR(100),
                port_number INTEGER,
                cable_type VARCHAR(50),
                cable_length_meters INTEGER,
                onu_signal_dbm VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Migrate Data
        console.log('🚚 Migrating data from existing customers table...');
        
        // Get all existing customers
        const { rows: customers } = await client.query('SELECT * FROM customers');
        
        for (const cust of customers) {
            // Create Service entry
            const serviceResult = await client.query(`
                INSERT INTO services (customer_id, package_id, address_installation, status, created_at)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            `, [cust.id, cust.package_id, cust.address, cust.status, cust.created_at]);
            
            const serviceId = serviceResult.rows[0].id;

            // Create Technical Details entry
            await client.query(`
                INSERT INTO technical_details (service_id, pppoe_username, pppoe_password, pppoe_profile, device_model)
                VALUES ($1, $2, $3, $4, $5)
            `, [serviceId, cust.pppoe_username, cust.pppoe_password, cust.pppoe_profile, cust.device_id]);

            // Create Network Infrastructure entry
            // Note: mapping cable_status/length if they exist in source
            await client.query(`
                INSERT INTO network_infrastructure (service_id, cable_type, cable_length_meters, port_number)
                VALUES ($1, $2, $3, $4)
            `, [serviceId, cust.cable_type, cust.cable_length, cust.port_number]);
        }

        // 3. Rename Old Table & Cleanup
        console.log('🔒 Securing legacy data...');
        await client.query('ALTER TABLE customers RENAME TO customers_legacy_backup');
        
        // Re-create 'customers' table with ONLY identity columns
        // We reuse the ID sequence to maintain consistency
        console.log('👤 Re-creating clean customers table...');
        await client.query(`
            CREATE TABLE customers (
                id VARCHAR(255) PRIMARY KEY, -- Keep existing IDs
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                email VARCHAR(255),
                address TEXT,
                latitude DECIMAL(10,8),
                longitude DECIMAL(11,8),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Restore identity data back to the clean table
        await client.query(`
            INSERT INTO customers (id, name, phone, email, address, latitude, longitude, created_at, updated_at)
            SELECT id, name, phone, email, address, latitude, longitude, created_at, updated_at
            FROM customers_legacy_backup
        `);

        // Reset sequence (Skipped for VARCHAR IDs)
        // await client.query(`
        //    SELECT setval(pg_get_serial_sequence('customers_legacy_backup', 'id'), (SELECT MAX(id) FROM customers));
        // `);
        console.log('🔹 Sequence reset skipped (VARCHAR ID detected)');

        // 4. Create Compatibility View
        console.log('👓 Creating backward compatibility VIEW...');
        await client.query(`
            CREATE OR REPLACE VIEW customers_view AS
            SELECT 
                c.id, c.name, c.phone, c.email, c.address, c.latitude, c.longitude,
                c.created_at, c.updated_at,
                s.package_id, s.status, s.installation_date,
                t.pppoe_username, t.pppoe_password, t.pppoe_profile, t.device_model as device_id,
                n.cable_type, n.cable_length_meters as cable_length, n.port_number
            FROM customers c
            JOIN services s ON c.id = s.customer_id
            LEFT JOIN technical_details t ON s.id = t.service_id
            LEFT JOIN network_infrastructure n ON s.id = n.service_id;
        `);

        await client.query('COMMIT');
        console.log('✅ Migration Completed Successfully!');
        
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
