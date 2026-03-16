import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const aiKeysRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

aiKeysRoutes.use('/*', authMiddleware)

// List API keys for the org
aiKeysRoutes.get('/', async (c) => {
  const user = c.get('user')
  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'Only CEO or admin can manage API keys' }, 403)
  }

  const { results } = await c.env.DB.prepare(
    'SELECT id, name, key_prefix, scopes, created_at FROM api_keys WHERE org_id = ? ORDER BY created_at DESC'
  ).bind(user.org_id).all()

  // Parse scopes for each key
  const keys = (results || []).map((k: Record<string, unknown>) => ({
    ...k,
    scopes: typeof k.scopes === 'string' ? JSON.parse(k.scopes as string) : k.scopes,
  }))

  return c.json({ keys })
})

// Create a new API key
aiKeysRoutes.post('/', async (c) => {
  const user = c.get('user')
  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'Only CEO or admin can manage API keys' }, 403)
  }

  const { name, scopes } = await c.req.json<{ name: string; scopes: string[] }>()

  if (!name) {
    return c.json({ error: 'name is required' }, 400)
  }

  const id = generateId()
  const rawKey = `ek_${generateId().replace(/-/g, '')}${generateId().replace(/-/g, '').slice(0, 16)}`
  const keyPrefix = rawKey.slice(0, 10)

  const encoded = new TextEncoder().encode(rawKey)
  const hash = await crypto.subtle.digest('SHA-256', encoded)
  const keyHash = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')

  const finalScopes = scopes && scopes.length > 0 ? scopes : ['*']

  await c.env.DB.prepare(
    'INSERT INTO api_keys (id, org_id, name, key_hash, key_prefix, scopes) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, user.org_id, name, keyHash, keyPrefix, JSON.stringify(finalScopes)).run()

  return c.json({ id, name, key: rawKey, prefix: keyPrefix, scopes: finalScopes }, 201)
})

// Delete an API key
aiKeysRoutes.delete('/:id', async (c) => {
  const user = c.get('user')
  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'Only CEO or admin can manage API keys' }, 403)
  }

  const id = c.req.param('id')

  // Verify key belongs to org
  const key = await c.env.DB.prepare(
    'SELECT id FROM api_keys WHERE id = ? AND org_id = ?'
  ).bind(id, user.org_id).first()

  if (!key) {
    return c.json({ error: 'API key not found' }, 404)
  }

  await c.env.DB.prepare('DELETE FROM api_keys WHERE id = ?').bind(id).run()

  return c.json({ success: true })
})
