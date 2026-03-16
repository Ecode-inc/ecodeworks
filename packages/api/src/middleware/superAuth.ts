import { createMiddleware } from 'hono/factory'
import type { Env } from '../types'

export interface SuperAdminUser {
  id: string
  email: string
  name: string
  role: 'super_admin'
}

type Variables = { superAdmin: SuperAdminUser }

export const superAuthMiddleware = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid Authorization header' }, 401)
    }

    const token = authHeader.slice(7)
    try {
      // Manually verify JWT (same logic as lib/jwt but with super_admin payload)
      const parts = token.split('.')
      if (parts.length !== 3) throw new Error('Invalid token format')

      const [encodedHeader, encodedPayload, encodedSignature] = parts
      const signingInput = `${encodedHeader}.${encodedPayload}`

      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(c.env.JWT_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
      )

      const signatureBuffer = base64urlToBuffer(encodedSignature)
      const valid = await crypto.subtle.verify(
        'HMAC', key, signatureBuffer, new TextEncoder().encode(signingInput)
      )
      if (!valid) throw new Error('Invalid signature')

      const payloadBytes = new Uint8Array(base64urlToBuffer(encodedPayload))
      const payload = JSON.parse(new TextDecoder().decode(payloadBytes))

      const now = Math.floor(Date.now() / 1000)
      if (payload.exp < now) throw new Error('Token expired')

      if (payload.role !== 'super_admin') {
        return c.json({ error: 'Insufficient privileges' }, 403)
      }

      c.set('superAdmin', {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: 'super_admin',
      })

      await next()
    } catch {
      return c.json({ error: 'Invalid or expired token' }, 401)
    }
  }
)

function base64urlToBuffer(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
