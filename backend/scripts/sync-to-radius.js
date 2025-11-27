/**
 * Manual sync script untuk sync customer ke RADIUS
 * Run: node scripts/sync-to-radius.js
 */

const radiusDb = require('../config/radius-postgres');
const radiusSync = require('../config/radius-sync');
const { logger } = require('../config/logger');

async function manualSync() {
  try {
    console.log('🔄 Starting manual RADIUS sync...\n');
    
    // Initialize database
    await radiusDb.initDatabase();
    console.log('✅ RADIUS database initialized\n');
    
    // Sync all customers
    const result = await radiusSync.syncCustomersToRadius();
    
    console.log('\n📊 Sync Results:');
    console.log(`   ✅ Synced: ${result.synced}`);
    console.log(`   ❌ Errors: ${result.errors}`);
    console.log(`   📝 Total: ${result.total}`);
    
    // Show sync status
    const status = await radiusSync.getSyncStatus();
    console.log('\n📈 Current Status:');
    console.log(`   Total customers: ${status.total}`);
    console.log(`   Synced to RADIUS: ${status.synced}`);
    console.log(`   Pending sync: ${status.pending}`);
    
    // Get all RADIUS users
    const users = await radiusDb.getAllRadiusUsers();
    console.log('\n👥 RADIUS Users:');
    users.forEach(user => {
      console.log(`   - ${user.username} (created: ${user.created_at})`);
    });
    
    console.log('\n✅ Manual sync completed!');
    
  } catch (error) {
    console.error('❌ Error during manual sync:', error);
    process.exit(1);
  }
}

// Run the sync
manualSync();
