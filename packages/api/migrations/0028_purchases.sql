-- Purchase categories
CREATE TABLE IF NOT EXISTS purchase_categories (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  order_index INTEGER DEFAULT 0,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(org_id, name)
);

-- Purchase requests
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  department_id TEXT,
  category_id TEXT,

  -- Item details
  item_name TEXT NOT NULL,
  item_url TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  unit_price INTEGER DEFAULT 0,         -- in KRW (원)
  total_price INTEGER DEFAULT 0,        -- quantity * unit_price

  -- Status workflow
  status TEXT DEFAULT 'requested' CHECK(status IN ('requested', 'approved', 'ordered', 'delivered', 'returned', 'cancelled')),

  -- Approval
  approved_by TEXT,
  approved_at TEXT,

  -- Order details
  ordered_at TEXT,
  delivered_at TEXT,

  note TEXT DEFAULT '',
  source TEXT DEFAULT 'web',             -- 'web', 'telegram'

  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (requester_id) REFERENCES users(id),
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (category_id) REFERENCES purchase_categories(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_purchases_org ON purchases(org_id);
CREATE INDEX IF NOT EXISTS idx_purchases_requester ON purchases(requester_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);
CREATE INDEX IF NOT EXISTS idx_purchases_dept ON purchases(department_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(created_at);
CREATE INDEX IF NOT EXISTS idx_purchases_deleted ON purchases(is_deleted);
