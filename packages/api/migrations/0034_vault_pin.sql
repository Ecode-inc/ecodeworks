-- Vault PIN system: personal PIN for credential access
ALTER TABLE users ADD COLUMN vault_pin_hash TEXT DEFAULT '';

-- Vault sessions: temporary tokens for PIN-verified access
CREATE TABLE IF NOT EXISTS vault_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
