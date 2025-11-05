const radiusDb = require('./config/radius-postgres');

async function verifyRadiusSetup() {
    console.log('🔍 VERIFYING RADIUS SETUP');
    console.log('=========================');

    try {
        // Check if tables exist
        console.log('\n📋 Checking RADIUS Tables:');
        const tables = ['radgroup', 'radgroupreply', 'radcheck', 'radusergroup'];

        for (const table of tables) {
            try {
                const result = await radiusDb.query(`SELECT COUNT(*) as count FROM ${table}`);
                console.log(`   ✅ ${table}: ${result[0].count} rows`);
            } catch (error) {
                console.log(`   ❌ ${table}: Error - ${error.message}`);
            }
        }

        // Check UpTo-10M group
        console.log('\n📋 Checking UpTo-10M Group:');
        try {
            const groupResult = await radiusDb.query(`
                SELECT * FROM radgroup WHERE groupname = 'UpTo-10M'
            `);

            if (groupResult.length > 0) {
                console.log(`   ✅ UpTo-10M group found:`);
                console.log(`      ID: ${groupResult[0].id}`);
                console.log(`      Description: ${groupResult[0].description}`);
                console.log(`      Priority: ${groupResult[0].priority}`);
            } else {
                console.log('   ❌ UpTo-10M group not found');
            }
        } catch (error) {
            console.log(`   ❌ Error checking UpTo-10M group: ${error.message}`);
        }

        // Check all groups
        console.log('\n📋 All Available Groups:');
        try {
            const allGroups = await radiusDb.query(`
                SELECT groupname, description, priority
                FROM radgroup
                ORDER BY priority, groupname
            `);

            if (allGroups.length > 0) {
                allGroups.forEach(group => {
                    console.log(`   - ${group.groupname} (Priority: ${group.priority}): ${group.description}`);
                });
            } else {
                console.log('   ❌ No groups found');
            }
        } catch (error) {
            console.log(`   ❌ Error getting groups: ${error.message}`);
        }

        // Check apptest user in radcheck
        console.log('\n📋 Checking apptest Authentication:');
        try {
            const userAuth = await radiusDb.query(`
                SELECT username, attribute, op, value
                FROM radcheck
                WHERE username = 'apptest'
            `);

            if (userAuth.length > 0) {
                console.log('   ✅ apptest authentication found:');
                userAuth.forEach(auth => {
                    console.log(`      ${auth.attribute} ${auth.op} ${auth.value}`);
                });
            } else {
                console.log('   ❌ apptest authentication not found');
            }
        } catch (error) {
            console.log(`   ❌ Error checking apptest auth: ${error.message}`);
        }

        // Check apptest group assignments
        console.log('\n📋 Checking apptest Group Assignments:');
        try {
            const userGroups = await radiusDb.query(`
                SELECT u.username, u.groupname, u.priority, g.description
                FROM radusergroup u
                LEFT JOIN radgroup g ON u.groupname = g.groupname
                WHERE u.username = 'apptest'
                ORDER BY u.priority
            `);

            if (userGroups.length > 0) {
                console.log('   ✅ apptest group assignments:');
                userGroups.forEach(group => {
                    console.log(`      ${group.groupname} (Priority: ${group.priority}): ${group.description || 'No description'}`);
                });
            } else {
                console.log('   ❌ apptest has no group assignments');
            }
        } catch (error) {
            console.log(`   ❌ Error checking group assignments: ${error.message}`);
        }

        // Check UpTo-10M group attributes
        console.log('\n📋 UpTo-10M Group Attributes:');
        try {
            const groupAttrs = await radiusDb.query(`
                SELECT attribute, op, value
                FROM radgroupreply
                WHERE groupname = 'UpTo-10M'
                ORDER BY attribute
            `);

            if (groupAttrs.length > 0) {
                console.log(`   ✅ UpTo-10M has ${groupAttrs.length} attributes:`);
                groupAttrs.forEach(attr => {
                    console.log(`      ${attr.attribute} ${attr.op} ${attr.value}`);
                });
            } else {
                console.log('   ❌ UpTo-10M group has no attributes');
            }
        } catch (error) {
            console.log(`   ❌ Error checking group attributes: ${error.message}`);
        }

        // Check all user group assignments
        console.log('\n📋 All User Group Assignments:');
        try {
            const allUserGroups = await radiusDb.query(`
                SELECT u.username, u.groupname, u.priority
                FROM radusergroup u
                ORDER BY u.username, u.priority
            `);

            if (allUserGroups.length > 0) {
                console.log(`   ✅ Found ${allUserGroups.length} user-group assignments:`);
                allUserGroups.forEach(assignment => {
                    console.log(`      ${assignment.username} -> ${assignment.groupname} (Priority: ${assignment.priority})`);
                });
            } else {
                console.log('   ❌ No user-group assignments found');
            }
        } catch (error) {
            console.log(`   ❌ Error checking all assignments: ${error.message}`);
        }

    } catch (error) {
        console.error('❌ Error verifying setup:', error.message);
    } finally {
        await radiusDb.closeDatabase();
        process.exit(0);
    }
}

verifyRadiusSetup();