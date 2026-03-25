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
  const flat = c.req.query('flat')

  let query = `SELECT d.id, d.department_id, d.parent_id, d.title, d.is_folder, d.order_index, d.created_by, d.created_at, d.updated_at, d.visibility, d.shared, u.name as created_by_name FROM documents d LEFT JOIN users u ON u.id = d.created_by WHERE 1=1`
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

  if (flat === 'true') {
    // Return all docs flat (no parent_id filter)
  } else if (parentId) {
    query += ' AND d.parent_id = ?'
    params.push(parentId)
  } else {
    // Root level: no parent
    query += ' AND d.parent_id IS NULL'
  }

  query += ' ORDER BY d.is_folder DESC, d.order_index ASC'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ documents: results })
})

// Search documents (FTS5) - MUST be before /:id to avoid matching "search" as an id
documentsRoutes.get('/search', async (c) => {
  const user = c.get('user')
  const q = c.req.query('q')
  const deptId = c.req.query('dept_id')

  if (!q) return c.json({ documents: [] })

  let query = `
    SELECT d.id, d.department_id, d.parent_id, d.title, d.is_folder, d.created_at, d.updated_at, d.visibility, d.shared,
           snippet(documents_fts, 1, '<mark>', '</mark>', '...', 32) as snippet
    FROM documents_fts fts
    JOIN documents d ON d.rowid = fts.rowid
    WHERE documents_fts MATCH ?`
  const params: unknown[] = [q]

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

// Get document (with content)
documentsRoutes.get('/:id', async (c) => {
  const user = c.get('user')
  const docId = c.req.param('id')
  const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(docId).first<any>()
  if (!doc) return c.json({ error: 'Document not found' }, 404)

  // Visibility check (CEO/admin can see everything)
  if (!user.is_ceo && !user.is_admin) {
    if (doc.shared === 1) {
      // shared docs are visible to anyone
    } else if (doc.visibility === 'company') {
      // company visibility: anyone in org can see
    } else if (doc.visibility === 'department') {
      const membership = await c.env.DB.prepare(
        'SELECT 1 FROM user_departments WHERE user_id = ? AND department_id = ?'
      ).bind(user.id, doc.department_id).first()
      if (!membership) return c.json({ error: 'Access denied' }, 403)
    } else if (doc.visibility === 'personal') {
      if (doc.created_by !== user.id) return c.json({ error: 'Access denied' }, 403)
    }
  }

  return c.json({ document: doc })
})

// Create document
documentsRoutes.post('/', requirePermission('docs', 'write'), async (c) => {
  const user = c.get('user')
  let deptId = c.req.query('dept_id') || ''

  const body = await c.req.json<{
    title: string
    content?: string
    parent_id?: string
    is_folder?: boolean
    visibility?: string
    shared?: boolean
  }>()

  if (!body.title) return c.json({ error: 'title required' }, 400)

  // Auto-resolve dept_id: from parent folder, or from user's membership
  if (!deptId && body.parent_id) {
    const parent = await c.env.DB.prepare('SELECT department_id FROM documents WHERE id = ?').bind(body.parent_id).first<{ department_id: string }>()
    if (parent) deptId = parent.department_id
  }
  if (!deptId) {
    const userDept = await c.env.DB.prepare('SELECT department_id FROM user_departments WHERE user_id = ? LIMIT 1').bind(user.id).first<{ department_id: string }>()
    if (userDept) deptId = userDept.department_id
    else {
      const orgDept = await c.env.DB.prepare('SELECT id FROM departments WHERE org_id = ? ORDER BY order_index LIMIT 1').bind(user.org_id).first<{ id: string }>()
      deptId = orgDept?.id || ''
    }
  }

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

// Update document (with optimistic locking via expected_updated_at)
documentsRoutes.patch('/:id', authMiddleware, async (c) => {
  const user = c.get('user')
  const docId = c.req.param('id')
  const body = await c.req.json<{
    title?: string
    content?: string
    parent_id?: string
    visibility?: string
    shared?: boolean
    expected_updated_at?: string  // optimistic lock: reject if doc was modified since this timestamp
  }>()

  // Check current state first
  const current = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(docId).first<any>()
  if (!current) return c.json({ error: 'Document not found' }, 404)

  // Optimistic locking: if caller provides expected_updated_at, check it matches
  if (body.expected_updated_at && current.updated_at !== body.expected_updated_at) {
    return c.json({
      error: 'conflict',
      message: '다른 사용자가 이 문서를 수정했습니다. 최신 버전을 확인해주세요.',
      current_document: current,
    }, 409)
  }

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
  const user = c.get('user')
  const docId = c.req.param('id')

  const doc = await c.env.DB.prepare('SELECT created_by, department_id FROM documents WHERE id = ?').bind(docId).first<{ created_by: string; department_id: string }>()
  if (!doc) return c.json({ error: 'Document not found' }, 404)

  // Permission check: only creator, dept head, CEO, or admin can delete
  if (!user.is_ceo && !user.is_admin && doc.created_by !== user.id) {
    const headCheck = await c.env.DB.prepare(
      "SELECT 1 FROM user_departments WHERE user_id = ? AND department_id = ? AND role = 'head'"
    ).bind(user.id, doc.department_id).first()
    if (!headCheck) return c.json({ error: 'Only the creator, department head, or admin can delete' }, 403)
  }

  await c.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(docId).run()
  return c.json({ success: true })
})

// Get linked tasks for a document (reverse link)
documentsRoutes.get('/:id/tasks', async (c) => {
  const docId = c.req.param('id')
  const { results } = await c.env.DB.prepare(`
    SELECT t.id, t.title, t.priority, t.column_id, bc.name as column_name, b.name as board_name
    FROM task_document_links tdl
    JOIN tasks t ON t.id = tdl.task_id
    JOIN board_columns bc ON bc.id = t.column_id
    JOIN boards b ON b.id = t.board_id
    WHERE tdl.document_id = ?
    ORDER BY t.updated_at DESC
  `).bind(docId).all()
  return c.json({ tasks: results || [] })
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

// ── Share Links ──────────────────────────────────────────────

// Create share link
documentsRoutes.post('/:id/share', authMiddleware, async (c) => {
  const user = c.get('user')
  const docId = c.req.param('id')

  const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(docId).first<any>()
  if (!doc) return c.json({ error: 'Document not found' }, 404)

  // Ownership/department check: only creator, dept head, CEO, or admin can create share links
  if (!user.is_ceo && !user.is_admin && doc.created_by !== user.id) {
    const headCheck = await c.env.DB.prepare(
      "SELECT 1 FROM user_departments WHERE user_id = ? AND department_id = ? AND role = 'head'"
    ).bind(user.id, doc.department_id).first()
    if (!headCheck) return c.json({ error: 'Only the creator, department head, or admin can share' }, 403)
  }

  const body = await c.req.json<{
    share_type: 'external' | 'internal'
    expires_at?: string
    internal_scope?: string
    internal_target_ids?: string[]
  }>()

  if (!body.share_type || !['external', 'internal'].includes(body.share_type)) {
    return c.json({ error: 'share_type must be "external" or "internal"' }, 400)
  }

  const id = generateId()
  const token = body.share_type === 'external' ? crypto.randomUUID() : null
  const expiresAt = body.expires_at || null
  const internalScope = body.internal_scope || 'company'
  const internalTargetIds = JSON.stringify(body.internal_target_ids || [])

  await c.env.DB.prepare(
    `INSERT INTO doc_share_links (id, document_id, org_id, share_type, token, expires_at, internal_scope, internal_target_ids, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, docId, user.org_id, body.share_type, token, expiresAt, internalScope, internalTargetIds, user.id).run()

  const share = await c.env.DB.prepare('SELECT * FROM doc_share_links WHERE id = ?').bind(id).first()

  const url = token ? `https://work.e-code.kr/share/${token}` : null
  return c.json({ share, url }, 201)
})

// List share links for a document
documentsRoutes.get('/:id/shares', async (c) => {
  const docId = c.req.param('id')
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM doc_share_links WHERE document_id = ? AND is_active = 1 ORDER BY created_at DESC'
  ).bind(docId).all()
  return c.json({ shares: results })
})

// Delete/deactivate share link
documentsRoutes.delete('/shares/:shareId', async (c) => {
  const shareId = c.req.param('shareId')
  await c.env.DB.prepare(
    'UPDATE doc_share_links SET is_active = 0 WHERE id = ?'
  ).bind(shareId).run()
  return c.json({ success: true })
})
