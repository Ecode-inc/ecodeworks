CREATE TABLE IF NOT EXISTS doc_files (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  mime_type TEXT DEFAULT '',
  uploaded_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_doc_files_doc ON doc_files(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_files_org ON doc_files(org_id);
