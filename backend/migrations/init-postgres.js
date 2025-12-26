/**
 * Initialize Kilusi-Bill PostgreSQL Database Schema
 * Creates all necessary tables with proper constraints and indexes
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

console.log('🔄 Initializing Kilusi-Bill PostgreSQL database schema...\n');
console.log(`📍 Connecting to: ${config.database}@${config.host}:${config.port}\n`);

async function initializeDatabase() {
    const client = await pool.connect();
    
    try {
        // Start transaction
        await client.query('BEGIN');

        // ============================================
        // 1. PACKAGES TABLE
        // ============================================
        console.log('📊 Creating packages table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS packages (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                speed VARCHAR(100) NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                tax_rate DECIMAL(5,2) DEFAULT 11.00,
                description TEXT,
                pppoe_profile VARCHAR(100) DEFAULT 'default',
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create index on active packages
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_packages_active 
            ON packages(is_active) WHERE is_active = true
        `);
        console.log('✅ packages table created\n');

        // ============================================
        // 2. CUSTOMERS TABLE
        // ============================================
        console.log('📊 Creating customers table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(50) UNIQUE NOT NULL,
                pppoe_username VARCHAR(255),
                email VARCHAR(255),
                address TEXT,
                latitude DECIMAL(10,8),
                longitude DECIMAL(11,8),
                package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
                pppoe_profile VARCHAR(100),
                status VARCHAR(50) DEFAULT 'active',
                join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                cable_type VARCHAR(50),
                cable_length INTEGER,
                port_number INTEGER,
                cable_status VARCHAR(50) DEFAULT 'connected',
                cable_notes TEXT,
                device_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_status CHECK (status IN ('active', 'inactive', 'suspended', 'terminated'))
            )
        `);

        // Create indexes for customers
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
            CREATE INDEX IF NOT EXISTS idx_customers_package ON customers(package_id);
            CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
            CREATE INDEX IF NOT EXISTS idx_customers_pppoe ON customers(pppoe_username);
        `);
        console.log('✅ customers table created\n');

        // ============================================
        // 3. INVOICES TABLE
        // ============================================
        console.log('📊 Creating invoices table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS invoices (
                id SERIAL PRIMARY KEY,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
                invoice_number VARCHAR(100) UNIQUE NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                due_date DATE NOT NULL,
                status VARCHAR(50) DEFAULT 'unpaid',
                payment_date TIMESTAMP,
                payment_method VARCHAR(50),
                payment_gateway VARCHAR(100),
                payment_token VARCHAR(255),
                payment_url TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_invoice_status CHECK (status IN ('unpaid', 'paid', 'cancelled', 'overdue'))
            )
        `);

        // Create indexes for invoices
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
            CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
            CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
            CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
        `);
        console.log('✅ invoices table created\n');

        // ============================================
        // 4. PAYMENTS TABLE
        // ============================================
        console.log('📊 Creating payments table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
                amount DECIMAL(10,2) NOT NULL,
                payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                payment_method VARCHAR(50),
                reference_number VARCHAR(255),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create index for payments
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
            CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
        `);
        console.log('✅ payments table created\n');

        // ============================================
        // 5. NAS SERVERS TABLE (for RADIUS)
        // ============================================
        console.log('📊 Creating nas_servers table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS nas_servers (
                id SERIAL PRIMARY KEY,
                nas_name VARCHAR(255) NOT NULL,
                short_name VARCHAR(100) NOT NULL,
                ip_address VARCHAR(50) NOT NULL,
                secret VARCHAR(255) NOT NULL,
                ports INTEGER DEFAULT 1812,
                type VARCHAR(50) DEFAULT 'other',
                description TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ nas_servers table created\n');

        // ============================================
        // 6. MIKROTIK SERVERS TABLE
        // ============================================
        console.log('📊 Creating mikrotik_servers table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS mikrotik_servers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                host VARCHAR(255) NOT NULL,
                port INTEGER DEFAULT 8728,
                username VARCHAR(100) NOT NULL,
                password VARCHAR(255) NOT NULL,
                main_interface VARCHAR(100),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ mikrotik_servers table created\n');

        // ============================================
        // 7. TROUBLE REPORTS TABLE
        // ============================================
        console.log('📊 Creating trouble_reports table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS trouble_reports (
                id SERIAL PRIMARY KEY,
                ticket_number VARCHAR(100) UNIQUE NOT NULL,
                customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
                customer_phone VARCHAR(50) NOT NULL,
                customer_name VARCHAR(255) NOT NULL,
                problem_description TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'open',
                priority VARCHAR(50) DEFAULT 'normal',
                technician_id INTEGER,
                technician_name VARCHAR(255),
                notes TEXT,
                resolution TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP,
                CONSTRAINT chk_trouble_status CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved', 'closed', 'cancelled')),
                CONSTRAINT chk_trouble_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_trouble_status ON trouble_reports(status);
            CREATE INDEX IF NOT EXISTS idx_trouble_customer ON trouble_reports(customer_id);
            CREATE INDEX IF NOT EXISTS idx_trouble_ticket ON trouble_reports(ticket_number);
        `);
        console.log('✅ trouble_reports table created\n');

        // ============================================
        // 8. INSTALLATIONS TABLE
        // ============================================
        console.log('📊 Creating installations table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS installations (
                id SERIAL PRIMARY KEY,
                job_number VARCHAR(100) UNIQUE NOT NULL,
                customer_name VARCHAR(255) NOT NULL,
                customer_phone VARCHAR(50) NOT NULL,
                address TEXT NOT NULL,
                package_id INTEGER REFERENCES packages(id),
                latitude DECIMAL(10,8),
                longitude DECIMAL(11,8),
                status VARCHAR(50) DEFAULT 'pending',
                technician_id INTEGER,
                technician_name VARCHAR(255),
                scheduled_date TIMESTAMP,
                completed_date TIMESTAMP,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_install_status CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'cancelled'))
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_installations_status ON installations(status);
            CREATE INDEX IF NOT EXISTS idx_installations_job ON installations(job_number);
        `);
        console.log('✅ installations table created\n');

        // ============================================
        // 9. SYSTEM LOGS TABLE
        // ============================================
        console.log('📊 Creating system_logs table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS system_logs (
                id SERIAL PRIMARY KEY,
                level VARCHAR(20) NOT NULL,
                message TEXT NOT NULL,
                meta JSONB,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_log_level CHECK (level IN ('info', 'warn', 'error', 'debug'))
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
        `);
        console.log('✅ system_logs table created\n');

        // ============================================
        // CREATE TRIGGERS FOR updated_at
        // ============================================
        console.log('📊 Creating update triggers...');
        
        // Create trigger function
        await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        // Apply triggers to tables
        const tablesWithUpdatedAt = [
            'packages', 'customers', 'invoices', 'nas_servers', 
            'mikrotik_servers', 'trouble_reports', 'installations'
        ];

        for (const table of tablesWithUpdatedAt) {
            await client.query(`
                DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table};
                CREATE TRIGGER update_${table}_updated_at
                BEFORE UPDATE ON ${table}
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
            `);
        }
        console.log('✅ Update triggers created\n');

        // Commit transaction
        await client.query('COMMIT');

        console.log('✅ Database initialization completed successfully!\n');
        console.log('📋 Summary:');
        console.log('  - packages table: Ready');
        console.log('  - customers table: Ready');
        console.log('  - invoices table: Ready');
        console.log('  - payments table: Ready');
        console.log('  - nas_servers table: Ready');
        console.log('  - mikrotik_servers table: Ready');
        console.log('  - trouble_reports table: Ready');
        console.log('  - installations table: Ready');
        console.log('  - system_logs table: Ready');
        console.log('\n🎉 Kilusi-Bill PostgreSQL database is now ready!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Initialization failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

// Run initialization
initializeDatabase().catch(err => {
    console.error('Initialization error:', err);
    process.exit(1);
});
