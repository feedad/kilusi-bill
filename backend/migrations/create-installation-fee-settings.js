const { query } = require('../config/database');
const { logger } = require('../config/logger');

async function createInstallationFeeSettings() {
  try {
    console.log('🔄 Creating installation_fee_settings table...');

    // Check if table already exists
    const checkResult = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'installation_fee_settings'
      )
    `);

    const tableExists = checkResult.rows[0].exists;

    if (!tableExists) {
      // Create installation_fee_settings table
      await query(`
        CREATE TABLE installation_fee_settings (
            id SERIAL PRIMARY KEY,
            billing_type VARCHAR(20) NOT NULL,        -- prepaid, postpaid
            package_id VARCHAR(5), -- null for default/all packages
            fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
            description TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(billing_type, package_id)
        )
      `);
      console.log('✅ Created installation_fee_settings table');
    } else {
      console.log('ℹ️  installation_fee_settings table already exists');
    }

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

    // Insert default settings
    console.log('🔄 Inserting default installation fee settings...');

    // Get current packages
    const packagesResult = await query('SELECT id, name FROM packages ORDER BY id');
    const packages = packagesResult.rows;

    // Default installation fees
    const defaultSettings = [
      { billing_type: 'prepaid', fee_amount: 0, description: 'Gratis instalasi untuk pelanggan prabayar' },
      { billing_type: 'postpaid', fee_amount: 50000, description: 'Biaya instalasi standar untuk pelanggan pascabayar' }
    ];

    for (const setting of defaultSettings) {
      await query(`
        INSERT INTO installation_fee_settings (billing_type, package_id, fee_amount, description)
        VALUES ($1, NULL, $2, $3)
        ON CONFLICT (billing_type, package_id) DO UPDATE SET
          fee_amount = EXCLUDED.fee_amount,
          description = EXCLUDED.description,
          updated_at = CURRENT_TIMESTAMP
      `, [setting.billing_type, setting.fee_amount, setting.description]);
    }

    // Package-specific settings (optional - can be customized per package)
    for (const pkg of packages) {
      // Example: Free installation for prepaid BRONZE package
      if (pkg.name.toLowerCase().includes('bronze')) {
        await query(`
          INSERT INTO installation_fee_settings (billing_type, package_id, fee_amount, description)
          VALUES ('prepaid', $1, 0, 'Gratis instalasi paket BRONZE untuk pelanggan prabayar')
          ON CONFLICT (billing_type, package_id) DO UPDATE SET
            fee_amount = EXCLUDED.fee_amount,
            description = EXCLUDED.description,
            updated_at = CURRENT_TIMESTAMP
        `, [pkg.id.toString()]);
      }

      // Example: Discounted installation for postpaid packages
      await query(`
        INSERT INTO installation_fee_settings (billing_type, package_id, fee_amount, description)
        VALUES ('postpaid', $1, 25000, 'Biaya instalasi diskon untuk paket ' || $2 || ' pelanggan pascabayar')
        ON CONFLICT (billing_type, package_id) DO UPDATE SET
          fee_amount = EXCLUDED.fee_amount,
          description = EXCLUDED.description,
          updated_at = CURRENT_TIMESTAMP
      `, [pkg.id.toString(), pkg.name]);
    }

    console.log('✅ Inserted default installation fee settings');

    // Show current settings
    const settingsResult = await query(`
      SELECT
        ifs.*,
        p.name as package_name
      FROM installation_fee_settings ifs
      LEFT JOIN packages p ON ifs.package_id = p.id
      ORDER BY ifs.billing_type, ifs.package_id NULLS LAST, p.name
    `);

    console.log('\n💰 Current Installation Fee Settings:');
    console.log('='.repeat(100));
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
    logger.error('❌ Error creating installation fee settings table:', error);
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  createInstallationFeeSettings()
    .then(() => {
      console.log('\n✨ Installation fee settings migration completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { createInstallationFeeSettings };