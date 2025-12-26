const { query } = require('../config/database');
const { logger } = require('../config/logger');

async function addInstallationFeeToPackages() {
  try {
    console.log('🔄 Adding installation_fee column to packages table...');

    // Check if column already exists
    const checkResult = await query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'packages'
      AND column_name = 'installation_fee'
    `);

    if (checkResult.rows.length === 0) {
      // Add installation_fee column
      await query(`
        ALTER TABLE packages
        ADD COLUMN installation_fee DECIMAL(10,2) DEFAULT 50000
      `);
      console.log('✅ Added installation_fee column (default: 50000)');
    } else {
      console.log('ℹ️  installation_fee column already exists');
    }

    // Check if installation_description column already exists
    const checkDescResult = await query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'packages'
      AND column_name = 'installation_description'
    `);

    if (checkDescResult.rows.length === 0) {
      // Add installation_description column
      await query(`
        ALTER TABLE packages
        ADD COLUMN installation_description TEXT DEFAULT 'Standard installation'
      `);
      console.log('✅ Added installation_description column');
    } else {
      console.log('ℹ️  installation_description column already exists');
    }

    // Update existing packages with default values if they have NULL values
    const updateResult = await query(`
      UPDATE packages
      SET installation_fee = 50000,
          installation_description = 'Standard installation'
      WHERE installation_fee IS NULL
    `);

    console.log(`✅ Updated ${updateResult.rowCount} packages with default installation fees`);

    // Show current packages with their installation fees
    const packagesResult = await query(`
      SELECT id, name, price, installation_fee, installation_description
      FROM packages
      ORDER BY id
    `);

    console.log('\n📦 Current Packages with Installation Fees:');
    console.log('─'.repeat(80));
    packagesResult.rows.forEach((pkg, index) => {
      console.log(`${index + 1}. ${pkg.name}`);
      console.log(`   💰 Monthly: Rp ${pkg.price?.toLocaleString('id-ID') || 0}`);
      console.log(`   🔧 Installation: Rp ${pkg.installation_fee?.toLocaleString('id-ID') || 0}`);
      console.log(`   📝 Description: ${pkg.installation_description}`);
      console.log('');
    });

    console.log('🎉 Migration completed successfully!');

  } catch (error) {
    logger.error('❌ Error adding installation fee to packages table:', error);
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  addInstallationFeeToPackages()
    .then(() => {
      console.log('\n✨ Installation fee migration completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addInstallationFeeToPackages };