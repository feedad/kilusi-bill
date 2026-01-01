const { logger } = require('../config/logger')
const { query } = require('../config/database')

exports.up = async () => {
  try {
    logger.info('Creating auto expense settings table...')

    // Create auto_expense_settings table
    await query(`
      CREATE TABLE IF NOT EXISTS auto_expense_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert default settings
    await query(`
      INSERT INTO auto_expense_settings (setting_key, setting_value, description) VALUES
      ('technician_fee_enabled', 'false', 'Enable automatic technician fee recording'),
      ('technician_fee_amount', '0', 'Amount to pay technicians for completed installations'),
      ('marketing_fee_enabled', 'false', 'Enable automatic marketing fee recording'),
      ('marketing_fee_amount', '0', 'Amount to pay for marketing/referral fees')
      ON CONFLICT (setting_key) DO NOTHING
    `)

    // Create recurring_expenses table
    await query(`
      CREATE TABLE IF NOT EXISTS recurring_expenses (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        category_id INTEGER REFERENCES accounting_categories(id) ON DELETE SET NULL,
        frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
        next_date DATE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_auto_expense_settings_key ON auto_expense_settings(setting_key)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_recurring_expenses_frequency ON recurring_expenses(frequency)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_recurring_expenses_next_date ON recurring_expenses(next_date)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_recurring_expenses_active ON recurring_expenses(is_active)`)

    logger.info('Auto expense settings tables created successfully')
  } catch (error) {
    logger.error('Error creating auto expense settings tables:', error)
    throw error
  }
}

exports.down = async () => {
  try {
    logger.info('Dropping auto expense settings tables...')

    await query(`DROP TABLE IF EXISTS recurring_expenses`)
    await query(`DROP TABLE IF EXISTS auto_expense_settings`)

    logger.info('Auto expense settings tables dropped successfully')
  } catch (error) {
    logger.error('Error dropping auto expense settings tables:', error)
    throw error
  }
}