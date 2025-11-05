const billing = require('./config/billing');

async function testPackageAPI() {
    console.log('🔧 TESTING PACKAGE API');
    console.log('=====================');

    try {
        // Test 1: Create new package with PPPoE profile
        console.log('\n📋 Test 1: Creating package with PPPoE profile...');
        const newPackage = await billing.createPackage({
            name: 'Test-10M-API',
            speed: '10Mbps',
            price: 150000,
            description: 'Test package via API',
            pppoe_profile: 'Test-10M',
            group: 'Test-10M',
            rate_limit: '10M/10M'
        });

        if (newPackage) {
            console.log('   ✅ Package created successfully:');
            console.log(`      ID: ${newPackage.id}`);
            console.log(`      Name: ${newPackage.name}`);
            console.log(`      PPPoE Profile: ${newPackage.pppoe_profile}`);
            console.log(`      Speed: ${newPackage.speed}`);
            console.log(`      Price: ${newPackage.price}`);

            // Test 2: Update package PPPoE profile
            console.log('\n📋 Test 2: Updating package PPPoE profile...');
            const updatedPackage = await billing.updatePackage(newPackage.id, {
                name: newPackage.name,
                speed: newPackage.speed,
                price: newPackage.price,
                description: newPackage.description,
                pppoe_profile: 'Updated-Test-10M',
                group: 'Updated-Test-10M',
                rate_limit: '10M/10M'
            });

            if (updatedPackage) {
                console.log('   ✅ Package updated successfully:');
                console.log(`      PPPoE Profile: ${updatedPackage.pppoe_profile}`);
                console.log(`      Group: ${updatedPackage.group}`);

                // Test 3: Verify package exists in database
                console.log('\n📋 Test 3: Verifying package in database...');
                const verifyPackage = await billing.getPackageById(newPackage.id);

                if (verifyPackage) {
                    console.log('   ✅ Package verified in database:');
                    console.log(`      PPPoE Profile: ${verifyPackage.pppoe_profile}`);
                    console.log(`      Group: ${verifyPackage.group}`);
                    console.log(`      Rate Limit: ${verifyPackage.rate_limit}`);

                    if (verifyPackage.pppoe_profile === 'Updated-Test-10M') {
                        console.log('\n🎉 SUCCESS: PPPoE profile saving is working correctly!');
                    } else {
                        console.log('\n❌ ISSUE: PPPoE profile not updated correctly');
                    }
                } else {
                    console.log('   ❌ Package not found in database');
                }

                // Test 4: Clean up - delete test package
                console.log('\n📋 Test 4: Cleaning up test package...');
                const deleted = await billing.deletePackage(newPackage.id);
                if (deleted) {
                    console.log('   ✅ Test package deleted successfully');
                } else {
                    console.log('   ❌ Failed to delete test package');
                }
            } else {
                console.log('   ❌ Failed to update package');
            }
        } else {
            console.log('   ❌ Failed to create package');
        }

    } catch (error) {
        console.error('❌ Error testing package API:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        process.exit(0);
    }
}

testPackageAPI();