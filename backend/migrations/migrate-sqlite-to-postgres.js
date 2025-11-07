/**
 * Migrate Data from SQLite to PostgreSQL
 * Transfers all existing data from billing.db to PostgreSQL
 */

const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');

// SQLite configuration
const sqlitePath = path.join(__dirname, '../billing.db');

// PostgreSQL configuration
const pgConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DATABASE || 'kilusi_bill',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
};

console.log('🔄 Starting data migration from SQLite to PostgreSQL...\n');
console.log(`📍 SQLite: ${sqlitePath}`);
console.log(`📍 PostgreSQL: ${pgConfig.database}@${pgConfig.host}:${pgConfig.port}\n`);

// Helper functions
function getSQLiteData(db, query) {
    return new Promise((resolve, reject) => {
        db.all(query, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function migrateData() {
    const sqliteDb = new sqlite3.Database(sqlitePath);
    const pgPool = new Pool(pgConfig);
    
    try {
        // Connect to PostgreSQL
        const pgClient = await pgPool.connect();
        console.log('✅ Connected to PostgreSQL\n');
        
        await pgClient.query('BEGIN');

        // ============================================
        // 1. Migrate Packages
        // ============================================
        console.log('📦 Migrating packages...');
        const packages = await getSQLiteData(sqliteDb, 'SELECT * FROM packages');
        
        if (packages.length > 0) {
            for (const pkg of packages) {
                await pgClient.query(`
                    INSERT INTO packages (
                        name, speed, price, tax_rate, description, 
                        pppoe_profile, is_active, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT DO NOTHING
                `, [
                    pkg.name,
                    pkg.speed,
                    pkg.price,
                    pkg.tax_rate || 11.00,
                    pkg.description,
                    pkg.pppoe_profile || 'default',
                    pkg.is_active !== 0,
                    pkg.created_at || new Date()
                ]);
            }
            console.log(`✅ Migrated ${packages.length} packages\n`);
        } else {
            console.log('⚠️  No packages found in SQLite\n');
        }

        // ============================================
        // 2. Migrate Customers
        // ============================================
        console.log('👥 Migrating customers...');
        const customers = await getSQLiteData(sqliteDb, 'SELECT * FROM customers');
        
        if (customers.length > 0) {
            for (const customer of customers) {
                await pgClient.query(`
                    INSERT INTO customers (
                        username, name, phone, pppoe_username, email, address,
                        latitude, longitude, package_id, pppoe_profile, status,
                        join_date, cable_type, cable_length, port_number,
                        cable_status, cable_notes, device_id, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                    ON CONFLICT (username) DO NOTHING
                `, [
                    customer.username,
                    customer.name,
                    customer.phone,
                    customer.pppoe_username,
                    customer.email,
                    customer.address,
                    customer.latitude,
                    customer.longitude,
                    customer.package_id,
                    customer.pppoe_profile,
                    customer.status || 'active',
                    customer.join_date || new Date(),
                    customer.cable_type,
                    customer.cable_length,
                    customer.port_number,
                    customer.cable_status,
                    customer.cable_notes,
                    customer.device_id,
                    customer.created_at || new Date()
                ]);
            }
            console.log(`✅ Migrated ${customers.length} customers\n`);
        } else {
            console.log('⚠️  No customers found in SQLite\n');
        }

        // ============================================
        // 3. Migrate Invoices
        // ============================================
        console.log('📄 Migrating invoices...');
        const invoices = await getSQLiteData(sqliteDb, 'SELECT * FROM invoices');
        
        if (invoices.length > 0) {
            for (const invoice of invoices) {
                await pgClient.query(`
                    INSERT INTO invoices (
                        customer_id, package_id, invoice_number, amount, due_date,
                        status, payment_date, payment_method, payment_gateway,
                        payment_token, payment_url, notes, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    ON CONFLICT (invoice_number) DO NOTHING
                `, [
                    invoice.customer_id,
                    invoice.package_id,
                    invoice.invoice_number,
                    invoice.amount,
                    invoice.due_date,
                    invoice.status || 'unpaid',
                    invoice.payment_date,
                    invoice.payment_method,
                    invoice.payment_gateway,
                    invoice.payment_token,
                    invoice.payment_url,
                    invoice.notes,
                    invoice.created_at || new Date()
                ]);
            }
            console.log(`✅ Migrated ${invoices.length} invoices\n`);
        } else {
            console.log('⚠️  No invoices found in SQLite\n');
        }

        // ============================================
        // 4. Migrate Payments
        // ============================================
        console.log('💰 Migrating payments...');
        const payments = await getSQLiteData(sqliteDb, 'SELECT * FROM payments');
        
        if (payments.length > 0) {
            for (const payment of payments) {
                await pgClient.query(`
                    INSERT INTO payments (
                        invoice_id, amount, payment_date, payment_method,
                        reference_number, notes, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    payment.invoice_id,
                    payment.amount,
                    payment.payment_date || new Date(),
                    payment.payment_method,
                    payment.reference_number,
                    payment.notes,
                    payment.created_at || new Date()
                ]);
            }
            console.log(`✅ Migrated ${payments.length} payments\n`);
        } else {
            console.log('⚠️  No payments found in SQLite\n');
        }

        // ============================================
        // 5. Migrate NAS Servers (if exists)
        // ============================================
        try {
            console.log('🖥️  Migrating NAS servers...');
            const nasServers = await getSQLiteData(sqliteDb, 'SELECT * FROM nas_servers');
            
            if (nasServers.length > 0) {
                for (const nas of nasServers) {
                    await pgClient.query(`
                        INSERT INTO nas_servers (
                            nas_name, short_name, ip_address, secret, ports, type, description, is_active, created_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    `, [
                        nas.nas_name,
                        nas.short_name,
                        nas.ip_address,
                        nas.secret,
                        nas.ports || 1812,
                        nas.type || 'other',
                        nas.description,
                        nas.is_active !== 0,
                        nas.created_at || new Date()
                    ]);
                }
                console.log(`✅ Migrated ${nasServers.length} NAS servers\n`);
            }
        } catch (e) {
            console.log('⚠️  NAS servers table not found (skipping)\n');
        }

        // ============================================
        // 6. Migrate Mikrotik Servers (if exists)
        // ============================================
        try {
            console.log('🔧 Migrating Mikrotik servers...');
            const mikrotikServers = await getSQLiteData(sqliteDb, 'SELECT * FROM mikrotik_servers');
            
            if (mikrotikServers.length > 0) {
                for (const mt of mikrotikServers) {
                    await pgClient.query(`
                        INSERT INTO mikrotik_servers (
                            name, host, port, username, password, main_interface, is_active, created_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    `, [
                        mt.name,
                        mt.host,
                        mt.port || 8728,
                        mt.username,
                        mt.password,
                        mt.main_interface,
                        mt.is_active !== 0,
                        mt.created_at || new Date()
                    ]);
                }
                console.log(`✅ Migrated ${mikrotikServers.length} Mikrotik servers\n`);
            }
        } catch (e) {
            console.log('⚠️  Mikrotik servers table not found (skipping)\n');
        }

        // ============================================
        // 7. Migrate Trouble Reports (if exists)
        // ============================================
        try {
            console.log('🎫 Migrating trouble reports...');
            const troubleReports = await getSQLiteData(sqliteDb, 'SELECT * FROM trouble_reports');
            
            if (troubleReports.length > 0) {
                for (const ticket of troubleReports) {
                    await pgClient.query(`
                        INSERT INTO trouble_reports (
                            ticket_number, customer_id, customer_phone, customer_name,
                            problem_description, status, priority, technician_id,
                            technician_name, notes, resolution, created_at, updated_at, resolved_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                        ON CONFLICT (ticket_number) DO NOTHING
                    `, [
                        ticket.ticket_number,
                        ticket.customer_id,
                        ticket.customer_phone,
                        ticket.customer_name,
                        ticket.problem_description,
                        ticket.status || 'open',
                        ticket.priority || 'normal',
                        ticket.technician_id,
                        ticket.technician_name,
                        ticket.notes,
                        ticket.resolution,
                        ticket.created_at || new Date(),
                        ticket.updated_at || new Date(),
                        ticket.resolved_at
                    ]);
                }
                console.log(`✅ Migrated ${troubleReports.length} trouble reports\n`);
            }
        } catch (e) {
            console.log('⚠️  Trouble reports table not found (skipping)\n');
        }

        // ============================================
        // 8. Migrate Installations (if exists)
        // ============================================
        try {
            console.log('🏗️  Migrating installations...');
            const installations = await getSQLiteData(sqliteDb, 'SELECT * FROM installations');
            
            if (installations.length > 0) {
                for (const install of installations) {
                    await pgClient.query(`
                        INSERT INTO installations (
                            job_number, customer_name, customer_phone, address, package_id,
                            latitude, longitude, status, technician_id, technician_name,
                            scheduled_date, completed_date, notes, created_at, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                        ON CONFLICT (job_number) DO NOTHING
                    `, [
                        install.job_number,
                        install.customer_name,
                        install.customer_phone,
                        install.address,
                        install.package_id,
                        install.latitude,
                        install.longitude,
                        install.status || 'pending',
                        install.technician_id,
                        install.technician_name,
                        install.scheduled_date,
                        install.completed_date,
                        install.notes,
                        install.created_at || new Date(),
                        install.updated_at || new Date()
                    ]);
                }
                console.log(`✅ Migrated ${installations.length} installations\n`);
            }
        } catch (e) {
            console.log('⚠️  Installations table not found (skipping)\n');
        }

        // Commit transaction
        await pgClient.query('COMMIT');
        pgClient.release();

        console.log('\n✅ Migration completed successfully!');
        console.log('\n📊 Summary:');
        console.log(`  - Packages: ${packages.length}`);
        console.log(`  - Customers: ${customers.length}`);
        console.log(`  - Invoices: ${invoices.length}`);
        console.log(`  - Payments: ${payments.length}`);
        console.log('\n🎉 All data has been migrated to PostgreSQL!');
        console.log('\n⚠️  IMPORTANT: Please verify the data before switching to PostgreSQL in production.');
        console.log('💡 TIP: Keep a backup of your billing.db file.');

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        sqliteDb.close();
        await pgPool.end();
    }
}

// Run migration
migrateData().catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
});
