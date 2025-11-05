const radiusDb = require('./config/radius-postgres');

async function checkDatabaseSchema() {
    console.log('🔍 CHECKING DATABASE SCHEMA');
    console.log('==========================');

    try {
        // Get current database info
        console.log('\n📋 Current Database Info:');
        const dbInfo = await radiusDb.query(
            'SELECT current_database() as database_name, current_user() as current_user, version() as version'
        );
        console.log(`   Database: ${dbInfo[0].database_name}`);
        console.log(`   User: ${dbInfo[0].current_user}`);
        console.log(`   Version: ${dbInfo[0].version.split(' ')[0]}`);

        // List all tables in the database
        console.log('\n📋 All Tables in Database:');
        const allTables = await radiusDb.query(`
            SELECT table_name, table_type
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);

        if (allTables.length > 0) {
            allTables.forEach(table => {
                console.log(`   ${table.table_type}: ${table.table_name}`);
            });
        } else {
            console.log('   ❌ No tables found in public schema');
        }

        // Check if there are any user-related tables
        console.log('\n📋 User/Customer Related Tables:');
        const userTables = allTables.filter(table =>
            table.table_name.toLowerCase().includes('user') ||
            table.table_name.toLowerCase().includes('customer') ||
            table.table_name.toLowerCase().includes('radius') ||
            table.table_name.toLowerCase().includes('nas') ||
            table.table_name.toLowerCase().includes('package')
        );

        if (userTables.length > 0) {
            userTables.forEach(table => {
                console.log(`   Found: ${table.table_name} (${table.table_type})`);
            });
        } else {
            console.log('   ❌ No user/radius-related tables found');
        }

        // Check if customers table exists
        console.log('\n📋 Customers Table Check:');
        try {
            const customerCount = await radiusDb.query(`
                SELECT COUNT(*) as count FROM customers
            `);
            console.log(`   Customers table exists: ${customerCount[0].count} customers`);

            // Check for apptest user in customers table
            const apptestCustomer = await radiusDb.query(`
                SELECT id, name, pppoe_username, pppoe_password, package_name
                FROM customers
                WHERE pppoe_username = $1
            `, ['apptest']);

            if (apptestCustomer.length > 0) {
                console.log(`   ✅ Found apptest customer:`);
                console.log(`      ID: ${apptestCustomer[0].id}`);
                console.log(`      Name: ${apptestCustomer[0].name}`);
                console.log(`      Username: ${apptestCustomer[0].pppoe_username}`);
                console.log(`      Package: ${apptestCustomer[0].package_name}`);
            } else {
                console.log(`   ❌ apptest user not found in customers table`);
            }
        } catch (error) {
            console.log(`   ❌ customers table not found: ${error.message}`);
        }

        // Check for radius-specific table structure
        console.log('\n📋 Looking for RADIUS-specific tables:');
        const radiusTableNames = [
            'radcheck', 'radreply', 'radgroupreply', 'radgroupcheck',
            'radusergroup', 'radacct', 'nas', 'nas_servers'
        ];

        for (const tableName of radiusTableNames) {
            try {
                const count = await radiusDb.query(`SELECT COUNT(*) as cnt FROM ${tableName}`);
                console.log(`   ✅ ${tableName}: ${count[0].cnt} rows`);
            } catch (error) {
                console.log(`   ❌ ${tableName}: Not found`);
            }
        }

    } catch (error) {
        console.error('❌ Error checking database schema:', error.message);
    } finally {
        await radiusDb.closeDatabase();
        process.exit(0);
    }
}

checkDatabaseSchema();