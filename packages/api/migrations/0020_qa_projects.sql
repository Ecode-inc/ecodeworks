-- QA project connections (replaces simple proxy approach)
CREATE TABLE IF NOT EXISTS qa_project_links (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  visibility TEXT DEFAULT 'company' CHECK(visibility IN ('company', 'department', 'personal')),
  department_id TEXT,          -- for department visibility
  created_by TEXT NOT NULL,    -- for personal visibility
  shared_with TEXT DEFAULT '[]', -- JSON array of user_ids for selective sharing
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Track which issues user has seen (for "new" badge)
CREATE TABLE IF NOT EXISTS qa_project_seen (
  user_id TEXT NOT NULL,
  project_link_id TEXT NOT NULL,
  last_seen_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, project_link_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_link_id) REFERENCES qa_project_links(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_qa_links_org ON qa_project_links(org_id);
CREATE INDEX IF NOT EXISTS idx_qa_links_dept ON qa_project_links(department_id);
CREATE INDEX IF NOT EXISTS idx_qa_links_visibility ON qa_project_links(visibility);
