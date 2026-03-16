-- Telegram chat connections (group or private)
CREATE TABLE IF NOT EXISTS telegram_chats (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  chat_id TEXT NOT NULL UNIQUE,  -- Telegram chat ID
  chat_type TEXT NOT NULL CHECK(chat_type IN ('private', 'group', 'supergroup')),
  chat_title TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- Telegram user <-> ecode user mapping
CREATE TABLE IF NOT EXISTS telegram_user_mappings (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  telegram_user_id TEXT NOT NULL,
  telegram_username TEXT DEFAULT '',
  telegram_display_name TEXT DEFAULT '',
  user_id TEXT,  -- mapped ecode user (nullable until mapped)
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(org_id, telegram_user_id)
);

-- Command history / audit log
CREATE TABLE IF NOT EXISTS telegram_command_log (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  telegram_user_id TEXT NOT NULL,
  user_id TEXT,  -- resolved ecode user
  command TEXT NOT NULL,
  args TEXT DEFAULT '',
  response_summary TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telegram_chats_org ON telegram_chats(org_id);
CREATE INDEX IF NOT EXISTS idx_telegram_mappings_org ON telegram_user_mappings(org_id);
CREATE INDEX IF NOT EXISTS idx_telegram_mappings_tg ON telegram_user_mappings(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_log_org ON telegram_command_log(org_id);
CREATE INDEX IF NOT EXISTS idx_telegram_log_chat ON telegram_command_log(chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_log_user ON telegram_command_log(telegram_user_id);
