const { query } = require('./config/database');

async function checkRadcheckConstraint() {
    try {
        console.log('🔍 Checking radcheck constraint structure in detail...');

        // Get detailed constraint information
        const constraints = await query(`
            SELECT
                tc.constraint_name,
                tc.constraint_type,
                tc.table_name,
                kcu.column_name,
                kcu.ordinal_position
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            WHERE tc.table_name = 'radcheck'
                AND tc.constraint_type = 'UNIQUE'
            ORDER BY tc.constraint_name, kcu.ordinal_position
        `);

        console.log('\n📊 radcheck Constraints Detail:');
        console.log('=================================');

        if (constraints.rows.length === 0) {
            console.log('❌ No unique constraints found in radcheck table');
        } else {
            const constraintGroups = {};
            constraints.rows.forEach(row => {
                if (!constraintGroups[row.constraint_name]) {
                    constraintGroups[row.constraint_name] = [];
                }
                constraintGroups[row.constraint_name].push(row.column_name);
            });

            Object.keys(constraintGroups).forEach(constraintName => {
                console.log(`✅ ${constraintName}`);
                console.log(`   Columns: [${constraintGroups[constraintName].join(', ')}]`);
                console.log('---');
            });
        }

        // Test the actual constraint by trying to insert a duplicate
        console.log('\n🧪 Testing constraint behavior...');

        // First, check if test user exists
        const testUser = await query(`
            SELECT * FROM radcheck WHERE username = 'test_user_check'
        `);

        if (testUser.rows.length > 0) {
            // Clean up test user
            await query('DELETE FROM radcheck WHERE username = \'test_user_check\'');
            console.log('🧹 Cleaned up existing test user');
        }

        // Try to insert a test record
        try {
            await query(`
                INSERT INTO radcheck (username, attribute, op, value)
                VALUES ('test_user_check', 'Cleartext-Password', ':=', 'test123')
                ON CONFLICT (username, attribute, op, value)
                DO UPDATE SET value = EXCLUDED.value
            `);
            console.log('✅ ON CONFLICT (username, attribute, op, value) works');

            // Try the same again to test the conflict
            await query(`
                INSERT INTO radcheck (username, attribute, op, value)
                VALUES ('test_user_check', 'Cleartext-Password', ':=', 'test123')
                ON CONFLICT (username, attribute, op, value)
                DO UPDATE SET value = EXCLUDED.value
            `);
            console.log('✅ ON CONFLICT (username, attribute, op, value) handles duplicates correctly');

            // Clean up
            await query('DELETE FROM radcheck WHERE username = \'test_user_check\'');

        } catch (error) {
            console.error('❌ ON CONFLICT (username, attribute, op, value) failed:', error.message);

            // Try with just the constraint name
            console.log('\n🔄 Trying to identify the correct constraint columns...');
            const constraintName = constraints.rows[0]?.constraint_name;
            if (constraintName) {
                console.log(`Found constraint: ${constraintName}`);
                console.log(`This might need to be referenced differently in the ON CONFLICT clause`);
            }
        }

    } catch (error) {
        console.error('❌ Error checking radcheck constraint:', error.message);
    } finally {
        process.exit(0);
    }
}

checkRadcheckConstraint();