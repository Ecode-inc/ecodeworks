import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'

type Variables = { user: AuthUser }

export const notificationRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

notificationRoutes.use('/*', authMiddleware)

// List notifications for current user
notificationRoutes.get('/', async (c) => {
  const user = c.get('user')
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100)
  const unreadOnly = c.req.query('unread_only') === '1'

  let query = 'SELECT * FROM notifications WHERE user_id = ? AND org_id = ?'
  const params: unknown[] = [user.id, user.org_id]

  if (unreadOnly) {
    query += ' AND is_read = 0'
  }

  query += ' ORDER BY created_at DESC LIMIT ?'
  params.push(limit)

  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ notifications: results || [] })
})

// Count unread notifications
notificationRoutes.get('/count', async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND org_id = ? AND is_read = 0'
  ).bind(user.id, user.org_id).first<{ count: number }>()
  return c.json({ count: row?.count || 0 })
})

// Mark single notification as read
notificationRoutes.post('/:id/read', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  await c.env.DB.prepare(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).run()
  return c.json({ success: true })
})

// Mark all notifications as read
notificationRoutes.post('/read-all', async (c) => {
  const user = c.get('user')
  await c.env.DB.prepare(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND org_id = ? AND is_read = 0'
  ).bind(user.id, user.org_id).run()
  return c.json({ success: true })
})
