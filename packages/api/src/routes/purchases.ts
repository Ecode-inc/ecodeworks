import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const purchasesRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

purchasesRoutes.use('/*', authMiddleware)

// ──────────────────────────────────────────────────────────────
// Helper: get user's primary department
// ──────────────────────────────────────────────────────────────
async function getUserDepartment(db: D1Database, userId: string): Promise<{ department_id: string; role: string } | null> {
  const row = await db.prepare(
    'SELECT department_id, role FROM user_departments WHERE user_id = ? LIMIT 1'
  ).bind(userId).first<{ department_id: string; role: string }>()
  return row || null
}

// ──────────────────────────────────────────────────────────────
// Helper: check if user is dept head for a given department
// ──────────────────────────────────────────────────────────────
async function isDeptHead(db: D1Database, userId: string, deptId: string): Promise<boolean> {
  const row = await db.prepare(
    'SELECT role FROM user_departments WHERE user_id = ? AND department_id = ?'
  ).bind(userId, deptId).first<{ role: string }>()
  return row?.role === 'head'
}

// ══════════════════════════════════════════════════════════════
// Category management
// ══════════════════════════════════════════════════════════════

// GET /categories - list categories
purchasesRoutes.get('/categories', async (c) => {
  const user = c.get('user')

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM purchase_categories WHERE org_id = ? ORDER BY order_index, name'
  ).bind(user.org_id).all()

  return c.json({ categories: results })
})

// POST /categories - create category (CEO/admin only)
purchasesRoutes.post('/categories', async (c) => {
  const user = c.get('user')
  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'CEO 또는 관리자만 카테고리를 생성할 수 있습니다' }, 403)
  }

  const body = await c.req.json<{ name: string; color?: string }>()
  if (!body.name) {
    return c.json({ error: 'name은 필수입니다' }, 400)
  }

  const id = generateId()
  const maxOrder = await c.env.DB.prepare(
    'SELECT MAX(order_index) as max_order FROM purchase_categories WHERE org_id = ?'
  ).bind(user.org_id).first<{ max_order: number | null }>()

  await c.env.DB.prepare(
    'INSERT INTO purchase_categories (id, org_id, name, color, order_index) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, user.org_id, body.name, body.color || '#6B7280', (maxOrder?.max_order ?? -1) + 1).run()

  const category = await c.env.DB.prepare('SELECT * FROM purchase_categories WHERE id = ?').bind(id).first()
  return c.json({ category }, 201)
})

// POST /categories/seed - seed default categories (CEO/admin only)
purchasesRoutes.post('/categories/seed', async (c) => {
  const user = c.get('user')
  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'CEO 또는 관리자만 기본 카테고리를 생성할 수 있습니다' }, 403)
  }

  const defaults = [
    { name: '사무용품', color: '#3B82F6' },
    { name: '식음료', color: '#10B981' },
    { name: 'IT장비', color: '#8B5CF6' },
    { name: '생활용품', color: '#F59E0B' },
    { name: '기타', color: '#6B7280' },
  ]

  const statements = defaults.map((cat, i) =>
    c.env.DB.prepare(
      'INSERT OR IGNORE INTO purchase_categories (id, org_id, name, color, order_index) VALUES (?, ?, ?, ?, ?)'
    ).bind(generateId(), user.org_id, cat.name, cat.color, i)
  )

  await c.env.DB.batch(statements)

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM purchase_categories WHERE org_id = ? ORDER BY order_index'
  ).bind(user.org_id).all()

  return c.json({ categories: results }, 201)
})

// ══════════════════════════════════════════════════════════════
// Purchase CRUD
// ══════════════════════════════════════════════════════════════

// GET /pending-count - count of requested purchases (for sidebar badge)
purchasesRoutes.get('/pending-count', async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM purchases WHERE org_id = ? AND status = 'requested' AND is_deleted = 0"
  ).bind(user.org_id).first<{ cnt: number }>()
  return c.json({ count: row?.cnt || 0 })
})

// POST / - create purchase request
purchasesRoutes.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{
    item_name: string
    item_url?: string
    quantity?: number
    unit_price?: number
    category_id?: string
    note?: string
    requester_id?: string
    source?: string
  }>()

  if (!body.item_name) {
    return c.json({ error: 'item_name은 필수입니다' }, 400)
  }

  const requesterId = body.requester_id || user.id
  const quantity = body.quantity || 1
  const unitPrice = body.unit_price || 0
  const totalPrice = quantity * unitPrice

  // Auto-detect department
  const dept = await getUserDepartment(c.env.DB, requesterId)
  const departmentId = dept?.department_id || null

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO purchases (
      id, org_id, requester_id, department_id, category_id,
      item_name, item_url, quantity, unit_price, total_price,
      note, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, user.org_id, requesterId, departmentId, body.category_id || null,
    body.item_name, body.item_url || '', quantity, unitPrice, totalPrice,
    body.note || '', body.source || 'web'
  ).run()

  const purchase = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first()
  return c.json({ purchase }, 201)
})

// GET / - list purchases
purchasesRoutes.get('/', async (c) => {
  const user = c.get('user')
  const status = c.req.query('status')
  const requesterId = c.req.query('requester_id')
  const deptId = c.req.query('dept_id')
  const categoryId = c.req.query('category_id')
  const month = c.req.query('month')
  const includeDeleted = c.req.query('include_deleted')

  let query = `
    SELECT p.*, u.name as requester_name, u.email as requester_email,
      pc.name as category_name, pc.color as category_color,
      d.name as department_name,
      a.name as approved_by_name
    FROM purchases p
    JOIN users u ON u.id = p.requester_id
    LEFT JOIN purchase_categories pc ON pc.id = p.category_id
    LEFT JOIN departments d ON d.id = p.department_id
    LEFT JOIN users a ON a.id = p.approved_by
    WHERE p.org_id = ?`
  const params: unknown[] = [user.org_id]

  // Soft delete filter
  if (includeDeleted !== '1') {
    query += ' AND p.is_deleted = 0'
  }

  // Visibility: regular user sees own + dept purchases, CEO/admin sees all
  if (!user.is_ceo && !user.is_admin) {
    const userDept = await getUserDepartment(c.env.DB, user.id)
    if (userDept && userDept.role === 'head') {
      query += ' AND (p.requester_id = ? OR p.department_id = ?)'
      params.push(user.id, userDept.department_id)
    } else {
      query += ' AND (p.requester_id = ? OR p.department_id = ?)'
      params.push(user.id, userDept?.department_id || '')
    }
  }

  if (status) {
    query += ' AND p.status = ?'
    params.push(status)
  }

  if (requesterId) {
    query += ' AND p.requester_id = ?'
    params.push(requesterId)
  }

  if (deptId) {
    query += ' AND p.department_id = ?'
    params.push(deptId)
  }

  if (categoryId) {
    query += ' AND p.category_id = ?'
    params.push(categoryId)
  }

  if (month) {
    query += " AND p.created_at >= ? AND p.created_at < ?"
    params.push(`${month}-01`, `${month}-31 23:59:59`)
  }

  query += ' ORDER BY p.created_at DESC LIMIT 200'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ purchases: results })
})

// GET /stats - monthly statistics
purchasesRoutes.get('/stats', async (c) => {
  const user = c.get('user')
  const month = c.req.query('month') || new Date().toISOString().slice(0, 7)
  const deptId = c.req.query('dept_id')

  let baseWhere = 'WHERE p.org_id = ? AND p.is_deleted = 0 AND p.created_at >= ? AND p.created_at < ?'
  const baseParams: unknown[] = [user.org_id, `${month}-01`, `${month}-31 23:59:59`]

  if (deptId) {
    baseWhere += ' AND p.department_id = ?'
    baseParams.push(deptId)
  }

  // Total
  const total = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(p.total_price), 0) as total_amount, COUNT(*) as total_count
    FROM purchases p ${baseWhere}
  `).bind(...baseParams).first<{ total_amount: number; total_count: number }>()

  // By category
  const { results: byCategory } = await c.env.DB.prepare(`
    SELECT pc.name, COALESCE(SUM(p.total_price), 0) as amount, COUNT(*) as count
    FROM purchases p
    LEFT JOIN purchase_categories pc ON pc.id = p.category_id
    ${baseWhere}
    GROUP BY p.category_id
    ORDER BY amount DESC
  `).bind(...baseParams).all()

  // By department
  const { results: byDepartment } = await c.env.DB.prepare(`
    SELECT d.name, COALESCE(SUM(p.total_price), 0) as amount, COUNT(*) as count
    FROM purchases p
    LEFT JOIN departments d ON d.id = p.department_id
    ${baseWhere}
    GROUP BY p.department_id
    ORDER BY amount DESC
  `).bind(...baseParams).all()

  // By requester
  const { results: byRequester } = await c.env.DB.prepare(`
    SELECT u.name, COALESCE(SUM(p.total_price), 0) as amount, COUNT(*) as count
    FROM purchases p
    JOIN users u ON u.id = p.requester_id
    ${baseWhere}
    GROUP BY p.requester_id
    ORDER BY amount DESC
  `).bind(...baseParams).all()

  return c.json({
    month,
    total_amount: total?.total_amount || 0,
    total_count: total?.total_count || 0,
    by_category: byCategory,
    by_department: byDepartment,
    by_requester: byRequester,
  })
})

// POST /batch - batch create purchases
purchasesRoutes.post('/batch', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{
    items: Array<{
      item_name: string
      item_url?: string
      quantity?: number
      unit_price?: number
      category_id?: string
    }>
    requester_id?: string
    note?: string
  }>()

  if (!body.items || body.items.length === 0) {
    return c.json({ error: 'items 배열은 필수입니다' }, 400)
  }

  const requesterId = body.requester_id || user.id
  const dept = await getUserDepartment(c.env.DB, requesterId)
  const departmentId = dept?.department_id || null

  const ids: string[] = []
  const statements = body.items.map(item => {
    const id = generateId()
    ids.push(id)
    const quantity = item.quantity || 1
    const unitPrice = item.unit_price || 0
    const totalPrice = quantity * unitPrice

    return c.env.DB.prepare(`
      INSERT INTO purchases (
        id, org_id, requester_id, department_id, category_id,
        item_name, item_url, quantity, unit_price, total_price,
        note, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'telegram', datetime('now'), datetime('now'))
    `).bind(
      id, user.org_id, requesterId, departmentId, item.category_id || null,
      item.item_name, item.item_url || '', quantity, unitPrice, totalPrice,
      body.note || ''
    )
  })

  await c.env.DB.batch(statements)

  const placeholders = ids.map(() => '?').join(',')
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM purchases WHERE id IN (${placeholders})`
  ).bind(...ids).all()

  return c.json({ purchases: results }, 201)
})

// GET /:id - single purchase detail
purchasesRoutes.get('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const purchase = await c.env.DB.prepare(`
    SELECT p.*, u.name as requester_name, u.email as requester_email,
      pc.name as category_name, pc.color as category_color,
      d.name as department_name,
      a.name as approved_by_name
    FROM purchases p
    JOIN users u ON u.id = p.requester_id
    LEFT JOIN purchase_categories pc ON pc.id = p.category_id
    LEFT JOIN departments d ON d.id = p.department_id
    LEFT JOIN users a ON a.id = p.approved_by
    WHERE p.id = ? AND p.org_id = ?
  `).bind(id, user.org_id).first()

  if (!purchase) {
    return c.json({ error: '구매 요청을 찾을 수 없습니다' }, 404)
  }

  return c.json({ purchase })
})

// PATCH /:id - update purchase (only if requested/approved, by requester or admin)
purchasesRoutes.patch('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const purchase = await c.env.DB.prepare(
    'SELECT * FROM purchases WHERE id = ? AND org_id = ?'
  ).bind(id, user.org_id).first<{
    id: string; status: string; requester_id: string
  }>()

  if (!purchase) {
    return c.json({ error: '구매 요청을 찾을 수 없습니다' }, 404)
  }

  if (purchase.status !== 'requested' && purchase.status !== 'approved') {
    return c.json({ error: '요청/승인 상태에서만 수정할 수 있습니다' }, 400)
  }

  if (purchase.requester_id !== user.id && !user.is_ceo && !user.is_admin) {
    return c.json({ error: '수정 권한이 없습니다' }, 403)
  }

  const body = await c.req.json<{
    item_name?: string
    item_url?: string
    quantity?: number
    unit_price?: number
    category_id?: string
    note?: string
  }>()

  const updates: string[] = []
  const values: unknown[] = []

  if (body.item_name) { updates.push('item_name = ?'); values.push(body.item_name) }
  if (body.item_url !== undefined) { updates.push('item_url = ?'); values.push(body.item_url) }
  if (body.category_id !== undefined) { updates.push('category_id = ?'); values.push(body.category_id || null) }
  if (body.note !== undefined) { updates.push('note = ?'); values.push(body.note) }

  // Recalculate total_price if quantity or unit_price changed
  if (body.quantity !== undefined || body.unit_price !== undefined) {
    const existingFull = await c.env.DB.prepare('SELECT quantity, unit_price FROM purchases WHERE id = ?').bind(id).first<{ quantity: number; unit_price: number }>()
    const newQuantity = body.quantity !== undefined ? body.quantity : (existingFull?.quantity || 1)
    const newUnitPrice = body.unit_price !== undefined ? body.unit_price : (existingFull?.unit_price || 0)
    if (body.quantity !== undefined) { updates.push('quantity = ?'); values.push(newQuantity) }
    if (body.unit_price !== undefined) { updates.push('unit_price = ?'); values.push(newUnitPrice) }
    updates.push('total_price = ?'); values.push(newQuantity * newUnitPrice)
  }

  if (updates.length === 0) {
    return c.json({ error: '수정할 항목이 없습니다' }, 400)
  }

  updates.push("updated_at = datetime('now')")
  values.push(id, user.org_id)

  await c.env.DB.prepare(
    `UPDATE purchases SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`
  ).bind(...values).run()

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first()
  return c.json({ purchase: updated })
})

// ══════════════════════════════════════════════════════════════
// Status transitions
// ══════════════════════════════════════════════════════════════

// POST /:id/approve - approve (CEO/admin/dept head)
purchasesRoutes.post('/:id/approve', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const purchase = await c.env.DB.prepare(
    'SELECT * FROM purchases WHERE id = ? AND org_id = ? AND is_deleted = 0'
  ).bind(id, user.org_id).first<{ id: string; status: string; department_id: string | null }>()

  if (!purchase) return c.json({ error: '구매 요청을 찾을 수 없습니다' }, 404)
  if (purchase.status !== 'requested') return c.json({ error: '요청 상태에서만 승인할 수 있습니다' }, 400)

  // Check permissions: CEO, admin, or dept head of purchase's department
  let canApprove = user.is_ceo || user.is_admin
  if (!canApprove && purchase.department_id) {
    canApprove = await isDeptHead(c.env.DB, user.id, purchase.department_id)
  }
  if (!canApprove) return c.json({ error: '승인 권한이 없습니다' }, 403)

  const now = new Date().toISOString()
  await c.env.DB.prepare(
    "UPDATE purchases SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(user.id, now, id).run()

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first()
  return c.json({ purchase: updated })
})

// POST /:id/reject - reject with comment
purchasesRoutes.post('/:id/reject', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const body = await c.req.json<{ comment?: string }>().catch(() => ({}))
  const comment = (body as { comment?: string }).comment || ''

  const purchase = await c.env.DB.prepare(
    'SELECT * FROM purchases WHERE id = ? AND org_id = ? AND is_deleted = 0'
  ).bind(id, user.org_id).first<{ id: string; status: string; department_id: string | null }>()

  if (!purchase) return c.json({ error: '구매 요청을 찾을 수 없습니다' }, 404)
  if (purchase.status !== 'requested') return c.json({ error: '요청 상태에서만 반려할 수 있습니다' }, 400)

  let canReject = user.is_ceo || user.is_admin
  if (!canReject && purchase.department_id) {
    canReject = await isDeptHead(c.env.DB, user.id, purchase.department_id)
  }
  if (!canReject) return c.json({ error: '반려 권한이 없습니다' }, 403)

  await c.env.DB.prepare(
    "UPDATE purchases SET status = 'cancelled', note = CASE WHEN note = '' THEN ? ELSE note || ' | 반려: ' || ? END, approved_by = ?, approved_at = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(comment, comment, user.id, new Date().toISOString(), id).run()

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first()
  return c.json({ purchase: updated })
})

// POST /:id/order - mark as ordered
purchasesRoutes.post('/:id/order', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const purchase = await c.env.DB.prepare(
    'SELECT * FROM purchases WHERE id = ? AND org_id = ? AND is_deleted = 0'
  ).bind(id, user.org_id).first<{ id: string; status: string }>()

  if (!purchase) return c.json({ error: '구매 요청을 찾을 수 없습니다' }, 404)
  if (purchase.status !== 'approved') return c.json({ error: '승인 상태에서만 주문 처리할 수 있습니다' }, 400)

  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: '주문 처리 권한이 없습니다' }, 403)
  }

  await c.env.DB.prepare(
    "UPDATE purchases SET status = 'ordered', ordered_at = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(new Date().toISOString(), id).run()

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first()
  return c.json({ purchase: updated })
})

// POST /:id/deliver - mark as delivered
purchasesRoutes.post('/:id/deliver', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const purchase = await c.env.DB.prepare(
    'SELECT * FROM purchases WHERE id = ? AND org_id = ? AND is_deleted = 0'
  ).bind(id, user.org_id).first<{ id: string; status: string }>()

  if (!purchase) return c.json({ error: '구매 요청을 찾을 수 없습니다' }, 404)
  if (purchase.status !== 'ordered') return c.json({ error: '주문 상태에서만 수령 처리할 수 있습니다' }, 400)

  await c.env.DB.prepare(
    "UPDATE purchases SET status = 'delivered', delivered_at = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(new Date().toISOString(), id).run()

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first()
  return c.json({ purchase: updated })
})

// POST /:id/return - mark as returned
purchasesRoutes.post('/:id/return', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const purchase = await c.env.DB.prepare(
    'SELECT * FROM purchases WHERE id = ? AND org_id = ? AND is_deleted = 0'
  ).bind(id, user.org_id).first<{ id: string; status: string }>()

  if (!purchase) return c.json({ error: '구매 요청을 찾을 수 없습니다' }, 404)
  if (purchase.status !== 'delivered') return c.json({ error: '수령 상태에서만 반품 처리할 수 있습니다' }, 400)

  await c.env.DB.prepare(
    "UPDATE purchases SET status = 'returned', updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run()

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first()
  return c.json({ purchase: updated })
})

// POST /:id/cancel - cancel
purchasesRoutes.post('/:id/cancel', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const purchase = await c.env.DB.prepare(
    'SELECT * FROM purchases WHERE id = ? AND org_id = ? AND is_deleted = 0'
  ).bind(id, user.org_id).first<{ id: string; status: string; requester_id: string }>()

  if (!purchase) return c.json({ error: '구매 요청을 찾을 수 없습니다' }, 404)
  if (purchase.status === 'cancelled') return c.json({ error: '이미 취소된 요청입니다' }, 400)

  if (purchase.requester_id !== user.id && !user.is_ceo && !user.is_admin) {
    return c.json({ error: '취소 권한이 없습니다' }, 403)
  }

  await c.env.DB.prepare(
    "UPDATE purchases SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run()

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first()
  return c.json({ purchase: updated })
})

// POST /:id/delete - soft delete
purchasesRoutes.post('/:id/delete', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const purchase = await c.env.DB.prepare(
    'SELECT * FROM purchases WHERE id = ? AND org_id = ?'
  ).bind(id, user.org_id).first<{ id: string; requester_id: string }>()

  if (!purchase) return c.json({ error: '구매 요청을 찾을 수 없습니다' }, 404)

  if (purchase.requester_id !== user.id && !user.is_ceo && !user.is_admin) {
    return c.json({ error: '삭제 권한이 없습니다' }, 403)
  }

  await c.env.DB.prepare(
    "UPDATE purchases SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run()

  return c.json({ success: true })
})
