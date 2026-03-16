-- Recreate boards table without restrictive CHECK constraint
CREATE TABLE IF NOT EXISTS boards_new (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  visibility TEXT DEFAULT 'department',
  created_by TEXT DEFAULT '',
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
);

INSERT INTO boards_new SELECT id, department_id, name, created_at, visibility, created_by FROM boards;

DROP TABLE boards;

ALTER TABLE boards_new RENAME TO boards;

CREATE INDEX IF NOT EXISTS idx_boards_dept ON boards(department_id);
