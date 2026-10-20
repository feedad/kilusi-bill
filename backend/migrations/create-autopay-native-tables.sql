-- Migration: Create bank_mutations and autopay_devices tables for native Autopay integration

CREATE TABLE IF NOT EXISTS bank_mutations (
    id SERIAL PRIMARY KEY,
    bank_id INTEGER,
    amount NUMERIC(15, 2) NOT NULL,
    type VARCHAR(10) NOT NULL DEFAULT 'CR',
    source_type VARCHAR(20) NOT NULL DEFAULT 'MOBILE',
    description TEXT,
    sender_info TEXT,
    raw_content TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    matched_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    matched_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_mutations_status ON bank_mutations(status);
CREATE INDEX IF NOT EXISTS idx_bank_mutations_amount ON bank_mutations(amount);
CREATE INDEX IF NOT EXISTS idx_bank_mutations_matched_invoice_id ON bank_mutations(matched_invoice_id);
CREATE INDEX IF NOT EXISTS idx_bank_mutations_created_at ON bank_mutations(created_at DESC);

CREATE TABLE IF NOT EXISTS autopay_devices (
    id SERIAL PRIMARY KEY,
    device_name VARCHAR(100) NOT NULL,
    api_key VARCHAR(100) UNIQUE NOT NULL,
    secret VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autopay_devices_api_key ON autopay_devices(api_key);
