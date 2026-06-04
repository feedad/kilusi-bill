-- Add rollback tracking to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_rolled_back BOOLEAN DEFAULT FALSE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMP;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS rolled_back_by VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS rollback_reason TEXT;

-- Add index for rolled back payments
CREATE INDEX IF NOT EXISTS idx_payments_rolled_back ON payments(is_rolled_back);
