ALTER TABLE departments ADD COLUMN parent_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_id);
