import { Hono } from 'hono'
import type { Env } from '../types'
import { hashPassword, verifyPassword } from '../lib/password'
import { generateId } from '../lib/id'
import { superAuthMiddleware, type SuperAdminUser } from '../middleware/superAuth'

const SUPER_TOKEN_EXPIRES = 4 * 3600 // 4 hours

type Variables = { superAdmin: SuperAdminUser }

export const superAdminRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

// ─── Auth (public, no middleware) ───────────────────────────────────

// Setup: create initial super admin (only works when no super admins exist)
superAdminRoutes.post('/auth/setup', async (c) => {
  const count = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM super_admins'
  ).first<{ cnt: number }>()

  if (count && count.cnt > 0) {
    return c.json({ error: 'Setup already completed. Super admin exists.' }, 403)
  }

  const { email, password, name } = await c.req.json<{
    email: string
    password: string
    name: string
  }>()

  if (!email || !password || !name) {
    return c.json({ error: 'email, password, and name are required' }, 400)
  }

  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }

  const id = generateId()
  const passwordHash = await hashPassword(password)

  await c.env.DB.prepare(
    'INSERT INTO super_admins (id, email, password_hash, name) VALUES (?, ?, ?, ?)'
  ).bind(id, email, passwordHash, name).run()

  return c.json({ success: true, message: 'Super admin created. You can now login.' }, 201)
})

// Login
superAdminRoutes.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json<{
    email: string
    password: string
  }>()

  if (!email || !password) {
    return c.json({ error: 'email and password are required' }, 400)
  }

  const admin = await c.env.DB.prepare(
    'SELECT id, email, password_hash, name FROM super_admins WHERE email = ?'
  ).bind(email).first<{ id: string; email: string; password_hash: string; name: string }>()

  if (!admin || !(await verifyPassword(password, admin.password_hash))) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  const token = await signSuperJWT(
    { sub: admin.id, email: admin.email, name: admin.name, role: 'super_admin' as const },
    c.env.JWT_SECRET,
    SUPER_TOKEN_EXPIRES
  )

  return c.json({
    admin: { id: admin.id, email: admin.email, name: admin.name },
    token,
  })
})

// ─── Protected routes (super admin only) ────────────────────────────

superAdminRoutes.use('/*', async (c, next) => {
  // Skip auth for login/setup endpoints
  const path = c.req.path
  if (path.endsWith('/auth/login') || path.endsWith('/auth/setup')) {
    return next()
  }
  return superAuthMiddleware(c, next)
})

// Dashboard stats
superAdminRoutes.get('/dashboard', async (c) => {
  const totalOrgs = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM organizations'
  ).first<{ cnt: number }>()

  const totalUsers = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM users'
  ).first<{ cnt: number }>()

  const planDist = await c.env.DB.prepare(
    `SELECT COALESCE(s.plan, 'free') as plan, COUNT(*) as cnt
     FROM organizations o
     LEFT JOIN org_subscriptions s ON s.org_id = o.id
     GROUP BY COALESCE(s.plan, 'free')`
  ).all<{ plan: string; cnt: number }>()

  const activeOrgs = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM organizations o
     LEFT JOIN org_subscriptions s ON s.org_id = o.id
     WHERE s.is_active IS NULL OR s.is_active = 1`
  ).first<{ cnt: number }>()

  return c.json({
    totalOrgs: totalOrgs?.cnt ?? 0,
    totalUsers: totalUsers?.cnt ?? 0,
    planDistribution: planDist?.results ?? [],
    activeOrgs: activeOrgs?.cnt ?? 0,
  })
})

// List all organizations
superAdminRoutes.get('/organizations', async (c) => {
  const { results: orgs } = await c.env.DB.prepare(
    `SELECT o.id, o.name, o.slug, o.created_at,
            s.plan, s.max_users, s.max_departments, s.max_storage_mb, s.is_active, s.expires_at,
            (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id) as user_count,
            (SELECT COUNT(*) FROM departments d WHERE d.org_id = o.id) as dept_count
     FROM organizations o
     LEFT JOIN org_subscriptions s ON s.org_id = o.id
     ORDER BY o.created_at DESC`
  ).all()

  return c.json({ organizations: orgs })
})

// Get organization detail
superAdminRoutes.get('/organizations/:id', async (c) => {
  const orgId = c.req.param('id')

  const org = await c.env.DB.prepare(
    `SELECT o.id, o.name, o.slug, o.created_at,
            s.plan, s.max_users, s.max_departments, s.max_storage_mb, s.features, s.is_active, s.started_at, s.expires_at
     FROM organizations o
     LEFT JOIN org_subscriptions s ON s.org_id = o.id
     WHERE o.id = ?`
  ).bind(orgId).first()

  if (!org) {
    return c.json({ error: 'Organization not found' }, 404)
  }

  const { results: users } = await c.env.DB.prepare(
    'SELECT id, email, name, is_ceo, is_admin, created_at FROM users WHERE org_id = ?'
  ).bind(orgId).all()

  const { results: departments } = await c.env.DB.prepare(
    'SELECT id, name, slug, color, order_index FROM departments WHERE org_id = ? ORDER BY order_index'
  ).bind(orgId).all()

  return c.json({ organization: org, users, departments })
})

// Update organization
superAdminRoutes.patch('/organizations/:id', async (c) => {
  const orgId = c.req.param('id')
  const admin = c.get('superAdmin')
  const { name, slug } = await c.req.json<{ name?: string; slug?: string }>()

  const updates: string[] = []
  const values: string[] = []

  if (name) {
    updates.push('name = ?')
    values.push(name)
  }
  if (slug) {
    // Check slug uniqueness
    const existing = await c.env.DB.prepare(
      'SELECT id FROM organizations WHERE slug = ? AND id != ?'
    ).bind(slug, orgId).first()
    if (existing) {
      return c.json({ error: 'Slug already in use' }, 409)
    }
    updates.push('slug = ?')
    values.push(slug)
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400)
  }

  values.push(orgId)
  await c.env.DB.prepare(
    `UPDATE organizations SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run()

  await logAudit(c.env.DB, admin.id, 'update_org', 'organization', orgId, JSON.stringify({ name, slug }))

  const org = await c.env.DB.prepare('SELECT * FROM organizations WHERE id = ?').bind(orgId).first()
  return c.json({ organization: org })
})

// Suspend organization
superAdminRoutes.post('/organizations/:id/suspend', async (c) => {
  const orgId = c.req.param('id')
  const admin = c.get('superAdmin')

  // Ensure subscription row exists
  await ensureSubscription(c.env.DB, orgId)

  await c.env.DB.prepare(
    'UPDATE org_subscriptions SET is_active = 0 WHERE org_id = ?'
  ).bind(orgId).run()

  await logAudit(c.env.DB, admin.id, 'suspend_org', 'organization', orgId, '')

  return c.json({ success: true })
})

// Activate organization
superAdminRoutes.post('/organizations/:id/activate', async (c) => {
  const orgId = c.req.param('id')
  const admin = c.get('superAdmin')

  await ensureSubscription(c.env.DB, orgId)

  await c.env.DB.prepare(
    'UPDATE org_subscriptions SET is_active = 1 WHERE org_id = ?'
  ).bind(orgId).run()

  await logAudit(c.env.DB, admin.id, 'activate_org', 'organization', orgId, '')

  return c.json({ success: true })
})

// Get subscription
superAdminRoutes.get('/organizations/:id/subscription', async (c) => {
  const orgId = c.req.param('id')

  await ensureSubscription(c.env.DB, orgId)

  const sub = await c.env.DB.prepare(
    'SELECT * FROM org_subscriptions WHERE org_id = ?'
  ).bind(orgId).first()

  return c.json({ subscription: sub })
})

// Update subscription
superAdminRoutes.patch('/organizations/:id/subscription', async (c) => {
  const orgId = c.req.param('id')
  const admin = c.get('superAdmin')
  const body = await c.req.json<{
    plan?: string
    max_users?: number
    max_departments?: number
    max_storage_mb?: number
    features?: string[]
    expires_at?: string | null
  }>()

  await ensureSubscription(c.env.DB, orgId)

  const updates: string[] = []
  const values: (string | number | null)[] = []

  if (body.plan) {
    if (!['free', 'starter', 'business', 'enterprise'].includes(body.plan)) {
      return c.json({ error: 'Invalid plan' }, 400)
    }
    updates.push('plan = ?')
    values.push(body.plan)
  }
  if (body.max_users !== undefined) {
    updates.push('max_users = ?')
    values.push(body.max_users)
  }
  if (body.max_departments !== undefined) {
    updates.push('max_departments = ?')
    values.push(body.max_departments)
  }
  if (body.max_storage_mb !== undefined) {
    updates.push('max_storage_mb = ?')
    values.push(body.max_storage_mb)
  }
  if (body.features !== undefined) {
    updates.push('features = ?')
    values.push(JSON.stringify(body.features))
  }
  if (body.expires_at !== undefined) {
    updates.push('expires_at = ?')
    values.push(body.expires_at)
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400)
  }

  values.push(orgId)
  await c.env.DB.prepare(
    `UPDATE org_subscriptions SET ${updates.join(', ')} WHERE org_id = ?`
  ).bind(...values).run()

  await logAudit(c.env.DB, admin.id, 'update_subscription', 'subscription', orgId, JSON.stringify(body))

  const sub = await c.env.DB.prepare(
    'SELECT * FROM org_subscriptions WHERE org_id = ?'
  ).bind(orgId).first()

  return c.json({ subscription: sub })
})

// Audit log
superAdminRoutes.get('/audit', async (c) => {
  const action = c.req.query('action')
  const targetType = c.req.query('target_type')
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')

  let sql = `SELECT p.*, sa.name as admin_name, sa.email as admin_email
             FROM platform_audit_log p
             JOIN super_admins sa ON sa.id = p.admin_id`
  const conditions: string[] = []
  const bindings: string[] = []

  if (action) {
    conditions.push('p.action = ?')
    bindings.push(action)
  }
  if (targetType) {
    conditions.push('p.target_type = ?')
    bindings.push(targetType)
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }

  sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?'

  const stmt = c.env.DB.prepare(sql)
  const { results } = await stmt.bind(...bindings, limit, offset).all()

  return c.json({ logs: results })
})

// ─── Helpers ─────────────────────────────────────────────────────────

async function ensureSubscription(db: D1Database, orgId: string): Promise<void> {
  const existing = await db.prepare(
    'SELECT org_id FROM org_subscriptions WHERE org_id = ?'
  ).bind(orgId).first()

  if (!existing) {
    await db.prepare(
      'INSERT INTO org_subscriptions (org_id) VALUES (?)'
    ).bind(orgId).run()
  }
}

async function logAudit(
  db: D1Database,
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  details: string
): Promise<void> {
  const id = generateId()
  await db.prepare(
    'INSERT INTO platform_audit_log (id, admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, adminId, action, targetType, targetId, details).run()
}

async function signSuperJWT(
  payload: { sub: string; email: string; name: string; role: 'super_admin' },
  secret: string,
  expiresInSeconds: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds }

  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(fullPayload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  const encodedSignature = base64urlFromBuffer(signature)

  return `${signingInput}.${encodedSignature}`
}

function base64url(str: string): string {
  const bytes = new TextEncoder().encode(str)
  return base64urlFromBuffer(bytes.buffer as ArrayBuffer)
}

function base64urlFromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
