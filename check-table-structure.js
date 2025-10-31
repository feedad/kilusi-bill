const { query } = require('./config/database');

async function checkTableStructure() {
    try {
        console.log('🔍 Checking customers table structure...');

        // Get table columns
        const result = await query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'customers'
            ORDER BY ordinal_position
        `);

        console.log('\n📊 Customers Table Structure:');
        console.log('==============================');

        if (result.rows.length === 0) {
            console.log('❌ No columns found in customers table');
        } else {
            result.rows.forEach(column => {
                console.log(`📝 ${column.column_name}`);
                console.log(`   Type: ${column.data_type}`);
                console.log(`   Nullable: ${column.is_nullable}`);
                console.log(`   Default: ${column.column_default || 'NULL'}`);
                console.log('---');
            });
        }

        // Get sample data
        console.log('\n📊 Sample Customer Data:');
        console.log('==========================');

        const sampleData = await query(`
            SELECT *
            FROM customers
            LIMIT 3
        `);

        if (sampleData.rows.length === 0) {
            console.log('❌ No data found in customers table');
        } else {
            sampleData.rows.forEach((customer, index) => {
                console.log(`👤 Customer ${index + 1}:`);
                Object.keys(customer).forEach(key => {
                    console.log(`   ${key}: ${customer[key]}`);
                });
                console.log('---');
            });
        }

    } catch (error) {
        console.error('❌ Error checking table structure:', error.message);
    } finally {
        process.exit(0);
    }
}

checkTableStructure();