CREATE TABLE IF NOT EXISTS auth_email_verification_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_email_verification_tokens_expires_at_idx
  ON auth_email_verification_tokens (expires_at);
