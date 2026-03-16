-- Leave/absence requests with approval workflow
CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,           -- applicant
  department_id TEXT,
  type TEXT NOT NULL CHECK(type IN ('vacation', 'half_day_am', 'half_day_pm', 'sick', 'special')),
  start_date TEXT NOT NULL,        -- YYYY-MM-DD
  end_date TEXT NOT NULL,          -- YYYY-MM-DD
  reason TEXT DEFAULT '',
  attachment_url TEXT DEFAULT '',   -- R2 file path
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
  is_deleted INTEGER DEFAULT 0,    -- soft delete (trash)

  -- Approval chain
  approver1_id TEXT,               -- department head
  approver1_status TEXT DEFAULT 'pending' CHECK(approver1_status IN ('pending', 'approved', 'rejected')),
  approver1_at TEXT,
  approver1_comment TEXT DEFAULT '',

  approver2_id TEXT,               -- CEO/대표
  approver2_status TEXT DEFAULT 'pending' CHECK(approver2_status IN ('pending', 'approved', 'rejected')),
  approver2_at TEXT,
  approver2_comment TEXT DEFAULT '',

  created_by TEXT NOT NULL,        -- who created (self, or dept head/CEO for manual)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (approver1_id) REFERENCES users(id),
  FOREIGN KEY (approver2_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_leave_org ON leave_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_leave_user ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_dept ON leave_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_dates ON leave_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_deleted ON leave_requests(is_deleted);
