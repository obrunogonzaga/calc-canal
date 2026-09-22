CREATE TABLE IF NOT EXISTS account_entitlement (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_product (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  product_cost DOUBLE PRECISION NOT NULL CHECK (product_cost >= 0),
  packaging DOUBLE PRECISION NOT NULL CHECK (packaging >= 0),
  seller_shipping DOUBLE PRECISION NOT NULL CHECK (seller_shipping >= 0),
  tax_percent DOUBLE PRECISION NOT NULL CHECK (tax_percent >= 0 AND tax_percent < 100),
  commission_percent DOUBLE PRECISION NOT NULL CHECK (commission_percent >= 0 AND commission_percent < 100),
  fixed_fee DOUBLE PRECISION NOT NULL CHECK (fixed_fee >= 0),
  desired_margin_percent DOUBLE PRECISION NOT NULL CHECK (desired_margin_percent >= 0 AND desired_margin_percent < 100),
  channel_id TEXT NOT NULL CHECK (channel_id IN ('mercado_livre', 'shopee', 'amazon_br', 'magalu')),
  tariff_mode TEXT NOT NULL CHECK (tariff_mode IN ('manual', 'ml_drop_off')),
  confirmed_drop_off BOOLEAN NOT NULL DEFAULT FALSE,
  current_price DOUBLE PRECISION CHECK (current_price > 0),
  evaluated_draft JSONB NOT NULL,
  evaluated_result JSONB NOT NULL,
  rule_version TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  free_selected BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    tariff_mode = 'manual'
    OR (channel_id = 'mercado_livre' AND confirmed_drop_off = TRUE)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_product_user_sku_unique
  ON catalog_product (user_id, LOWER(sku));

CREATE INDEX IF NOT EXISTS catalog_product_owner_active_updated
  ON catalog_product (user_id, archived_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS catalog_product_evaluation (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES catalog_product(id) ON DELETE CASCADE,
  product_version INTEGER NOT NULL CHECK (product_version > 0),
  evaluated_draft JSONB NOT NULL,
  evaluated_input JSONB NOT NULL,
  evaluated_result JSONB NOT NULL,
  rule_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, product_version)
);

CREATE OR REPLACE FUNCTION prevent_catalog_product_evaluation_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Catalog product evaluations are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_product_evaluation_immutable
  ON catalog_product_evaluation;

CREATE TRIGGER catalog_product_evaluation_immutable
  BEFORE UPDATE ON catalog_product_evaluation
  FOR EACH ROW
  EXECUTE FUNCTION prevent_catalog_product_evaluation_update();
