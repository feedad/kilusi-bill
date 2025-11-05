const { Pool } = require('pg');

async function testRadiusAttributes() {
    console.log('🔍 TESTING RADIUS ATTRIBUTE PROCESSING');
    console.log('=====================================');

    const pool = new Pool({
        host: '172.22.10.28',
        port: 5432,
        database: 'kilusi_bill',
        user: 'kilusi_user',
        password: 'kilusi1234'
    });

    try {
        // Simulate the RADIUS server's attribute lookup process
        const username = 'apptest';
        console.log(`\n📋 Simulating RADIUS authentication for ${username}:`);

        // Step 1: Check user authentication (radcheck)
        console.log('\n1. Checking user authentication:');
        const userCheck = await pool.query(`
            SELECT attribute, op, value
            FROM radcheck
            WHERE username = $1
        `, [username]);

        if (userCheck.rows.length > 0) {
            console.log('   ✅ User authentication found:');
            userCheck.rows.forEach(auth => {
                console.log(`      ${auth.attribute} ${auth.op} ${auth.value}`);
            });
        } else {
            console.log('   ❌ No authentication data found');
            return;
        }

        // Step 2: Get user groups (radusergroup)
        console.log('\n2. Getting user group assignments:');
        const userGroups = await pool.query(`
            SELECT groupname, priority
            FROM radusergroup
            WHERE username = $1
            ORDER BY priority ASC, groupname ASC
        `, [username]);

        if (userGroups.rows.length > 0) {
            console.log('   ✅ User groups found:');
            userGroups.rows.forEach(group => {
                console.log(`      ${group.groupname} (Priority: ${group.priority})`);
            });
        } else {
            console.log('   ❌ No group assignments found');
            return;
        }

        // Step 3: Get reply attributes from groups (radgroupreply)
        console.log('\n3. Getting reply attributes from groups:');
        let allReplyAttributes = [];

        for (const group of userGroups.rows) {
            const groupAttrs = await pool.query(`
                SELECT attribute, op, value
                FROM radgroupreply
                WHERE groupname = $1
                ORDER BY attribute
            `, [group.groupname]);

            if (groupAttrs.rows.length > 0) {
                console.log(`   📦 From group ${group.groupname}:`);
                groupAttrs.rows.forEach(attr => {
                    console.log(`      ${attr.attribute} ${attr.op} ${attr.value}`);

                    // Add to our collected attributes (later groups override earlier ones)
                    allReplyAttributes.push({
                        group: group.groupname,
                        priority: group.priority,
                        attribute: attr.attribute,
                        op: attr.op,
                        value: attr.value
                    });
                });
            }
        }

        // Step 4: Get direct user reply attributes (radreply)
        console.log('\n4. Getting direct user reply attributes:');
        const userReply = await pool.query(`
            SELECT attribute, op, value
            FROM radreply
            WHERE username = $1
            ORDER BY attribute
        `, [username]);

        if (userReply.rows.length > 0) {
            console.log('   📦 Direct user attributes:');
            userReply.rows.forEach(attr => {
                console.log(`      ${attr.attribute} ${attr.op} ${attr.value}`);

                // Direct user attributes have highest priority
                allReplyAttributes.push({
                    group: 'direct',
                    priority: 0,
                    attribute: attr.attribute,
                    op: attr.op,
                    value: attr.value
                });
            });
        } else {
            console.log('   ℹ️  No direct user reply attributes found');
        }

        // Step 5: Process final attributes (simulate RADIUS server behavior)
        console.log('\n5. Final RADIUS reply attributes:');
        const finalAttributes = {};

        // Process by priority (lower number = higher priority)
        allReplyAttributes.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority; // Lower priority number first
            }
            return a.group.localeCompare(b.group); // Then alphabetically by group
        });

        allReplyAttributes.forEach(attr => {
            // Later attributes with same name override earlier ones
            finalAttributes[attr.attribute] = {
                op: attr.op,
                value: attr.value,
                source: attr.group
            };
        });

        console.log('   📦 Final attributes to be returned:');
        Object.entries(finalAttributes).forEach(([attr, config]) => {
            console.log(`      ${attr} ${config.op} ${config.value} (from: ${config.source})`);
        });

        // Step 6: Check for key Mikrotik attributes
        console.log('\n6. Key Mikrotik attributes check:');
        const mikrotikAttrs = ['Mikrotik-Rate-Limit', 'Framed-Protocol', 'Service-Type', 'Framed-Pool'];

        mikrotikAttrs.forEach(attr => {
            if (finalAttributes[attr]) {
                console.log(`   ✅ ${attr}: ${finalAttributes[attr].value}`);
            } else {
                console.log(`   ❌ ${attr}: NOT FOUND`);
            }
        });

        // Step 7: Test what the actual RADIUS server would return
        console.log('\n7. Simulating RADIUS server response:');
        console.log(`   📤 Access-Accept for ${username} would include:`);

        const responseAttrs = {
            'Reply-Message': 'Authentication successful',
            ...Object.fromEntries(
                Object.entries(finalAttributes).map(([key, val]) => [key, val.value])
            )
        };

        Object.entries(responseAttrs).forEach(([key, value]) => {
            console.log(`      ${key}: ${value}`);
        });

        console.log('\n🎯 Analysis:');
        if (finalAttributes['Mikrotik-Rate-Limit']) {
            console.log('   ✅ Mikrotik rate limiting attribute is present');
            console.log('   ✅ User should get correct 10M bandwidth profile');
        } else {
            console.log('   ❌ Mikrotik rate limiting attribute is missing');
            console.log('   ❌ User may get default profile instead of UpTo-10M');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

testRadiusAttributes();