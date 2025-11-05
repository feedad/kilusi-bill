const { Pool } = require('pg');

// Database configuration from settings.json
const config = {
    host: '172.22.10.28',
    port: 5432,
    database: 'kilusi_bill',
    user: 'kilusi_user',
    password: 'kilusi1234',
};

const pool = new Pool(config);

async function showRadiusData() {
    const client = await pool.connect();

    try {
        console.log('=== NAS SERVERS DATA ===\n');
        const nasResult = await client.query(`
            SELECT id, nas_name, short_name, ip_address, type, is_active, created_at
            FROM nas_servers
            ORDER BY id
        `);

        if (nasResult.rows.length === 0) {
            console.log('❌ No NAS servers found in database');
        } else {
            console.log('📋 NAS Servers:');
            nasResult.rows.forEach((row, index) => {
                console.log(`${index + 1}. ID: ${row.id}`);
                console.log(`   NAS Name: ${row.nas_name}`);
                console.log(`   Short Name: ${row.short_name}`);
                console.log(`   IP Address: ${row.ip_address}`);
                console.log(`   Type: ${row.type}`);
                console.log(`   Active: ${row.is_active ? 'Yes' : 'No'}`);
                console.log(`   Created: ${row.created_at}`);
                console.log('');
            });
        }

        console.log('\n=== RADIUS USERS DATA ===\n');

        // Check if RADIUS tables exist
        const radiusTablesCheck = await client.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('radcheck', 'radreply', 'radusergroup', 'radgroup')
        `);

        if (radiusTablesCheck.rows.length === 0) {
            console.log('❌ RADIUS tables not found. Initializing RADIUS tables...');

            // Initialize RADIUS tables
            await client.query(`
                CREATE TABLE IF NOT EXISTS radgroup (
                    id SERIAL PRIMARY KEY,
                    groupname VARCHAR(64) UNIQUE NOT NULL,
                    description TEXT,
                    priority INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS radcheck (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(64) NOT NULL,
                    attribute VARCHAR(64) NOT NULL,
                    op VARCHAR(2) NOT NULL DEFAULT ':=',
                    value VARCHAR(253) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(username, attribute, op, value)
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS radreply (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(64) NOT NULL,
                    attribute VARCHAR(64) NOT NULL,
                    op VARCHAR(2) NOT NULL DEFAULT ':=',
                    value VARCHAR(253) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS radusergroup (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(64) NOT NULL,
                    groupname VARCHAR(64) NOT NULL,
                    priority INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('✅ RADIUS tables initialized');
        }

        // Get RADIUS users from radcheck table
        const usersResult = await client.query(`
            SELECT DISTINCT username,
                   COUNT(*) as attribute_count,
                   MIN(created_at) as created_at
            FROM radcheck
            GROUP BY username
            ORDER BY username
        `);

        if (usersResult.rows.length === 0) {
            console.log('❌ No RADIUS users found in radcheck table');
        } else {
            console.log(`👥 Found ${usersResult.rows.length} RADIUS users:`);
            usersResult.rows.forEach((row, index) => {
                console.log(`${index + 1}. Username: ${row.username}`);
                console.log(`   Attributes: ${row.attribute_count}`);
                console.log(`   Created: ${row.created_at}`);

                // Get user attributes
                try {
                    const attrsResult = await client.query(`
                        SELECT attribute, op, value FROM radcheck
                        WHERE username = $1
                    `, [row.username]);

                    attrsResult.rows.forEach(attr => {
                        console.log(`   ${attr.attribute} ${attr.op} ${attr.value}`);
                    });
                } catch (attrErr) {
                    console.log(`   Error getting attributes: ${attrErr.message}`);
                }

                // Get user groups
                try {
                    const groupsResult = await client.query(`
                        SELECT groupname FROM radusergroup
                        WHERE username = $1
                    `, [row.username]);

                if (groupsResult.rows.length > 0) {
                    console.log(`   Groups: ${groupsResult.rows.map(g => g.groupname).join(', ')}`);
                }

                console.log('');
            });
        }

        // Get active sessions from radacct if exists
        try {
            const acctResult = await client.query(`
                SELECT COUNT(*) as active_count
                FROM radacct
                WHERE acctstoptime IS NULL
            `);

            const activeCount = parseInt(acctResult.rows[0].active_count);
            console.log(`\n🔗 Active Sessions: ${activeCount}`);

            if (activeCount > 0) {
                const sessionsResult = await client.query(`
                    SELECT username, nasipaddress, acctstarttime, acctsessiontime, framedipaddress
                    FROM radacct
                    WHERE acctstoptime IS NULL
                    ORDER BY acctstarttime DESC
                    LIMIT 10
                `);

                console.log('Recent active sessions:');
                sessionsResult.rows.forEach((session, index) => {
                    console.log(`${index + 1}. ${session.username} @ ${session.nasipaddress} (${session.framedipaddress})`);
                    console.log(`   Started: ${session.acctstarttime}, Duration: ${session.acctsessiontime}s`);
                });
            }
        } catch (err) {
            console.log('\n📊 Accounting table (radacct) not found or no active sessions');
        }

        // Get RADIUS groups
        try {
            const groupsResult = await client.query(`
                SELECT groupname, description, priority
                FROM radgroup
                ORDER BY priority, groupname
            `);

            if (groupsResult.rows.length > 0) {
                console.log('\n📁 RADIUS Groups:');
                groupsResult.rows.forEach((group, index) => {
                    console.log(`${index + 1}. ${group.groupname} (Priority: ${group.priority})`);
                    if (group.description) {
                        console.log(`   Description: ${group.description}`);
                    }
                });
            }
        } catch (err) {
            console.log('\n📁 No RADIUS groups found');
        }

    } catch (error) {
        console.error('❌ Error querying database:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the query
showRadiusData();