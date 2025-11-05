const { query } = require('./config/database');

async function createTestRadiusUser() {
    try {
        console.log('Creating test RADIUS user...');

        // Insert test customer with PPPoE credentials
        const customerResult = await query(`
            INSERT INTO customers (
                name, phone, address, pppoe_username, pppoe_password,
                status, package_id
            ) VALUES (
                'Test RADIUS User', '6281234567890', 'Test Address',
                'testuser', 'testpass123',
                'active', 1
            ) ON CONFLICT (phone) DO UPDATE SET
                pppoe_username = EXCLUDED.pppoe_username,
                pppoe_password = EXCLUDED.pppoe_password,
                status = EXCLUDED.status,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, name, pppoe_username, pppoe_password
        `);

        const customer = customerResult.rows[0];
        console.log('✅ Customer created/updated:', customer);

        // Insert into RADIUS radcheck table (delete existing first)
        await query('DELETE FROM radcheck WHERE username = $1', [customer.pppoe_username]);
        await query(`
            INSERT INTO radcheck (username, attribute, op, value)
            VALUES ($1, 'Cleartext-Password', ':=', $2)
        `, [customer.pppoe_username, customer.pppoe_password]);

        console.log('✅ RADIUS user created in radcheck table');

        // Insert into RADIUS radreply table for basic attributes
        await query('DELETE FROM radreply WHERE username = $1', [customer.pppoe_username]);
        await query(`
            INSERT INTO radreply (username, attribute, op, value)
            VALUES ($1, 'Session-Timeout', ':=', '3600')
        `, [customer.pppoe_username]);

        console.log('✅ RADIUS reply attributes added');

        // Add to default group
        await query(`
            INSERT INTO radgroup (groupname, description, priority)
            VALUES ('default', 'Default user group', 1)
            ON CONFLICT (groupname) DO NOTHING
        `);

        await query('DELETE FROM radusergroup WHERE username = $1', [customer.pppoe_username]);
        await query(`
            INSERT INTO radusergroup (username, groupname, priority)
            VALUES ($1, 'default', 1)
        `, [customer.pppoe_username]);

        console.log('✅ User added to default group');

        console.log('\n🎉 Test RADIUS user created successfully!');
        console.log('Username:', customer.pppoe_username);
        console.log('Password:', customer.pppoe_password);
        console.log('\nYou can now test RADIUS authentication with these credentials.');

        process.exit(0);

    } catch (error) {
        console.error('❌ Error creating test RADIUS user:', error);
        process.exit(1);
    }
}

createTestRadiusUser();