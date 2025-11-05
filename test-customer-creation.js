/**
 * Test customer creation to debug issues
 */

const { initializePool } = require('./config/database');
const billing = require('./config/billing');

async function testCustomerCreation() {
    try {
        console.log('🔧 Initializing database...');
        initializePool();

        // Test data
        const testCustomer = {
            name: 'Test Customer Fixed',
            phone: '6285554443332',
            address: 'Test Address Final 123',
            package_id: 1,
            install_date: new Date().toISOString(),
            connection_type: 'pppoe'
        };

        console.log('📝 Creating test customer:', testCustomer);

        const result = await billing.createCustomer(testCustomer);

        console.log('✅ Customer created successfully:', result);
        console.log('📊 Customer Created:');
        console.log('ID Pelanggan:', result.id.padStart(5, '0')); // 5-digit format
        console.log('Username (Login Portal):', result.phone); // Phone number
        console.log('Username (Internal):', result.username); // Hidden internal
        console.log('PPPoE Username:', result.pppoe_username); // Internet access
        console.log('Customer Name:', result.name);
        console.log('Customer Phone:', result.phone);

        // Test fetching customers
        console.log('\n📋 Fetching all customers...');
        const customers = await billing.getAllCustomers();
        console.log(`Found ${customers.length} customers`);

        customers.slice(0, 3).forEach(c => {
            console.log(`- ID: ${c.id}, Name: ${c.name}, Phone: ${c.phone}`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        process.exit(0);
    }
}

testCustomerCreation();