const { query, getAll } = require('./config/database');

async function fixCustomerData() {
    try {
        console.log('🔧 Fixing customer data...');

        // 1. Add password to customer Feedad
        console.log('\n📝 Adding PPPoE password to Feedad...');
        await query(`
            UPDATE customers
            SET pppoe_password = '1234567', updated_at = CURRENT_TIMESTAMP
            WHERE id = 2 AND name = 'Feedad'
        `);
        console.log('✅ PPPoE password added to Feedad');

        // 2. Update customer ID format to 5 digits (00001-99999)
        console.log('\n📝 Updating customer ID format to 5 digits...');

        const customers = await getAll('SELECT id FROM customers ORDER BY id');
        let updatedCount = 0;

        for (const customer of customers) {
            const newId = String(customer.id).padStart(5, '0');
            await query(`
                UPDATE customers
                SET id = $1::text::integer, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [newId, customer.id]);

            console.log(`✅ ID ${customer.id} -> ${newId}`);
            updatedCount++;
        }

        console.log(`\n📊 Summary:`);
        console.log(`✅ Updated ${updatedCount} customer IDs to 5-digit format`);
        console.log(`✅ Added PPPoE password to Feedad`);

        // 3. Verify the changes
        console.log('\n🔍 Verifying changes...');
        const updatedCustomers = await getAll(`
            SELECT id, username, name, pppoe_username, pppoe_password, status
            FROM customers
            ORDER BY id
        `);

        console.log('\n📊 Updated Customer Data:');
        console.log('============================');

        updatedCustomers.forEach(customer => {
            const hasPPPoE = customer.pppoe_username && customer.pppoe_password;
            const status = hasPPPoE ? '✅' : '❌';
            console.log(`${status} ${customer.name} (ID: ${customer.id})`);
            console.log(`   PPPoE: ${customer.pppoe_username}`);
            console.log(`   Password: ${customer.pppoe_password ? '***' : 'NULL'}`);
            console.log('---');
        });

    } catch (error) {
        console.error('❌ Error fixing customer data:', error.message);
    } finally {
        process.exit(0);
    }
}

fixCustomerData();