CREATE TABLE IF NOT EXISTS disciplines (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  reason TEXT DEFAULT '',
  amount REAL DEFAULT 0,
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_disciplines_user ON disciplines(org_id, user_id, created_at);
