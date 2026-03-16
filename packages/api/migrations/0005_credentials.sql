-- Credentials (password vault)
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  url TEXT DEFAULT '',
  username_enc TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  notes_enc TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Credential access log (audit)
CREATE TABLE IF NOT EXISTS credential_access_log (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('view', 'create', 'update', 'delete')),
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (credential_id) REFERENCES credentials(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credentials_dept ON credentials(department_id);
CREATE INDEX IF NOT EXISTS idx_credential_log_cred ON credential_access_log(credential_id);
CREATE INDEX IF NOT EXISTS idx_credential_log_user ON credential_access_log(user_id);
