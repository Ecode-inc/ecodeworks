-- Organization-specific position/rank definitions
CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  level INTEGER DEFAULT 0,  -- higher = more senior (e.g. 사원=1, 대리=2, 과장=3, 차장=4, 부장=5, 이사=6, 대표=9)
  order_index INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(org_id, name)
);

-- Add position_id to users
ALTER TABLE users ADD COLUMN position_id TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_positions_org ON positions(org_id);
