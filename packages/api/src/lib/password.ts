const ITERATIONS = 100_000
const SALT_LENGTH = 16
const KEY_LENGTH = 32

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const key = await deriveKey(password, salt)
  const hash = await crypto.subtle.exportKey('raw', key) as ArrayBuffer
  const hashArray = new Uint8Array(hash)

  // Format: base64(salt):base64(hash)
  return `${arrayToBase64(salt)}:${arrayToBase64(hashArray)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = stored.split(':')
  if (!saltB64 || !hashB64) return false

  const salt = base64ToArray(saltB64)
  const storedHash = base64ToArray(hashB64)
  const key = await deriveKey(password, salt)
  const hash = new Uint8Array(await crypto.subtle.exportKey('raw', key) as ArrayBuffer)

  if (hash.length !== storedHash.length) return false
  let diff = 0
  for (let i = 0; i < hash.length; i++) {
    diff |= hash[i] ^ storedHash[i]
  }
  return diff === 0
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH * 8 },
    true,
    ['encrypt', 'decrypt']
  )
}

function arrayToBase64(arr: Uint8Array): string {
  let binary = ''
  for (const byte of arr) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToArray(b64: string): Uint8Array {
  const binary = atob(b64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i)
  }
  return arr
}
