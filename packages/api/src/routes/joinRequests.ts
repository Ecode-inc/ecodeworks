import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { hashPassword } from '../lib/password'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const joinRequestsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

// ── Public endpoint (no auth) ──

// Get departments for an org by slug (public, for the signup form)
joinRequestsRoutes.get('/departments', async (c) => {
  const orgSlug = c.req.query('orgSlug')
  if (!orgSlug) {
    return c.json({ error: 'orgSlug is required' }, 400)
  }

  const org = await c.env.DB.prepare(
    'SELECT id FROM organizations WHERE slug = ?'
  ).bind(orgSlug).first<{ id: string }>()

  if (!org) {
    return c.json({ error: 'Organization not found' }, 404)
  }

  const { results } = await c.env.DB.prepare(
    'SELECT id, name, color FROM departments WHERE org_id = ? ORDER BY name ASC'
  ).bind(org.id).all<{ id: string; name: string; color: string }>()

  return c.json({ departments: results ?? [] })
})

// Submit join request
joinRequestsRoutes.post('/', async (c) => {
  const { orgSlug, email, password, name, message, departmentId } = await c.req.json<{
    orgSlug: string
    email: string
    password: string
    name: string
    message?: string
    departmentId?: string
  }>()

  if (!orgSlug || !email || !password || !name) {
    return c.json({ error: 'orgSlug, email, password, and name are required' }, 400)
  }

  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }

  // Look up org by slug
  const org = await c.env.DB.prepare(
    'SELECT id, name FROM organizations WHERE slug = ?'
  ).bind(orgSlug).first<{ id: string; name: string }>()

  if (!org) {
    return c.json({ error: 'Organization not found' }, 404)
  }

  // Check if user already exists in this org
  const existingUser = await c.env.DB.prepare(
    'SELECT id FROM users WHERE org_id = ? AND email = ?'
  ).bind(org.id, email).first()

  if (existingUser) {
    return c.json({ error: 'This email is already registered in this organization' }, 409)
  }

  // Check if there's already a pending request
  const existingRequest = await c.env.DB.prepare(
    "SELECT id FROM join_requests WHERE org_id = ? AND email = ? AND status = 'pending'"
  ).bind(org.id, email).first()

  if (existingRequest) {
    return c.json({ error: 'A pending join request already exists for this email' }, 409)
  }

  const id = generateId()
  const passwordHash = await hashPassword(password)

  await c.env.DB.prepare(
    'INSERT INTO join_requests (id, org_id, email, name, password_hash, message, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, org.id, email, name, passwordHash, message || '', departmentId || '').run()

  return c.json({ success: true, message: 'Join request submitted successfully' }, 201)
})

// ── Auth-protected endpoints ──

// List pending requests for the user's org (CEO/admin only)
joinRequestsRoutes.get('/', authMiddleware, async (c) => {
  const user = c.get('user')

  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'Only CEO or admin can view join requests' }, 403)
  }

  const { results } = await c.env.DB.prepare(
    "SELECT id, org_id, email, name, message, department_id, status, created_at FROM join_requests WHERE org_id = ? AND status = 'pending' ORDER BY created_at ASC"
  ).bind(user.org_id).all()

  return c.json({ requests: results })
})

// Count pending requests (for badge)
joinRequestsRoutes.get('/count', authMiddleware, async (c) => {
  const user = c.get('user')

  if (!user.is_ceo && !user.is_admin) {
    return c.json({ count: 0 })
  }

  const result = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM join_requests WHERE org_id = ? AND status = 'pending'"
  ).bind(user.org_id).first<{ count: number }>()

  return c.json({ count: result?.count ?? 0 })
})

// Approve request
joinRequestsRoutes.post('/:id/approve', authMiddleware, async (c) => {
  const user = c.get('user')
  const requestId = c.req.param('id')

  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'Only CEO or admin can approve join requests' }, 403)
  }

  const { departmentId: overrideDeptId, role } = await c.req.json<{
    departmentId?: string
    role?: 'head' | 'member'
  }>()

  // Get the join request
  const joinRequest = await c.env.DB.prepare(
    "SELECT id, org_id, email, name, password_hash, department_id, status FROM join_requests WHERE id = ? AND org_id = ? AND status = 'pending'"
  ).bind(requestId, user.org_id).first<{
    id: string; org_id: string; email: string; name: string; password_hash: string; department_id: string; status: string
  }>()

  if (!joinRequest) {
    return c.json({ error: 'Join request not found or already processed' }, 404)
  }

  // Use override from approve body, or fall back to applicant's chosen department
  const departmentId = overrideDeptId || joinRequest.department_id

  if (!departmentId) {
    return c.json({ error: 'departmentId is required' }, 400)
  }

  // Check if email already exists (could have been added in the meantime)
  const existingUser = await c.env.DB.prepare(
    'SELECT id FROM users WHERE org_id = ? AND email = ?'
  ).bind(user.org_id, joinRequest.email).first()

  if (existingUser) {
    // Mark as rejected since user already exists
    await c.env.DB.prepare(
      "UPDATE join_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
    ).bind(user.id, requestId).run()
    return c.json({ error: 'Email already registered in this organization' }, 409)
  }

  // Verify department belongs to this org
  const dept = await c.env.DB.prepare(
    'SELECT id FROM departments WHERE id = ? AND org_id = ?'
  ).bind(departmentId, user.org_id).first()

  if (!dept) {
    return c.json({ error: 'Department not found' }, 404)
  }

  const memberId = generateId()

  await c.env.DB.batch([
    // Create the user
    c.env.DB.prepare(
      'INSERT INTO users (id, org_id, email, password_hash, name) VALUES (?, ?, ?, ?, ?)'
    ).bind(memberId, user.org_id, joinRequest.email, joinRequest.password_hash, joinRequest.name),
    // Add to department
    c.env.DB.prepare(
      'INSERT INTO user_departments (user_id, department_id, role) VALUES (?, ?, ?)'
    ).bind(memberId, departmentId, role || 'member'),
    // Update join request status
    c.env.DB.prepare(
      "UPDATE join_requests SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
    ).bind(user.id, requestId),
  ])

  return c.json({
    member: { id: memberId, email: joinRequest.email, name: joinRequest.name, is_ceo: false, org_id: user.org_id },
  }, 201)
})

// Reject request
joinRequestsRoutes.post('/:id/reject', authMiddleware, async (c) => {
  const user = c.get('user')
  const requestId = c.req.param('id')

  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'Only CEO or admin can reject join requests' }, 403)
  }

  const joinRequest = await c.env.DB.prepare(
    "SELECT id FROM join_requests WHERE id = ? AND org_id = ? AND status = 'pending'"
  ).bind(requestId, user.org_id).first()

  if (!joinRequest) {
    return c.json({ error: 'Join request not found or already processed' }, 404)
  }

  await c.env.DB.prepare(
    "UPDATE join_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
  ).bind(user.id, requestId).run()

  return c.json({ success: true })
})
