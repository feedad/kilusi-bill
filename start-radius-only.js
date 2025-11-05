const radiusServer = require('./config/radius-server');
const radiusDb = require('./config/radius-postgres');
const { logger } = require('./config/logger');

async function startRadiusOnly() {
  try {
    console.log('🔐 Starting RADIUS Server Only...');

    // Initialize RADIUS database
    await radiusDb.initDatabase();

    // Load NAS clients
    await radiusServer.reloadNasClients();

    // Start RADIUS server
    await radiusServer.startRadiusServer();

    console.log('✅ RADIUS Server started successfully!');

    // Show server status
    const status = radiusServer.getServerStatus();
    console.log('\n📊 Server Status:');
    console.log('- Authentication Server:', status.authServer ? 'Running' : 'Stopped');
    console.log('- Accounting Server:', status.acctServer ? 'Running' : 'Stopped');
    console.log('- Auth Port:', status.ports.auth);
    console.log('- Acct Port:', status.ports.acct);
    console.log('- NAS Clients:', status.nasClients.length);

    status.nasClients.forEach(nas => {
      console.log(`  - ${nas.name} (${nas.ip})`);
    });

    console.log('\n🎯 RADIUS Server is ready for authentication!');
    console.log('Press Ctrl+C to stop...');

    // Keep running
    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping RADIUS Server...');
      await radiusServer.stopRadiusServer();
      console.log('✅ RADIUS Server stopped');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start RADIUS Server:', error.message);
    process.exit(1);
  }
}

startRadiusOnly();