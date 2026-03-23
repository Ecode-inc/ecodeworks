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
    SELECT u.id, u.email, u.name, u.avatar_url, u.is_ceo, u.is_admin, u.is_attendance_admin, u.position_id, u.hire_date, u.created_at,
           p.name as position_name, p.level as position_level,
           GROUP_CONCAT(d.id || '::' || d.name || '::' || COALESCE(d.color,'') || '::' || ud.role, '|||') as dept_info
    FROM users u
    LEFT JOIN positions p ON p.id = u.position_id
    LEFT JOIN user_departments ud ON ud.user_id = u.id
    LEFT JOIN departments d ON d.id = ud.department_id
    WHERE u.org_id = ?
    GROUP BY u.id
    ORDER BY u.created_at
  `).bind(user.org_id).all()

  const members = results.map((row: any) => {
    const departments: { id: string; name: string; color: string; role: string }[] = []
    if (row.dept_info) {
      const parts = (row.dept_info as string).split('|||')
      for (const part of parts) {
        const [id, name, color, role] = part.split('::')
        if (id && name) {
          departments.push({ id, name, color: color || '', role: role || 'member' })
        }
      }
    }
    const { dept_info: _, ...rest } = row
    return { ...rest, departments }
  })

  return c.json({ members })
})

// Get member with departments
membersRoutes.get('/:id', async (c) => {
  const user = c.get('user')
  const memberId = c.req.param('id')

  const member = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.name, u.avatar_url, u.is_ceo, u.is_admin, u.is_attendance_admin, u.position_id, u.hire_date, u.created_at,
           p.name as position_name, p.level as position_level
    FROM users u
    LEFT JOIN positions p ON p.id = u.position_id
    WHERE u.id = ? AND u.org_id = ?
  `).bind(memberId, user.org_id).first()

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

  const { email, password, name, departmentId, role, positionId } = await c.req.json<{
    email: string
    password: string
    name: string
    departmentId: string
    role?: 'head' | 'member'
    positionId?: string
  }>()

  if (!email || !password || !name || !departmentId) {
    return c.json({ error: 'email, password, name, and departmentId are required' }, 400)
  }

  // Check permissions
  if (!user.is_ceo && !user.is_admin) {
    const membership = await c.env.DB.prepare(
      'SELECT role FROM user_departments WHERE user_id = ? AND department_id = ?'
    ).bind(user.id, departmentId).first<{ role: string }>()

    if (membership?.role !== 'head') {
      return c.json({ error: 'Only CEO, admin, or department head can invite members' }, 403)
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
      'INSERT INTO users (id, org_id, email, password_hash, name, position_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(memberId, user.org_id, email, passwordHash, name, positionId || ''),
    c.env.DB.prepare(
      'INSERT INTO user_departments (user_id, department_id, role) VALUES (?, ?, ?)'
    ).bind(memberId, departmentId, role || 'member'),
  ])

  return c.json({
    member: { id: memberId, email, name, is_ceo: false, org_id: user.org_id },
  }, 201)
})

// Update member (CEO/admin can update anyone, users can update own name)
membersRoutes.patch('/:id', async (c) => {
  const user = c.get('user')
  const memberId = c.req.param('id')
  const isSelf = memberId === user.id

  if (!user.is_ceo && !user.is_admin && !isSelf) {
    return c.json({ error: 'Only CEO, admin, or self can update' }, 403)
  }

  // Verify member belongs to the same org
  const member = await c.env.DB.prepare(
    'SELECT id FROM users WHERE id = ? AND org_id = ?'
  ).bind(memberId, user.org_id).first()

  if (!member) {
    return c.json({ error: 'Member not found' }, 404)
  }

  const { name, is_admin: newIsAdmin, position_id, is_attendance_admin, hire_date } = await c.req.json<{
    name?: string
    is_admin?: number
    position_id?: string
    is_attendance_admin?: number
    hire_date?: string
  }>()

  const updates: string[] = []
  const values: unknown[] = []

  if (name !== undefined) { updates.push('name = ?'); values.push(name) }
  if (position_id !== undefined) {
    // Only CEO/admin can change position
    if (!user.is_ceo && !user.is_admin) {
      return c.json({ error: 'Only CEO or admin can change position' }, 403)
    }
    updates.push('position_id = ?'); values.push(position_id)
  }
  if (newIsAdmin !== undefined) {
    // Only CEO can grant/revoke admin
    if (!user.is_ceo) {
      return c.json({ error: 'Only CEO can change admin status' }, 403)
    }
    updates.push('is_admin = ?'); values.push(newIsAdmin)
  }
  if (is_attendance_admin !== undefined) {
    if (!user.is_ceo && !user.is_admin) {
      return c.json({ error: 'Only CEO or admin can change attendance admin status' }, 403)
    }
    updates.push('is_attendance_admin = ?'); values.push(is_attendance_admin)
  }
  if (hire_date !== undefined) {
    if (!user.is_ceo && !user.is_admin) {
      return c.json({ error: 'Only CEO or admin can change hire date' }, 403)
    }
    updates.push('hire_date = ?'); values.push(hire_date)
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400)
  }

  values.push(memberId, user.org_id)
  await c.env.DB.prepare(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`
  ).bind(...values).run()

  const updated = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.name, u.avatar_url, u.is_ceo, u.is_admin, u.is_attendance_admin, u.position_id, u.hire_date, u.created_at,
           p.name as position_name, p.level as position_level
    FROM users u
    LEFT JOIN positions p ON p.id = u.position_id
    WHERE u.id = ? AND u.org_id = ?
  `).bind(memberId, user.org_id).first()

  return c.json({ member: updated })
})

// Add member to department
membersRoutes.post('/:id/departments', async (c) => {
  const user = c.get('user')
  const memberId = c.req.param('id')

  const { departmentId, role } = await c.req.json<{
    departmentId: string
    role?: 'head' | 'member'
  }>()

  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'Only CEO or admin can assign departments' }, 403)
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
  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'Only CEO or admin can remove department assignments' }, 403)
  }

  const memberId = c.req.param('id')
  const deptId = c.req.param('deptId')

  await c.env.DB.prepare(
    'DELETE FROM user_departments WHERE user_id = ? AND department_id = ?'
  ).bind(memberId, deptId).run()

  return c.json({ success: true })
})
