import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const boardsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

boardsRoutes.use('/*', authMiddleware)

// List boards
boardsRoutes.get('/', async (c) => {
  const user = c.get('user')
  const deptId = c.req.query('dept_id')

  let query = 'SELECT * FROM boards WHERE 1=1'
  const params: unknown[] = []

  // Visibility filtering (CEO sees everything)
  if (!user.is_ceo) {
    query += ` AND (
      visibility = 'company'
      OR (visibility = 'department' AND department_id IN (SELECT department_id FROM user_departments WHERE user_id = ?))
      OR (visibility = 'personal' AND created_by = ?)
    )`
    params.push(user.id, user.id)
  }

  if (deptId) {
    query += ' AND department_id = ?'
    params.push(deptId)
  }

  query += ' ORDER BY created_at DESC'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ boards: results })
})

// Get board with columns and tasks
boardsRoutes.get('/:id', async (c) => {
  const boardId = c.req.param('id')

  const board = await c.env.DB.prepare('SELECT * FROM boards WHERE id = ?').bind(boardId).first()
  if (!board) return c.json({ error: 'Board not found' }, 404)

  const { results: columns } = await c.env.DB.prepare(
    'SELECT * FROM board_columns WHERE board_id = ? ORDER BY order_index'
  ).bind(boardId).all()

  const { results: tasks } = await c.env.DB.prepare(
    `SELECT t.*, u.name as assignee_name FROM tasks t
     LEFT JOIN users u ON u.id = t.assignee_id
     WHERE t.board_id = ? ORDER BY t.order_index`
  ).bind(boardId).all()

  return c.json({ board, columns, tasks })
})

// Create board
boardsRoutes.post('/', requirePermission('kanban', 'write'), async (c) => {
  const user = c.get('user')
  let deptId = c.req.query('dept_id') || ''
  const { name, visibility } = await c.req.json<{ name: string; visibility?: string }>()
  if (!name) return c.json({ error: 'name required' }, 400)

  const boardVisibility = visibility || 'department'

  // Auto-resolve dept if not provided
  if (!deptId) {
    const userDept = await c.env.DB.prepare('SELECT department_id FROM user_departments WHERE user_id = ? LIMIT 1').bind(user.id).first<{ department_id: string }>()
    deptId = userDept?.department_id || ''
  }

  const boardId = generateId()

  // Create board with default columns
  const defaultColumns = [
    { name: 'To Do', color: '#6B7280', order: 0 },
    { name: 'In Progress', color: '#3B82F6', order: 1 },
    { name: 'Done', color: '#10B981', order: 2 },
  ]

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO boards (id, department_id, name, visibility, created_by) VALUES (?, ?, ?, ?, ?)'
    ).bind(boardId, deptId, name, boardVisibility, user.id),
    ...defaultColumns.map((col) =>
      c.env.DB.prepare(
        'INSERT INTO board_columns (id, board_id, name, color, order_index) VALUES (?, ?, ?, ?, ?)'
      ).bind(generateId(), boardId, col.name, col.color, col.order)
    ),
  ])

  const board = await c.env.DB.prepare('SELECT * FROM boards WHERE id = ?').bind(boardId).first()
  return c.json({ board }, 201)
})

// Delete board
boardsRoutes.delete('/:id', authMiddleware, async (c) => {
  const boardId = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM boards WHERE id = ?').bind(boardId).run()
  return c.json({ success: true })
})

// Add column
boardsRoutes.post('/:id/columns', authMiddleware, async (c) => {
  const boardId = c.req.param('id')
  const { name, color, wip_limit } = await c.req.json<{ name: string; color?: string; wip_limit?: number }>()

  const maxOrder = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(order_index), -1) as max_idx FROM board_columns WHERE board_id = ?'
  ).bind(boardId).first<{ max_idx: number }>()

  const colId = generateId()
  await c.env.DB.prepare(
    'INSERT INTO board_columns (id, board_id, name, color, order_index, wip_limit) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(colId, boardId, name, color || '#6B7280', (maxOrder?.max_idx ?? -1) + 1, wip_limit || 0).run()

  const column = await c.env.DB.prepare('SELECT * FROM board_columns WHERE id = ?').bind(colId).first()
  return c.json({ column }, 201)
})

// Update column
boardsRoutes.patch('/columns/:id', authMiddleware, async (c) => {
  const colId = c.req.param('id')
  const body = await c.req.json<{ name?: string; color?: string; wip_limit?: number }>()

  const updates: string[] = []
  const values: unknown[] = []
  if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name) }
  if (body.color !== undefined) { updates.push('color = ?'); values.push(body.color) }
  if (body.wip_limit !== undefined) { updates.push('wip_limit = ?'); values.push(body.wip_limit) }

  if (updates.length === 0) return c.json({ error: 'No fields' }, 400)
  values.push(colId)

  await c.env.DB.prepare(`UPDATE board_columns SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  const column = await c.env.DB.prepare('SELECT * FROM board_columns WHERE id = ?').bind(colId).first()
  return c.json({ column })
})

// Delete column
boardsRoutes.delete('/columns/:id', authMiddleware, async (c) => {
  const colId = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM board_columns WHERE id = ?').bind(colId).run()
  return c.json({ success: true })
})

// Reorder columns
boardsRoutes.patch('/:id/columns/reorder', authMiddleware, async (c) => {
  const { orders } = await c.req.json<{ orders: { id: string; order_index: number }[] }>()

  await c.env.DB.batch(
    orders.map((o) =>
      c.env.DB.prepare('UPDATE board_columns SET order_index = ? WHERE id = ?').bind(o.order_index, o.id)
    )
  )

  return c.json({ success: true })
})
