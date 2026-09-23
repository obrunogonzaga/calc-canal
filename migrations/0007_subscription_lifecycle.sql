ALTER TABLE billing_order
  ADD COLUMN IF NOT EXISTS subscription_reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS initial_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_state TEXT NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_confirmed_at TIMESTAMPTZ;

ALTER TABLE billing_order
  DROP CONSTRAINT IF EXISTS billing_order_cancellation_state_check;

ALTER TABLE billing_order
  ADD CONSTRAINT billing_order_cancellation_state_check
  CHECK (cancellation_state IN ('not_requested', 'requested', 'unknown', 'confirmed'));

CREATE UNIQUE INDEX IF NOT EXISTS billing_order_subscription_unique
  ON billing_order (subscription_id)
  WHERE subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_order_initial_payment_unique
  ON billing_order (initial_payment_id)
  WHERE initial_payment_id IS NOT NULL;
