CREATE TABLE IF NOT EXISTS billing_payment_cycle (
  payment_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES billing_order(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  subscription_id TEXT,
  due_date DATE,
  invoice_url TEXT,
  period_end TIMESTAMPTZ NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('overdue', 'confirmed', 'refunded', 'chargeback')),
  is_initial BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE billing_payment_cycle ADD COLUMN IF NOT EXISTS invoice_url TEXT;
ALTER TABLE billing_payment_cycle ALTER COLUMN subscription_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS billing_payment_cycle_user_period
  ON billing_payment_cycle (user_id, period_end DESC);

INSERT INTO billing_payment_cycle (payment_id, order_id, user_id, subscription_id,
  period_end, state, is_initial)
SELECT initial_payment_id, id, user_id, subscription_id, period_end,
  'confirmed', TRUE
FROM billing_order
WHERE status = 'paid' AND method = 'card' AND initial_payment_id IS NOT NULL
  AND subscription_id IS NOT NULL AND period_end IS NOT NULL
ON CONFLICT (payment_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS billing_payment_event (
  event_id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_payment_event_payment
  ON billing_payment_event (payment_id, received_at DESC);

CREATE TABLE IF NOT EXISTS billing_subscription_event (
  event_id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
