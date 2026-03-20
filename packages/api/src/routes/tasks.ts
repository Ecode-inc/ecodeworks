import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const tasksRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

tasksRoutes.use('/*', authMiddleware)

// All tasks across all boards (unified kanban view)
tasksRoutes.get('/all', async (c) => {
  const user = c.get('user')
  const status = c.req.query('status') // column filter
  const assigneeId = c.req.query('assignee_id')

  let query = `
    SELECT t.*,
           GROUP_CONCAT(u.id) as assignee_ids,
           GROUP_CONCAT(u.name) as assignee_names,
           b.name as board_name,
           b.department_id,
           d.name as department_name,
           bc.name as column_name,
           bc.color as column_color
    FROM tasks t
    JOIN boards b ON b.id = t.board_id
    JOIN departments d ON d.id = b.department_id
    JOIN board_columns bc ON bc.id = t.column_id
    LEFT JOIN task_assignees ta ON ta.task_id = t.id
    LEFT JOIN users u ON u.id = ta.user_id
    WHERE d.org_id = ?`
  const params: unknown[] = [user.org_id]

  // Non-admin: only boards they can see
  if (!user.is_ceo && !user.is_admin) {
    query += ` AND (
      b.visibility = 'company'
      OR (b.visibility = 'department' AND b.department_id IN (SELECT department_id FROM user_departments WHERE user_id = ?))
      OR (b.visibility = 'personal' AND b.created_by = ?)
      OR t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)
    )`
    params.push(user.id, user.id, user.id)
  }

  if (assigneeId) {
    query += ' AND t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)'
    params.push(assigneeId)
  }

  query += ' GROUP BY t.id ORDER BY bc.order_index, t.order_index'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()

  return c.json({ tasks: results || [] })
})

// Create task
tasksRoutes.post('/', async (c) => {
  const body = await c.req.json<{
    board_id: string
    column_id: string
    title: string
    description?: string
    assignee_id?: string
    assignee_ids?: string[]
    priority?: string
    labels?: string[]
    due_date?: string
  }>()

  if (!body.board_id || !body.column_id || !body.title) {
    return c.json({ error: 'board_id, column_id, title required' }, 400)
  }

  // Resolve assignee_ids: prefer array, fall back to single assignee_id
  const assigneeIds: string[] = body.assignee_ids?.filter(Boolean) ||
    (body.assignee_id ? [body.assignee_id] : [])
  const firstAssignee = assigneeIds[0] || null

  const maxOrder = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(order_index), -1) as max_idx FROM tasks WHERE column_id = ?'
  ).bind(body.column_id).first<{ max_idx: number }>()

  const id = generateId()

  const statements = [
    c.env.DB.prepare(
      `INSERT INTO tasks (id, board_id, column_id, title, description, assignee_id, priority, labels, due_date, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, body.board_id, body.column_id, body.title,
      body.description || '', firstAssignee,
      body.priority || 'medium', JSON.stringify(body.labels || []),
      body.due_date || null, (maxOrder?.max_idx ?? -1) + 1
    ),
    ...assigneeIds.map(uid =>
      c.env.DB.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)').bind(id, uid)
    ),
  ]
  await c.env.DB.batch(statements)

  const task = await c.env.DB.prepare(
    `SELECT t.*,
            GROUP_CONCAT(u.id) as assignee_ids,
            GROUP_CONCAT(u.name) as assignee_names
     FROM tasks t
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     LEFT JOIN users u ON u.id = ta.user_id
     WHERE t.id = ?
     GROUP BY t.id`
  ).bind(id).first()

  // Broadcast
  const board = await c.env.DB.prepare('SELECT department_id FROM boards WHERE id = ?').bind(body.board_id).first<any>()
  if (board) broadcastToDept(c.env, board.department_id, 'task:created', task)

  return c.json({ task }, 201)
})

// Update task
tasksRoutes.patch('/:id', async (c) => {
  const taskId = c.req.param('id')
  const body = await c.req.json<Record<string, unknown>>()

  const allowed = ['title', 'description', 'assignee_id', 'priority', 'due_date', 'column_id']
  const updates: string[] = []
  const values: unknown[] = []

  // Handle assignee_ids array
  const assigneeIds = body.assignee_ids as string[] | undefined
  if (assigneeIds !== undefined) {
    const filtered = assigneeIds.filter(Boolean)
    // Keep assignee_id in sync for backward compat
    updates.push('assignee_id = ?')
    values.push(filtered[0] || null)
  }

  for (const key of allowed) {
    // Skip assignee_id if we already handled it via assignee_ids
    if (key === 'assignee_id' && assigneeIds !== undefined) continue
    if (body[key] !== undefined) {
      updates.push(`${key} = ?`)
      values.push(body[key])
    }
  }
  if (body.labels !== undefined) {
    updates.push('labels = ?')
    values.push(JSON.stringify(body.labels))
  }

  if (updates.length === 0 && assigneeIds === undefined) return c.json({ error: 'No fields' }, 400)

  const statements: ReturnType<typeof c.env.DB.prepare>[] = []

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')")
    values.push(taskId)
    statements.push(
      c.env.DB.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).bind(...values)
    )
  }

  // Update junction table if assignee_ids provided
  if (assigneeIds !== undefined) {
    const filtered = assigneeIds.filter(Boolean)
    statements.push(
      c.env.DB.prepare('DELETE FROM task_assignees WHERE task_id = ?').bind(taskId)
    )
    for (const uid of filtered) {
      statements.push(
        c.env.DB.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)').bind(taskId, uid)
      )
    }
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements)
  }

  const task = await c.env.DB.prepare(
    `SELECT t.*,
            GROUP_CONCAT(u.id) as assignee_ids,
            GROUP_CONCAT(u.name) as assignee_names
     FROM tasks t
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     LEFT JOIN users u ON u.id = ta.user_id
     WHERE t.id = ?
     GROUP BY t.id`
  ).bind(taskId).first()

  // Broadcast
  if (task) {
    const board = await c.env.DB.prepare('SELECT department_id FROM boards WHERE id = ?').bind((task as any).board_id).first<any>()
    if (board) broadcastToDept(c.env, board.department_id, 'task:updated', task)
  }

  return c.json({ task })
})

// Delete task
tasksRoutes.delete('/:id', async (c) => {
  const taskId = c.req.param('id')
  const task = await c.env.DB.prepare('SELECT board_id FROM tasks WHERE id = ?').bind(taskId).first<any>()

  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(taskId).run()

  if (task) {
    const board = await c.env.DB.prepare('SELECT department_id FROM boards WHERE id = ?').bind(task.board_id).first<any>()
    if (board) broadcastToDept(c.env, board.department_id, 'task:deleted', { id: taskId })
  }

  return c.json({ success: true })
})

// Reorder / move tasks
tasksRoutes.patch('/reorder', async (c) => {
  const { tasks: taskOrders } = await c.req.json<{
    tasks: { id: string; column_id: string; order_index: number }[]
  }>()

  await c.env.DB.batch(
    taskOrders.map((t) =>
      c.env.DB.prepare(
        "UPDATE tasks SET column_id = ?, order_index = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(t.column_id, t.order_index, t.id)
    )
  )

  return c.json({ success: true })
})

async function broadcastToDept(env: Env, deptId: string, type: string, data: unknown) {
  try {
    const roomId = env.WEBSOCKET_ROOM.idFromName(deptId)
    const room = env.WEBSOCKET_ROOM.get(roomId)
    await room.fetch(new Request('https://internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type, data }),
    }))
  } catch { /* ignore */ }
}
