-- Add unique_code and amount_with_code columns to invoices
-- Run: psql -U kilusi_user -d kilusi_bill -f backend/migrations/add-unique-code.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'unique_code') THEN
        ALTER TABLE invoices ADD COLUMN unique_code INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'amount_with_code') THEN
        ALTER TABLE invoices ADD COLUMN amount_with_code BIGINT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_unique_code ON invoices(unique_code) WHERE unique_code IS NOT NULL;
