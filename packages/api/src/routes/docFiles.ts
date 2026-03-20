import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const docFilesRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

docFilesRoutes.use('/*', authMiddleware)

// ──────────────────────────────────────────────────────────────
// Upload file
// POST /doc-files/upload
// ──────────────────────────────────────────────────────────────
docFilesRoutes.post('/upload', async (c) => {
  const user = c.get('user')

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const documentId = formData.get('document_id') as string | null

  if (!file) return c.json({ error: 'file is required' }, 400)
  if (!documentId) return c.json({ error: 'document_id is required' }, 400)

  // Verify document exists and belongs to user's org
  const doc = await c.env.DB.prepare(`
    SELECT d.id, d.department_id FROM documents d
    JOIN departments dept ON dept.id = d.department_id
    WHERE d.id = ? AND dept.org_id = ?
  `).bind(documentId, user.org_id).first<{ id: string; department_id: string }>()

  if (!doc) return c.json({ error: 'Document not found' }, 404)

  // Get org slug
  const org = await c.env.DB.prepare(
    'SELECT slug FROM organizations WHERE id = ?'
  ).bind(user.org_id).first<{ slug: string }>()

  if (!org) return c.json({ error: 'Organization not found' }, 404)

  const timestamp = Date.now()
  const fileName = file.name || 'file'
  const r2Key = `${org.slug}/docs/${documentId}/files/${timestamp}_${fileName}`

  // Upload to R2
  const arrayBuffer = await file.arrayBuffer()
  await c.env.FILES.put(r2Key, arrayBuffer, {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  })

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO doc_files (id, document_id, org_id, file_url, file_name, file_size, mime_type, uploaded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    id,
    documentId,
    user.org_id,
    r2Key,
    fileName,
    file.size,
    file.type || 'application/octet-stream',
    user.id
  ).run()

  const record = await c.env.DB.prepare('SELECT * FROM doc_files WHERE id = ?').bind(id).first()
  return c.json({ file: record }, 201)
})

// ──────────────────────────────────────────────────────────────
// List files for a document
// GET /doc-files?document_id=X
// ──────────────────────────────────────────────────────────────
docFilesRoutes.get('/', async (c) => {
  const user = c.get('user')
  const documentId = c.req.query('document_id')

  if (!documentId) return c.json({ error: 'document_id is required' }, 400)

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM doc_files WHERE document_id = ? AND org_id = ? ORDER BY created_at DESC'
  ).bind(documentId, user.org_id).all()

  return c.json({ files: results })
})

// ──────────────────────────────────────────────────────────────
// Delete file
// DELETE /doc-files/:id
// ──────────────────────────────────────────────────────────────
docFilesRoutes.delete('/:id', async (c) => {
  const user = c.get('user')
  const fileId = c.req.param('id')

  const file = await c.env.DB.prepare(
    'SELECT id, file_url FROM doc_files WHERE id = ? AND org_id = ?'
  ).bind(fileId, user.org_id).first<{ id: string; file_url: string }>()

  if (!file) return c.json({ error: 'File not found' }, 404)

  // Delete from R2
  await c.env.FILES.delete(file.file_url)

  // Delete from DB
  await c.env.DB.prepare('DELETE FROM doc_files WHERE id = ?').bind(fileId).run()

  return c.json({ success: true })
})
