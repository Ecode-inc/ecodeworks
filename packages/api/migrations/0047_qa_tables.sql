-- QA Dashboard tables (integrated into ecode-internal)

CREATE TABLE IF NOT EXISTS qa_projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  order_index INTEGER DEFAULT 0,
  is_public INTEGER DEFAULT 0,
  public_token TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS qa_issues (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'todo',
  assignee_id TEXT,
  created_by_user_id TEXT,
  created_by_external TEXT,
  images TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES qa_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS qa_test_results (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL,
  user_id TEXT,
  external_name TEXT,
  result TEXT NOT NULL,
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (issue_id) REFERENCES qa_issues(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_qa_projects_org ON qa_projects(org_id);
CREATE INDEX IF NOT EXISTS idx_qa_projects_public_token ON qa_projects(public_token);
CREATE INDEX IF NOT EXISTS idx_qa_issues_project ON qa_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_qa_issues_status ON qa_issues(status);
CREATE INDEX IF NOT EXISTS idx_qa_issues_assignee ON qa_issues(assignee_id);
CREATE INDEX IF NOT EXISTS idx_qa_test_results_issue ON qa_test_results(issue_id);
