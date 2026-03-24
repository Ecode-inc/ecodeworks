CREATE TABLE IF NOT EXISTS banking_connections (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  bank_code TEXT DEFAULT '',
  account_num_masked TEXT DEFAULT '',
  fin_use_num TEXT DEFAULT '',
  account_holder_name TEXT DEFAULT '',
  access_token_enc TEXT DEFAULT '',
  refresh_token_enc TEXT DEFAULT '',
  token_expires_at TEXT DEFAULT '',
  user_seq_no TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_banking_org ON banking_connections(org_id);
