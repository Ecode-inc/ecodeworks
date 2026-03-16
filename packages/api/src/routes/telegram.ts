import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const telegramRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

telegramRoutes.use('/*', authMiddleware)

// ──────────────────────────────────────────────────────────────
// Chat management
// ──────────────────────────────────────────────────────────────

// List connected telegram chats for org
telegramRoutes.get('/chats', async (c) => {
  const user = c.get('user')

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM telegram_chats WHERE org_id = ? ORDER BY created_at DESC'
  ).bind(user.org_id).all()

  return c.json({ chats: results })
})

// Register a telegram chat
telegramRoutes.post('/chats', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{
    chat_id: string
    chat_type: string
    chat_title?: string
  }>()

  if (!body.chat_id || !body.chat_type) {
    return c.json({ error: 'chat_id and chat_type are required' }, 400)
  }

  if (!['private', 'group', 'supergroup'].includes(body.chat_type)) {
    return c.json({ error: 'chat_type must be one of: private, group, supergroup' }, 400)
  }

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO telegram_chats (id, org_id, chat_id, chat_type, chat_title)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, user.org_id, body.chat_id, body.chat_type, body.chat_title || '').run()

  const chat = await c.env.DB.prepare('SELECT * FROM telegram_chats WHERE id = ?').bind(id).first()
  return c.json({ chat }, 201)
})

// Disconnect a chat
telegramRoutes.delete('/chats/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const existing = await c.env.DB.prepare(
    'SELECT id FROM telegram_chats WHERE id = ? AND org_id = ?'
  ).bind(id, user.org_id).first()
  if (!existing) return c.json({ error: 'Chat not found' }, 404)

  await c.env.DB.prepare('DELETE FROM telegram_chats WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// Update chat (is_active, chat_title)
telegramRoutes.patch('/chats/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const existing = await c.env.DB.prepare(
    'SELECT id FROM telegram_chats WHERE id = ? AND org_id = ?'
  ).bind(id, user.org_id).first()
  if (!existing) return c.json({ error: 'Chat not found' }, 404)

  const body = await c.req.json<Record<string, unknown>>()
  const allowedFields = ['is_active', 'chat_title']
  const sets: string[] = []
  const params: unknown[] = []

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`)
      params.push(body[field])
    }
  }

  if (sets.length === 0) return c.json({ error: 'No valid fields to update' }, 400)

  params.push(id)
  await c.env.DB.prepare(`UPDATE telegram_chats SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()

  const chat = await c.env.DB.prepare('SELECT * FROM telegram_chats WHERE id = ?').bind(id).first()
  return c.json({ chat })
})

// ──────────────────────────────────────────────────────────────
// User mapping
// ──────────────────────────────────────────────────────────────

// List all telegram user mappings
telegramRoutes.get('/mappings', async (c) => {
  const user = c.get('user')

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM telegram_user_mappings WHERE org_id = ? ORDER BY created_at DESC'
  ).bind(user.org_id).all()

  return c.json({ mappings: results })
})

// Create mapping
telegramRoutes.post('/mappings', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{
    telegram_user_id: string
    telegram_username?: string
    telegram_display_name?: string
    user_id?: string
  }>()

  if (!body.telegram_user_id) {
    return c.json({ error: 'telegram_user_id is required' }, 400)
  }

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO telegram_user_mappings (id, org_id, telegram_user_id, telegram_username, telegram_display_name, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    user.org_id,
    body.telegram_user_id,
    body.telegram_username || '',
    body.telegram_display_name || '',
    body.user_id || null
  ).run()

  const mapping = await c.env.DB.prepare('SELECT * FROM telegram_user_mappings WHERE id = ?').bind(id).first()
  return c.json({ mapping }, 201)
})

// Update mapping (link/unlink user_id)
telegramRoutes.patch('/mappings/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const existing = await c.env.DB.prepare(
    'SELECT id FROM telegram_user_mappings WHERE id = ? AND org_id = ?'
  ).bind(id, user.org_id).first()
  if (!existing) return c.json({ error: 'Mapping not found' }, 404)

  const body = await c.req.json<Record<string, unknown>>()
  const allowedFields = ['user_id', 'telegram_username', 'telegram_display_name', 'is_active']
  const sets: string[] = []
  const params: unknown[] = []

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`)
      params.push(body[field])
    }
  }

  if (sets.length === 0) return c.json({ error: 'No valid fields to update' }, 400)

  params.push(id)
  await c.env.DB.prepare(`UPDATE telegram_user_mappings SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()

  const mapping = await c.env.DB.prepare('SELECT * FROM telegram_user_mappings WHERE id = ?').bind(id).first()
  return c.json({ mapping })
})

// Remove mapping
telegramRoutes.delete('/mappings/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const existing = await c.env.DB.prepare(
    'SELECT id FROM telegram_user_mappings WHERE id = ? AND org_id = ?'
  ).bind(id, user.org_id).first()
  if (!existing) return c.json({ error: 'Mapping not found' }, 404)

  await c.env.DB.prepare('DELETE FROM telegram_user_mappings WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// ──────────────────────────────────────────────────────────────
// Command history
// ──────────────────────────────────────────────────────────────

// List command history with pagination
telegramRoutes.get('/logs', async (c) => {
  const user = c.get('user')
  const chatId = c.req.query('chat_id')
  const telegramUserId = c.req.query('telegram_user_id')
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200)
  const offset = parseInt(c.req.query('offset') || '0', 10)

  let query = 'SELECT * FROM telegram_command_log WHERE org_id = ?'
  const params: unknown[] = [user.org_id]

  if (chatId) { query += ' AND chat_id = ?'; params.push(chatId) }
  if (telegramUserId) { query += ' AND telegram_user_id = ?'; params.push(telegramUserId) }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ logs: results })
})

// Create log entry
telegramRoutes.post('/logs', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{
    chat_id: string
    telegram_user_id: string
    user_id?: string
    command: string
    args?: string
    response_summary?: string
  }>()

  if (!body.chat_id || !body.telegram_user_id || !body.command) {
    return c.json({ error: 'chat_id, telegram_user_id, and command are required' }, 400)
  }

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO telegram_command_log (id, org_id, chat_id, telegram_user_id, user_id, command, args, response_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    user.org_id,
    body.chat_id,
    body.telegram_user_id,
    body.user_id || null,
    body.command,
    body.args || '',
    body.response_summary || ''
  ).run()

  const log = await c.env.DB.prepare('SELECT * FROM telegram_command_log WHERE id = ?').bind(id).first()
  return c.json({ log }, 201)
})
