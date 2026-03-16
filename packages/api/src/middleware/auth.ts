import { createMiddleware } from 'hono/factory'
import type { Env, AuthUser } from '../types'
import { verifyJWT } from '../lib/jwt'

type Variables = { user: AuthUser }

export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid Authorization header' }, 401)
    }

    const token = authHeader.slice(7)
    try {
      const payload = await verifyJWT(token, c.env.JWT_SECRET)
      c.set('user', {
        id: payload.sub,
        org_id: payload.org,
        email: payload.email,
        name: payload.name,
        is_ceo: payload.is_ceo,
        is_admin: payload.is_admin,
      })
      await next()
    } catch (e) {
      return c.json({ error: 'Invalid or expired token' }, 401)
    }
  }
)
