import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const positionsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

positionsRoutes.use('/*', authMiddleware)

// List positions for the user's org (ordered by level desc)
positionsRoutes.get('/', async (c) => {
  const user = c.get('user')

  const { results } = await c.env.DB.prepare(`
    SELECT id, org_id, name, level, order_index, created_at
    FROM positions
    WHERE org_id = ?
    ORDER BY level DESC, order_index ASC
  `).bind(user.org_id).all()

  return c.json({ positions: results })
})

// Create position (CEO/admin only)
positionsRoutes.post('/', async (c) => {
  const user = c.get('user')

  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'Only CEO or admin can create positions' }, 403)
  }

  const { name, level } = await c.req.json<{ name: string; level: number }>()

  if (!name) {
    return c.json({ error: 'name is required' }, 400)
  }

  const id = generateId()

  try {
    await c.env.DB.prepare(
      'INSERT INTO positions (id, org_id, name, level, order_index) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, user.org_id, name, level ?? 0, level ?? 0).run()
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return c.json({ error: 'Position name already exists in this organization' }, 409)
    }
    throw err
  }

  const position = await c.env.DB.prepare(
    'SELECT id, org_id, name, level, order_index, created_at FROM positions WHERE id = ?'
  ).bind(id).first()

  return c.json({ position }, 201)
})

// Update position (CEO/admin only)
positionsRoutes.patch('/:id', async (c) => {
  const user = c.get('user')
  const positionId = c.req.param('id')

  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'Only CEO or admin can update positions' }, 403)
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM positions WHERE id = ? AND org_id = ?'
  ).bind(positionId, user.org_id).first()

  if (!existing) {
    return c.json({ error: 'Position not found' }, 404)
  }

  const { name, level } = await c.req.json<{ name?: string; level?: number }>()

  const updates: string[] = []
  const values: unknown[] = []

  if (name !== undefined) { updates.push('name = ?'); values.push(name) }
  if (level !== undefined) { updates.push('level = ?'); values.push(level); updates.push('order_index = ?'); values.push(level) }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400)
  }

  values.push(positionId, user.org_id)

  try {
    await c.env.DB.prepare(
      `UPDATE positions SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`
    ).bind(...values).run()
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return c.json({ error: 'Position name already exists in this organization' }, 409)
    }
    throw err
  }

  const position = await c.env.DB.prepare(
    'SELECT id, org_id, name, level, order_index, created_at FROM positions WHERE id = ?'
  ).bind(positionId).first()

  return c.json({ position })
})

// Delete position (CEO/admin only, check no users assigned)
positionsRoutes.delete('/:id', async (c) => {
  const user = c.get('user')
  const positionId = c.req.param('id')

  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'Only CEO or admin can delete positions' }, 403)
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM positions WHERE id = ? AND org_id = ?'
  ).bind(positionId, user.org_id).first()

  if (!existing) {
    return c.json({ error: 'Position not found' }, 404)
  }

  // Check if any users are assigned to this position
  const assigned = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM users WHERE position_id = ? AND org_id = ?'
  ).bind(positionId, user.org_id).first<{ cnt: number }>()

  if (assigned && assigned.cnt > 0) {
    return c.json({ error: `Cannot delete position: ${assigned.cnt} user(s) are assigned to it` }, 409)
  }

  await c.env.DB.prepare(
    'DELETE FROM positions WHERE id = ? AND org_id = ?'
  ).bind(positionId, user.org_id).run()

  return c.json({ success: true })
})

// Seed default Korean positions (CEO/admin only)
positionsRoutes.post('/seed', async (c) => {
  const user = c.get('user')

  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'Only CEO or admin can seed positions' }, 403)
  }

  // Check if positions already exist
  const existing = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM positions WHERE org_id = ?'
  ).bind(user.org_id).first<{ cnt: number }>()

  if (existing && existing.cnt > 0) {
    return c.json({ error: 'Positions already exist for this organization' }, 409)
  }

  const defaults = [
    { name: '대표이사', level: 9 },
    { name: '이사', level: 7 },
    { name: '부장', level: 6 },
    { name: '차장', level: 5 },
    { name: '과장', level: 4 },
    { name: '대리', level: 3 },
    { name: '주임', level: 2 },
    { name: '사원', level: 1 },
    { name: '인턴', level: 0 },
  ]

  const stmts = defaults.map((d) =>
    c.env.DB.prepare(
      'INSERT INTO positions (id, org_id, name, level, order_index) VALUES (?, ?, ?, ?, ?)'
    ).bind(generateId(), user.org_id, d.name, d.level, d.level)
  )

  await c.env.DB.batch(stmts)

  const { results } = await c.env.DB.prepare(`
    SELECT id, org_id, name, level, order_index, created_at
    FROM positions
    WHERE org_id = ?
    ORDER BY level DESC
  `).bind(user.org_id).all()

  return c.json({ positions: results }, 201)
})
