-- Create mitra settlement tables and accounting categories
-- Run: psql -U kilusi_user -d kilusi_bill -f backend/migrations/create-mitra-settlement-tables.sql

CREATE TABLE IF NOT EXISTS mitra_settlements (
    id SERIAL PRIMARY KEY,
    settlement_number VARCHAR(50) UNIQUE NOT NULL,
    mitra_id UUID NOT NULL REFERENCES mitra(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    settlement_date DATE NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'transfer',
    bank_account_source VARCHAR(100),
    notes TEXT,
    status VARCHAR(20) DEFAULT 'completed', -- 'completed', 'cancelled'
    pusat_transaction_id INTEGER REFERENCES accounting_transactions(id) ON DELETE SET NULL,
    mitra_transaction_id INTEGER REFERENCES accounting_transactions(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mitra_settlements_mitra_id ON mitra_settlements(mitra_id);
CREATE INDEX IF NOT EXISTS idx_mitra_settlements_period ON mitra_settlements(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_mitra_settlements_date ON mitra_settlements(settlement_date);
CREATE INDEX IF NOT EXISTS idx_mitra_settlements_status ON mitra_settlements(status);

CREATE TABLE IF NOT EXISTS mitra_settlement_items (
    id SERIAL PRIMARY KEY,
    settlement_id INTEGER NOT NULL REFERENCES mitra_settlements(id) ON DELETE CASCADE,
    payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(settlement_id, payment_id)
);

CREATE INDEX IF NOT EXISTS idx_mitra_settlement_items_settlement ON mitra_settlement_items(settlement_id);
CREATE INDEX IF NOT EXISTS idx_mitra_settlement_items_payment ON mitra_settlement_items(payment_id);

-- Ensure accounting categories exist
INSERT INTO accounting_categories (name, type, description, color, icon, is_active)
SELECT 'Penyetoran Mitra', 'expense', 'Pengeluaran Pusat untuk penyetoran bagi hasil ke Mitra', '#ef4444', 'arrow-up-right', true
WHERE NOT EXISTS (SELECT 1 FROM accounting_categories WHERE name = 'Penyetoran Mitra' AND type = 'expense');

INSERT INTO accounting_categories (name, type, description, color, icon, is_active)
SELECT 'Penyetoran dari Pusat', 'revenue', 'Pemasukan Mitra dari hasil penyetoran Pusat', '#10b981', 'arrow-down-left', true
WHERE NOT EXISTS (SELECT 1 FROM accounting_categories WHERE name = 'Penyetoran dari Pusat' AND type = 'revenue');
