import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { hashPassword, verifyPassword } from '../lib/password'
import { signJWT, verifyJWT } from '../lib/jwt'
import { generateId } from '../lib/id'
import { authMiddleware } from '../middleware/auth'

const ACCESS_TOKEN_EXPIRES = 15 * 60        // 15 minutes
const REFRESH_TOKEN_EXPIRES = 7 * 24 * 3600 // 7 days

type Variables = { user: AuthUser }

export const authRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

// Register (creates org + user + default department)
authRoutes.post('/register', async (c) => {
  const { email, password, name, orgName } = await c.req.json<{
    email: string
    password: string
    name: string
    orgName: string
  }>()

  if (!email || !password || !name || !orgName) {
    return c.json({ error: 'All fields are required' }, 400)
  }

  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }

  const orgId = generateId()
  const userId = generateId()
  const deptId = generateId()
  let slug = orgName.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/(^-|-$)/g, '')
  // If slug is empty or only Korean, generate from org name or use a fallback
  if (!slug || slug === '-') {
    slug = orgName.trim().replace(/\s+/g, '-')
  }

  // Check if org slug exists
  const existing = await c.env.DB.prepare(
    'SELECT id FROM organizations WHERE slug = ?'
  ).bind(slug).first()
  if (existing) {
    return c.json({ error: 'Organization slug already exists' }, 409)
  }

  const passwordHash = await hashPassword(password)

  // Create org, user (as CEO), and default department in a batch
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)'
    ).bind(orgId, orgName, slug),
    c.env.DB.prepare(
      'INSERT INTO users (id, org_id, email, password_hash, name, is_ceo) VALUES (?, ?, ?, ?, ?, 1)'
    ).bind(userId, orgId, email, passwordHash, name),
    c.env.DB.prepare(
      'INSERT INTO departments (id, org_id, name, slug, color, order_index) VALUES (?, ?, ?, ?, ?, 0)'
    ).bind(deptId, orgId, '일반', 'general', '#3B82F6'),
    c.env.DB.prepare(
      'INSERT INTO user_departments (user_id, department_id, role) VALUES (?, ?, ?)'
    ).bind(userId, deptId, 'head'),
    // Default permissions for the general department
    ...['calendar', 'kanban', 'docs', 'vault', 'qa'].map(mod =>
      c.env.DB.prepare(
        'INSERT INTO department_permissions (department_id, module, permission) VALUES (?, ?, ?)'
      ).bind(deptId, mod, 'write')
    ),
  ])

  // Generate tokens
  const accessToken = await signJWT(
    { sub: userId, org: orgId, email, name, is_ceo: true },
    c.env.JWT_SECRET,
    ACCESS_TOKEN_EXPIRES
  )
  const refreshToken = await generateRefreshToken(c.env.DB, userId)

  return c.json({
    user: { id: userId, email, name, is_ceo: true, org_id: orgId },
    organization: { id: orgId, name: orgName, slug },
    accessToken,
    refreshToken,
  }, 201)
})

// Login
authRoutes.post('/login', async (c) => {
  const { email, password, orgSlug } = await c.req.json<{
    email: string
    password: string
    orgSlug: string
  }>()

  if (!email || !password || !orgSlug) {
    return c.json({ error: 'Email, password, and orgSlug are required' }, 400)
  }

  // Find org
  const org = await c.env.DB.prepare(
    'SELECT id, name, slug FROM organizations WHERE slug = ?'
  ).bind(orgSlug).first<{ id: string; name: string; slug: string }>()
  if (!org) {
    return c.json({ error: 'Organization not found' }, 404)
  }

  // Find user
  const user = await c.env.DB.prepare(
    'SELECT id, email, password_hash, name, is_ceo FROM users WHERE org_id = ? AND email = ?'
  ).bind(org.id, email).first<{ id: string; email: string; password_hash: string; name: string; is_ceo: number }>()

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  const accessToken = await signJWT(
    { sub: user.id, org: org.id, email: user.email, name: user.name, is_ceo: !!user.is_ceo },
    c.env.JWT_SECRET,
    ACCESS_TOKEN_EXPIRES
  )
  const refreshToken = await generateRefreshToken(c.env.DB, user.id)

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, is_ceo: !!user.is_ceo, org_id: org.id },
    organization: { id: org.id, name: org.name, slug: org.slug },
    accessToken,
    refreshToken,
  })
})

// Refresh token
authRoutes.post('/refresh', async (c) => {
  const { refreshToken } = await c.req.json<{ refreshToken: string }>()
  if (!refreshToken) {
    return c.json({ error: 'refreshToken is required' }, 400)
  }

  const tokenHash = await hashToken(refreshToken)

  // Find and validate refresh token
  const stored = await c.env.DB.prepare(
    'SELECT user_id, expires_at FROM refresh_tokens WHERE token_hash = ?'
  ).bind(tokenHash).first<{ user_id: string; expires_at: string }>()

  if (!stored || new Date(stored.expires_at) < new Date()) {
    // Clean up expired token
    if (stored) {
      await c.env.DB.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').bind(tokenHash).run()
    }
    return c.json({ error: 'Invalid or expired refresh token' }, 401)
  }

  // Delete old refresh token (rotation)
  await c.env.DB.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').bind(tokenHash).run()

  // Get user
  const user = await c.env.DB.prepare(
    'SELECT id, org_id, email, name, is_ceo FROM users WHERE id = ?'
  ).bind(stored.user_id).first<{ id: string; org_id: string; email: string; name: string; is_ceo: number }>()

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  const accessToken = await signJWT(
    { sub: user.id, org: user.org_id, email: user.email, name: user.name, is_ceo: !!user.is_ceo },
    c.env.JWT_SECRET,
    ACCESS_TOKEN_EXPIRES
  )
  const newRefreshToken = await generateRefreshToken(c.env.DB, user.id)

  return c.json({ accessToken, refreshToken: newRefreshToken })
})

// Get current user
authRoutes.get('/me', authMiddleware, async (c) => {
  const authUser = c.get('user')

  const user = await c.env.DB.prepare(
    'SELECT id, org_id, email, name, avatar_url, is_ceo FROM users WHERE id = ?'
  ).bind(authUser.id).first()

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  // Get user's departments with roles
  const { results: departments } = await c.env.DB.prepare(`
    SELECT d.id, d.name, d.slug, d.color, ud.role
    FROM user_departments ud
    JOIN departments d ON d.id = ud.department_id
    WHERE ud.user_id = ?
    ORDER BY d.order_index
  `).bind(authUser.id).all()

  return c.json({ user, departments })
})

// Helpers
async function generateRefreshToken(db: D1Database, userId: string): Promise<string> {
  const token = generateId() + '-' + generateId()
  const tokenHash = await hashToken(token)
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES * 1000).toISOString()

  await db.prepare(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
  ).bind(userId, tokenHash, expiresAt).run()

  return token
}

async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token)
  const hash = await crypto.subtle.digest('SHA-256', encoded)
  const bytes = new Uint8Array(hash)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}
