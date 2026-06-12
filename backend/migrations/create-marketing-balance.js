const { logger } = require('../config/logger')
const { query } = require('../config/database')

exports.up = async () => {
  try {
    logger.info('Creating marketing balance tables...')

    await query(`
      CREATE TABLE IF NOT EXISTS marketing_balance (
        id SERIAL PRIMARY KEY,
        customer_id VARCHAR(255) UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
        total_credit DECIMAL(12,2) DEFAULT 0,
        used_credit DECIMAL(12,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS marketing_balance_transactions (
        id SERIAL PRIMARY KEY,
        customer_id VARCHAR(255) REFERENCES customers(id) ON DELETE CASCADE,
        amount DECIMAL(12,2) NOT NULL,
        type VARCHAR(10) CHECK (type IN ('credit', 'debit')),
        balance_before DECIMAL(12,2) DEFAULT 0,
        balance_after DECIMAL(12,2) DEFAULT 0,
        reference_type VARCHAR(50),
        reference_id INTEGER,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await query(`CREATE INDEX IF NOT EXISTS idx_mb_customer ON marketing_balance(customer_id)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_mbt_customer ON marketing_balance_transactions(customer_id)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_mbt_created ON marketing_balance_transactions(created_at DESC)`)

    // Ensure accounting categories exist — use separate params to avoid PG type conflict
    for (const cat of [
      { name: 'Diskon Referral', type: 'expense', desc: 'Biaya saldo marketing referrer yang sudah dipakai' },
      { name: 'Diskon Layanan Referral', type: 'expense', desc: 'Diskon invoice pertama untuk pelanggan baru (referred)' }
    ]) {
      await query(`
        INSERT INTO accounting_categories (name, type, description)
        SELECT $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM accounting_categories WHERE name = $4)
      `, [cat.name, cat.type, cat.desc, cat.name])
    }

    logger.info('Marketing balance tables created successfully')
  } catch (error) {
    logger.error('Error creating marketing balance tables:', error)
    throw error
  }
}

exports.down = async () => {
  try {
    logger.info('Dropping marketing balance tables...')

    await query(`DROP INDEX IF EXISTS idx_mbt_created`)
    await query(`DROP INDEX IF EXISTS idx_mbt_customer`)
    await query(`DROP INDEX IF EXISTS idx_mb_customer`)
    await query(`DROP TABLE IF EXISTS marketing_balance_transactions`)
    await query(`DROP TABLE IF EXISTS marketing_balance`)

    logger.info('Marketing balance tables dropped successfully')
  } catch (error) {
    logger.error('Error dropping marketing balance tables:', error)
    throw error
  }
}

// Run directly if executed as script
if (require.main === module) {
  exports.up().then(() => process.exit(0)).catch(() => process.exit(1))
}
