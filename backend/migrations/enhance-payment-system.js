/**
 * Enhanced Payment System Migration
 * Adds support for multiple payment gateways with detailed tracking
 */

const { logger } = require('../config/logger');
const { query } = require('../config/database');

exports.up = async () => {
  try {
    logger.info('🔄 Starting enhanced payment system migration...');

    // ============================================
    // 1. ENHANCE INVOICES TABLE
    // ============================================
    logger.info('📊 Enhancing invoices table...');
    await query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS payment_gateway_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS payment_gateway_reference VARCHAR(255),
      ADD COLUMN IF NOT EXISTS payment_gateway_method VARCHAR(50),
      ADD COLUMN IF NOT EXISTS payment_gateway_status VARCHAR(50),
      ADD COLUMN IF NOT EXISTS payment_gateway_response JSONB,
      ADD COLUMN IF NOT EXISTS payment_method_details JSONB,
      ADD COLUMN IF NOT EXISTS payment_fee_amount DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS settlement_date TIMESTAMP,
      ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMP
    `);

    // Add indexes for performance
    await query(`CREATE INDEX IF NOT EXISTS idx_invoices_payment_gateway ON invoices(payment_gateway)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_gateway_status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_invoices_expiry_date ON invoices(expiry_date)`);
    logger.info('✅ Invoices table enhanced');

    // ============================================
    // 2. CREATE PAYMENT_TRANSACTIONS TABLE
    // ============================================
    logger.info('📊 Creating payment_transactions table...');
    await query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
        gateway VARCHAR(50) NOT NULL,
        gateway_transaction_id VARCHAR(255) UNIQUE,
        gateway_reference VARCHAR(255),
        payment_method VARCHAR(100),
        payment_type VARCHAR(50),
        amount DECIMAL(12,2) NOT NULL,
        fee_amount DECIMAL(12,2) DEFAULT 0,
        net_amount DECIMAL(12,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        callback_url VARCHAR(500),
        return_url VARCHAR(500),
        customer_data JSONB,
        gateway_request JSONB,
        gateway_response JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        paid_at TIMESTAMP,
        CONSTRAINT chk_payment_status CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded')),
        CONSTRAINT chk_payment_gateway CHECK (gateway IN ('tripay', 'midtrans', 'xendit', 'duitku'))
      )
    `);

    // Create indexes for payment_transactions
    await query(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice ON payment_transactions(invoice_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_gateway ON payment_transactions(gateway)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_gateway_tx ON payment_transactions(gateway_transaction_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_method ON payment_transactions(payment_method)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payment_transactions_expires ON payment_transactions(expires_at)`);
    logger.info('✅ Payment transactions table created');

    // ============================================
    // 3. CREATE PAYMENT_GATEWAY_SETTINGS TABLE
    // ============================================
    logger.info('📊 Creating payment_gateway_settings table...');
    await query(`
      CREATE TABLE IF NOT EXISTS payment_gateway_settings (
        id SERIAL PRIMARY KEY,
        gateway VARCHAR(50) UNIQUE NOT NULL,
        is_enabled BOOLEAN DEFAULT false,
        is_production BOOLEAN DEFAULT false,
        config JSONB NOT NULL,
        active_payment_methods JSONB,
        fee_settings JSONB,
        webhook_secret VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_gateway_name CHECK (gateway IN ('tripay', 'midtrans', 'xendit', 'duitku'))
      )
    `);

    // Insert default Tripay configuration
    await query(`
      INSERT INTO payment_gateway_settings (gateway, config) VALUES
      ('tripay', '{
        "api_key": "",
        "private_key": "",
        "merchant_code": "",
        "mode": "sandbox",
        "fee_handling": "customer",
        "auto_expiry": true,
        "expiry_hours": 24
      }') ON CONFLICT (gateway) DO NOTHING
    `);

    await query(`
      INSERT INTO payment_gateway_settings (gateway, config) VALUES
      ('midtrans', '{
        "server_key": "",
        "client_key": "",
        "production": false,
        "fee_handling": "customer"
      }') ON CONFLICT (gateway) DO NOTHING
    `);

    await query(`
      INSERT INTO payment_gateway_settings (gateway, config) VALUES
      ('duitku', '{
        "api_key": "",
        "merchant_code": "",
        "environment": "sandbox",
        "fee_handling": "customer"
      }') ON CONFLICT (gateway) DO NOTHING
    `);

    logger.info('✅ Payment gateway settings table created');

    // ============================================
    // 4. CREATE PAYMENT_WEBHOOK_LOGS TABLE
    // ============================================
    logger.info('📊 Creating payment_webhook_logs table...');
    await query(`
      CREATE TABLE IF NOT EXISTS payment_webhook_logs (
        id SERIAL PRIMARY KEY,
        gateway VARCHAR(50) NOT NULL,
        transaction_id VARCHAR(255),
        event_type VARCHAR(100),
        payload JSONB,
        headers JSONB,
        signature_valid BOOLEAN,
        processed BOOLEAN DEFAULT false,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      )
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_webhook_logs_gateway ON payment_webhook_logs(gateway)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_webhook_logs_transaction ON payment_webhook_logs(transaction_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON payment_webhook_logs(processed)`);
    logger.info('✅ Payment webhook logs table created');

    // ============================================
    // 5. UPDATE EXISTING PAYMENTS TABLE
    // ============================================
    logger.info('📊 Enhancing existing payments table...');
    await query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS payment_gateway VARCHAR(50),
      ADD COLUMN IF NOT EXISTS payment_method_details JSONB,
      ADD COLUMN IF NOT EXISTS gateway_transaction_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS processing_fee DECIMAL(10,2) DEFAULT 0
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_payments_gateway ON payments(payment_gateway)`);
    logger.info('✅ Payments table enhanced');

    // ============================================
    // 6. CREATE PAYMENT METHODS CACHE TABLE
    // ============================================
    logger.info('📊 Creating payment_methods_cache table...');
    await query(`
      CREATE TABLE IF NOT EXISTS payment_methods_cache (
        id SERIAL PRIMARY KEY,
        gateway VARCHAR(50) NOT NULL,
        method_code VARCHAR(100) NOT NULL,
        method_name VARCHAR(255) NOT NULL,
        method_type VARCHAR(50),
        icon VARCHAR(100),
        color VARCHAR(50),
        fee_customer JSONB,
        fee_merchant JSONB,
        minimum_amount DECIMAL(12,2),
        maximum_amount DECIMAL(12,2),
        is_active BOOLEAN DEFAULT true,
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(gateway, method_code)
      )
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_payment_methods_cache_gateway ON payment_methods_cache(gateway)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payment_methods_cache_active ON payment_methods_cache(is_active)`);
    logger.info('✅ Payment methods cache table created');

    logger.info('🎉 Enhanced payment system migration completed successfully!');

  } catch (error) {
    logger.error('❌ Error during enhanced payment system migration:', error);
    throw error;
  }
};

exports.down = async () => {
  try {
    logger.info('🔄 Rolling back enhanced payment system migration...');

    // Drop tables in reverse order
    await query(`DROP TABLE IF EXISTS payment_methods_cache`);
    await query(`DROP TABLE IF EXISTS payment_webhook_logs`);
    await query(`DROP TABLE IF EXISTS payment_gateway_settings`);
    await query(`DROP TABLE IF EXISTS payment_transactions`);

    // Drop columns from invoices
    await query(`
      ALTER TABLE invoices
      DROP COLUMN IF EXISTS payment_gateway_token,
      DROP COLUMN IF EXISTS payment_gateway_reference,
      DROP COLUMN IF EXISTS payment_gateway_method,
      DROP COLUMN IF EXISTS payment_gateway_status,
      DROP COLUMN IF EXISTS payment_gateway_response,
      DROP COLUMN IF EXISTS payment_method_details,
      DROP COLUMN IF EXISTS payment_fee_amount,
      DROP COLUMN IF EXISTS settlement_date,
      DROP COLUMN IF EXISTS expiry_date
    `);

    // Drop columns from payments
    await query(`
      ALTER TABLE payments
      DROP COLUMN IF EXISTS payment_gateway,
      DROP COLUMN IF EXISTS payment_method_details,
      DROP COLUMN IF EXISTS gateway_transaction_id,
      DROP COLUMN IF EXISTS processing_fee
    `);

    logger.info('✅ Enhanced payment system migration rolled back successfully!');

  } catch (error) {
    logger.error('❌ Error during enhanced payment system rollback:', error);
    throw error;
  }
};