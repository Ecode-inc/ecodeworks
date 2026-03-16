-- Safely recreate boards without CHECK constraint
-- Step 1: Disable FK temporarily and save all related data
PRAGMA foreign_keys = OFF;

-- Step 2: Save columns and tasks
CREATE TABLE IF NOT EXISTS _tmp_board_columns AS SELECT * FROM board_columns;
CREATE TABLE IF NOT EXISTS _tmp_tasks AS SELECT * FROM tasks;

-- Step 3: Drop dependent tables
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS board_columns;

-- Step 4: Recreate boards without CHECK
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

-- Step 5: Recreate board_columns
CREATE TABLE IF NOT EXISTS board_columns (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  order_index INTEGER DEFAULT 0,
  wip_limit INTEGER DEFAULT 0,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

INSERT INTO board_columns SELECT * FROM _tmp_board_columns;
DROP TABLE _tmp_board_columns;
CREATE INDEX IF NOT EXISTS idx_columns_board ON board_columns(board_id);

-- Step 6: Recreate tasks
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  column_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  assignee_id TEXT,
  priority TEXT DEFAULT 'medium',
  labels TEXT DEFAULT '[]',
  due_date TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (column_id) REFERENCES board_columns(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO tasks SELECT * FROM _tmp_tasks;
DROP TABLE _tmp_tasks;
CREATE INDEX IF NOT EXISTS idx_tasks_board ON tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(column_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);

PRAGMA foreign_keys = ON;
