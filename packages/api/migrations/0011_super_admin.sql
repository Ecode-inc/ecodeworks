-- Super admin users (platform-level, not org-level)
CREATE TABLE IF NOT EXISTS super_admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Organization subscription plans
CREATE TABLE IF NOT EXISTS org_subscriptions (
  org_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free', 'starter', 'business', 'enterprise')),
  max_users INTEGER DEFAULT 5,
  max_departments INTEGER DEFAULT 2,
  max_storage_mb INTEGER DEFAULT 100,
  features TEXT DEFAULT '[]',  -- JSON array of enabled features
  started_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- Platform audit log
CREATE TABLE IF NOT EXISTS platform_audit_log (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,  -- 'organization', 'subscription', 'super_admin'
  target_id TEXT,
  details TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (admin_id) REFERENCES super_admins(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_plan ON org_subscriptions(plan);
CREATE INDEX IF NOT EXISTS idx_platform_audit_admin ON platform_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_target ON platform_audit_log(target_type, target_id);
