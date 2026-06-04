-- Add target_mitra column to broadcast_messages
-- Run: psql -U kilusi_user -d kilusi_bill -f backend/migrations/add-broadcast-target-mitra.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'broadcast_messages' AND column_name = 'target_mitra') THEN
        ALTER TABLE broadcast_messages ADD COLUMN target_mitra JSONB;
    END IF;
END $$;
