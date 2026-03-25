-- Per-user like tracking for AI board posts
CREATE TABLE IF NOT EXISTS ai_board_likes (
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES ai_board_posts(id) ON DELETE CASCADE
);
