import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const calendarRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

calendarRoutes.use('/*', authMiddleware)

// List events (with visibility filtering)
calendarRoutes.get('/events', async (c) => {
  const user = c.get('user')
  const deptId = c.req.query('dept_id')
  const start = c.req.query('start')
  const end = c.req.query('end')

  // Build visibility-aware query
  // Rules:
  //   personal  -> only creator
  //   department -> members of that department
  //   company   -> everyone in the org
  //   shared    -> creator + explicitly shared targets (user or executives)
  const visibilityClauses: string[] = []
  const visibilityParams: unknown[] = []

  // 1) personal: only creator
  visibilityClauses.push("(e.visibility = 'personal' AND e.user_id = ?)")
  visibilityParams.push(user.id)

  // 2) department: user must belong to the event's department
  visibilityClauses.push(
    "(e.visibility = 'department' AND e.department_id IN (SELECT department_id FROM user_departments WHERE user_id = ?))"
  )
  visibilityParams.push(user.id)

  // 3) company: visible to all in org (events table has department_id FK -> departments -> org_id)
  visibilityClauses.push("(e.visibility = 'company')")

  // 4) shared: creator OR target user OR target executives (is_ceo)
  if (user.is_ceo) {
    visibilityClauses.push(
      "(e.visibility = 'shared' AND (e.user_id = ? OR EXISTS (SELECT 1 FROM event_shared_targets est WHERE est.event_id = e.id AND (est.target_id = ? OR est.target_type = 'executives'))))"
    )
  } else {
    visibilityClauses.push(
      "(e.visibility = 'shared' AND (e.user_id = ? OR EXISTS (SELECT 1 FROM event_shared_targets est WHERE est.event_id = e.id AND est.target_id = ?)))"
    )
  }
  visibilityParams.push(user.id, user.id)

  let query = `SELECT e.* FROM events e WHERE (${visibilityClauses.join(' OR ')})`
  const params: unknown[] = [...visibilityParams]

  // Optional department filter (still respect visibility)
  if (deptId) {
    query += ' AND e.department_id = ?'
    params.push(deptId)
  }

  if (start) {
    query += ' AND e.end_at >= ?'
    params.push(start)
  }
  if (end) {
    query += ' AND e.start_at <= ?'
    params.push(end)
  }

  query += ' ORDER BY e.start_at ASC'

  const { results } = await c.env.DB.prepare(query).bind(...params).all()

  // Attach shared targets for shared events
  const sharedEvents = (results || []).filter((ev: any) => ev.visibility === 'shared')
  if (sharedEvents.length > 0) {
    const ids = sharedEvents.map((ev: any) => ev.id)
    const placeholders = ids.map(() => '?').join(',')
    const { results: targets } = await c.env.DB.prepare(
      `SELECT * FROM event_shared_targets WHERE event_id IN (${placeholders})`
    ).bind(...ids).all()

    const targetMap = new Map<string, any[]>()
    for (const t of targets || []) {
      const arr = targetMap.get((t as any).event_id) || []
      arr.push(t)
      targetMap.set((t as any).event_id, arr)
    }
    for (const ev of sharedEvents) {
      (ev as any).shared_targets = targetMap.get((ev as any).id) || []
    }
  }

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
    visibility?: 'personal' | 'department' | 'company' | 'shared'
    shared_target_ids?: string[]       // user IDs for selective sharing
    share_with_executives?: boolean    // share with executives (임원진)
  }>()

  if (!body.title || !body.start_at || !body.end_at) {
    return c.json({ error: 'title, start_at, end_at are required' }, 400)
  }

  const visibility = body.visibility || 'department'

  const id = generateId()

  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO events (id, department_id, user_id, title, description, start_at, end_at, all_day, color, recurrence_rule, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, deptId, user.id, body.title, body.description || '', body.start_at, body.end_at, body.all_day ? 1 : 0, body.color || '#3B82F6', body.recurrence_rule || null, visibility),
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

  // Add shared targets for 'shared' visibility
  if (visibility === 'shared') {
    if (body.share_with_executives) {
      const targetId = generateId()
      stmts.push(
        c.env.DB.prepare(
          'INSERT INTO event_shared_targets (id, event_id, target_type, target_id) VALUES (?, ?, ?, ?)'
        ).bind(targetId, id, 'executives', null)
      )
    }
    if (body.shared_target_ids?.length) {
      for (const uid of body.shared_target_ids) {
        const targetId = generateId()
        stmts.push(
          c.env.DB.prepare(
            'INSERT INTO event_shared_targets (id, event_id, target_type, target_id) VALUES (?, ?, ?, ?)'
          ).bind(targetId, id, 'user', uid)
        )
      }
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

  const allowed = ['title', 'description', 'start_at', 'end_at', 'all_day', 'color', 'recurrence_rule', 'visibility']
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

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `UPDATE events SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values),
  ]

  // If visibility changed to 'shared', update shared targets
  const newVisibility = body['visibility'] as string | undefined
  if (newVisibility === 'shared') {
    // Remove old shared targets
    stmts.push(
      c.env.DB.prepare('DELETE FROM event_shared_targets WHERE event_id = ?').bind(eventId)
    )
    // Add new shared targets
    const sharedTargetIds = (body as any).shared_target_ids as string[] | undefined
    const shareWithExecs = (body as any).share_with_executives as boolean | undefined
    if (shareWithExecs) {
      const targetId = generateId()
      stmts.push(
        c.env.DB.prepare(
          'INSERT INTO event_shared_targets (id, event_id, target_type, target_id) VALUES (?, ?, ?, ?)'
        ).bind(targetId, eventId, 'executives', null)
      )
    }
    if (sharedTargetIds?.length) {
      for (const uid of sharedTargetIds) {
        const targetId = generateId()
        stmts.push(
          c.env.DB.prepare(
            'INSERT INTO event_shared_targets (id, event_id, target_type, target_id) VALUES (?, ?, ?, ?)'
          ).bind(targetId, eventId, 'user', uid)
        )
      }
    }
  } else if (newVisibility && newVisibility !== 'shared') {
    // Changing away from shared — clean up targets
    stmts.push(
      c.env.DB.prepare('DELETE FROM event_shared_targets WHERE event_id = ?').bind(eventId)
    )
  }

  await c.env.DB.batch(stmts)

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
