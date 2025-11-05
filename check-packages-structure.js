const { Pool } = require('pg');

async function checkPackagesStructure() {
    console.log('🔍 CHECKING PACKAGES TABLE STRUCTURE');
    console.log('=====================================');

    const pool = new Pool({
        host: '172.22.10.28',
        port: 5432,
        database: 'kilusi_bill',
        user: 'kilusi_user',
        password: 'kilusi1234'
    });

    try {
        // Check packages table structure
        console.log('\n📋 Packages Table Structure:');
        const packageStructure = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'packages'
            ORDER BY ordinal_position
        `);

        if (packageStructure.rows.length > 0) {
            packageStructure.rows.forEach(col => {
                console.log(`   - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}${col.column_default ? ` DEFAULT ${col.column_default}` : ''}`);
            });
        } else {
            console.log('   ❌ Packages table not found');
        }

        // Check existing packages
        console.log('\n📋 Existing Packages:');
        const packages = await pool.query(`
            SELECT id, name, price, pppoe_profile, speed, rate_limit, "group"
            FROM packages
            ORDER BY id
        `);

        if (packages.rows.length > 0) {
            packages.rows.forEach(pkg => {
                console.log(`   ${pkg.id}. ${pkg.name}`);
                console.log(`      Price: ${pkg.price}`);
                console.log(`      PPPoE Profile: ${pkg.pppoe_profile || 'NULL'}`);
                console.log(`      Speed: ${pkg.speed || 'NULL'}`);
                console.log(`      Rate Limit: ${pkg.rate_limit || 'NULL'}`);
                console.log(`      Group: ${pkg.group || 'NULL'}`);
                console.log('');
            });
        } else {
            console.log('   ❌ No packages found');
        }

        // Check if UpTo-10M profile exists
        console.log('\n📋 Searching for UpTo-10M profile in packages:');
        const upto10mPackages = await pool.query(`
            SELECT * FROM packages
            WHERE pppoe_profile ILIKE '%upto%' OR pppoe_profile ILIKE '%10m%' OR name ILIKE '%upto%' OR name ILIKE '%10m%'
        `);

        if (upto10mPackages.rows.length > 0) {
            upto10mPackages.rows.forEach(pkg => {
                console.log(`   ✅ Found: ${pkg.name} -> Profile: ${pkg.pppoe_profile}`);
            });
        } else {
            console.log('   ❌ No UpTo-10M related packages found');
        }

        // Check customer-package relationship
        console.log('\n📋 Customer Package Assignment:');
        const customerPackages = await pool.query(`
            SELECT c.id, c.name, c.pppoe_username, c.package_id, p.name as package_name, p.pppoe_profile
            FROM customers c
            LEFT JOIN packages p ON c.package_id = p.id
            WHERE c.pppoe_username = 'apptest'
        `);

        if (customerPackages.rows.length > 0) {
            customerPackages.rows.forEach(cp => {
                console.log(`   Customer: ${cp.name} (${cp.pppoe_username})`);
                console.log(`   Package ID: ${cp.package_id}`);
                console.log(`   Package Name: ${cp.package_name || 'NULL'}`);
                console.log(`   PPPoE Profile: ${cp.pppoe_profile || 'NULL'}`);
            });
        } else {
            console.log('   ❌ Customer apptest not found');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

checkPackagesStructure();