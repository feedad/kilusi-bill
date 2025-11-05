const radiusDb = require('./config/radius-postgres');

async function checkRadiusGroups() {
    console.log('🔍 CHECKING RADIUS GROUP ASSIGNMENTS');
    console.log('==================================');

    try {
        // Check apptest user group assignment
        console.log('\n📋 User Group Assignment:');
        const userGroups = await radiusDb.query(`
            SELECT username, groupname, priority
            FROM radusergroup
            WHERE username = $1
            ORDER BY priority
        `, ['apptest']);

        if (userGroups.length > 0) {
            userGroups.forEach(group => {
                console.log(`   User: ${group.username} -> Group: ${group.groupname} (Priority: ${group.priority})`);
            });
        } else {
            console.log('   ❌ No group assignment found for apptest user');
        }

        // Check all available groups
        console.log('\n📋 Available RADIUS Groups:');
        const allGroups = await radiusDb.query(`
            SELECT DISTINCT groupname
            FROM radgroupreply
            ORDER BY groupname
        `);

        if (allGroups.length > 0) {
            allGroups.forEach(group => {
                console.log(`   Group: ${group.groupname}`);
            });
        } else {
            console.log('   ❌ No groups found in radgroupreply');
        }

        // Check group reply attributes for UpTo-10M
        console.log('\n📋 UpTo-10M Group Attributes:');
        const upto10mAttrs = await radiusDb.query(`
            SELECT groupname, attribute, op, value
            FROM radgroupreply
            WHERE groupname = $1
            ORDER BY attribute
        `, ['UpTo-10M']);

        if (upto10mAttrs.length > 0) {
            upto10mAttrs.forEach(attr => {
                console.log(`   ${attr.attribute} ${attr.op} ${attr.value}`);
            });
        } else {
            console.log('   ❌ No attributes found for UpTo-10M group');
        }

        // Check if UpTo-10M group exists
        console.log('\n🔍 Searching for UpTo-10M variations:');
        const groupVariations = await radiusDb.query(`
            SELECT DISTINCT groupname
            FROM radgroupreply
            WHERE groupname ILIKE '%upto%' OR groupname ILIKE '%10m%'
            ORDER BY groupname
        `);

        if (groupVariations.length > 0) {
            groupVariations.forEach(group => {
                console.log(`   Found group: "${group.groupname}"`);
            });
        } else {
            console.log('   ❌ No UpTo-10M related groups found');
        }

        // Check user's current reply attributes
        console.log('\n📋 apptest User Reply Attributes:');
        const userReplyAttrs = await radiusDb.query(`
            SELECT attribute, op, value
            FROM radreply
            WHERE username = $1
            ORDER BY attribute
        `, ['apptest']);

        if (userReplyAttrs.length > 0) {
            userReplyAttrs.forEach(attr => {
                console.log(`   ${attr.attribute} ${attr.op} ${attr.value}`);
            });
        } else {
            console.log('   ❌ No direct reply attributes found for apptest');
        }

        // Check what Mikrotik attributes are commonly used
        console.log('\n📋 Common Mikrotik Attributes in Database:');
        const mikrotikAttrs = await radiusDb.query(`
            SELECT DISTINCT attribute
            FROM radgroupreply
            WHERE attribute ILIKE '%mikrotik%' OR attribute ILIKE '%rate%' OR attribute ILIKE '%limit%'
            ORDER BY attribute
        `);

        if (mikrotikAttrs.length > 0) {
            mikrotikAttrs.forEach(attr => {
                console.log(`   Attribute: ${attr.attribute}`);
            });
        } else {
            console.log('   ❌ No Mikrotik-specific attributes found');
        }

    } catch (error) {
        console.error('❌ Error checking RADIUS groups:', error.message);
    } finally {
        await radiusDb.closeDatabase();
        process.exit(0);
    }
}

checkRadiusGroups();