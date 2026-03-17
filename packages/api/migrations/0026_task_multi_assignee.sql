-- Task assignees junction table (replaces single assignee_id)
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (task_id, user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);

-- Migrate existing assignee_id data to junction table
INSERT OR IGNORE INTO task_assignees (task_id, user_id)
SELECT id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL AND assignee_id != '';
