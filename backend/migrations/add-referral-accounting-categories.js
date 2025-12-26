const { logger } = require('../config/logger')
const { query } = require('../config/database')

exports.up = async () => {
  try {
    logger.info('Adding referral accounting categories...')

    // Add referral-related accounting categories
    await query(`
      INSERT INTO accounting_categories (name, type, description, color, icon) VALUES
      ('Diskon Referral', 'expense', 'Diskon yang diberikan untuk program referral pelanggan', '#ef4444', 'gift'),
      ('Cash Reward Referral', 'expense', 'Cash reward yang diberikan untuk program referral pelanggan', '#f59e0b', 'gift'),
      ('Fee Marketing Referral', 'expense', 'Fee yang dibayarkan kepada marketer non-pelanggan', '#8b5cf6', 'users'),
      ('Diskon Instalasi Referral', 'expense', 'Diskon instalasi untuk pelanggan dari program referral', '#3b82f6', 'tools')
      ON CONFLICT (name) DO NOTHING
    `)

    logger.info('Referral accounting categories added successfully')
  } catch (error) {
    logger.error('Error adding referral accounting categories:', error)
    throw error
  }
}

exports.down = async () => {
  try {
    logger.info('Removing referral accounting categories...')

    await query(`
      DELETE FROM accounting_categories
      WHERE name IN (
        'Diskon Referral',
        'Cash Reward Referral',
        'Fee Marketing Referral',
        'Diskon Instalasi Referral'
      )
    `)

    logger.info('Referral accounting categories removed successfully')
  } catch (error) {
    logger.error('Error removing referral accounting categories:', error)
    throw error
  }
}