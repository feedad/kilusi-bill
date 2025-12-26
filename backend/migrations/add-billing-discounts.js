const { logger } = require('../config/logger')
const { query } = require('../config/database')

exports.up = async () => {
  try {
    logger.info('Creating billing_discounts table for compensation discounts...')

    // Create billing_discounts table
    await query(`
      CREATE TABLE IF NOT EXISTS billing_discounts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
        discount_value DECIMAL(12,2) NOT NULL,
        target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('all', 'area', 'package', 'customer')),
        target_ids TEXT[], -- Array of customer IDs, area names, or package IDs based on target_type
        compensation_reason VARCHAR(100),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        max_discount_amount DECIMAL(12,2), -- Maximum discount amount for percentage type
        apply_to_existing_invoices BOOLEAN DEFAULT false,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create billing_discount_applications table to track which invoices got discounts
    await query(`
      CREATE TABLE IF NOT EXISTS billing_discount_applications (
        id SERIAL PRIMARY KEY,
        discount_id INTEGER,
        customer_id INTEGER,
        invoice_id INTEGER,
        original_amount DECIMAL(12,2) NOT NULL,
        discount_amount DECIMAL(12,2) NOT NULL,
        final_amount DECIMAL(12,2) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        applied_by INTEGER,
        notes TEXT
      )
    `)

    // Add discount columns to invoices table (if not already exists)
    await query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS final_amount DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS discount_notes TEXT
    `)

    // Create indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_billing_discounts_active ON billing_discounts(is_active)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_billing_discounts_date_range ON billing_discounts(start_date, end_date)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_billing_discounts_target_type ON billing_discounts(target_type)`)

    await query(`CREATE INDEX IF NOT EXISTS idx_discount_applications_discount ON billing_discount_applications(discount_id)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_discount_applications_customer ON billing_discount_applications(customer_id)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_discount_applications_invoice ON billing_discount_applications(invoice_id)`)

    // Create trigger for updated_at
    await query(`
      CREATE OR REPLACE FUNCTION update_billing_discounts_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `)

    await query(`
      DROP TRIGGER IF EXISTS update_billing_discounts_updated_at ON billing_discounts;
      CREATE TRIGGER update_billing_discounts_updated_at
      BEFORE UPDATE ON billing_discounts
      FOR EACH ROW
      EXECUTE FUNCTION update_billing_discounts_updated_at();
    `)

    logger.info('Billing discounts table created successfully')
  } catch (error) {
    logger.error('Error creating billing discounts table:', error)
    throw error
  }
}

exports.down = async () => {
  try {
    logger.info('Dropping billing discounts tables...')

    // Drop trigger
    await query(`DROP TRIGGER IF EXISTS update_billing_discounts_updated_at ON billing_discounts`)
    await query(`DROP FUNCTION IF EXISTS update_billing_discounts_updated_at`)

    // Drop indexes
    await query(`DROP INDEX IF EXISTS idx_discount_applications_invoice`)
    await query(`DROP INDEX IF EXISTS idx_discount_applications_customer`)
    await query(`DROP INDEX IF EXISTS idx_discount_applications_discount`)
    await query(`DROP INDEX IF EXISTS idx_billing_discounts_target_type`)
    await query(`DROP INDEX IF EXISTS idx_billing_discounts_date_range`)
    await query(`DROP INDEX IF EXISTS idx_billing_discounts_active`)

    // Drop tables
    await query(`DROP TABLE IF EXISTS billing_discount_applications`)
    await query(`DROP TABLE IF EXISTS billing_discounts`)

    // Remove columns from invoices table
    await query(`
      ALTER TABLE invoices
      DROP COLUMN IF EXISTS discount_amount,
      DROP COLUMN IF EXISTS final_amount,
      DROP COLUMN IF EXISTS discount_notes
    `)

    logger.info('Billing discounts tables dropped successfully')
  } catch (error) {
    logger.error('Error dropping billing discounts tables:', error)
    throw error
  }
}