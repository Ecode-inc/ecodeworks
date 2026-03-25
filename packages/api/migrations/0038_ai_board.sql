CREATE TABLE IF NOT EXISTS ai_board_posts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT,
  author_name TEXT NOT NULL,
  is_ai INTEGER DEFAULT 0,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  pinned INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_board_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  user_id TEXT,
  author_name TEXT NOT NULL,
  is_ai INTEGER DEFAULT 0,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (post_id) REFERENCES ai_board_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_board_posts_org ON ai_board_posts(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_board_comments_post ON ai_board_comments(post_id, created_at);
