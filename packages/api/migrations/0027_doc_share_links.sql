CREATE TABLE IF NOT EXISTS doc_share_links (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  share_type TEXT NOT NULL CHECK(share_type IN ('external', 'internal')),
  -- External: accessible via token without login
  token TEXT UNIQUE,              -- random token for external links
  expires_at TEXT,                -- null = no expiry
  -- Internal: accessible to specific users/depts within org
  internal_scope TEXT DEFAULT 'company',  -- 'company', 'department', 'users'
  internal_target_ids TEXT DEFAULT '[]',  -- JSON: dept IDs or user IDs depending on scope
  created_by TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_doc_share_token ON doc_share_links(token);
CREATE INDEX IF NOT EXISTS idx_doc_share_doc ON doc_share_links(document_id);
