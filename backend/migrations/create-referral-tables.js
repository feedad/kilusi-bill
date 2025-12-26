const { logger } = require('../config/logger')
const { query } = require('../config/database')

exports.up = async () => {
  try {
    logger.info('Creating referral tables...')

    // Create referral_codes table
    await query(`
      CREATE TABLE IF NOT EXISTS referral_codes (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        code VARCHAR(10) UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        usage_count INTEGER DEFAULT 0,
        max_uses INTEGER DEFAULT 50
      )
    `)

    // Create referral_transactions table
    await query(`
      CREATE TABLE IF NOT EXISTS referral_transactions (
        id SERIAL PRIMARY KEY,
        referrer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        referred_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        referral_code_id INTEGER REFERENCES referral_codes(id) ON DELETE SET NULL,
        benefit_type VARCHAR(20) CHECK (benefit_type IN ('discount', 'cash', 'fee_deduction')),
        benefit_amount DECIMAL(12,2),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'expired')),
        applied_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create marketing_referrals table
    await query(`
      CREATE TABLE IF NOT EXISTS marketing_referrals (
        id SERIAL PRIMARY KEY,
        marketer_name VARCHAR(255) NOT NULL,
        marketer_phone VARCHAR(20),
        marketer_email VARCHAR(255),
        referral_code VARCHAR(10) UNIQUE NOT NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        fee_amount DECIMAL(12,2),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
        paid_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Add referral columns to customers table
    await query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS referral_code_used VARCHAR(10),
      ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES customers(id)
    `)

    // Create indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_referral_codes_customer ON referral_codes(customer_id)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_referral_codes_active ON referral_codes(is_active)`)

    await query(`CREATE INDEX IF NOT EXISTS idx_referral_transactions_referrer ON referral_transactions(referrer_id)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_referral_transactions_referred ON referral_transactions(referred_id)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_referral_transactions_status ON referral_transactions(status)`)

    await query(`CREATE INDEX IF NOT EXISTS idx_marketing_referrals_code ON marketing_referrals(referral_code)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_marketing_referrals_customer ON marketing_referrals(customer_id)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_marketing_referrals_status ON marketing_referrals(status)`)

    logger.info('Referral tables created successfully')
  } catch (error) {
    logger.error('Error creating referral tables:', error)
    throw error
  }
}

exports.down = async () => {
  try {
    logger.info('Dropping referral tables...')

    // Drop indexes first
    await query(`DROP INDEX IF EXISTS idx_marketing_referrals_status`)
    await query(`DROP INDEX IF EXISTS idx_marketing_referrals_customer`)
    await query(`DROP INDEX IF EXISTS idx_marketing_referrals_code`)
    await query(`DROP INDEX IF EXISTS idx_referral_transactions_status`)
    await query(`DROP INDEX IF EXISTS idx_referral_transactions_referred`)
    await query(`DROP INDEX IF EXISTS idx_referral_transactions_referrer`)
    await query(`DROP INDEX IF EXISTS idx_referral_codes_active`)
    await query(`DROP INDEX IF EXISTS idx_referral_codes_code`)
    await query(`DROP INDEX IF EXISTS idx_referral_codes_customer`)

    // Drop tables
    await query(`DROP TABLE IF EXISTS marketing_referrals`)
    await query(`DROP TABLE IF EXISTS referral_transactions`)
    await query(`DROP TABLE IF EXISTS referral_codes`)

    // Remove columns from customers table
    await query(`
      ALTER TABLE customers
      DROP COLUMN IF EXISTS referred_by,
      DROP COLUMN IF EXISTS referral_code_used
    `)

    logger.info('Referral tables dropped successfully')
  } catch (error) {
    logger.error('Error dropping referral tables:', error)
    throw error
  }
}