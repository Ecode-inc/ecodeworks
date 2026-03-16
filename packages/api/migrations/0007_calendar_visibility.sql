-- Add visibility column to events table
ALTER TABLE events ADD COLUMN visibility TEXT NOT NULL DEFAULT 'department' CHECK(visibility IN ('personal', 'department', 'company', 'shared'));

-- Shared targets for selective sharing
CREATE TABLE IF NOT EXISTS event_shared_targets (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('user', 'executives')),
  target_id TEXT, -- user_id when target_type='user', NULL when target_type='executives'
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_shared_targets_event ON event_shared_targets(event_id);
CREATE INDEX IF NOT EXISTS idx_event_shared_targets_target ON event_shared_targets(target_id);
CREATE INDEX IF NOT EXISTS idx_events_visibility ON events(visibility);
