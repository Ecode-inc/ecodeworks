import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { hashPassword } from '../lib/password'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const membersRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

membersRoutes.use('/*', authMiddleware)

// List organization members
membersRoutes.get('/', async (c) => {
  const user = c.get('user')

  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.name, u.avatar_url, u.is_ceo, u.created_at
    FROM users u
    WHERE u.org_id = ?
    ORDER BY u.created_at
  `).bind(user.org_id).all()

  return c.json({ members: results })
})

// Get member with departments
membersRoutes.get('/:id', async (c) => {
  const user = c.get('user')
  const memberId = c.req.param('id')

  const member = await c.env.DB.prepare(
    'SELECT id, email, name, avatar_url, is_ceo, created_at FROM users WHERE id = ? AND org_id = ?'
  ).bind(memberId, user.org_id).first()

  if (!member) {
    return c.json({ error: 'Member not found' }, 404)
  }

  const { results: departments } = await c.env.DB.prepare(`
    SELECT d.id, d.name, d.slug, d.color, ud.role
    FROM user_departments ud
    JOIN departments d ON d.id = ud.department_id
    WHERE ud.user_id = ?
    ORDER BY d.order_index
  `).bind(memberId).all()

  return c.json({ member, departments })
})

// Invite member (CEO or dept head only)
membersRoutes.post('/', async (c) => {
  const user = c.get('user')

  const { email, password, name, departmentId, role } = await c.req.json<{
    email: string
    password: string
    name: string
    departmentId: string
    role?: 'head' | 'member'
  }>()

  if (!email || !password || !name || !departmentId) {
    return c.json({ error: 'email, password, name, and departmentId are required' }, 400)
  }

  // Check permissions
  if (!user.is_ceo) {
    const membership = await c.env.DB.prepare(
      'SELECT role FROM user_departments WHERE user_id = ? AND department_id = ?'
    ).bind(user.id, departmentId).first<{ role: string }>()

    if (membership?.role !== 'head') {
      return c.json({ error: 'Only CEO or department head can invite members' }, 403)
    }
  }

  // Check if email already exists in org
  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE org_id = ? AND email = ?'
  ).bind(user.org_id, email).first()
  if (existing) {
    return c.json({ error: 'Email already registered in this organization' }, 409)
  }

  const memberId = generateId()
  const passwordHash = await hashPassword(password)

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO users (id, org_id, email, password_hash, name) VALUES (?, ?, ?, ?, ?)'
    ).bind(memberId, user.org_id, email, passwordHash, name),
    c.env.DB.prepare(
      'INSERT INTO user_departments (user_id, department_id, role) VALUES (?, ?, ?)'
    ).bind(memberId, departmentId, role || 'member'),
  ])

  return c.json({
    member: { id: memberId, email, name, is_ceo: false, org_id: user.org_id },
  }, 201)
})

// Add member to department
membersRoutes.post('/:id/departments', async (c) => {
  const user = c.get('user')
  const memberId = c.req.param('id')

  const { departmentId, role } = await c.req.json<{
    departmentId: string
    role?: 'head' | 'member'
  }>()

  if (!user.is_ceo) {
    return c.json({ error: 'Only CEO can assign departments' }, 403)
  }

  await c.env.DB.prepare(
    `INSERT INTO user_departments (user_id, department_id, role) VALUES (?, ?, ?)
     ON CONFLICT(user_id, department_id) DO UPDATE SET role = excluded.role`
  ).bind(memberId, departmentId, role || 'member').run()

  return c.json({ success: true })
})

// Remove member from department
membersRoutes.delete('/:id/departments/:deptId', async (c) => {
  const user = c.get('user')
  if (!user.is_ceo) {
    return c.json({ error: 'Only CEO can remove department assignments' }, 403)
  }

  const memberId = c.req.param('id')
  const deptId = c.req.param('deptId')

  await c.env.DB.prepare(
    'DELETE FROM user_departments WHERE user_id = ? AND department_id = ?'
  ).bind(memberId, deptId).run()

  return c.json({ success: true })
})
