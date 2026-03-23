-- Add hire_date to users
ALTER TABLE users ADD COLUMN hire_date TEXT DEFAULT '';

-- Leave balance adjustments (for manual additions/deductions)
CREATE TABLE IF NOT EXISTS leave_balance_adjustments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('annual', 'bonus', 'deduction', 'carryover')),
  days REAL NOT NULL,  -- can be 0.5 for half days
  reason TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leave_balance_user ON leave_balance_adjustments(user_id, year);
