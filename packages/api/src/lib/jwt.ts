import type { JWTPayload } from '../types'

export async function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string, expiresInSeconds: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  }

  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(fullPayload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const key = await getKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  const encodedSignature = base64urlFromBuffer(signature)

  return `${signingInput}.${encodedSignature}`
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid token format')

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const key = await getKey(secret)
  const signatureBuffer = base64urlToBuffer(encodedSignature)
  const valid = await crypto.subtle.verify('HMAC', key, signatureBuffer, new TextEncoder().encode(signingInput))

  if (!valid) throw new Error('Invalid signature')

  // UTF-8 safe decode
  const payloadBytes = new Uint8Array(base64urlToBuffer(encodedPayload))
  const payload: JWTPayload = JSON.parse(new TextDecoder().decode(payloadBytes))

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp < now) throw new Error('Token expired')

  return payload
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function base64url(str: string): string {
  // UTF-8 safe: encode string as bytes first
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
