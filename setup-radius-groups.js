const radiusDb = require('./config/radius-postgres');

async function setupRadiusGroups() {
    console.log('🔧 SETTING UP RADIUS GROUPS');
    console.log('===========================');

    try {
        // Initialize RADIUS tables
        console.log('\n📋 Initializing RADIUS database tables...');
        const initResult = await radiusDb.initDatabase();
        if (initResult) {
            console.log('   ✅ RADIUS tables initialized successfully');
        } else {
            console.log('   ❌ Failed to initialize RADIUS tables');
            return;
        }

        // Check if UpTo-10M group exists, if not create it
        console.log('\n📋 Creating UpTo-10M group...');
        try {
            await radiusDb.query(`
                INSERT INTO radgroup (groupname, description, priority)
                VALUES ('UpTo-10M', 'UpTo-10M Mikrotik Profile', 5)
                ON CONFLICT (groupname) DO UPDATE SET
                    description = EXCLUDED.description,
                    priority = EXCLUDED.priority
            `);
            console.log('   ✅ UpTo-10M group created/updated');
        } catch (error) {
            console.log(`   ❌ Error creating UpTo-10M group: ${error.message}`);
        }

        // Add Mikrotik attributes for UpTo-10M group
        console.log('\n📋 Adding Mikrotik attributes to UpTo-10M group...');
        const mikrotikAttrs = [
            // Rate limiting attributes for Mikrotik
            ['Mikrotik-Rate-Limit', ':=', '10M/10M'],
            ['Framed-Protocol', ':=', 'PPP'],
            ['Service-Type', ':=', 'Framed-User'],
            ['Framed-Compression', ':=', 'Van-Jacobson-TCP-IP'],
            // Additional Mikrotik-specific attributes
            ['Mikrotik-Recv-Limit', ':=', '10485760'], // 10MB in bytes
            ['Mikrotik-Xmit-Limit', ':=', '10485760'], // 10MB in bytes
            ['Session-Timeout', ':=', '86400'], // 24 hours
        ];

        for (const [attr, op, value] of mikrotikAttrs) {
            try {
                await radiusDb.query(`
                    INSERT INTO radgroupreply (groupname, attribute, op, value)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT DO NOTHING
                `, ['UpTo-10M', attr, op, value]);
                console.log(`   ✅ Added ${attr}: ${value}`);
            } catch (error) {
                console.log(`   ❌ Error adding ${attr}: ${error.message}`);
            }
        }

        // Check if apptest user exists in radcheck
        console.log('\n📋 Setting up apptest user...');
        try {
            // Add or update apptest user password
            await radiusDb.query(`
                INSERT INTO radcheck (username, attribute, op, value)
                VALUES ('apptest', 'Cleartext-Password', ':=', '1234567')
                ON CONFLICT (username, attribute, op, value) DO UPDATE SET
                    value = EXCLUDED.value
            `);
            console.log('   ✅ apptest password set to 1234567');
        } catch (error) {
            console.log(`   ❌ Error setting apptest password: ${error.message}`);
        }

        // Assign apptest to UpTo-10M group
        console.log('\n📋 Assigning apptest to UpTo-10M group...');
        try {
            await radiusDb.query(`
                INSERT INTO radusergroup (username, groupname, priority)
                VALUES ('apptest', 'UpTo-10M', 1)
                ON CONFLICT (username, groupname) DO UPDATE SET
                    priority = EXCLUDED.priority
            `);
            console.log('   ✅ apptest assigned to UpTo-10M group');
        } catch (error) {
            console.log(`   ❌ Error assigning apptest to group: ${error.message}`);
        }

        // Verify the setup
        console.log('\n📋 Verification - Checking group assignments:');
        try {
            const userGroups = await radiusDb.query(`
                SELECT u.username, u.groupname, g.description
                FROM radusergroup u
                JOIN radgroup g ON u.groupname = g.groupname
                WHERE u.username = 'apptest'
            `);

            if (userGroups.length > 0) {
                userGroups.forEach(group => {
                    console.log(`   ✅ User: ${group.username} -> Group: ${group.groupname} (${group.description})`);
                });
            } else {
                console.log('   ❌ No group assignments found for apptest');
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
                groupAttrs.forEach(attr => {
                    console.log(`   ✅ ${attr.attribute} ${attr.op} ${attr.value}`);
                });
            } else {
                console.log('   ❌ No attributes found for UpTo-10M group');
            }
        } catch (error) {
            console.log(`   ❌ Error checking group attributes: ${error.message}`);
        }

        // Check user authentication
        console.log('\n📋 apptest User Authentication:');
        try {
            const userAuth = await radiusDb.query(`
                SELECT attribute, op, value
                FROM radcheck
                WHERE username = 'apptest'
            `);

            if (userAuth.length > 0) {
                userAuth.forEach(auth => {
                    console.log(`   ✅ ${auth.attribute} ${auth.op} ${auth.value}`);
                });
            } else {
                console.log('   ❌ No authentication found for apptest');
            }
        } catch (error) {
            console.log(`   ❌ Error checking user authentication: ${error.message}`);
        }

        console.log('\n🎉 RADIUS group setup completed!');
        console.log('🔄 You may need to restart the RADIUS server for changes to take effect');

    } catch (error) {
        console.error('❌ Error setting up RADIUS groups:', error.message);
    } finally {
        await radiusDb.closeDatabase();
        process.exit(0);
    }
}

setupRadiusGroups();