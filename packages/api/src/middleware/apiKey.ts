import { createMiddleware } from 'hono/factory'
import type { Env } from '../types'

type Variables = { apiKeyOrgId: string; apiKeyScopes: string[] }

export const apiKeyMiddleware = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ek_')) {
      return c.json({ error: 'Invalid API key format' }, 401)
    }

    const apiKey = authHeader.slice(7)
    const keyHash = await hashKey(apiKey)

    const row = await c.env.DB.prepare(
      'SELECT ak.org_id, ak.scopes FROM api_keys ak WHERE ak.key_hash = ?'
    ).bind(keyHash).first<{ org_id: string; scopes: string }>()

    if (!row) {
      return c.json({ error: 'Invalid API key' }, 401)
    }

    c.set('apiKeyOrgId', row.org_id)
    c.set('apiKeyScopes', JSON.parse(row.scopes))
    await next()
  }
)

async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key)
  const hash = await crypto.subtle.digest('SHA-256', encoded)
  const bytes = new Uint8Array(hash)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}
