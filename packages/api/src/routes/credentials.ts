import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { encrypt, decrypt } from '../lib/crypto'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const credentialsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

credentialsRoutes.use('/*', authMiddleware)

// ── Vault PIN: Set or change personal vault PIN ──
credentialsRoutes.post('/pin', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ pin: string }>()

  if (!body.pin || !/^\d{4,8}$/.test(body.pin)) {
    return c.json({ error: 'PIN must be 4-8 digits' }, 400)
  }

  // SHA-256 hash the PIN
  const encoder = new TextEncoder()
  const data = encoder.encode(body.pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)
  const pinHash = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')

  await c.env.DB.prepare('UPDATE users SET vault_pin_hash = ? WHERE id = ?').bind(pinHash, user.id).run()

  return c.json({ success: true, message: 'PIN set successfully' })
})

// ── Vault PIN: Verify PIN and get a temporary vault_token ──
credentialsRoutes.post('/pin/verify', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ pin: string }>()

  if (!body.pin) return c.json({ error: 'pin required' }, 400)

  const dbUser = await c.env.DB.prepare('SELECT vault_pin_hash FROM users WHERE id = ?').bind(user.id).first<{ vault_pin_hash: string }>()
  if (!dbUser?.vault_pin_hash) return c.json({ error: 'No PIN set' }, 400)

  // Hash the provided PIN
  const encoder = new TextEncoder()
  const data = encoder.encode(body.pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)
  const pinHash = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')

  if (pinHash !== dbUser.vault_pin_hash) {
    return c.json({ error: 'Invalid PIN' }, 403)
  }

  // Generate a random vault session token
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
  const vaultToken = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('')

  // Expires in 10 minutes
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  // Clean up old sessions for this user, then insert new one
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM vault_sessions WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('INSERT INTO vault_sessions (token, user_id, org_id, expires_at) VALUES (?, ?, ?, ?)').bind(vaultToken, user.id, user.org_id, expiresAt),
  ])

  return c.json({ vault_token: vaultToken, expires_in: 600 })
})

// ── Vault PIN: Check PIN status and unlock state ──
credentialsRoutes.get('/pin/status', async (c) => {
  const user = c.get('user')

  const dbUser = await c.env.DB.prepare('SELECT vault_pin_hash FROM users WHERE id = ?').bind(user.id).first<{ vault_pin_hash: string }>()
  const hasPin = !!(dbUser?.vault_pin_hash)

  // Check if there's an active vault session
  let unlocked = false
  if (hasPin) {
    const session = await c.env.DB.prepare(
      'SELECT token FROM vault_sessions WHERE user_id = ? AND expires_at > ? LIMIT 1'
    ).bind(user.id, new Date().toISOString()).first()
    unlocked = !!session
  }

  return c.json({ has_pin: hasPin, unlocked })
})

// List credentials (metadata only - no decryption)
credentialsRoutes.get('/', requirePermission('vault', 'read'), async (c) => {
  const user = c.get('user')
  const deptId = c.req.query('dept_id')!

  let query = `SELECT id, department_id, service_name, url, created_by, created_at, updated_at, visibility
     FROM credentials WHERE 1=1`
  const params: unknown[] = []

  // Visibility filtering (CEO sees everything)
  if (!user.is_ceo) {
    query += ` AND (
      visibility = 'company'
      OR (visibility = 'department' AND department_id IN (SELECT department_id FROM user_departments WHERE user_id = ?))
    )`
    params.push(user.id)
  }

  if (deptId) {
    query += ' AND department_id = ?'
    params.push(deptId)
  }

  query += ' ORDER BY service_name'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()

  return c.json({ credentials: results })
})

// Get credential (decrypt + audit log)
credentialsRoutes.get('/:id', requirePermission('vault', 'read'), async (c) => {
  const user = c.get('user')
  const credId = c.req.param('id')

  // PIN gate: if user has PIN set, require vault_token
  const dbUser = await c.env.DB.prepare('SELECT vault_pin_hash FROM users WHERE id = ?').bind(user.id).first<{ vault_pin_hash: string }>()
  if (dbUser?.vault_pin_hash) {
    const vaultToken = c.req.header('X-Vault-Token') || c.req.query('vault_token')
    if (!vaultToken) {
      return c.json({ error: 'Vault PIN verification required', code: 'PIN_REQUIRED' }, 403)
    }

    const session = await c.env.DB.prepare(
      'SELECT token FROM vault_sessions WHERE token = ? AND user_id = ? AND expires_at > ?'
    ).bind(vaultToken, user.id, new Date().toISOString()).first()
    if (!session) {
      return c.json({ error: 'Invalid or expired vault token', code: 'PIN_REQUIRED' }, 403)
    }
  }

  const cred = await c.env.DB.prepare('SELECT * FROM credentials WHERE id = ?').bind(credId).first<any>()
  if (!cred) return c.json({ error: 'Credential not found' }, 404)

  // Decrypt
  const username = await decrypt(cred.username_enc, c.env.VAULT_KEY)
  const password = await decrypt(cred.password_enc, c.env.VAULT_KEY)
  const notes = cred.notes_enc ? await decrypt(cred.notes_enc, c.env.VAULT_KEY) : ''

  // Audit log
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
  await c.env.DB.prepare(
    'INSERT INTO credential_access_log (id, credential_id, user_id, action, ip_address) VALUES (?, ?, ?, ?, ?)'
  ).bind(generateId(), credId, user.id, 'view', ip).run()

  return c.json({
    credential: {
      id: cred.id,
      department_id: cred.department_id,
      service_name: cred.service_name,
      url: cred.url,
      username,
      password,
      notes,
      created_by: cred.created_by,
      created_at: cred.created_at,
      updated_at: cred.updated_at,
    },
  })
})

// Create credential
credentialsRoutes.post('/', requirePermission('vault', 'write'), async (c) => {
  const user = c.get('user')
  let deptId = c.req.query('dept_id') || ''

  // Auto-resolve dept if not provided
  if (!deptId) {
    const userDept = await c.env.DB.prepare('SELECT department_id FROM user_departments WHERE user_id = ? LIMIT 1').bind(user.id).first<{ department_id: string }>()
    if (userDept) deptId = userDept.department_id
    else {
      const orgDept = await c.env.DB.prepare('SELECT id FROM departments WHERE org_id = ? ORDER BY order_index LIMIT 1').bind(user.org_id).first<{ id: string }>()
      deptId = orgDept?.id || ''
    }
  }
  const body = await c.req.json<{
    service_name: string
    url?: string
    username: string
    password: string
    notes?: string
  }>()

  if (!body.service_name || !body.username || !body.password) {
    return c.json({ error: 'service_name, username, password required' }, 400)
  }

  const id = generateId()
  const usernameEnc = await encrypt(body.username, c.env.VAULT_KEY)
  const passwordEnc = await encrypt(body.password, c.env.VAULT_KEY)
  const notesEnc = body.notes ? await encrypt(body.notes, c.env.VAULT_KEY) : ''

  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO credentials (id, department_id, service_name, url, username_enc, password_enc, notes_enc, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, deptId, body.service_name, body.url || '', usernameEnc, passwordEnc, notesEnc, user.id),
    c.env.DB.prepare(
      'INSERT INTO credential_access_log (id, credential_id, user_id, action, ip_address) VALUES (?, ?, ?, ?, ?)'
    ).bind(generateId(), id, user.id, 'create', ip),
  ])

  return c.json({
    credential: { id, service_name: body.service_name, url: body.url || '', created_at: new Date().toISOString() },
  }, 201)
})

// Update credential
credentialsRoutes.patch('/:id', requirePermission('vault', 'write'), async (c) => {
  const user = c.get('user')
  const credId = c.req.param('id')
  const body = await c.req.json<{
    service_name?: string
    url?: string
    username?: string
    password?: string
    notes?: string
  }>()

  const updates: string[] = []
  const values: unknown[] = []

  if (body.service_name !== undefined) { updates.push('service_name = ?'); values.push(body.service_name) }
  if (body.url !== undefined) { updates.push('url = ?'); values.push(body.url) }
  if (body.username !== undefined) { updates.push('username_enc = ?'); values.push(await encrypt(body.username, c.env.VAULT_KEY)) }
  if (body.password !== undefined) { updates.push('password_enc = ?'); values.push(await encrypt(body.password, c.env.VAULT_KEY)) }
  if (body.notes !== undefined) { updates.push('notes_enc = ?'); values.push(await encrypt(body.notes, c.env.VAULT_KEY)) }

  if (updates.length === 0) return c.json({ error: 'No fields' }, 400)

  updates.push("updated_at = datetime('now')")
  values.push(credId)

  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'

  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE credentials SET ${updates.join(', ')} WHERE id = ?`).bind(...values),
    c.env.DB.prepare(
      'INSERT INTO credential_access_log (id, credential_id, user_id, action, ip_address) VALUES (?, ?, ?, ?, ?)'
    ).bind(generateId(), credId, user.id, 'update', ip),
  ])

  return c.json({ success: true })
})

// Delete credential
credentialsRoutes.delete('/:id', requirePermission('vault', 'admin'), async (c) => {
  const user = c.get('user')
  const credId = c.req.param('id')
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO credential_access_log (id, credential_id, user_id, action, ip_address) VALUES (?, ?, ?, ?, ?)'
    ).bind(generateId(), credId, user.id, 'delete', ip),
    c.env.DB.prepare('DELETE FROM credentials WHERE id = ?').bind(credId),
  ])

  return c.json({ success: true })
})

// Audit log
credentialsRoutes.get('/:id/log', requirePermission('vault', 'admin'), async (c) => {
  const credId = c.req.param('id')
  const { results } = await c.env.DB.prepare(
    `SELECT cal.*, u.name as user_name FROM credential_access_log cal
     LEFT JOIN users u ON u.id = cal.user_id
     WHERE cal.credential_id = ? ORDER BY cal.created_at DESC LIMIT 100`
  ).bind(credId).all()
  return c.json({ logs: results })
})
