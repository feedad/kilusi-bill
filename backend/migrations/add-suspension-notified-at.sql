ALTER TABLE services ADD COLUMN IF NOT EXISTS suspension_notified_at TIMESTAMPTZ;
