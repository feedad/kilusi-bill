const { query } = require('../config/database');

async function up() {
  try {
    console.log('Creating customer_default_settings table...');

    await query(`
      CREATE TABLE IF NOT EXISTS customer_default_settings (
        id SERIAL PRIMARY KEY,
        field_name VARCHAR(100) UNIQUE NOT NULL,
        default_value TEXT NOT NULL,
        field_type VARCHAR(50) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Inserting default customer settings...');

    // Insert default settings
    const defaultSettings = [
      // Billing Settings
      ['billing_type', 'postpaid', 'select', 'Jenis tagihan: prepaid atau postpaid'],
      ['billing_cycle', 'bulan', 'select', 'Siklus billing: profile, tetap, bulan'],
      ['tax_enabled', 'true', 'boolean', 'Aktifkan pajak'],
      ['tax_percentage', '11', 'number', 'Persentase pajak'],

      // Network Settings
      ['pppoe_suffix', 'isp', 'text', 'Suffix username PPPoE'],
      ['pppoe_password', '1234567', 'text', 'Default password PPPoE'],

      // Date Settings
      ['due_date_day', '25', 'number', 'Tanggal jatuh tempo setiap bulan'],
      ['invoice_days_before_suspend', '3', 'number', 'Jumlah hari invoice terbit sebelum suspend'],

      // Reconnection Settings
      ['reconnection_calculation', 'payment_date', 'select', 'Metode perhitungan tanggal aktif: isolate_date atau payment_date'],

      // Isolation Settings
      ['isolate_time', '23:59', 'text', 'Jam isolir otomatis']
    ];

    for (const [fieldName, defaultValue, fieldType, description] of defaultSettings) {
      await query(`
        INSERT INTO customer_default_settings (field_name, default_value, field_type, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (field_name) DO NOTHING
      `, [fieldName, defaultValue, fieldType, description]);
    }

    console.log('Customer default settings table created successfully!');
  } catch (error) {
    console.error('Error creating customer default settings table:', error);
    throw error;
  }
}

async function down() {
  try {
    console.log('Dropping customer_default_settings table...');
    await query('DROP TABLE IF EXISTS customer_default_settings');
    console.log('Customer default settings table dropped successfully!');
  } catch (error) {
    console.error('Error dropping customer default settings table:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'up') {
    up()
      .then(() => {
        console.log('Migration completed successfully!');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
      });
  } else if (command === 'down') {
    down()
      .then(() => {
        console.log('Rollback completed successfully!');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Rollback failed:', error);
        process.exit(1);
      });
  } else {
    console.log('Usage: node add-customer-default-settings.js [up|down]');
    process.exit(1);
  }
}

module.exports = { up, down };