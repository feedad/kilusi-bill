/**
 * Script untuk migrasi NAS clients dari settings.json ke database
 * Jalankan dengan: node scripts/migrate-nas-to-database.js
 */

const fs = require('fs');
const path = require('path');
const radiusDb = require('../config/radius-postgres');

async function migrateNasClients() {
  console.log('🔄 Starting NAS clients migration...');
  
  try {
    // Initialize database
    await radiusDb.initDatabase();
    console.log('✅ Database initialized');
    
    // Read settings.json
    const settingsPath = path.join(__dirname, '../settings.json');
    if (!fs.existsSync(settingsPath)) {
      console.log('⚠️  settings.json not found, skipping migration');
      return;
    }
    
    const settingsData = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(settingsData);
    
    // Check if radius_nas_clients exists
    if (!settings.radius_nas_clients || !Array.isArray(settings.radius_nas_clients)) {
      console.log('⚠️  No NAS clients found in settings.json');
      return;
    }
    
    console.log(`📋 Found ${settings.radius_nas_clients.length} NAS clients in settings.json`);
    
    // Check if already migrated
    const existingClients = await radiusDb.getAllNasClients();
    if (existingClients.length > 0) {
      console.log(`⚠️  Database already has ${existingClients.length} NAS clients`);
      console.log('💡 Skipping existing entries, only adding new ones...');
    }
    
    // Migrate each NAS client
    let migratedCount = 0;
    for (const nas of settings.radius_nas_clients) {
      const nasname = nas.ip;
      const shortname = nas.name || nas.ip;
      const secret = nas.secret || 'testing123';
      const type = 'other';
      const description = `Migrated from settings.json`;
      
      try {
        // Check if exists
        const existing = await radiusDb.getNasClient(nasname);
        if (existing) {
          // Update
          await radiusDb.updateNasClient(
            existing.id,
            nasname,
            shortname,
            secret,
            type,
            description
          );
          console.log(`✅ Updated: ${shortname} (${nasname})`);
        } else {
          // Add new
          await radiusDb.addNasClient(
            nasname,
            shortname,
            secret,
            type,
            description
          );
          console.log(`✅ Added: ${shortname} (${nasname})`);
        }
        migratedCount++;
      } catch (error) {
        console.error(`❌ Failed to migrate ${shortname}: ${error.message}`);
      }
    }
    
    console.log(`\n🎉 Migration completed: ${migratedCount}/${settings.radius_nas_clients.length} NAS clients migrated`);
    console.log('\n💡 Tip: You can now remove radius_nas_clients from settings.json');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await radiusDb.closeDatabase();
    process.exit(0);
  }
}

// Run migration
migrateNasClients();
