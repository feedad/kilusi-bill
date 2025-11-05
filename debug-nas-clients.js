const radiusDb = require('./config/radius-postgres');

async function debugNasClients() {
    console.log('=== DEBUG NAS CLIENTS ===');

    try {
        // Initialize RADIUS tables first
        await radiusDb.initializeRadiusTables();

        // Check existing NAS clients
        console.log('\n1. Checking existing NAS clients...');
        const nasClients = await radiusDb.getAllNasClients();
        console.log('Existing NAS clients:', nasClients);

        if (nasClients.length === 0) {
            console.log('\n2. No NAS clients found. Adding default NAS client...');

            // Add default NAS client for localhost/172.22.10.28
            const newNas = await radiusDb.addNasClient({
                nasname: '172.22.10.28',
                shortname: 'local-nas',
                secret: 'kilusi-secret',
                type: 'other',
                ports: 1812,
                server: '172.22.10.28',
                community: 'public',
                description: 'Local NAS client for testing'
            });

            console.log('Added NAS client:', newNas);
        }

        // Check again after adding
        console.log('\n3. Final NAS clients list...');
        const finalNasClients = await radiusDb.getAllNasClients();
        console.log('Final NAS clients:', finalNasClients);

    } catch (error) {
        console.error('Error debugging NAS clients:', error);
    }
}

debugNasClients();