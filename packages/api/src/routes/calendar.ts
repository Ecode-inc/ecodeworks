import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const calendarRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

calendarRoutes.use('/*', authMiddleware)

// List events
calendarRoutes.get('/events', async (c) => {
  const user = c.get('user')
  const deptId = c.req.query('dept_id')
  const start = c.req.query('start')
  const end = c.req.query('end')

  let query = 'SELECT * FROM events WHERE 1=1'
  const params: unknown[] = []

  if (deptId) {
    query += ' AND department_id = ?'
    params.push(deptId)
  } else if (!user.is_ceo) {
    // Only show events from user's departments
    query += ' AND department_id IN (SELECT department_id FROM user_departments WHERE user_id = ?)'
    params.push(user.id)
  }

  if (start) {
    query += ' AND end_at >= ?'
    params.push(start)
  }
  if (end) {
    query += ' AND start_at <= ?'
    params.push(end)
  }

  query += ' ORDER BY start_at ASC'

  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ events: results })
})

// Create event
calendarRoutes.post('/events', requirePermission('calendar', 'write'), async (c) => {
  const user = c.get('user')
  const deptId = c.req.query('dept_id')!
  const body = await c.req.json<{
    title: string
    description?: string
    start_at: string
    end_at: string
    all_day?: boolean
    color?: string
    recurrence_rule?: string
    attendee_ids?: string[]
  }>()

  if (!body.title || !body.start_at || !body.end_at) {
    return c.json({ error: 'title, start_at, end_at are required' }, 400)
  }

  const id = generateId()

  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO events (id, department_id, user_id, title, description, start_at, end_at, all_day, color, recurrence_rule)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, deptId, user.id, body.title, body.description || '', body.start_at, body.end_at, body.all_day ? 1 : 0, body.color || '#3B82F6', body.recurrence_rule || null),
  ]

  // Add attendees
  if (body.attendee_ids?.length) {
    for (const uid of body.attendee_ids) {
      stmts.push(
        c.env.DB.prepare(
          'INSERT INTO event_attendees (event_id, user_id) VALUES (?, ?)'
        ).bind(id, uid)
      )
    }
  }

  await c.env.DB.batch(stmts)

  const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first()

  // Broadcast
  broadcastToDept(c.env, deptId, 'event:created', event)

  return c.json({ event }, 201)
})

// Update event
calendarRoutes.patch('/events/:id', authMiddleware, async (c) => {
  const user = c.get('user')
  const eventId = c.req.param('id')
  const body = await c.req.json<Record<string, unknown>>()

  const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first<any>()
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const allowed = ['title', 'description', 'start_at', 'end_at', 'all_day', 'color', 'recurrence_rule']
  const updates: string[] = []
  const values: unknown[] = []

  for (const key of allowed) {
    if (body[key] !== undefined) {
      updates.push(`${key} = ?`)
      values.push(key === 'all_day' ? (body[key] ? 1 : 0) : body[key])
    }
  }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400)

  updates.push("updated_at = datetime('now')")
  values.push(eventId)

  await c.env.DB.prepare(
    `UPDATE events SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run()

  const updated = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first()
  broadcastToDept(c.env, event.department_id, 'event:updated', updated)

  return c.json({ event: updated })
})

// Delete event
calendarRoutes.delete('/events/:id', authMiddleware, async (c) => {
  const eventId = c.req.param('id')
  const event = await c.env.DB.prepare('SELECT department_id FROM events WHERE id = ?').bind(eventId).first<any>()
  if (!event) return c.json({ error: 'Event not found' }, 404)

  await c.env.DB.prepare('DELETE FROM events WHERE id = ?').bind(eventId).run()
  broadcastToDept(c.env, event.department_id, 'event:deleted', { id: eventId })

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
