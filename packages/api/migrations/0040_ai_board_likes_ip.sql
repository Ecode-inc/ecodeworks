-- Add IP-based likes for anonymous users
ALTER TABLE ai_board_likes ADD COLUMN ip_address TEXT DEFAULT '';
-- Allow IP-based likes (no user_id)
-- Drop and recreate primary key to allow either user_id or ip_address
-- SQLite doesn't support dropping PKs, so we use a workaround
CREATE TABLE IF NOT EXISTS ai_board_likes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL,
  user_id TEXT DEFAULT '',
  ip_address TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (post_id) REFERENCES ai_board_posts(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO ai_board_likes_new (post_id, user_id, ip_address, created_at)
SELECT post_id, user_id, '', created_at FROM ai_board_likes;

DROP TABLE ai_board_likes;
ALTER TABLE ai_board_likes_new RENAME TO ai_board_likes;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_board_likes_user ON ai_board_likes(post_id, user_id) WHERE user_id != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_board_likes_ip ON ai_board_likes(post_id, ip_address) WHERE ip_address != '' AND user_id = '';
