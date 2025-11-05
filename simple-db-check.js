const radiusDb = require('./config/radius-postgres');

async function simpleDatabaseCheck() {
    console.log('🔍 SIMPLE DATABASE CHECK');
    console.log('========================');

    try {
        // Try to get a simple list of tables
        console.log('\n📋 Checking Database Connection:');

        // Test basic query first
        try {
            const result = await radiusDb.query('SELECT NOW() as current_time');
            console.log(`   ✅ Database connected: ${result[0].current_time}`);
        } catch (error) {
            console.log(`   ❌ Database connection failed: ${error.message}`);
            return;
        }

        // Get list of tables using a simpler query
        console.log('\n📋 Tables in Database:');
        try {
            const tables = await radiusDb.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
            if (tables.length > 0) {
                tables.forEach(table => {
                    console.log(`   - ${table.table_name}`);
                });
            } else {
                console.log('   ❌ No tables found');
            }
        } catch (error) {
            console.log(`   ❌ Error getting tables: ${error.message}`);
        }

        // Check specifically for tables that might contain our data
        console.log('\n📋 Looking for User/RADIUS Tables:');
        const potentialTables = ['customers', 'users', 'radius_users', 'nas_servers', 'packages'];

        for (const tableName of potentialTables) {
            try {
                const count = await radiusDb.query(`SELECT COUNT(*) as cnt FROM ${tableName}`);
                console.log(`   ✅ ${tableName}: ${count[0].cnt} rows`);

                // If it's customers table, check for apptest
                if (tableName === 'customers') {
                    const apptest = await radiusDb.query(`SELECT * FROM ${tableName} WHERE pppoe_username = $1`, ['apptest']);
                    if (apptest.length > 0) {
                        console.log(`      Found apptest: ${apptest[0].name} - Package: ${apptest[0].package_name}`);
                    }
                }
            } catch (error) {
                console.log(`   ❌ ${tableName}: Not found`);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await radiusDb.closeDatabase();
        process.exit(0);
    }
}

simpleDatabaseCheck();