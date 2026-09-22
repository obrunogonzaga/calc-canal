CREATE TABLE IF NOT EXISTS billing_order (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  external_reference TEXT NOT NULL UNIQUE,
  method TEXT NOT NULL CHECK (method IN ('card')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents = 2990),
  currency TEXT NOT NULL CHECK (currency = 'BRL'),
  status TEXT NOT NULL CHECK (status IN ('creating', 'checkout_created', 'paid', 'failed')),
  checkout_id TEXT UNIQUE,
  checkout_link TEXT,
  checkout_expires_at TIMESTAMPTZ NOT NULL,
  provider_status TEXT,
  subscription_id TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_order_one_open_checkout_per_user
  ON billing_order (user_id)
  WHERE status IN ('creating', 'checkout_created');

CREATE INDEX IF NOT EXISTS billing_order_owner_created
  ON billing_order (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_webhook_event (
  event_id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES billing_order(id) ON DELETE SET NULL,
  checkout_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS billing_webhook_event_order
  ON billing_webhook_event (order_id, received_at DESC);
