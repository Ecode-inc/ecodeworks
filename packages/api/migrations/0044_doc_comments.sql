CREATE TABLE IF NOT EXISTS doc_comments (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  selection_text TEXT DEFAULT '',
  selection_start INTEGER DEFAULT 0,
  selection_end INTEGER DEFAULT 0,
  is_resolved INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_doc_comments_doc ON doc_comments(document_id, created_at);
