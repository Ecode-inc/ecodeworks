import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { encrypt, decrypt } from '../lib/crypto'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const credentialsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

credentialsRoutes.use('/*', authMiddleware)

// List credentials (metadata only - no decryption)
credentialsRoutes.get('/', requirePermission('vault', 'read'), async (c) => {
  const deptId = c.req.query('dept_id')!

  const { results } = await c.env.DB.prepare(
    `SELECT id, department_id, service_name, url, created_by, created_at, updated_at
     FROM credentials WHERE department_id = ? ORDER BY service_name`
  ).bind(deptId).all()

  return c.json({ credentials: results })
})

// Get credential (decrypt + audit log)
credentialsRoutes.get('/:id', requirePermission('vault', 'read'), async (c) => {
  const user = c.get('user')
  const credId = c.req.param('id')

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
  const deptId = c.req.query('dept_id')!
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
