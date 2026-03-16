import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const documentsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

documentsRoutes.use('/*', authMiddleware)

// List documents (tree)
documentsRoutes.get('/', async (c) => {
  const user = c.get('user')
  const deptId = c.req.query('dept_id')
  const parentId = c.req.query('parent_id')

  let query = `SELECT d.id, d.department_id, d.parent_id, d.title, d.is_folder, d.order_index, d.created_by, d.created_at, d.updated_at, d.visibility, d.shared FROM documents d WHERE 1=1`
  const params: unknown[] = []

  // Visibility filtering (CEO sees everything)
  if (!user.is_ceo) {
    query += ` AND (
      (d.visibility = 'company')
      OR (d.visibility = 'department' AND d.shared = 0 AND d.department_id IN (SELECT department_id FROM user_departments WHERE user_id = ?))
      OR (d.visibility = 'department' AND d.shared = 1)
      OR (d.visibility = 'personal' AND d.shared = 0 AND d.created_by = ?)
      OR (d.visibility = 'personal' AND d.shared = 1)
    )`
    params.push(user.id, user.id)
  }

  if (deptId) {
    query += ' AND d.department_id = ?'
    params.push(deptId)
  }

  if (parentId) {
    query += ' AND d.parent_id = ?'
    params.push(parentId)
  } else if (deptId) {
    query += ' AND d.parent_id IS NULL'
  }

  query += ' ORDER BY d.is_folder DESC, d.order_index ASC'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ documents: results })
})

// Get document (with content)
documentsRoutes.get('/:id', async (c) => {
  const docId = c.req.param('id')
  const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(docId).first()
  if (!doc) return c.json({ error: 'Document not found' }, 404)
  return c.json({ document: doc })
})

// Create document
documentsRoutes.post('/', requirePermission('docs', 'write'), async (c) => {
  const user = c.get('user')
  const deptId = c.req.query('dept_id')!
  const body = await c.req.json<{
    title: string
    content?: string
    parent_id?: string
    is_folder?: boolean
    visibility?: string
    shared?: boolean
  }>()

  if (!body.title) return c.json({ error: 'title required' }, 400)

  const visibility = body.visibility || 'department'
  const shared = body.shared ? 1 : 0

  const id = generateId()
  const maxOrder = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(order_index), -1) as max_idx FROM documents WHERE department_id = ? AND parent_id IS ?'
  ).bind(deptId, body.parent_id || null).first<{ max_idx: number }>()

  await c.env.DB.prepare(
    `INSERT INTO documents (id, department_id, parent_id, title, content, is_folder, order_index, created_by, visibility, shared)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, deptId, body.parent_id || null, body.title, body.content || '', body.is_folder ? 1 : 0, (maxOrder?.max_idx ?? -1) + 1, user.id, visibility, shared).run()

  // Save initial version if it's not a folder
  if (!body.is_folder && body.content) {
    await c.env.DB.prepare(
      'INSERT INTO document_versions (id, document_id, content, version_number, created_by) VALUES (?, ?, ?, 1, ?)'
    ).bind(generateId(), id, body.content, user.id).run()
  }

  const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first()
  return c.json({ document: doc }, 201)
})

// Update document
documentsRoutes.patch('/:id', authMiddleware, async (c) => {
  const user = c.get('user')
  const docId = c.req.param('id')
  const body = await c.req.json<{ title?: string; content?: string; parent_id?: string; visibility?: string; shared?: boolean }>()

  const updates: string[] = []
  const values: unknown[] = []

  if (body.title !== undefined) { updates.push('title = ?'); values.push(body.title) }
  if (body.content !== undefined) { updates.push('content = ?'); values.push(body.content) }
  if (body.parent_id !== undefined) { updates.push('parent_id = ?'); values.push(body.parent_id || null) }
  if (body.visibility !== undefined) { updates.push('visibility = ?'); values.push(body.visibility) }
  if (body.shared !== undefined) { updates.push('shared = ?'); values.push(body.shared ? 1 : 0) }

  if (updates.length === 0) return c.json({ error: 'No fields' }, 400)

  updates.push("updated_at = datetime('now')")
  values.push(docId)

  await c.env.DB.prepare(
    `UPDATE documents SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run()

  // Save version if content changed
  if (body.content !== undefined) {
    const maxVer = await c.env.DB.prepare(
      'SELECT COALESCE(MAX(version_number), 0) as max_ver FROM document_versions WHERE document_id = ?'
    ).bind(docId).first<{ max_ver: number }>()

    await c.env.DB.prepare(
      'INSERT INTO document_versions (id, document_id, content, version_number, created_by) VALUES (?, ?, ?, ?, ?)'
    ).bind(generateId(), docId, body.content, (maxVer?.max_ver ?? 0) + 1, user.id).run()
  }

  const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(docId).first()
  return c.json({ document: doc })
})

// Delete document
documentsRoutes.delete('/:id', authMiddleware, async (c) => {
  const docId = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(docId).run()
  return c.json({ success: true })
})

// Search documents (FTS5)
documentsRoutes.get('/search', async (c) => {
  const user = c.get('user')
  const q = c.req.query('q')
  const deptId = c.req.query('dept_id')

  if (!q) return c.json({ documents: [] })

  // FTS5 search with visibility filtering
  let query = `
    SELECT d.id, d.department_id, d.parent_id, d.title, d.is_folder, d.created_at, d.updated_at, d.visibility, d.shared,
           snippet(documents_fts, 1, '<mark>', '</mark>', '...', 32) as snippet
    FROM documents_fts fts
    JOIN documents d ON d.rowid = fts.rowid
    WHERE documents_fts MATCH ?`
  const params: unknown[] = [q]

  // Visibility filtering (CEO sees everything)
  if (!user.is_ceo) {
    query += ` AND (
      (d.visibility = 'company')
      OR (d.visibility = 'department' AND d.shared = 0 AND d.department_id IN (SELECT department_id FROM user_departments WHERE user_id = ?))
      OR (d.visibility = 'department' AND d.shared = 1)
      OR (d.visibility = 'personal' AND d.shared = 0 AND d.created_by = ?)
      OR (d.visibility = 'personal' AND d.shared = 1)
    )`
    params.push(user.id, user.id)
  }

  if (deptId) {
    query += ' AND d.department_id = ?'
    params.push(deptId)
  }

  query += ' ORDER BY rank LIMIT 50'

  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ documents: results })
})

// Get version history
documentsRoutes.get('/:id/versions', async (c) => {
  const docId = c.req.param('id')
  const { results } = await c.env.DB.prepare(
    `SELECT dv.*, u.name as author_name FROM document_versions dv
     LEFT JOIN users u ON u.id = dv.created_by
     WHERE dv.document_id = ? ORDER BY dv.version_number DESC`
  ).bind(docId).all()
  return c.json({ versions: results })
})

// Get specific version
documentsRoutes.get('/:id/versions/:versionId', async (c) => {
  const versionId = c.req.param('versionId')
  const version = await c.env.DB.prepare(
    'SELECT * FROM document_versions WHERE id = ?'
  ).bind(versionId).first()
  if (!version) return c.json({ error: 'Version not found' }, 404)
  return c.json({ version })
})
