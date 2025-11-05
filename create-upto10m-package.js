const { Pool } = require('pg');

async function createUpTo10MPackage() {
    console.log('🔧 CREATING UpTo-10M PACKAGE');
    console.log('============================');

    const pool = new Pool({
        host: '172.22.10.28',
        port: 5432,
        database: 'kilusi_bill',
        user: 'kilusi_user',
        password: 'kilusi1234'
    });

    try {
        // Create UpTo-10M package
        console.log('\n📋 Creating UpTo-10M package...');
        const insertPackage = await pool.query(`
            INSERT INTO packages (name, speed, price, pppoe_profile, "group", rate_limit, description, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, name, pppoe_profile, speed, price
        `, [
            'UpTo-10M',           // name
            '10Mbps',            // speed
            150000,              // price (sama dengan BRONZE)
            'UpTo-10M',          // pppoe_profile -> sesuai dengan RADIUS group
            'UpTo-10M',          // group
            '10M/10M',           // rate_limit
            'Paket UpTo-10M dengan limit 10Mbps', // description
            true                 // is_active
        ]);

        if (insertPackage.rows.length > 0) {
            const newPackage = insertPackage.rows[0];
            console.log('   ✅ Package created successfully:');
            console.log(`      ID: ${newPackage.id}`);
            console.log(`      Name: ${newPackage.name}`);
            console.log(`      Profile: ${newPackage.pppoe_profile}`);
            console.log(`      Speed: ${newPackage.speed}`);
            console.log(`      Price: ${newPackage.price}`);
        } else {
            console.log('   ❌ Failed to create package');
            return;
        }

        // Update customer Ferry Adhitya to use new package
        console.log('\n📋 Updating Ferry Adhitya customer to use UpTo-10M package...');
        const updateCustomer = await pool.query(`
            UPDATE customers
            SET package_id = $1,
                pppoe_profile = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE pppoe_username = $3
            RETURNING id, name, pppoe_username, package_id, pppoe_profile
        `, [
            insertPackage.rows[0].id,  // new package ID
            'UpTo-10M',                // pppoe_profile
            'apptest'                  // username
        ]);

        if (updateCustomer.rows.length > 0) {
            const customer = updateCustomer.rows[0];
            console.log('   ✅ Customer updated successfully:');
            console.log(`      Customer: ${customer.name} (${customer.pppoe_username})`);
            console.log(`      New Package ID: ${customer.package_id}`);
            console.log(`      PPPoE Profile: ${customer.pppoe_profile}`);
        } else {
            console.log('   ❌ Failed to update customer');
        }

        // Verify the changes
        console.log('\n📋 Verification:');
        const verifyData = await pool.query(`
            SELECT c.id, c.name, c.pppoe_username, c.package_id, c.pppoe_profile,
                   p.name as package_name, p.pppoe_profile as package_profile, p.speed, p.price
            FROM customers c
            LEFT JOIN packages p ON c.package_id = p.id
            WHERE c.pppoe_username = $1
        `, ['apptest']);

        if (verifyData.rows.length > 0) {
            const data = verifyData.rows[0];
            console.log('   ✅ Current customer data:');
            console.log(`      Name: ${data.name}`);
            console.log(`      Username: ${data.pppoe_username}`);
            console.log(`      Package: ${data.package_name} (ID: ${data.package_id})`);
            console.log(`      Package Profile: ${data.package_profile}`);
            console.log(`      Customer Profile: ${data.pppoe_profile}`);
            console.log(`      Speed: ${data.speed}`);
            console.log(`      Price: ${data.price}`);

            if (data.package_profile === 'UpTo-10M') {
                console.log('\n🎉 SUCCESS: UpTo-10M package created and assigned to Ferry Adhitya!');
                console.log('🚀 Customer should now get correct 10M bandwidth from RADIUS');
            } else {
                console.log('\n❌ ISSUE: Package profile not matching');
            }
        }

        // List all packages
        console.log('\n📋 All available packages:');
        const allPackages = await pool.query(`
            SELECT id, name, pppoe_profile, speed, price, is_active
            FROM packages
            ORDER BY id
        `);

        allPackages.rows.forEach(pkg => {
            console.log(`   ${pkg.id}. ${pkg.name} - ${pkg.speed} - Profile: ${pkg.pppoe_profile || 'NULL'} ${pkg.is_active ? '(Active)' : '(Inactive)'}`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

createUpTo10MPackage();