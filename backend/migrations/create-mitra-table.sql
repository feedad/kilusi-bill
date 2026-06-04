-- Create mitra table for partner/agent management
-- Run: psql -U kilusi_user -d kilusi_bill -f backend/migrations/create-mitra-table.sql

CREATE TABLE IF NOT EXISTS mitra (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    notes TEXT,
    disabled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add mitra_id to regions if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'regions' AND column_name = 'mitra_id') THEN
        ALTER TABLE regions ADD COLUMN mitra_id UUID REFERENCES mitra(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_mitra_name ON mitra(name);
CREATE INDEX IF NOT EXISTS idx_mitra_active ON mitra(disabled_at) WHERE disabled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_regions_mitra_id ON regions(mitra_id);
