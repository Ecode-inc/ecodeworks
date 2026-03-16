CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  department_id TEXT,
  date TEXT NOT NULL,  -- YYYY-MM-DD
  clock_in TEXT,       -- ISO datetime
  clock_out TEXT,      -- ISO datetime
  clock_in_source TEXT DEFAULT 'web',   -- 'web', 'telegram', 'api'
  clock_out_source TEXT DEFAULT 'web',
  status TEXT DEFAULT 'present' CHECK(status IN ('present', 'late', 'half_day', 'absent', 'remote', 'vacation')),
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(org_id, user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_org ON attendance_records(org_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_attendance_dept ON attendance_records(department_id);
