const { Pool } = require('pg');

async function checkExistingRadiusData() {
    console.log('🔍 CHECKING EXISTING RADIUS DATA');
    console.log('================================');

    const pool = new Pool({
        host: '172.22.10.28',
        port: 5432,
        database: 'kilusi_bill',
        user: 'kilusi_user',
        password: 'kilusi1234'
    });

    try {
        // Check existing groups
        console.log('\n📋 Existing RADIUS Groups:');
        const groups = await pool.query(`
            SELECT id, groupname, description, priority
            FROM radgroup
            ORDER BY priority, groupname
        `);

        groups.rows.forEach(group => {
            console.log(`   ${group.id}. ${group.groupname} (Priority: ${group.priority})`);
            console.log(`      Description: ${group.description}`);
        });

        // Check apptest user authentication
        console.log('\n📋 apptest Authentication Data:');
        const userAuth = await pool.query(`
            SELECT username, attribute, op, value
            FROM radcheck
            WHERE username = 'apptest'
        `);

        if (userAuth.rows.length > 0) {
            userAuth.rows.forEach(auth => {
                console.log(`   ${auth.attribute} ${auth.op} ${auth.value}`);
            });
        } else {
            console.log('   ❌ No authentication data for apptest');
        }

        // Check apptest group assignments
        console.log('\n📋 apptest Group Assignments:');
        const userGroups = await pool.query(`
            SELECT u.username, u.groupname, u.priority, g.description
            FROM radusergroup u
            JOIN radgroup g ON u.groupname = g.groupname
            WHERE u.username = 'apptest'
            ORDER BY u.priority
        `);

        if (userGroups.rows.length > 0) {
            userGroups.rows.forEach(group => {
                console.log(`   ${group.groupname} (Priority: ${group.priority})`);
                console.log(`      Description: ${group.description}`);
            });
        } else {
            console.log('   ❌ apptest has no group assignments');
        }

        // Check if UpTo-10M group exists
        console.log('\n📋 Looking for UpTo-10M related groups:');
        const upto10mGroups = await pool.query(`
            SELECT groupname, description
            FROM radgroup
            WHERE groupname ILIKE '%upto%' OR groupname ILIKE '%10m%' OR groupname ILIKE '%up%'
            ORDER BY groupname
        `);

        if (upto10mGroups.rows.length > 0) {
            upto10mGroups.rows.forEach(group => {
                console.log(`   Found: ${group.groupname} - ${group.description}`);
            });
        } else {
            console.log('   ❌ No UpTo-10M related groups found');
        }

        // Check group attributes for each group
        console.log('\n📋 Group Reply Attributes:');
        for (const group of groups.rows) {
            const groupAttrs = await pool.query(`
                SELECT attribute, op, value
                FROM radgroupreply
                WHERE groupname = $1
                ORDER BY attribute
            `, [group.groupname]);

            if (groupAttrs.rows.length > 0) {
                console.log(`   ${group.groupname} (${groupAttrs.rows.length} attributes):`);
                groupAttrs.rows.forEach(attr => {
                    // Show only key attributes relevant to Mikrotik
                    if (attr.attribute.toLowerCase().includes('mikrotik') ||
                        attr.attribute.toLowerCase().includes('rate') ||
                        attr.attribute.toLowerCase().includes('limit') ||
                        attr.attribute.toLowerCase().includes('framed') ||
                        attr.attribute.toLowerCase().includes('service')) {
                        console.log(`      ${attr.attribute} ${attr.op} ${attr.value}`);
                    }
                });
            }
        }

        // Check customers table structure for apptest
        console.log('\n📋 Customers Table Structure:');
        try {
            const customerStructure = await pool.query(`
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'customers'
                ORDER BY ordinal_position
            `);

            console.log('   Available columns:');
            customerStructure.rows.forEach(col => {
                console.log(`     - ${col.column_name} (${col.data_type})`);
            });

            // Now check for apptest in customers table
            console.log('\n📋 Searching for apptest in customers table:');
            const customerSearch = await pool.query(`
                SELECT id, name, pppoe_username, pppoe_password, package_id
                FROM customers
                WHERE pppoe_username = $1 OR name ILIKE $2
            `, ['apptest', '%apptest%']);

            if (customerSearch.rows.length > 0) {
                customerSearch.rows.forEach(customer => {
                    console.log(`   ✅ Found customer:`);
                    console.log(`      ID: ${customer.id}`);
                    console.log(`      Name: ${customer.name}`);
                    console.log(`      Username: ${customer.pppoe_username}`);
                    console.log(`      Package ID: ${customer.package_id}`);
                });
            } else {
                console.log('   ❌ apptest not found in customers table');
            }
        } catch (error) {
            console.log(`   ❌ Error checking customers: ${error.message}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

checkExistingRadiusData();