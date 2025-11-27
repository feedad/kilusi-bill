/**
 * Migration: Add Multi-NAS and Multi-Mikrotik Support
 * Adds tables for managing multiple NAS devices and Mikrotik servers
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../billing.db');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Starting migration: Multi-NAS and Multi-Mikrotik support...\n');

// Promisify database operations
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

async function migrate() {
try {
    // Create NAS Servers table
    console.log('📊 Creating nas_servers table...');
    await runQuery(`
        CREATE TABLE IF NOT EXISTS nas_servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL DEFAULT 'mikrotik',
            host TEXT NOT NULL,
            secret TEXT NOT NULL,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ nas_servers table created\n');

    // Create Mikrotik Servers table
    console.log('📊 Creating mikrotik_servers table...');
    await runQuery(`
        CREATE TABLE IF NOT EXISTS mikrotik_servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            host TEXT NOT NULL,
            port INTEGER DEFAULT 8728,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            description TEXT,
            is_pppoe_server INTEGER DEFAULT 1,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ mikrotik_servers table created\n');

    // Add columns to customers table if not exists
    console.log('📊 Updating customers table...');
    
    // Check if nas_server_id column exists
    const hasNasServer = await getQuery("SELECT COUNT(*) as count FROM pragma_table_info('customers') WHERE name='nas_server_id'");
    
    if (hasNasServer.count === 0) {
        await runQuery(`ALTER TABLE customers ADD COLUMN nas_server_id INTEGER DEFAULT 1`);
        console.log('✅ Added nas_server_id column to customers');
    } else {
        console.log('ℹ️  nas_server_id column already exists');
    }
    
    // Check if mikrotik_server_id column exists
    const hasMikrotikServer = await getQuery("SELECT COUNT(*) as count FROM pragma_table_info('customers') WHERE name='mikrotik_server_id'");
    
    if (hasMikrotikServer.count === 0) {
        await runQuery(`ALTER TABLE customers ADD COLUMN mikrotik_server_id INTEGER DEFAULT 1`);
        console.log('✅ Added mikrotik_server_id column to customers');
    } else {
        console.log('ℹ️  mikrotik_server_id column already exists');
    }
    
    console.log('');

    // Insert default NAS server from current settings
    console.log('📊 Adding default NAS server...');
    const existingNas = await getQuery('SELECT COUNT(*) as count FROM nas_servers');
    if (existingNas.count === 0) {
        await runQuery(`
            INSERT INTO nas_servers (id, name, type, host, secret, description, is_active)
            VALUES (1, 'Default NAS', 'mikrotik', '192.168.88.1', 'testing123', 'Default NAS Server', 1)
        `);
        console.log('✅ Default NAS server added\n');
    } else {
        console.log('ℹ️  NAS servers already exist\n');
    }

    // Insert default Mikrotik server from current settings
    console.log('📊 Adding default Mikrotik server...');
    const existingMikrotik = await getQuery('SELECT COUNT(*) as count FROM mikrotik_servers');
    if (existingMikrotik.count === 0) {
        await runQuery(`
            INSERT INTO mikrotik_servers (id, name, host, port, username, password, description, is_pppoe_server, is_active)
            VALUES (1, 'Main PPPoE Server', '192.168.88.1', 8728, 'admin', '', 'Main PPPoE Server', 1, 1)
        `);
        console.log('✅ Default Mikrotik server added\n');
    } else {
        console.log('ℹ️  Mikrotik servers already exist\n');
    }

    console.log('✅ Migration completed successfully!');
    console.log('\n📋 Summary:');
    console.log('  - nas_servers table: Ready');
    console.log('  - mikrotik_servers table: Ready');
    console.log('  - customers.nas_server_id: Added');
    console.log('  - customers.mikrotik_server_id: Added');
    console.log('\n🎉 Multi-NAS and Multi-Mikrotik support is now enabled!');

} catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
} finally {
    db.close();
}
}

// Run migration
migrate().catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
});
