/**
 * Add Manual Payment Support Migration
 * - Adds 'manual' gateway to payment_gateway_settings
 * - Adds proof_of_payment column to payment_transactions
 * - Creates admin_notifications table
 * - Adds Telegram settings
 */

const { logger } = require('../config/logger');
const { query } = require('../config/database');

exports.up = async () => {
  try {
    logger.info('🔄 Starting manual payment support migration...');

    // ============================================
    // 1. UPDATE CONSTRAINT TO ALLOW 'manual' GATEWAY
    // ============================================
    logger.info('📊 Updating payment_transactions constraint...');

    // Drop the old constraint and create a new one with 'manual' included
    await query(`
      ALTER TABLE payment_transactions
      DROP CONSTRAINT IF EXISTS chk_payment_gateway
    `);

    await query(`
      ALTER TABLE payment_transactions
      ADD CONSTRAINT chk_payment_gateway 
      CHECK (gateway IN ('tripay', 'midtrans', 'xendit', 'duitku', 'manual'))
    `);

    logger.info('✅ Payment transactions constraint updated');

    // ============================================
    // 2. ADD PROOF_OF_PAYMENT COLUMN
    // ============================================
    logger.info('📊 Adding proof_of_payment column...');

    await query(`
      ALTER TABLE payment_transactions
      ADD COLUMN IF NOT EXISTS proof_of_payment VARCHAR(500),
      ADD COLUMN IF NOT EXISTS verified_by INTEGER,
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS verification_notes TEXT
    `);

    logger.info('✅ Proof of payment columns added');

    // ============================================
    // 3. UPDATE PAYMENT_GATEWAY_SETTINGS CONSTRAINT
    // ============================================
    logger.info('📊 Updating payment_gateway_settings constraint...');

    await query(`
      ALTER TABLE payment_gateway_settings
      DROP CONSTRAINT IF EXISTS chk_gateway_name
    `);

    await query(`
      ALTER TABLE payment_gateway_settings
      ADD CONSTRAINT chk_gateway_name 
      CHECK (gateway IN ('tripay', 'midtrans', 'xendit', 'duitku', 'manual'))
    `);

    // Insert manual gateway configuration
    await query(`
      INSERT INTO payment_gateway_settings (gateway, is_enabled, config) VALUES
      ('manual', true, '{
        "bank_name": "BCA",
        "account_number": "1234567890",
        "account_holder": "PT Kilusi Digital Network",
        "instructions": "Transfer ke rekening di atas, lalu upload bukti pembayaran."
      }') ON CONFLICT (gateway) DO UPDATE SET
        config = EXCLUDED.config,
        is_enabled = true
    `);

    logger.info('✅ Manual gateway added to settings');

    // ============================================
    // 4. CREATE ADMIN_NOTIFICATIONS TABLE
    // ============================================
    logger.info('📊 Creating admin_notifications table...');

    await query(`
      CREATE TABLE IF NOT EXISTS admin_notifications (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        data JSONB,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP
      )
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_type ON admin_notifications(type)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_read ON admin_notifications(is_read)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON admin_notifications(created_at DESC)`);

    logger.info('✅ Admin notifications table created');

    // ============================================
    // 5. ADD TELEGRAM SETTINGS TO APP_CONFIG
    // ============================================
    logger.info('📊 Adding Telegram settings...');

    // Check if app_config table exists, create if not
    await query(`
      CREATE TABLE IF NOT EXISTS app_config (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert Telegram settings
    await query(`
      INSERT INTO app_config (key, value, description) VALUES
      ('telegram_bot_token', '', 'Telegram Bot Token for notifications'),
      ('telegram_chat_id', '', 'Telegram Chat ID for admin notifications'),
      ('telegram_enabled', 'false', 'Enable/disable Telegram notifications')
      ON CONFLICT (key) DO NOTHING
    `);

    logger.info('✅ Telegram settings added');

    logger.info('🎉 Manual payment support migration completed successfully!');

  } catch (error) {
    logger.error('❌ Error during manual payment support migration:', error);
    throw error;
  }
};

exports.down = async () => {
  try {
    logger.info('🔄 Rolling back manual payment support migration...');

    // Remove Telegram settings
    await query(`DELETE FROM app_config WHERE key IN ('telegram_bot_token', 'telegram_chat_id', 'telegram_enabled')`);

    // Drop admin_notifications table
    await query(`DROP TABLE IF EXISTS admin_notifications`);

    // Remove manual gateway
    await query(`DELETE FROM payment_gateway_settings WHERE gateway = 'manual'`);

    // Remove proof_of_payment columns
    await query(`
      ALTER TABLE payment_transactions
      DROP COLUMN IF EXISTS proof_of_payment,
      DROP COLUMN IF EXISTS verified_by,
      DROP COLUMN IF EXISTS verified_at,
      DROP COLUMN IF EXISTS verification_notes
    `);

    // Restore original constraints (without 'manual')
    await query(`
      ALTER TABLE payment_transactions
      DROP CONSTRAINT IF EXISTS chk_payment_gateway
    `);

    await query(`
      ALTER TABLE payment_transactions
      ADD CONSTRAINT chk_payment_gateway 
      CHECK (gateway IN ('tripay', 'midtrans', 'xendit', 'duitku'))
    `);

    await query(`
      ALTER TABLE payment_gateway_settings
      DROP CONSTRAINT IF EXISTS chk_gateway_name
    `);

    await query(`
      ALTER TABLE payment_gateway_settings
      ADD CONSTRAINT chk_gateway_name 
      CHECK (gateway IN ('tripay', 'midtrans', 'xendit', 'duitku'))
    `);

    logger.info('✅ Manual payment support migration rolled back successfully!');

  } catch (error) {
    logger.error('❌ Error during manual payment support rollback:', error);
    throw error;
  }
};
