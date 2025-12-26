const { logger } = require('../config/logger')
const { query } = require('../config/database')

exports.up = async () => {
  try {
    logger.info('Creating accounting tables...')

    // Create accounting_categories table
    await query(`
      CREATE TABLE IF NOT EXISTS accounting_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        type VARCHAR(20) NOT NULL CHECK (type IN ('revenue', 'expense')),
        description TEXT,
        color VARCHAR(7) DEFAULT '#6366f1',
        icon VARCHAR(50) DEFAULT 'circle',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create accounting_transactions table
    await query(`
      CREATE TABLE IF NOT EXISTS accounting_transactions (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES accounting_categories(id) ON DELETE SET NULL,
        type VARCHAR(20) NOT NULL CHECK (type IN ('revenue', 'expense')),
        amount DECIMAL(12,2) NOT NULL,
        description TEXT NOT NULL,
        reference_type VARCHAR(50),
        reference_id INTEGER,
        date DATE NOT NULL,
        attachment_url VARCHAR(255),
        notes TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert default categories
    await query(`
      INSERT INTO accounting_categories (name, type, description, color, icon) VALUES
      ('Tagihan Internet', 'revenue', 'Pendapatan dari tagihan pelanggan internet', '#10b981', 'credit-card'),
      ('Biaya Instalasi', 'revenue', 'Pendapatan dari biaya instalasi', '#3b82f6', 'tools'),
      ('Pinjaman Modal', 'revenue', 'Pinjaman modal untuk operasional', '#8b5cf6', 'trending-up'),
      ('Lain-lain', 'revenue', 'Pendapatan lain-lain', '#6b7280', 'more-horizontal'),
      ('Gaji Karyawan', 'expense', 'Penggajian karyawan', '#ef4444', 'users'),
      ('Sewa Kantor', 'expense', 'Biaya sewa kantor/ruko', '#f59e0b', 'home'),
      ('Listrik & Internet', 'expense', 'Biaya listrik dan internet kantor', '#3b82f6', 'zap'),
      ('Marketing', 'expense', 'Biaya marketing dan promosi', '#8b5cf6', 'megaphone'),
      ('Operasional', 'expense', 'Biaya operasional lain-lain', '#6b7280', 'settings')
      ON CONFLICT (name) DO NOTHING
    `)

    // Create indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_accounting_transactions_type ON accounting_transactions(type)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_accounting_transactions_date ON accounting_transactions(date)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_accounting_transactions_category ON accounting_transactions(category_id)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_accounting_transactions_reference ON accounting_transactions(reference_type, reference_id)`)

    logger.info('Accounting tables created successfully')
  } catch (error) {
    logger.error('Error creating accounting tables:', error)
    throw error
  }
}

exports.down = async () => {
  try {
    logger.info('Dropping accounting tables...')

    await query(`DROP TABLE IF EXISTS accounting_transactions`)
    await query(`DROP TABLE IF EXISTS accounting_categories`)

    logger.info('Accounting tables dropped successfully')
  } catch (error) {
    logger.error('Error dropping accounting tables:', error)
    throw error
  }
}