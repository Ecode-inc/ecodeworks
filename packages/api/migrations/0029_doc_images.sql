-- Document images
CREATE TABLE IF NOT EXISTS doc_images (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  file_url TEXT NOT NULL,           -- R2 path
  file_name TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  mime_type TEXT DEFAULT 'image/jpeg',
  width INTEGER DEFAULT 0,
  height INTEGER DEFAULT 0,

  -- Tags (JSON array of strings)
  tags TEXT DEFAULT '[]',

  -- Person tags (JSON array of {name, confidence?})
  people TEXT DEFAULT '[]',

  -- AI description
  ai_description TEXT DEFAULT '',

  uploaded_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_doc_images_doc ON doc_images(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_images_org ON doc_images(org_id);
