-- Add manual_payment_details column to payment_transactions table
-- This stores the payment method details for manual payments (bank accounts, e-wallets, cash)

ALTER TABLE payment_transactions
ADD COLUMN IF NOT EXISTS manual_payment_details JSONB,
ADD COLUMN IF NOT EXISTS is_manual_payment BOOLEAN DEFAULT false;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_payment_transactions_manual ON payment_transactions(is_manual_payment);

-- Drop and recreate status constraint to include pending_verification
ALTER TABLE payment_transactions
DROP CONSTRAINT IF EXISTS chk_payment_status;

ALTER TABLE payment_transactions
ADD CONSTRAINT chk_payment_status
CHECK (status::text = ANY (ARRAY[
  'pending'::character varying,
  'pending_verification'::character varying,
  'paid'::character varying,
  'failed'::character varying,
  'expired'::character varying,
  'cancelled'::character varying,
  'refunded'::character varying
]::text[]));

-- Comment
COMMENT ON COLUMN payment_transactions.manual_payment_details IS 'Stores payment details for manual methods (bank transfer, e-wallet, cash) from payment_settings';
COMMENT ON COLUMN payment_transactions.is_manual_payment IS 'Indicates whether this is a manual payment (requires proof upload)';
