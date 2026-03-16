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
