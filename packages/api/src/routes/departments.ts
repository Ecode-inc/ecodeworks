import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const departmentsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

departmentsRoutes.use('/*', authMiddleware)

// List departments
departmentsRoutes.get('/', async (c) => {
  const user = c.get('user')

  const { results } = await c.env.DB.prepare(
    'SELECT id, name, slug, color, order_index, created_at FROM departments WHERE org_id = ? ORDER BY order_index'
  ).bind(user.org_id).all()

  return c.json({ departments: results })
})

// Create department
departmentsRoutes.post('/', async (c) => {
  const user = c.get('user')
  if (!user.is_ceo) {
    return c.json({ error: 'Only CEO can create departments' }, 403)
  }

  const { name, color } = await c.req.json<{ name: string; color?: string }>()
  if (!name) {
    return c.json({ error: 'Name is required' }, 400)
  }

  const id = generateId()
  const slug = name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/(^-|-$)/g, '')

  // Get max order_index
  const maxOrder = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(order_index), -1) as max_idx FROM departments WHERE org_id = ?'
  ).bind(user.org_id).first<{ max_idx: number }>()

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO departments (id, org_id, name, slug, color, order_index) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, user.org_id, name, slug, color || '#3B82F6', (maxOrder?.max_idx ?? -1) + 1),
    // Default permissions
    ...['calendar', 'kanban', 'docs', 'vault', 'qa'].map(mod =>
      c.env.DB.prepare(
        'INSERT INTO department_permissions (department_id, module, permission) VALUES (?, ?, ?)'
      ).bind(id, mod, 'read')
    ),
  ])

  const dept = await c.env.DB.prepare(
    'SELECT id, name, slug, color, order_index, created_at FROM departments WHERE id = ?'
  ).bind(id).first()

  return c.json({ department: dept }, 201)
})

// Update department
departmentsRoutes.patch('/:id', async (c) => {
  const user = c.get('user')
  const deptId = c.req.param('id')

  // Check if user is CEO or department head
  if (!user.is_ceo) {
    const membership = await c.env.DB.prepare(
      'SELECT role FROM user_departments WHERE user_id = ? AND department_id = ?'
    ).bind(user.id, deptId).first<{ role: string }>()

    if (membership?.role !== 'head') {
      return c.json({ error: 'Only CEO or department head can update' }, 403)
    }
  }

  const { name, color } = await c.req.json<{ name?: string; color?: string }>()
  const updates: string[] = []
  const values: unknown[] = []

  if (name) { updates.push('name = ?'); values.push(name) }
  if (color) { updates.push('color = ?'); values.push(color) }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400)
  }

  values.push(deptId, user.org_id)
  await c.env.DB.prepare(
    `UPDATE departments SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`
  ).bind(...values).run()

  const dept = await c.env.DB.prepare(
    'SELECT id, name, slug, color, order_index, created_at FROM departments WHERE id = ?'
  ).bind(deptId).first()

  return c.json({ department: dept })
})

// Delete department
departmentsRoutes.delete('/:id', async (c) => {
  const user = c.get('user')
  if (!user.is_ceo) {
    return c.json({ error: 'Only CEO can delete departments' }, 403)
  }

  const deptId = c.req.param('id')
  await c.env.DB.prepare(
    'DELETE FROM departments WHERE id = ? AND org_id = ?'
  ).bind(deptId, user.org_id).run()

  return c.json({ success: true })
})

// Update department permissions
departmentsRoutes.patch('/:id/permissions', async (c) => {
  const user = c.get('user')
  const deptId = c.req.param('id')

  if (!user.is_ceo) {
    const membership = await c.env.DB.prepare(
      'SELECT role FROM user_departments WHERE user_id = ? AND department_id = ?'
    ).bind(user.id, deptId).first<{ role: string }>()

    if (membership?.role !== 'head') {
      return c.json({ error: 'Only CEO or department head can update permissions' }, 403)
    }
  }

  const { permissions } = await c.req.json<{
    permissions: { module: string; permission: string }[]
  }>()

  await c.env.DB.batch(
    permissions.map(p =>
      c.env.DB.prepare(
        `INSERT INTO department_permissions (department_id, module, permission)
         VALUES (?, ?, ?)
         ON CONFLICT(department_id, module) DO UPDATE SET permission = excluded.permission`
      ).bind(deptId, p.module, p.permission)
    )
  )

  return c.json({ success: true })
})
