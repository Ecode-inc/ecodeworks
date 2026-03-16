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
    'SELECT id, name, slug, created_at FROM organizations WHERE id = ?'
  ).bind(user.org_id).first()

  if (!org) {
    return c.json({ error: 'Organization not found' }, 404)
  }

  return c.json({ organization: org })
})

// Update organization
organizationsRoutes.patch('/', async (c) => {
  const user = c.get('user')
  if (!user.is_ceo) {
    return c.json({ error: 'Only CEO can update organization' }, 403)
  }

  const { name } = await c.req.json<{ name?: string }>()

  if (name) {
    await c.env.DB.prepare(
      'UPDATE organizations SET name = ? WHERE id = ?'
    ).bind(name, user.org_id).run()
  }

  const org = await c.env.DB.prepare(
    'SELECT id, name, slug, created_at FROM organizations WHERE id = ?'
  ).bind(user.org_id).first()

  return c.json({ organization: org })
})
