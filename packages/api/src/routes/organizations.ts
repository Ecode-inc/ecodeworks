import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'

type Variables = { user: AuthUser }

export const organizationsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

organizationsRoutes.use('/*', authMiddleware)

// Get current organization
organizationsRoutes.get('/', async (c) => {
  const user = c.get('user')

  const org = await c.env.DB.prepare(
    'SELECT id, name, slug, logo_url, sidebar_theme, sidebar_color, created_at FROM organizations WHERE id = ?'
  ).bind(user.org_id).first()

  if (!org) {
    return c.json({ error: 'Organization not found' }, 404)
  }

  return c.json({ organization: org })
})

// Update organization
organizationsRoutes.patch('/', async (c) => {
  const user = c.get('user')
  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'Only CEO or admin can update organization' }, 403)
  }

  const { name, sidebar_theme, sidebar_color } = await c.req.json<{ name?: string; sidebar_theme?: string; sidebar_color?: string }>()

  if (name) {
    await c.env.DB.prepare(
      'UPDATE organizations SET name = ? WHERE id = ?'
    ).bind(name, user.org_id).run()
  }

  if (sidebar_theme) {
    const validThemes = ['dark', 'light', 'custom']
    if (validThemes.includes(sidebar_theme)) {
      await c.env.DB.prepare(
        'UPDATE organizations SET sidebar_theme = ? WHERE id = ?'
      ).bind(sidebar_theme, user.org_id).run()
    }
  }

  if (sidebar_color) {
    await c.env.DB.prepare(
      'UPDATE organizations SET sidebar_color = ? WHERE id = ?'
    ).bind(sidebar_color, user.org_id).run()
  }

  const org = await c.env.DB.prepare(
    'SELECT id, name, slug, logo_url, sidebar_theme, sidebar_color, created_at FROM organizations WHERE id = ?'
  ).bind(user.org_id).first()

  return c.json({ organization: org })
})

// Update organization slug
organizationsRoutes.patch('/slug', async (c) => {
  const user = c.get('user')
  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'Only CEO or admin can update organization slug' }, 403)
  }

  const { slug } = await c.req.json<{ slug?: string }>()

  if (!slug) {
    return c.json({ error: 'slug is required' }, 400)
  }

  const normalized = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '')
  if (!normalized) {
    return c.json({ error: 'Invalid slug' }, 400)
  }

  // Check if slug is already taken by another org
  const existing = await c.env.DB.prepare(
    'SELECT id FROM organizations WHERE slug = ? AND id != ?'
  ).bind(normalized, user.org_id).first()

  if (existing) {
    return c.json({ error: 'Slug already in use' }, 409)
  }

  await c.env.DB.prepare(
    'UPDATE organizations SET slug = ? WHERE id = ?'
  ).bind(normalized, user.org_id).run()

  const org = await c.env.DB.prepare(
    'SELECT id, name, slug, logo_url, sidebar_theme, sidebar_color, created_at FROM organizations WHERE id = ?'
  ).bind(user.org_id).first()

  return c.json({ organization: org })
})

// Upload organization logo
organizationsRoutes.post('/logo', async (c) => {
  const user = c.get('user')
  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'Only CEO or admin can upload logo' }, 403)
  }

  const formData = await c.req.formData()
  const file = formData.get('file') as unknown as File | null

  if (!file || typeof file === 'string') {
    return c.json({ error: 'No file provided' }, 400)
  }

  const key = `logos/${user.org_id}/${file.name}`
  await c.env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  })

  const logoUrl = `/api/files/${key}`

  await c.env.DB.prepare(
    'UPDATE organizations SET logo_url = ? WHERE id = ?'
  ).bind(logoUrl, user.org_id).run()

  return c.json({ logo_url: logoUrl })
})

// Get organization logo
organizationsRoutes.get('/logo', async (c) => {
  const user = c.get('user')

  const org = await c.env.DB.prepare(
    'SELECT logo_url FROM organizations WHERE id = ?'
  ).bind(user.org_id).first<{ logo_url: string }>()

  if (!org || !org.logo_url) {
    return c.json({ error: 'No logo found' }, 404)
  }

  const key = org.logo_url.replace('/api/files/', '')
  const object = await c.env.FILES.get(key)

  if (!object) {
    return c.json({ error: 'Logo file not found' }, 404)
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control', 'public, max-age=86400')
  return new Response(object.body, { headers })
})

// Dashboard statistics
organizationsRoutes.get('/dashboard', async (c) => {
  const user = c.get('user')
  const orgId = user.org_id
  const today = new Date().toISOString().slice(0, 10)

  // Get start/end of current week (Monday-Sunday)
  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const weekStart = monday.toISOString().slice(0, 10)
  const weekEnd = sunday.toISOString().slice(0, 10) + 'T23:59:59'

  // For non-admin users, get their department IDs
  let deptIds: string[] = []
  if (!user.is_ceo && !user.is_admin) {
    const depts = await c.env.DB.prepare(
      'SELECT department_id FROM user_departments WHERE user_id = ?'
    ).bind(user.id).all<{ department_id: string }>()
    deptIds = (depts.results || []).map(d => d.department_id)
  }

  const isFullAccess = user.is_ceo || user.is_admin

  // 1. Events this week
  let eventsThisWeek = 0
  if (isFullAccess) {
    const ev = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM events e
       JOIN departments d ON d.id = e.department_id
       WHERE d.org_id = ? AND e.start_at >= ? AND e.start_at <= ?`
    ).bind(orgId, weekStart, weekEnd).first<{ cnt: number }>()
    eventsThisWeek = ev?.cnt || 0
  } else if (deptIds.length > 0) {
    const placeholders = deptIds.map(() => '?').join(',')
    const ev = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM events
       WHERE department_id IN (${placeholders}) AND start_at >= ? AND start_at <= ?`
    ).bind(...deptIds, weekStart, weekEnd).first<{ cnt: number }>()
    eventsThisWeek = ev?.cnt || 0
  }

  // 2. Pending tasks (not in a column named 'Done' or '완료')
  let pendingTasks = 0
  if (isFullAccess) {
    const tk = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT t.id) as cnt FROM tasks t
       JOIN board_columns c ON c.id = t.column_id
       JOIN boards b ON b.id = t.board_id
       JOIN departments d ON d.id = b.department_id
       WHERE d.org_id = ? AND LOWER(c.name) NOT IN ('done', '완료')`
    ).bind(orgId).first<{ cnt: number }>()
    pendingTasks = tk?.cnt || 0
  } else if (deptIds.length > 0) {
    const placeholders = deptIds.map(() => '?').join(',')
    const tk = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT t.id) as cnt FROM tasks t
       JOIN board_columns c ON c.id = t.column_id
       JOIN boards b ON b.id = t.board_id
       WHERE b.department_id IN (${placeholders}) AND LOWER(c.name) NOT IN ('done', '완료')`
    ).bind(...deptIds).first<{ cnt: number }>()
    pendingTasks = tk?.cnt || 0
  }

  // 3. Pending leave requests (for approvers: where user is approver1_id or approver2_id)
  let pendingLeave = 0
  if (isFullAccess) {
    const lv = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM leave_requests WHERE org_id = ? AND status = 'pending' AND is_deleted = 0`
    ).bind(orgId).first<{ cnt: number }>()
    pendingLeave = lv?.cnt || 0
  } else {
    const lv = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM leave_requests
       WHERE org_id = ? AND status = 'pending' AND is_deleted = 0
       AND (approver1_id = ? OR approver2_id = ?)`
    ).bind(orgId, user.id, user.id).first<{ cnt: number }>()
    pendingLeave = lv?.cnt || 0
  }

  // 4. Pending purchase requests
  let pendingPurchases = 0
  if (isFullAccess) {
    const pr = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM purchases WHERE org_id = ? AND status = 'pending' AND is_deleted = 0`
    ).bind(orgId).first<{ cnt: number }>()
    pendingPurchases = pr?.cnt || 0
  } else if (deptIds.length > 0) {
    const placeholders = deptIds.map(() => '?').join(',')
    const pr = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM purchases
       WHERE org_id = ? AND status = 'pending' AND is_deleted = 0
       AND department_id IN (${placeholders})`
    ).bind(orgId, ...deptIds).first<{ cnt: number }>()
    pendingPurchases = pr?.cnt || 0
  }

  // 5. Recent documents (last 5 updated)
  let recentDocs: any[] = []
  if (isFullAccess) {
    const docs = await c.env.DB.prepare(
      `SELECT d.id, d.title, d.updated_at, d.created_by, u.name as author_name
       FROM documents d
       LEFT JOIN users u ON u.id = d.created_by
       JOIN departments dept ON dept.id = d.department_id
       WHERE dept.org_id = ? AND d.is_folder = 0
       ORDER BY d.updated_at DESC LIMIT 5`
    ).bind(orgId).all()
    recentDocs = docs.results || []
  } else if (deptIds.length > 0) {
    const placeholders = deptIds.map(() => '?').join(',')
    const docs = await c.env.DB.prepare(
      `SELECT d.id, d.title, d.updated_at, d.created_by, u.name as author_name
       FROM documents d
       LEFT JOIN users u ON u.id = d.created_by
       WHERE d.department_id IN (${placeholders}) AND d.is_folder = 0
       ORDER BY d.updated_at DESC LIMIT 5`
    ).bind(...deptIds).all()
    recentDocs = docs.results || []
  }

  // 6. Today's attendance count
  const att = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM attendance_records
     WHERE org_id = ? AND date = ? AND clock_in IS NOT NULL`
  ).bind(orgId, today).first<{ cnt: number }>()
  const todayAttendance = att?.cnt || 0

  return c.json({
    eventsThisWeek,
    pendingTasks,
    pendingLeave,
    pendingPurchases,
    recentDocs,
    todayAttendance,
  })
})
