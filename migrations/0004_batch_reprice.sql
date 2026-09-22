CREATE TABLE IF NOT EXISTS catalog_batch_reprice_preview (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  changes JSONB NOT NULL,
  rows JSONB NOT NULL,
  valid_count INTEGER NOT NULL CHECK (valid_count >= 0 AND valid_count <= 500),
  invalid_count INTEGER NOT NULL CHECK (invalid_count >= 0 AND invalid_count <= 500),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  confirmation_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_batch_reprice_preview_row_count_check
    CHECK (valid_count + invalid_count BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS catalog_batch_reprice_preview_owner_expires
  ON catalog_batch_reprice_preview (user_id, expires_at DESC);
