-- Add autopay columns to invoices table
-- Run: psql -U kilusi_user -d kilusi_bill -f backend/migrations/add-autopay-columns.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'autopay_amount') THEN
        ALTER TABLE invoices ADD COLUMN autopay_amount INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'autopay_unique_code') THEN
        ALTER TABLE invoices ADD COLUMN autopay_unique_code INTEGER;
    END IF;
END $$;
