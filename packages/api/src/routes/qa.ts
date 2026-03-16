import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const qaRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

qaRoutes.use('/*', authMiddleware)

// Helper: check if user is CEO, admin, or department head
async function isManager(db: D1Database, user: AuthUser): Promise<boolean> {
  if (user.is_ceo || user.is_admin) return true
  const head = await db.prepare(
    "SELECT 1 FROM user_departments WHERE user_id = ? AND role = 'head' LIMIT 1"
  ).bind(user.id).first()
  return !!head
}

// GET /links - list QA project links visible to the user
qaRoutes.get('/links', async (c) => {
  const user = c.get('user')

  let query: string
  let params: unknown[]

  if (user.is_ceo) {
    // CEO sees all links in their org
    query = `SELECT l.*,
      CASE WHEN s.last_seen_at IS NULL OR s.last_seen_at < l.updated_at THEN 1 ELSE 0 END as has_new
      FROM qa_project_links l
      LEFT JOIN qa_project_seen s ON s.project_link_id = l.id AND s.user_id = ?
      WHERE l.org_id = ?
      ORDER BY l.created_at DESC`
    params = [user.id, user.org_id]
  } else {
    query = `SELECT l.*,
      CASE WHEN s.last_seen_at IS NULL OR s.last_seen_at < l.updated_at THEN 1 ELSE 0 END as has_new
      FROM qa_project_links l
      LEFT JOIN qa_project_seen s ON s.project_link_id = l.id AND s.user_id = ?
      WHERE l.org_id = ?
      AND (
        l.visibility = 'company'
        OR (l.visibility = 'department' AND l.department_id IN (SELECT department_id FROM user_departments WHERE user_id = ?))
        OR (l.visibility = 'personal' AND l.created_by = ?)
        OR (l.visibility = 'personal' AND l.shared_with LIKE '%' || ? || '%')
      )
      ORDER BY l.created_at DESC`
    params = [user.id, user.org_id, user.id, user.id, user.id]
  }

  const { results } = await c.env.DB.prepare(query).bind(...params).all()

  const links = (results || []).map((r: any) => ({
    ...r,
    has_new: r.has_new === 1,
    shared_with: typeof r.shared_with === 'string' ? JSON.parse(r.shared_with) : r.shared_with,
  }))

  return c.json({ links })
})

// POST /links - create a QA project link (CEO/admin/dept head only)
qaRoutes.post('/links', async (c) => {
  const user = c.get('user')

  if (!(await isManager(c.env.DB, user))) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  const body = await c.req.json<{
    name: string
    url: string
    visibility?: string
    department_id?: string
    shared_with?: string[]
  }>()

  if (!body.name || !body.url) {
    return c.json({ error: 'name and url are required' }, 400)
  }

  const id = generateId()
  const visibility = body.visibility || 'company'
  const sharedWith = JSON.stringify(body.shared_with || [])

  await c.env.DB.prepare(
    `INSERT INTO qa_project_links (id, org_id, name, url, visibility, department_id, created_by, shared_with)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, user.org_id, body.name, body.url, visibility, body.department_id || null, user.id, sharedWith).run()

  const link = await c.env.DB.prepare('SELECT * FROM qa_project_links WHERE id = ?').bind(id).first()

  return c.json({ link }, 201)
})

// PATCH /links/:id - update a QA project link (CEO/admin/dept head only)
qaRoutes.patch('/links/:id', async (c) => {
  const user = c.get('user')

  if (!(await isManager(c.env.DB, user))) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  const linkId = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT * FROM qa_project_links WHERE id = ?').bind(linkId).first()
  if (!existing) return c.json({ error: 'Link not found' }, 404)

  const body = await c.req.json<Record<string, unknown>>()

  const allowed = ['name', 'url', 'visibility', 'department_id', 'shared_with']
  const updates: string[] = []
  const values: unknown[] = []

  for (const key of allowed) {
    if (body[key] !== undefined) {
      if (key === 'shared_with') {
        updates.push(`${key} = ?`)
        values.push(JSON.stringify(body[key]))
      } else {
        updates.push(`${key} = ?`)
        values.push(body[key])
      }
    }
  }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400)

  updates.push("updated_at = datetime('now')")
  values.push(linkId)

  await c.env.DB.prepare(
    `UPDATE qa_project_links SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run()

  const link = await c.env.DB.prepare('SELECT * FROM qa_project_links WHERE id = ?').bind(linkId).first()

  return c.json({ link })
})

// DELETE /links/:id - delete a QA project link (CEO/admin/dept head only)
qaRoutes.delete('/links/:id', async (c) => {
  const user = c.get('user')

  if (!(await isManager(c.env.DB, user))) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  const linkId = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT * FROM qa_project_links WHERE id = ?').bind(linkId).first()
  if (!existing) return c.json({ error: 'Link not found' }, 404)

  await c.env.DB.prepare('DELETE FROM qa_project_links WHERE id = ?').bind(linkId).run()

  return c.json({ success: true })
})

// POST /links/:id/seen - mark a project as seen
qaRoutes.post('/links/:id/seen', async (c) => {
  const user = c.get('user')
  const linkId = c.req.param('id')

  await c.env.DB.prepare(
    `INSERT INTO qa_project_seen (user_id, project_link_id, last_seen_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id, project_link_id)
     DO UPDATE SET last_seen_at = datetime('now')`
  ).bind(user.id, linkId).run()

  return c.json({ success: true })
})
