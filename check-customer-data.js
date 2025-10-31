const { query, getAll } = require('./config/database');

async function checkCustomerData() {
    try {
        console.log('🔍 Checking customer data...');

        // Get specific customer data
        const customers = await getAll(`
            SELECT id, username, name, pppoe_username, pppoe_password, password, status
            FROM customers
            WHERE name = 'Feedad' OR username = 'Feedad'
        `);

        console.log('\n📊 Customer Data:');
        console.log('================');

        if (customers.length === 0) {
            console.log('❌ No customer found with name/username "Feedad"');
        } else {
            customers.forEach(customer => {
                console.log(`ID: ${customer.id}`);
                console.log(`Username: ${customer.username}`);
                console.log(`Name: ${customer.name}`);
                console.log(`PPPoE Username: ${customer.pppoe_username || 'NULL'}`);
                console.log(`PPPoE Password: ${customer.pppoe_password ? '***' : 'NULL'}`);
                console.log(`Password: ${customer.password ? '***' : 'NULL'}`);
                console.log(`Status: ${customer.status}`);
                console.log('----------------');
            });
        }

        // Get all customers with PPPoE data
        console.log('\n📊 All Customers with PPPoE Data:');
        console.log('=====================================');

        const allCustomers = await getAll(`
            SELECT id, username, name, pppoe_username, pppoe_password, password, status
            FROM customers
            ORDER BY id
        `);

        let withPPPoE = 0;
        let withoutPPPoE = 0;

        allCustomers.forEach(customer => {
            const hasPPPoE = customer.pppoe_username && customer.pppoe_password;
            const hasLogin = customer.username && customer.password;

            if (hasPPPoE || hasLogin) {
                withPPPoE++;
                console.log(`✅ ${customer.name} (${customer.id}) - ${customer.pppoe_username || customer.username}`);
            } else {
                withoutPPPoE++;
                console.log(`❌ ${customer.name} (${customer.id}) - NO PPPoE/Portal data`);
            }
        });

        console.log(`\n📈 Summary:`);
        console.log(`Total Customers: ${allCustomers.length}`);
        console.log(`With PPPoE/Portal data: ${withPPPoE}`);
        console.log(`Without PPPoE/Portal data: ${withoutPPPoE}`);

    } catch (error) {
        console.error('❌ Error checking customer data:', error.message);
    } finally {
        process.exit(0);
    }
}

checkCustomerData();