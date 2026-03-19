import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const docImagesRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

docImagesRoutes.use('/*', authMiddleware)

// ──────────────────────────────────────────────────────────────
// Upload image
// POST /doc-images/upload
// ──────────────────────────────────────────────────────────────
docImagesRoutes.post('/upload', async (c) => {
  const user = c.get('user')

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const documentId = formData.get('document_id') as string | null
  const tagsRaw = formData.get('tags') as string | null

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
  const fileName = file.name || 'image.jpg'
  const r2Key = `${org.slug}/docs/${documentId}/${timestamp}_${fileName}`

  // Upload to R2
  const arrayBuffer = await file.arrayBuffer()
  await c.env.FILES.put(r2Key, arrayBuffer, {
    httpMetadata: { contentType: file.type || 'image/jpeg' },
  })

  // Parse tags
  const tags: string[] = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO doc_images (id, document_id, org_id, file_url, file_name, file_size, mime_type, tags, people, ai_description, uploaded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', '', ?, datetime('now'))
  `).bind(
    id,
    documentId,
    user.org_id,
    r2Key,
    fileName,
    file.size,
    file.type || 'image/jpeg',
    JSON.stringify(tags),
    user.id
  ).run()

  const image = await c.env.DB.prepare('SELECT * FROM doc_images WHERE id = ?').bind(id).first()
  return c.json({ image }, 201)
})

// ──────────────────────────────────────────────────────────────
// Search images across documents
// GET /doc-images/search?tag=X&person=X&org_id=X
// ──────────────────────────────────────────────────────────────
docImagesRoutes.get('/search', async (c) => {
  const user = c.get('user')
  const tag = c.req.query('tag')
  const person = c.req.query('person')

  let query = 'SELECT * FROM doc_images WHERE org_id = ?'
  const params: unknown[] = [user.org_id]

  if (tag) {
    query += " AND json_array_length(tags) > 0 AND tags LIKE ?"
    params.push(`%${tag}%`)
  }

  if (person) {
    query += " AND json_array_length(people) > 0 AND people LIKE ?"
    params.push(`%${person}%`)
  }

  query += ' ORDER BY created_at DESC LIMIT 100'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ images: results })
})

// ──────────────────────────────────────────────────────────────
// Bulk tag
// POST /doc-images/bulk-tag
// ──────────────────────────────────────────────────────────────
docImagesRoutes.post('/bulk-tag', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ image_ids: string[]; tags: string[] }>()

  if (!body.image_ids || !body.tags || body.image_ids.length === 0 || body.tags.length === 0) {
    return c.json({ error: 'image_ids and tags are required' }, 400)
  }

  const updated: string[] = []

  for (const imageId of body.image_ids) {
    const image = await c.env.DB.prepare(
      'SELECT id, tags FROM doc_images WHERE id = ? AND org_id = ?'
    ).bind(imageId, user.org_id).first<{ id: string; tags: string }>()

    if (!image) continue

    let existingTags: string[] = []
    try { existingTags = JSON.parse(image.tags || '[]') } catch { /* ignore */ }

    const merged = Array.from(new Set([...existingTags, ...body.tags]))
    await c.env.DB.prepare(
      'UPDATE doc_images SET tags = ? WHERE id = ?'
    ).bind(JSON.stringify(merged), imageId).run()

    updated.push(imageId)
  }

  return c.json({ success: true, updated_count: updated.length, updated_ids: updated })
})

// ──────────────────────────────────────────────────────────────
// List images for a document
// GET /doc-images?document_id=X
// ──────────────────────────────────────────────────────────────
docImagesRoutes.get('/', async (c) => {
  const user = c.get('user')
  const documentId = c.req.query('document_id')
  const tag = c.req.query('tag')
  const person = c.req.query('person')

  if (!documentId) return c.json({ error: 'document_id is required' }, 400)

  let query = 'SELECT * FROM doc_images WHERE document_id = ? AND org_id = ?'
  const params: unknown[] = [documentId, user.org_id]

  if (tag) {
    query += ' AND tags LIKE ?'
    params.push(`%${tag}%`)
  }

  if (person) {
    query += ' AND people LIKE ?'
    params.push(`%${person}%`)
  }

  query += ' ORDER BY created_at DESC'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ images: results })
})

// ──────────────────────────────────────────────────────────────
// Tag person in image
// POST /doc-images/:id/tag-person
// ──────────────────────────────────────────────────────────────
docImagesRoutes.post('/:id/tag-person', async (c) => {
  const user = c.get('user')
  const imageId = c.req.param('id')
  const body = await c.req.json<{ name: string }>()

  if (!body.name) return c.json({ error: 'name is required' }, 400)

  const image = await c.env.DB.prepare(
    'SELECT id, people FROM doc_images WHERE id = ? AND org_id = ?'
  ).bind(imageId, user.org_id).first<{ id: string; people: string }>()

  if (!image) return c.json({ error: 'Image not found' }, 404)

  let existingPeople: Array<{ name: string }> = []
  try { existingPeople = JSON.parse(image.people || '[]') } catch { /* ignore */ }

  // Avoid duplicates
  if (!existingPeople.some(p => p.name === body.name)) {
    existingPeople.push({ name: body.name })
  }

  await c.env.DB.prepare(
    'UPDATE doc_images SET people = ? WHERE id = ?'
  ).bind(JSON.stringify(existingPeople), imageId).run()

  const updated = await c.env.DB.prepare('SELECT * FROM doc_images WHERE id = ?').bind(imageId).first()
  return c.json({ image: updated })
})

// ──────────────────────────────────────────────────────────────
// Get single image
// GET /doc-images/:id
// ──────────────────────────────────────────────────────────────
docImagesRoutes.get('/:id', async (c) => {
  const user = c.get('user')
  const imageId = c.req.param('id')

  const image = await c.env.DB.prepare(
    'SELECT * FROM doc_images WHERE id = ? AND org_id = ?'
  ).bind(imageId, user.org_id).first()

  if (!image) return c.json({ error: 'Image not found' }, 404)
  return c.json({ image })
})

// ──────────────────────────────────────────────────────────────
// Update image tags/people/ai_description
// PATCH /doc-images/:id
// ──────────────────────────────────────────────────────────────
docImagesRoutes.patch('/:id', async (c) => {
  const user = c.get('user')
  const imageId = c.req.param('id')
  const body = await c.req.json<{
    tags?: string[]
    people?: Array<{ name: string }>
    ai_description?: string
  }>()

  const image = await c.env.DB.prepare(
    'SELECT id FROM doc_images WHERE id = ? AND org_id = ?'
  ).bind(imageId, user.org_id).first()

  if (!image) return c.json({ error: 'Image not found' }, 404)

  const updates: string[] = []
  const values: unknown[] = []

  if (body.tags !== undefined) {
    updates.push('tags = ?')
    values.push(JSON.stringify(body.tags))
  }
  if (body.people !== undefined) {
    updates.push('people = ?')
    values.push(JSON.stringify(body.people))
  }
  if (body.ai_description !== undefined) {
    updates.push('ai_description = ?')
    values.push(body.ai_description)
  }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400)

  values.push(imageId)
  await c.env.DB.prepare(
    `UPDATE doc_images SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run()

  const updated = await c.env.DB.prepare('SELECT * FROM doc_images WHERE id = ?').bind(imageId).first()
  return c.json({ image: updated })
})

// ──────────────────────────────────────────────────────────────
// Delete image
// DELETE /doc-images/:id
// ──────────────────────────────────────────────────────────────
docImagesRoutes.delete('/:id', async (c) => {
  const user = c.get('user')
  const imageId = c.req.param('id')

  const image = await c.env.DB.prepare(
    'SELECT id, file_url FROM doc_images WHERE id = ? AND org_id = ?'
  ).bind(imageId, user.org_id).first<{ id: string; file_url: string }>()

  if (!image) return c.json({ error: 'Image not found' }, 404)

  // Delete from R2
  await c.env.FILES.delete(image.file_url)

  // Delete from DB
  await c.env.DB.prepare('DELETE FROM doc_images WHERE id = ?').bind(imageId).run()

  return c.json({ success: true })
})
