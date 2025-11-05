/**
 * Reset customer sequence to start from 1
 * This will create new customers starting from ID 1 (displayed as 00001)
 */

const { initializePool } = require('./config/database');

async function resetCustomerSequence() {
    try {
        console.log('🔧 Initializing database...');
        initializePool();

        const { query } = require('./config/database');

        console.log('🗑️ Cleaning up test customers...');

        // Delete test customers (those with phone numbers starting with 628)
        const deleteResult = await query(`
            DELETE FROM customers
            WHERE phone LIKE '628%'
            RETURNING id, phone, name
        `);

        console.log(`✅ Deleted ${deleteResult.rows.length} test customers:`);
        deleteResult.rows.forEach(row => {
            console.log(`   - ID: ${row.id}, Phone: ${row.phone}, Name: ${row.name}`);
        });

        console.log('\n🔄 Resetting customer sequence...');

        // Get the sequence name for customers table
        const sequenceResult = await query(`
            SELECT pg_get_serial_sequence('customers', 'id') as sequence_name
        `);

        if (sequenceResult.rows.length > 0 && sequenceResult.rows[0].sequence_name) {
            const sequenceName = sequenceResult.rows[0].sequence_name;
            console.log(`📋 Found sequence: ${sequenceName}`);

            // Reset sequence to 1
            await query(`ALTER SEQUENCE ${sequenceName} RESTART WITH 1`);
            console.log('✅ Sequence reset to start from 1');
        } else {
            console.log('⚠️ No sequence found for customers.id');
        }

        console.log('\n🧪 Testing new customer creation...');

        // Test creating a new customer
        const billing = require('./config/billing');
        const testCustomer = {
            name: 'Test Customer New',
            phone: '6281112223334',
            address: 'Test Address New 123',
            package_id: 1,
            install_date: new Date().toISOString(),
            connection_type: 'pppoe'
        };

        const result = await billing.createCustomer(testCustomer);

        console.log('🎉 New customer created:');
        console.log(`📊 ID Pelanggan: ${result.id.padStart(5, '0')}`);
        console.log(`📱 Username (Portal): ${result.phone}`);
        console.log(`🔐 PPPoE Username: ${result.pppoe_username}`);
        console.log(`👤 Name: ${result.name}`);

        // Check all customers after reset
        console.log('\n📋 All customers in database:');
        const allCustomers = await billing.getAllCustomers();
        allCustomers.forEach(c => {
            console.log(`   - ID: ${c.id.padStart(5, '0')}, Name: ${c.name}, Phone: ${c.phone}`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        process.exit(0);
    }
}

resetCustomerSequence();