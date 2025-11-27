const { logger } = require('../config/logger')
const { query } = require('../config/database')

exports.up = async () => {
  try {
    logger.info('Adding referral system settings...')

    // Check if auto_expense_settings table exists, create if not
    await query(`
      CREATE TABLE IF NOT EXISTS auto_expense_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert referral system settings
    await query(`
      INSERT INTO auto_expense_settings (setting_key, setting_value, description) VALUES
      ('referral_enabled', 'true', 'Enable referral system'),
      ('referrer_discount_fixed', '25000', 'Fixed discount amount for referrer'),
      ('referrer_cash_amount', '30000', 'Fixed cash amount for referrer'),
      ('referred_installation_discount_fixed', '50000', 'Fixed installation discount for referred customer'),
      ('referred_service_discount_fixed', '25000', 'Fixed service discount for referred customer'),
      ('marketing_min_fee', '100000', 'Minimum marketing fee'),
      ('marketing_max_fee', '500000', 'Maximum marketing fee'),
      ('referral_code_expiry_days', '365', 'Referral code expiry in days'),
      ('referral_max_uses', '50', 'Maximum uses per referral code'),
      ('referral_benefit_type', 'discount', 'Default benefit type: discount or cash'),
      ('referral_cash_enabled', 'true', 'Enable cash referral option')
      ON CONFLICT (setting_key) DO NOTHING
    `)

    logger.info('Referral settings added successfully')
  } catch (error) {
    logger.error('Error adding referral settings:', error)
    throw error
  }
}

exports.down = async () => {
  try {
    logger.info('Removing referral system settings...')

    // Remove referral settings
    await query(`
      DELETE FROM auto_expense_settings
      WHERE setting_key IN (
        'referral_enabled',
        'referrer_discount_fixed',
        'referrer_cash_amount',
        'referred_installation_discount_fixed',
        'referred_service_discount_fixed',
        'marketing_min_fee',
        'marketing_max_fee',
        'referral_code_expiry_days',
        'referral_max_uses',
        'referral_benefit_type',
        'referral_cash_enabled'
      )
    `)

    logger.info('Referral settings removed successfully')
  } catch (error) {
    logger.error('Error removing referral settings:', error)
    throw error
  }
}