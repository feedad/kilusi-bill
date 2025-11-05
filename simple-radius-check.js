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

async function checkRadiusData() {
    const client = await pool.connect();

    try {
        console.log('=== NAS SERVERS ===\n');

        const nasResult = await client.query(`
            SELECT id, nas_name, short_name, ip_address, type, is_active, created_at
            FROM nas_servers
            ORDER BY id
        `);

        if (nasResult.rows.length === 0) {
            console.log('❌ No NAS servers found\n');
        } else {
            nasResult.rows.forEach((row, index) => {
                console.log(`${index + 1}. ID: ${row.id}`);
                console.log(`   Name: ${row.nas_name} (${row.short_name})`);
                console.log(`   IP: ${row.ip_address}`);
                console.log(`   Type: ${row.type}, Active: ${row.is_active}`);
                console.log('');
            });
        }

        console.log('=== RADIUS TABLES ===\n');

        // Check what RADIUS tables exist
        const tablesCheck = await client.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name LIKE 'rad%'
            ORDER BY table_name
        `);

        if (tablesCheck.rows.length === 0) {
            console.log('❌ No RADIUS tables found\n');
        } else {
            console.log('Found RADIUS tables:');
            tablesCheck.rows.forEach(row => {
                console.log(`- ${row.table_name}`);
            });
            console.log('');
        }

        // Check radcheck for users
        try {
            const radcheckResult = await client.query(`
                SELECT COUNT(*) as total_users FROM radcheck
                WHERE attribute = 'Cleartext-Password'
            `);

            const userCount = parseInt(radcheckResult.rows[0].total_users);
            console.log(`👥 RADIUS Users: ${userCount}`);

            if (userCount > 0) {
                const usersResult = await client.query(`
                    SELECT username, value as password, created_at
                    FROM radcheck
                    WHERE attribute = 'Cleartext-Password'
                    ORDER BY username
                    LIMIT 10
                `);

                console.log('First 10 users:');
                usersResult.rows.forEach((row, index) => {
                    console.log(`${index + 1}. ${row.username} (pass: ${row.password})`);
                });
            }
            console.log('');
        } catch (err) {
            console.log('❌ radcheck table not found or error querying users\n');
        }

        // Check for active sessions
        try {
            const activeResult = await client.query(`
                SELECT COUNT(*) as active_sessions
                FROM radacct
                WHERE acctstoptime IS NULL
            `);

            const activeCount = parseInt(activeResult.rows[0].active_sessions);
            console.log(`🔗 Active Sessions: ${activeCount}\n`);
        } catch (err) {
            console.log('ℹ️  No active session data available\n');
        }

    } catch (error) {
        console.error('❌ Database error:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

checkRadiusData();