import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  byDay?: string[]    // "MO","TU","WE","TH","FR","SA","SU"
  until?: string       // "YYYY-MM-DD"
}

const DAY_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
}

function parseDate(s: string): Date {
  return new Date(s)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

function addYears(d: Date, n: number): Date {
  const r = new Date(d)
  r.setFullYear(r.getFullYear() + n)
  return r
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Expand recurring events into individual occurrences within a date range.
 */
function expandRecurringEvents(events: any[], rangeStart: string, rangeEnd: string): any[] {
  const result: any[] = []
  const rStart = parseDate(rangeStart)
  const rEnd = parseDate(rangeEnd)

  for (const ev of events) {
    if (!ev.recurrence_rule) {
      result.push(ev)
      continue
    }

    let rule: RecurrenceRule
    try {
      rule = JSON.parse(ev.recurrence_rule)
    } catch {
      // Invalid rule, just include as-is
      result.push(ev)
      continue
    }

    const eventStart = parseDate(ev.start_at)
    const eventEnd = parseDate(ev.end_at)
    const durationMs = eventEnd.getTime() - eventStart.getTime()

    const untilDate = rule.until ? parseDate(rule.until + 'T23:59:59') : rEnd
    const effectiveEnd = untilDate < rEnd ? untilDate : rEnd
    const interval = rule.interval || 1

    if (rule.freq === 'weekly' && rule.byDay?.length) {
      // For weekly with byDay: iterate week by week, check each target day
      const targetDays = rule.byDay.map(d => DAY_MAP[d]).filter(d => d !== undefined)

      // Start from the beginning of the week containing eventStart
      let cursor = new Date(eventStart)
      // Go to start of week (Sunday)
      cursor.setDate(cursor.getDate() - cursor.getDay())

      let weekCount = 0
      while (cursor <= effectiveEnd) {
        if (weekCount % interval === 0) {
          for (const targetDay of targetDays) {
            const occDate = new Date(cursor)
            occDate.setDate(occDate.getDate() + targetDay)
            // Set to same time as original event
            occDate.setHours(eventStart.getHours(), eventStart.getMinutes(), eventStart.getSeconds(), eventStart.getMilliseconds())

            // Must be >= original event start and within range
            if (occDate < eventStart) continue
            if (occDate > effectiveEnd) continue

            const occEnd = new Date(occDate.getTime() + durationMs)

            // Check if occurrence overlaps with the requested range
            if (occEnd < rStart) continue
            if (occDate > rEnd) continue

            const occStartStr = occDate.toISOString()
            const occEndStr = occEnd.toISOString()
            const occDateStr = toDateStr(occDate)

            result.push({
              ...ev,
              id: `${ev.id}_${occDateStr}`,
              start_at: occStartStr,
              end_at: occEndStr,
              is_recurring: true,
              recurring_parent_id: ev.id,
            })
          }
        }
        // Advance to next week
        cursor.setDate(cursor.getDate() + 7)
        weekCount++
      }
    } else {
      // daily, weekly (without byDay), monthly, yearly
      let cursor = new Date(eventStart)
      let iterations = 0
      const maxIterations = 3660 // safety limit (~10 years of daily)

      while (cursor <= effectiveEnd && iterations < maxIterations) {
        const occEnd = new Date(cursor.getTime() + durationMs)

        // Check overlap with range
        if (occEnd >= rStart && cursor <= rEnd) {
          const occStartStr = cursor.toISOString()
          const occEndStr = occEnd.toISOString()
          const occDateStr = toDateStr(cursor)

          if (iterations === 0) {
            // First occurrence is the original event
            result.push({
              ...ev,
              is_recurring: true,
              recurring_parent_id: ev.id,
            })
          } else {
            result.push({
              ...ev,
              id: `${ev.id}_${occDateStr}`,
              start_at: occStartStr,
              end_at: occEndStr,
              is_recurring: true,
              recurring_parent_id: ev.id,
            })
          }
        }

        // Advance cursor
        iterations++
        switch (rule.freq) {
          case 'daily':
            cursor = addDays(cursor, interval)
            break
          case 'weekly':
            cursor = addDays(cursor, 7 * interval)
            break
          case 'monthly':
            cursor = addMonths(cursor, interval)
            break
          case 'yearly':
            cursor = addYears(cursor, interval)
            break
        }
      }
    }
  }

  return result
}

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

  // Attach document counts and documents for all events
  const allEvents = results || []
  if (allEvents.length > 0) {
    const eventIds = allEvents.map((ev: any) => ev.id)
    const placeholders = eventIds.map(() => '?').join(',')
    const { results: docLinks } = await c.env.DB.prepare(
      `SELECT ed.event_id, ed.document_id, d.title
       FROM event_documents ed
       JOIN documents d ON d.id = ed.document_id
       WHERE ed.event_id IN (${placeholders})`
    ).bind(...eventIds).all()

    const docMap = new Map<string, { id: string; title: string }[]>()
    for (const dl of docLinks || []) {
      const link = dl as any
      const arr = docMap.get(link.event_id) || []
      arr.push({ id: link.document_id, title: link.title })
      docMap.set(link.event_id, arr)
    }
    for (const ev of allEvents) {
      const docs = docMap.get((ev as any).id) || []
      ;(ev as any).document_count = docs.length
      ;(ev as any).documents = docs
    }
  }

  // Expand recurring events
  let expandedEvents = allEvents as any[]
  if (start && end) {
    expandedEvents = expandRecurringEvents(expandedEvents, start, end)
  }

  return c.json({ events: expandedEvents })
})

// Get single event detail
calendarRoutes.get('/events/:id', async (c) => {
  const eventId = c.req.param('id')

  const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first<any>()
  if (!event) return c.json({ error: 'Event not found' }, 404)

  // Attach documents
  const { results: docLinks } = await c.env.DB.prepare(
    `SELECT ed.document_id, d.title
     FROM event_documents ed
     JOIN documents d ON d.id = ed.document_id
     WHERE ed.event_id = ?`
  ).bind(eventId).all()

  event.documents = (docLinks || []).map((dl: any) => ({ id: dl.document_id, title: dl.title }))
  event.document_count = event.documents.length

  // Attach shared targets
  if (event.visibility === 'shared') {
    const { results: targets } = await c.env.DB.prepare(
      'SELECT * FROM event_shared_targets WHERE event_id = ?'
    ).bind(eventId).all()
    event.shared_targets = targets || []
  }

  return c.json({ event })
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
    share_with_executives?: boolean    // share with executives
    document_ids?: string[]
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

  // Add document links
  if (body.document_ids?.length) {
    for (const docId of body.document_ids) {
      stmts.push(
        c.env.DB.prepare(
          'INSERT INTO event_documents (event_id, document_id) VALUES (?, ?)'
        ).bind(id, docId)
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

  const allowed = ['title', 'description', 'start_at', 'end_at', 'all_day', 'color', 'recurrence_rule', 'visibility']
  const updates: string[] = []
  const values: unknown[] = []

  for (const key of allowed) {
    if (body[key] !== undefined) {
      updates.push(`${key} = ?`)
      values.push(key === 'all_day' ? (body[key] ? 1 : 0) : body[key])
    }
  }

  if (updates.length === 0 && !('document_ids' in body)) return c.json({ error: 'No fields to update' }, 400)

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')")
  }
  values.push(eventId)

  const stmts: D1PreparedStatement[] = []

  if (updates.length > 0) {
    stmts.push(
      c.env.DB.prepare(
        `UPDATE events SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...values),
    )
  }

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

  // Update document links
  if ('document_ids' in body) {
    const documentIds = body.document_ids as string[] | undefined
    // Delete old links
    stmts.push(
      c.env.DB.prepare('DELETE FROM event_documents WHERE event_id = ?').bind(eventId)
    )
    // Insert new links
    if (documentIds?.length) {
      for (const docId of documentIds) {
        stmts.push(
          c.env.DB.prepare(
            'INSERT INTO event_documents (event_id, document_id) VALUES (?, ?)'
          ).bind(eventId, docId)
        )
      }
    }
  }

  if (stmts.length > 0) {
    await c.env.DB.batch(stmts)
  }

  // Suppress unused variable warning
  void user

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
