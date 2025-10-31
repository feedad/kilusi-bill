const { query } = require('./config/database');

async function checkRadiusConstraints() {
    try {
        console.log('🔍 Checking RADIUS table constraints...');

        // Check radcheck constraints
        const radcheckConstraints = await query(`
            SELECT
                tc.constraint_name,
                tc.constraint_type,
                kcu.column_name,
                tc.table_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            WHERE tc.table_name = 'radcheck'
                AND tc.constraint_type = 'UNIQUE'
            ORDER BY tc.constraint_name
        `);

        console.log('\n📊 radcheck Unique Constraints:');
        console.log('=============================');

        if (radcheckConstraints.rows.length === 0) {
            console.log('❌ No unique constraints found in radcheck table');
        } else {
            radcheckConstraints.rows.forEach(constraint => {
                console.log(`✅ ${constraint.constraint_name}`);
                console.log(`   Type: ${constraint.constraint_type}`);
                console.log(`   Column: ${constraint.column_name}`);
                console.log('---');
            });
        }

        // Check radusergroup constraints
        const radusergroupConstraints = await query(`
            SELECT
                tc.constraint_name,
                tc.constraint_type,
                kcu.column_name,
                tc.table_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            WHERE tc.table_name = 'radusergroup'
                AND tc.constraint_type = 'UNIQUE'
            ORDER BY tc.constraint_name
        `);

        console.log('\n📊 radusergroup Unique Constraints:');
        console.log('=================================');

        if (radusergroupConstraints.rows.length === 0) {
            console.log('❌ No unique constraints found in radusergroup table');
        } else {
            radusergroupConstraints.rows.forEach(constraint => {
                console.log(`✅ ${constraint.constraint_name}`);
                console.log(`   Type: ${constraint.constraint_type}`);
                console.log(`   Column: ${constraint.column_name}`);
                console.log('---');
            });
        }

        // Add missing constraints if needed
        if (radcheckConstraints.rows.length === 0) {
            console.log('\n🔧 Adding missing constraints...');
            await query(`
                ALTER TABLE radcheck
                ADD CONSTRAINT radcheck_username_attribute_op_value_unique
                UNIQUE (username, attribute, op, value)
            `);
            console.log('✅ Added unique constraint to radcheck');
        }

        if (radusergroupConstraints.rows.length === 0) {
            console.log('🔧 Adding missing constraints...');
            await query(`
                ALTER TABLE radusergroup
                ADD CONSTRAINT radusergroup_username_groupname_unique
                UNIQUE (username, groupname)
            `);
            console.log('✅ Added unique constraint to radusergroup');
        }

    } catch (error) {
        console.error('❌ Error checking RADIUS constraints:', error.message);
    } finally {
        process.exit(0);
    }
}

checkRadiusConstraints();