/**
 * Initialize Kilusi-Bill Database with Basic Tables
 * Creates packages, customers, invoices, and payments tables
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../billing.db');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Initializing Kilusi-Bill database schema...\n');

// Promisify database operations
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

async function initializeDatabase() {
try {
    console.log('📊 Creating packages table...');
    await runQuery(`
        CREATE TABLE IF NOT EXISTS packages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            speed TEXT NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            tax_rate DECIMAL(5,2) DEFAULT 11.00,
            description TEXT,
            pppoe_profile TEXT DEFAULT 'default',
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ packages table created\n');

    console.log('📊 Creating customers table...');
    await runQuery(`
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            pppoe_username TEXT,
            email TEXT,
            address TEXT,
            latitude DECIMAL(10,8),
            longitude DECIMAL(11,8),
            package_id INTEGER,
            pppoe_profile TEXT,
            status TEXT DEFAULT 'active',
            join_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            cable_type TEXT,
            cable_length INTEGER,
            port_number INTEGER,
            cable_status TEXT DEFAULT 'connected',
            cable_notes TEXT,
            FOREIGN KEY (package_id) REFERENCES packages (id)
        )
    `);
    console.log('✅ customers table created\n');

    console.log('📊 Creating invoices table...');
    await runQuery(`
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            package_id INTEGER NOT NULL,
            invoice_number TEXT UNIQUE NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            due_date DATE NOT NULL,
            status TEXT DEFAULT 'unpaid',
            payment_date DATETIME,
            payment_method TEXT,
            payment_gateway TEXT,
            payment_token TEXT,
            payment_url TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers (id),
            FOREIGN KEY (package_id) REFERENCES packages (id)
        )
    `);
    console.log('✅ invoices table created\n');

    console.log('📊 Creating payments table...');
    await runQuery(`
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            payment_method TEXT,
            reference_number TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (invoice_id) REFERENCES invoices (id)
        )
    `);
    console.log('✅ payments table created\n');

    console.log('✅ Database initialization completed successfully!');
    console.log('\n📋 Summary:');
    console.log('  - packages table: Ready');
    console.log('  - customers table: Ready');
    console.log('  - invoices table: Ready');
    console.log('  - payments table: Ready');
    console.log('\n🎉 Kilusi-Bill database is now ready!');

} catch (error) {
    console.error('❌ Initialization failed:', error.message);
    console.error(error);
    process.exit(1);
} finally {
    db.close();
}
}

// Run initialization
initializeDatabase().catch(err => {
    console.error('Initialization error:', err);
    process.exit(1);
});
