const radiusDb = require('./config/radius-postgres');

async function checkRadiusTables() {
    console.log('🔍 CHECKING RADIUS DATABASE TABLES');
    console.log('=================================');

    try {
        // Check what tables exist
        console.log('\n📋 Available Tables:');
        const tables = await radiusDb.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);

        if (tables.length > 0) {
            tables.forEach(table => {
                console.log(`   Table: ${table.table_name}`);
            });
        } else {
            console.log('   ❌ No tables found');
        }

        // Check radcheck table
        console.log('\n📋 radcheck Table Structure:');
        try {
            const radcheckUsers = await radiusDb.query(`
                SELECT username, attribute, op, value
                FROM radcheck
                WHERE username = $1
                ORDER BY attribute
            `, ['apptest']);

            if (radcheckUsers.length > 0) {
                radcheckUsers.forEach(attr => {
                    console.log(`   ${attr.attribute} ${attr.op} ${attr.value}`);
                });
            } else {
                console.log('   ❌ No entries found for apptest in radcheck');
            }
        } catch (error) {
            console.log('   ❌ radcheck table not found or error:', error.message);
        }

        // Check if group tables exist
        console.log('\n📋 Group Tables Check:');
        const groupTables = ['radusergroup', 'radgroupreply', 'radgroupcheck'];

        for (const table of groupTables) {
            try {
                const count = await radiusDb.query(`SELECT COUNT(*) as count FROM ${table}`);
                console.log(`   ${table}: ${count[0].count} rows`);
            } catch (error) {
                console.log(`   ${table}: ❌ Table not found (${error.message})`);
            }
        }

        // Check if we need to create group tables
        console.log('\n📋 Checking if RADIUS group tables need to be created:');
        const hasGroupTables = await Promise.all(
            groupTables.map(async (table) => {
                try {
                    await radiusDb.query(`SELECT 1 FROM ${table} LIMIT 1`);
                    return true;
                } catch {
                    return false;
                }
            })
        );

        const needsCreation = hasGroupTables.some(exists => !exists);
        if (needsCreation) {
            console.log('   ⚠️  Some RADIUS group tables are missing');
            console.log('   🔧 Need to create proper RADIUS group structure');
        } else {
            console.log('   ✅ All RADIUS group tables exist');
        }

    } catch (error) {
        console.error('❌ Error checking tables:', error.message);
    } finally {
        await radiusDb.closeDatabase();
        process.exit(0);
    }
}

checkRadiusTables();