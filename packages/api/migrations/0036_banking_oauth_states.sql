-- Banking OAuth state temporary storage
CREATE TABLE IF NOT EXISTS banking_oauth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
