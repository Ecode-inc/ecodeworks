import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const tasksRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

tasksRoutes.use('/*', authMiddleware)

// Create task
tasksRoutes.post('/', async (c) => {
  const body = await c.req.json<{
    board_id: string
    column_id: string
    title: string
    description?: string
    assignee_id?: string
    priority?: string
    labels?: string[]
    due_date?: string
  }>()

  if (!body.board_id || !body.column_id || !body.title) {
    return c.json({ error: 'board_id, column_id, title required' }, 400)
  }

  const maxOrder = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(order_index), -1) as max_idx FROM tasks WHERE column_id = ?'
  ).bind(body.column_id).first<{ max_idx: number }>()

  const id = generateId()
  await c.env.DB.prepare(
    `INSERT INTO tasks (id, board_id, column_id, title, description, assignee_id, priority, labels, due_date, order_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, body.board_id, body.column_id, body.title,
    body.description || '', body.assignee_id || null,
    body.priority || 'medium', JSON.stringify(body.labels || []),
    body.due_date || null, (maxOrder?.max_idx ?? -1) + 1
  ).run()

  const task = await c.env.DB.prepare(
    `SELECT t.*, u.name as assignee_name FROM tasks t
     LEFT JOIN users u ON u.id = t.assignee_id WHERE t.id = ?`
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

  for (const key of allowed) {
    if (body[key] !== undefined) {
      updates.push(`${key} = ?`)
      values.push(body[key])
    }
  }
  if (body.labels !== undefined) {
    updates.push('labels = ?')
    values.push(JSON.stringify(body.labels))
  }

  if (updates.length === 0) return c.json({ error: 'No fields' }, 400)

  updates.push("updated_at = datetime('now')")
  values.push(taskId)

  await c.env.DB.prepare(
    `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run()

  const task = await c.env.DB.prepare(
    `SELECT t.*, u.name as assignee_name FROM tasks t
     LEFT JOIN users u ON u.id = t.assignee_id WHERE t.id = ?`
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
