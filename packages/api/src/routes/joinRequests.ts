import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { hashPassword } from '../lib/password'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const joinRequestsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

// ── Public endpoint (no auth) ──

// Submit join request
joinRequestsRoutes.post('/', async (c) => {
  const { orgSlug, email, password, name, message } = await c.req.json<{
    orgSlug: string
    email: string
    password: string
    name: string
    message?: string
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
    'INSERT INTO join_requests (id, org_id, email, name, password_hash, message) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, org.id, email, name, passwordHash, message || '').run()

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
    "SELECT id, org_id, email, name, message, status, created_at FROM join_requests WHERE org_id = ? AND status = 'pending' ORDER BY created_at ASC"
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

  const { departmentId, role } = await c.req.json<{
    departmentId: string
    role?: 'head' | 'member'
  }>()

  if (!departmentId) {
    return c.json({ error: 'departmentId is required' }, 400)
  }

  // Get the join request
  const joinRequest = await c.env.DB.prepare(
    "SELECT id, org_id, email, name, password_hash, status FROM join_requests WHERE id = ? AND org_id = ? AND status = 'pending'"
  ).bind(requestId, user.org_id).first<{
    id: string; org_id: string; email: string; name: string; password_hash: string; status: string
  }>()

  if (!joinRequest) {
    return c.json({ error: 'Join request not found or already processed' }, 404)
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
