// AES-256-GCM encryption/decryption for vault

const IV_LENGTH = 12

export async function encrypt(plaintext: string, keyHex: string): Promise<string> {
  const key = await importKey(keyHex)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )

  // Format: base64(iv):base64(ciphertext)
  return `${arrayToBase64(iv)}:${arrayToBase64(new Uint8Array(ciphertext))}`
}

export async function decrypt(encrypted: string, keyHex: string): Promise<string> {
  const [ivB64, ctB64] = encrypted.split(':')
  if (!ivB64 || !ctB64) throw new Error('Invalid encrypted format')

  const key = await importKey(keyHex)
  const iv = base64ToArray(ivB64)
  const ciphertext = base64ToArray(ctB64)

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )

  return new TextDecoder().decode(plaintext)
}

async function importKey(keyHex: string): Promise<CryptoKey> {
  const keyBytes = hexToArray(keyHex)
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    'AES-GCM',
    false,
    ['encrypt', 'decrypt']
  )
}

function hexToArray(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
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
