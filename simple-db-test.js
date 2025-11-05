const { Pool } = require('pg');

async function testDirectDb() {
    console.log('🔍 TESTING DIRECT DATABASE CONNECTION');
    console.log('===================================');

    const pool = new Pool({
        host: '172.22.10.28',
        port: 5432,
        database: 'kilusi_bill',
        user: 'kilusi_user',
        password: 'kilusi1234'
    });

    try {
        console.log('\n📋 Testing basic connection...');
        const result = await pool.query('SELECT NOW() as current_time');
        console.log(`   ✅ Connected: ${result.rows[0].current_time}`);

        console.log('\n📋 Listing all tables...');
        const tables = await pool.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);

        if (tables.rows.length > 0) {
            console.log('   Tables found:');
            tables.rows.forEach(table => {
                console.log(`     - ${table.table_name}`);
            });
        } else {
            console.log('   ❌ No tables found');
        }

        // Check for RADIUS tables specifically
        console.log('\n📋 Checking RADIUS tables...');
        const radiusTables = ['radgroup', 'radcheck', 'radreply', 'radusergroup', 'radgroupreply'];

        for (const tableName of radiusTables) {
            try {
                const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                console.log(`   ✅ ${tableName}: ${countResult.rows[0].count} rows`);
            } catch (error) {
                console.log(`   ❌ ${tableName}: ${error.message}`);
            }
        }

        // Check if customers table has apptest
        console.log('\n📋 Checking customers table for apptest...');
        try {
            const customerResult = await pool.query(`
                SELECT id, name, pppoe_username, package_name
                FROM customers
                WHERE pppoe_username = $1
            `, ['apptest']);

            if (customerResult.rows.length > 0) {
                console.log('   ✅ Found apptest customer:');
                customerResult.rows.forEach(customer => {
                    console.log(`     ID: ${customer.id}`);
                    console.log(`     Name: ${customer.name}`);
                    console.log(`     Username: ${customer.pppoe_username}`);
                    console.log(`     Package: ${customer.package_name}`);
                });
            } else {
                console.log('   ❌ apptest not found in customers table');
            }
        } catch (error) {
            console.log(`   ❌ Error checking customers: ${error.message}`);
        }

    } catch (error) {
        console.error('❌ Database error:', error.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

testDirectDb();