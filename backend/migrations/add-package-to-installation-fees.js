const { query } = require('../config/database');
const { logger } = require('../config/logger');

async function addPackageToInstallationFees() {
  try {
    console.log('🔄 Adding package_id to installation_fee_settings table...');

    // First, drop the existing table and recreate with package_id
    await query('DROP TABLE IF EXISTS installation_fee_settings CASCADE');
    console.log('✅ Dropped existing installation_fee_settings table');

    // Create installation_fee_settings table with package_id
    await query(`
      CREATE TABLE installation_fee_settings (
          id SERIAL PRIMARY KEY,
          billing_type VARCHAR(20) NOT NULL,        -- prepaid, postpaid
          package_id INTEGER,                        -- null for default/all packages
          fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
          description TEXT,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(billing_type, package_id)
      )
    `);
    console.log('✅ Created installation_fee_settings table with package_id support');

    // Create indexes
    console.log('🔄 Creating indexes...');
    await query(`
      CREATE INDEX IF NOT EXISTS idx_installation_fee_settings_billing_type ON installation_fee_settings(billing_type)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_installation_fee_settings_package_id ON installation_fee_settings(package_id)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_installation_fee_settings_active ON installation_fee_settings(is_active)
    `);
    console.log('✅ Created indexes');

    // Create updated_at trigger
    console.log('🔄 Creating updated_at trigger...');
    await query(`
      CREATE OR REPLACE FUNCTION update_installation_fee_settings_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await query(`
      DROP TRIGGER IF EXISTS update_installation_fee_settings_updated_at_trigger ON installation_fee_settings
    `);

    await query(`
      CREATE TRIGGER update_installation_fee_settings_updated_at_trigger
          BEFORE UPDATE ON installation_fee_settings
          FOR EACH ROW
          EXECUTE FUNCTION update_installation_fee_settings_updated_at()
    `);
    console.log('✅ Created updated_at trigger');

    // Get current packages
    const packagesResult = await query('SELECT id, name FROM packages ORDER BY id');
    const packages = packagesResult.rows;

    console.log(`Found ${packages.length} packages`);

    // Create default settings for each billing type (package_id = NULL)
    const defaultSettings = [
      { billing_type: 'prepaid', fee_amount: 0, description: 'Default biaya instalasi untuk pelanggan prabayar' },
      { billing_type: 'postpaid', fee_amount: 50000, description: 'Default biaya instalasi untuk pelanggan pascabayar' }
    ];

    for (const setting of defaultSettings) {
      await query(`
        INSERT INTO installation_fee_settings (billing_type, package_id, fee_amount, description)
        VALUES ($1, NULL, $2, $3)
      `, [setting.billing_type, setting.fee_amount, setting.description]);
    }

    // Create package-specific settings
    for (const pkg of packages) {
      // Default settings per package
      const pkgSettings = [
        {
          billing_type: 'prepaid',
          package_id: pkg.id.toString(),
          fee_amount: pkg.name.toLowerCase().includes('bronze') ? 0 : 50000,
          description: `Biaya instalasi paket ${pkg.name} untuk pelanggan prabayar`
        },
        {
          billing_type: 'postpaid',
          package_id: pkg.id.toString(),
          fee_amount: pkg.name.toLowerCase().includes('lite') ? 150000 : 150000,
          description: `Biaya instalasi paket ${pkg.name} untuk pelanggan pascabayar`
        }
      ];

      for (const setting of pkgSettings) {
        await query(`
          INSERT INTO installation_fee_settings (billing_type, package_id, fee_amount, description)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (billing_type, package_id) DO UPDATE SET
            fee_amount = EXCLUDED.fee_amount,
            description = EXCLUDED.description,
            updated_at = CURRENT_TIMESTAMP
        `, [setting.billing_type, setting.package_id, setting.fee_amount, setting.description]);
      }
    }

    console.log('✅ Inserted installation fee settings for packages');

    // Show current settings
    const settingsResult = await query(`
      SELECT
        ifs.*,
        p.name as package_name
      FROM installation_fee_settings ifs
      LEFT JOIN packages p ON ifs.package_id = p.id
      ORDER BY
        CASE WHEN ifs.package_id IS NULL THEN 0 ELSE 1 END,
        ifs.billing_type,
        p.name
    `);

    console.log('\n💰 Current Installation Fee Settings:');
    console.log('='.repeat(120));
    settingsResult.rows.forEach((setting, index) => {
      const packageName = setting.package_name || 'DEFAULT (Semua Paket)';
      console.log(`${index + 1}. ${setting.billing_type.toUpperCase()} - ${packageName}`);
      console.log(`   💰 Biaya: Rp ${setting.fee_amount?.toLocaleString('id-ID')}`);
      console.log(`   📝 Deskripsi: ${setting.description}`);
      console.log(`   ✅ Status: ${setting.is_active ? 'Aktif' : 'Non-aktif'}`);
      console.log('');
    });

    console.log('🎉 Installation fee settings migration completed successfully!');

  } catch (error) {
    logger.error('❌ Error adding package_id to installation fee settings table:', error);
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  addPackageToInstallationFees()
    .then(() => {
      console.log('\n✨ Package installation fee migration completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addPackageToInstallationFees };