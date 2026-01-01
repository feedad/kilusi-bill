const { logger } = require('../config/logger')
const { query } = require('../config/database')

exports.up = async () => {
  try {
    logger.info('Adding referral_discount column to invoices table...')

    await query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS referral_discount DECIMAL(12,2) DEFAULT 0
    `)

    logger.info('Referral discount column added to invoices successfully')
  } catch (error) {
    logger.error('Error adding referral discount column:', error)
    throw error
  }
}

exports.down = async () => {
  try {
    logger.info('Removing referral_discount column from invoices table...')

    await query(`
      ALTER TABLE invoices
      DROP COLUMN IF EXISTS referral_discount
    `)

    logger.info('Referral discount column removed from invoices successfully')
  } catch (error) {
    logger.error('Error removing referral discount column:', error)
    throw error
  }
}