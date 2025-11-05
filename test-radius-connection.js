const radiusPostgres = require('./config/radius-postgres');

async function testRadiusConnection() {
    console.log('=== TESTING RADIUS CONNECTION ===');

    try {
        // 1. Initialize RADIUS tables
        console.log('1. Initializing RADIUS tables...');
        const initialized = await radiusPostgres.initializeRadiusTables();
        console.log('Tables initialized:', initialized);

        // 2. Check existing RADIUS users
        console.log('\n2. Checking existing RADIUS users...');
        const users = await radiusPostgres.getAllRadiusUsers();
        console.log('Found RADIUS users:', users);

        // 3. Test getting specific user 'apptest'
        console.log('\n3. Testing get user "apptest"...');
        const user = await radiusPostgres.getRadiusUser('apptest');
        console.log('User "apptest":', user);

        // 4. Test creating/updating user 'apptest'
        console.log('\n4. Testing create/update user "apptest"...');
        if (user) {
            console.log('User already exists, updating...');
            await radiusPostgres.createOrUpdateRadiusUser('apptest', 'test123', 'default');
        } else {
            console.log('Creating new user...');
            await radiusPostgres.createOrUpdateRadiusUser('apptest', 'test123', 'default');
        }
        console.log('User created/updated successfully');

        // 5. Verify user after creation/update
        console.log('\n5. Verifying user after creation/update...');
        const updatedUser = await radiusPostgres.getRadiusUser('apptest');
        console.log('Updated user:', updatedUser);

        // 6. Test authentication
        console.log('\n6. Testing authentication...');
        const authResult = await radiusPostgres.authenticateRadiusUser('apptest', 'test123');
        console.log('Authentication result:', authResult);

    } catch (error) {
        console.error('Error testing RADIUS connection:', error);
    }
}

testRadiusConnection();