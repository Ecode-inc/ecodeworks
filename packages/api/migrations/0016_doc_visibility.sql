-- Add visibility to documents
ALTER TABLE documents ADD COLUMN visibility TEXT DEFAULT 'department' CHECK(visibility IN ('company', 'department', 'personal'));
ALTER TABLE documents ADD COLUMN shared INTEGER DEFAULT 0;  -- 1 = shared/public within org even if department-scoped

-- Add visibility to boards (kanban)
ALTER TABLE boards ADD COLUMN visibility TEXT DEFAULT 'department' CHECK(visibility IN ('company', 'department'));

-- Add visibility to credentials (vault)
ALTER TABLE credentials ADD COLUMN visibility TEXT DEFAULT 'department' CHECK(visibility IN ('company', 'department'));
