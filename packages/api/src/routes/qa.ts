import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

// --- Helper: WebSocket broadcast ---
async function broadcast(env: Env, projectId: string, type: string, data: unknown) {
  try {
    const roomId = env.WEBSOCKET_ROOM.idFromName(`qa-${projectId}`)
    const room = env.WEBSOCKET_ROOM.get(roomId)
    await room.fetch(new Request('https://dummy/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type, data }),
    }))
  } catch (e) {
    console.error('QA broadcast error:', e)
  }
}

// --- Helper: generate a random public token ---
function generatePublicToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  for (const b of bytes) {
    token += chars[b % chars.length]
  }
  return token
}

// --- Helper: mask names for external routes ---
function maskNames(
  items: Record<string, unknown>[],
  fields: string[],
  idFields: string[]
): Record<string, unknown>[] {
  const idToLabel = new Map<string, string>()
  let letterIndex = 0

  function getLabel(id: string): string {
    if (!id) return ''
    if (idToLabel.has(id)) return idToLabel.get(id)!
    const letter = String.fromCharCode(65 + (letterIndex % 26)) // A, B, C, ...
    const label = `담당자${letter}`
    idToLabel.set(id, label)
    letterIndex++
    return label
  }

  return items.map((item) => {
    const masked = { ...item }
    // Mask name fields by looking at corresponding id fields
    for (let i = 0; i < idFields.length; i++) {
      const idField = idFields[i]
      const nameField = fields[i]
      const idVal = item[idField] as string | null
      if (idVal) {
        masked[nameField] = getLabel(idVal)
      } else if (item[nameField]) {
        // For external creators, mask the external name too
        masked[nameField] = getLabel(item[nameField] as string)
      }
    }
    return masked
  })
}

// --- Helper: fetch issue with joins ---
async function fetchIssueWithDetails(db: D1Database, issueId: string) {
  const issue = await db.prepare(`
    SELECT
      i.*,
      u1.name as assignee_name,
      u2.name as created_by_name
    FROM qa_issues i
    LEFT JOIN users u1 ON i.assignee_id = u1.id
    LEFT JOIN users u2 ON i.created_by_user_id = u2.id
    WHERE i.id = ?
  `).bind(issueId).first()

  if (!issue) return null

  const { results: testResults } = await db.prepare(`
    SELECT tr.*, u.name as user_name
    FROM qa_test_results tr
    LEFT JOIN users u ON tr.user_id = u.id
    WHERE tr.issue_id = ?
    ORDER BY tr.created_at DESC
  `).bind(issueId).all()

  return {
    ...issue,
    images: JSON.parse((issue.images as string) || '[]'),
    test_results: testResults || [],
  }
}

// ===========================
// QA Routes (internal, JWT auth)
// ===========================
export const qaRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

qaRoutes.use('/*', authMiddleware)

// GET / - List QA projects for user's org with issue counts per status
qaRoutes.get('/', async (c) => {
  const user = c.get('user')

  const { results: projects } = await c.env.DB.prepare(
    'SELECT * FROM qa_projects WHERE org_id = ? ORDER BY order_index ASC'
  ).bind(user.org_id).all()

  const projectsWithCounts = await Promise.all(
    (projects || []).map(async (project: any) => {
      const { results: counts } = await c.env.DB.prepare(`
        SELECT status, COUNT(*) as count
        FROM qa_issues
        WHERE project_id = ?
        GROUP BY status
      `).bind(project.id).all<{ status: string; count: number }>()

      const issue_count: Record<string, number> = {
        todo: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0,
        test_failed: 0,
      }
      for (const row of counts) {
        issue_count[row.status] = row.count
      }

      return { ...project, issue_count }
    })
  )

  return c.json({ projects: projectsWithCounts })
})

// POST / - Create project
qaRoutes.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ name: string; color?: string; is_public?: number }>()

  if (!body.name?.trim()) {
    return c.json({ error: '프로젝트명을 입력해주세요' }, 400)
  }

  const id = generateId()
  const isPublic = body.is_public ? 1 : 0
  const publicToken = isPublic ? generatePublicToken() : null

  // Next order_index
  const maxOrder = await c.env.DB.prepare(
    'SELECT MAX(order_index) as max FROM qa_projects WHERE org_id = ?'
  ).bind(user.org_id).first<{ max: number | null }>()
  const orderIndex = (maxOrder?.max ?? -1) + 1

  await c.env.DB.prepare(
    'INSERT INTO qa_projects (id, org_id, name, color, order_index, is_public, public_token) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, user.org_id, body.name.trim(), body.color || '#3B82F6', orderIndex, isPublic, publicToken).run()

  const project = await c.env.DB.prepare('SELECT * FROM qa_projects WHERE id = ?').bind(id).first()

  return c.json({ project }, 201)
})

// PATCH /reorder - Reorder projects (must be before /:id)
qaRoutes.patch('/reorder', async (c) => {
  const { orders } = await c.req.json<{ orders: { id: string; order_index: number }[] }>()

  if (!orders || !Array.isArray(orders)) {
    return c.json({ error: 'orders 배열이 필요합니다' }, 400)
  }

  const statements = orders.map(({ id, order_index }) =>
    c.env.DB.prepare('UPDATE qa_projects SET order_index = ? WHERE id = ?').bind(order_index, id)
  )

  await c.env.DB.batch(statements)

  return c.json({ success: true })
})

// PATCH /:id - Update project
qaRoutes.patch('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const existing = await c.env.DB.prepare(
    'SELECT * FROM qa_projects WHERE id = ? AND org_id = ?'
  ).bind(id, user.org_id).first()

  if (!existing) return c.json({ error: '프로젝트를 찾을 수 없습니다' }, 404)

  const body = await c.req.json<{ name?: string; color?: string; is_public?: number }>()

  const newIsPublic = body.is_public !== undefined ? (body.is_public ? 1 : 0) : (existing.is_public as number)

  // Generate public_token if switching to public and no token exists
  let publicToken = existing.public_token as string | null
  if (newIsPublic === 1 && !publicToken) {
    publicToken = generatePublicToken()
  }

  await c.env.DB.prepare(
    'UPDATE qa_projects SET name = ?, color = ?, is_public = ?, public_token = ? WHERE id = ?'
  ).bind(
    body.name?.trim() || existing.name,
    body.color || existing.color,
    newIsPublic,
    publicToken,
    id
  ).run()

  const project = await c.env.DB.prepare('SELECT * FROM qa_projects WHERE id = ?').bind(id).first()

  return c.json({ project })
})

// DELETE /:id - Delete project (CASCADE deletes issues and test results)
qaRoutes.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const existing = await c.env.DB.prepare(
    'SELECT * FROM qa_projects WHERE id = ? AND org_id = ?'
  ).bind(id, user.org_id).first()

  if (!existing) return c.json({ error: '프로젝트를 찾을 수 없습니다' }, 404)

  await c.env.DB.prepare('DELETE FROM qa_projects WHERE id = ?').bind(id).run()

  return c.json({ success: true })
})

// GET /:id/issues - List issues for project
qaRoutes.get('/:id/issues', async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('id')
  const statusFilter = c.req.query('status')
  const assigneeFilter = c.req.query('assignee_id')

  // Verify project belongs to user's org
  const project = await c.env.DB.prepare(
    'SELECT * FROM qa_projects WHERE id = ? AND org_id = ?'
  ).bind(projectId, user.org_id).first()

  if (!project) return c.json({ error: '프로젝트를 찾을 수 없습니다' }, 404)

  let query = `
    SELECT
      i.*,
      u1.name as assignee_name,
      u2.name as created_by_name
    FROM qa_issues i
    LEFT JOIN users u1 ON i.assignee_id = u1.id
    LEFT JOIN users u2 ON i.created_by_user_id = u2.id
    WHERE i.project_id = ?
  `
  const params: unknown[] = [projectId]

  if (statusFilter && statusFilter !== 'all') {
    query += ' AND i.status = ?'
    params.push(statusFilter)
  }

  if (assigneeFilter) {
    query += ' AND i.assignee_id = ?'
    params.push(assigneeFilter)
  }

  query += `
    ORDER BY
      CASE i.status
        WHEN 'in_progress' THEN 0
        WHEN 'test_failed' THEN 1
        WHEN 'todo' THEN 2
        WHEN 'completed' THEN 3
        WHEN 'cancelled' THEN 4
      END,
      i.created_at DESC
  `

  const { results } = await c.env.DB.prepare(query).bind(...params).all()

  // Fetch test results for each issue
  const issues = await Promise.all(
    (results || []).map(async (issue: any) => {
      const { results: testResults } = await c.env.DB.prepare(`
        SELECT tr.*, u.name as user_name
        FROM qa_test_results tr
        LEFT JOIN users u ON tr.user_id = u.id
        WHERE tr.issue_id = ?
        ORDER BY tr.created_at DESC
      `).bind(issue.id).all()

      return {
        ...issue,
        images: JSON.parse(issue.images || '[]'),
        test_results: testResults || [],
      }
    })
  )

  return c.json({ issues })
})

// POST /:id/issues - Create issue
qaRoutes.post('/:id/issues', async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('id')

  // Verify project belongs to user's org
  const project = await c.env.DB.prepare(
    'SELECT * FROM qa_projects WHERE id = ? AND org_id = ?'
  ).bind(projectId, user.org_id).first()

  if (!project) return c.json({ error: '프로젝트를 찾을 수 없습니다' }, 404)

  const body = await c.req.json<{
    content: string
    assignee_id?: string
    images?: { url: string; name: string }[]
  }>()

  if (!body.content?.trim()) {
    return c.json({ error: '내용을 입력해주세요' }, 400)
  }

  const id = generateId()

  // Auto-increment issue_number per project
  const maxNum = await c.env.DB.prepare(
    'SELECT MAX(issue_number) as max FROM qa_issues WHERE project_id = ?'
  ).bind(projectId).first<{ max: number | null }>()
  const issueNumber = (maxNum?.max ?? 0) + 1

  await c.env.DB.prepare(`
    INSERT INTO qa_issues (id, project_id, issue_number, content, assignee_id, created_by_user_id, images)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, projectId, issueNumber, body.content.trim(),
    body.assignee_id || null, user.id,
    JSON.stringify(body.images || [])
  ).run()

  const issue = await fetchIssueWithDetails(c.env.DB, id)

  await broadcast(c.env, projectId, 'issue:created', issue)

  return c.json({ issue }, 201)
})

// PATCH /issues/:id - Update issue
qaRoutes.patch('/issues/:id', async (c) => {
  const user = c.get('user')
  const issueId = c.req.param('id')

  const existing = await c.env.DB.prepare(`
    SELECT i.*, p.org_id FROM qa_issues i
    JOIN qa_projects p ON i.project_id = p.id
    WHERE i.id = ?
  `).bind(issueId).first()

  if (!existing) return c.json({ error: '이슈를 찾을 수 없습니다' }, 404)
  if (existing.org_id !== user.org_id) return c.json({ error: '권한이 없습니다' }, 403)

  const body = await c.req.json<{
    content?: string
    status?: string
    assignee_id?: string | null
    images?: { url: string; name: string }[]
  }>()

  const validStatuses = ['todo', 'in_progress', 'completed', 'cancelled', 'test_failed']
  if (body.status && !validStatuses.includes(body.status)) {
    return c.json({ error: '잘못된 상태값입니다' }, 400)
  }

  await c.env.DB.prepare(`
    UPDATE qa_issues SET
      content = ?,
      status = ?,
      assignee_id = ?,
      images = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.content?.trim() || existing.content,
    body.status || existing.status,
    body.assignee_id !== undefined ? body.assignee_id : existing.assignee_id,
    body.images !== undefined ? JSON.stringify(body.images) : (existing.images as string),
    issueId
  ).run()

  const issue = await fetchIssueWithDetails(c.env.DB, issueId)

  await broadcast(c.env, existing.project_id as string, 'issue:updated', issue)

  return c.json({ issue })
})

// DELETE /issues/:id - Delete issue
qaRoutes.delete('/issues/:id', async (c) => {
  const user = c.get('user')
  const issueId = c.req.param('id')

  const existing = await c.env.DB.prepare(`
    SELECT i.*, p.org_id FROM qa_issues i
    JOIN qa_projects p ON i.project_id = p.id
    WHERE i.id = ?
  `).bind(issueId).first()

  if (!existing) return c.json({ error: '이슈를 찾을 수 없습니다' }, 404)
  if (existing.org_id !== user.org_id) return c.json({ error: '권한이 없습니다' }, 403)

  await c.env.DB.prepare('DELETE FROM qa_issues WHERE id = ?').bind(issueId).run()

  await broadcast(c.env, existing.project_id as string, 'issue:deleted', {
    id: issueId,
    deleted_by: user.id,
  })

  return c.json({ success: true })
})

// POST /issues/:id/test - Add test result
qaRoutes.post('/issues/:id/test', async (c) => {
  const user = c.get('user')
  const issueId = c.req.param('id')

  const existing = await c.env.DB.prepare(`
    SELECT i.*, p.org_id FROM qa_issues i
    JOIN qa_projects p ON i.project_id = p.id
    WHERE i.id = ?
  `).bind(issueId).first()

  if (!existing) return c.json({ error: '이슈를 찾을 수 없습니다' }, 404)
  if (existing.org_id !== user.org_id) return c.json({ error: '권한이 없습니다' }, 403)

  const body = await c.req.json<{ result: 'pass' | 'fail' | 'comment'; comment?: string }>()

  if (!['pass', 'fail', 'comment'].includes(body.result)) {
    return c.json({ error: '잘못된 결과값입니다' }, 400)
  }

  const id = generateId()

  await c.env.DB.prepare(`
    INSERT INTO qa_test_results (id, issue_id, user_id, result, comment)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, issueId, user.id, body.result, body.comment || null).run()

  // If result is fail, set issue status to test_failed
  if (body.result === 'fail') {
    await c.env.DB.prepare(`
      UPDATE qa_issues SET status = 'test_failed', updated_at = datetime('now') WHERE id = ?
    `).bind(issueId).run()
  }

  const issue = await fetchIssueWithDetails(c.env.DB, issueId)

  await broadcast(c.env, existing.project_id as string, 'issue:updated', issue)

  return c.json({ issue })
})

// POST /images/upload - Upload image to R2
qaRoutes.post('/images/upload', async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null

  if (!file) return c.json({ error: '파일이 필요합니다' }, 400)

  // Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ error: '파일 크기는 10MB를 초과할 수 없습니다' }, 400)
  }

  const ext = file.name.split('.').pop() || 'png'
  const key = `qa/${generateId()}.${ext}`

  await c.env.FILES.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type || 'image/png',
    },
  })

  const url = `/api/files/${key}`

  return c.json({ url, key, name: file.name })
})

// GET /images/:key - Serve image from R2 (proxied through /api/files/ in index.ts already)
// This route provides an alternative path under /api/qa/images/
qaRoutes.get('/images/*', async (c) => {
  const key = c.req.path.replace(/^\/images\//, '')
  const fullKey = key.startsWith('qa/') ? key : `qa/${key}`
  const object = await c.env.FILES.get(fullKey)

  if (!object) return c.json({ error: '이미지를 찾을 수 없습니다' }, 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control', 'public, max-age=86400')

  return new Response(object.body, { headers })
})

// GET /dashboard-stats - Unresolved counts per project for the org
qaRoutes.get('/dashboard-stats', async (c) => {
  const user = c.get('user')

  const { results: projects } = await c.env.DB.prepare(
    'SELECT id, name, color FROM qa_projects WHERE org_id = ? ORDER BY order_index ASC'
  ).bind(user.org_id).all()

  const stats = await Promise.all(
    (projects || []).map(async (project: any) => {
      const row = await c.env.DB.prepare(`
        SELECT COUNT(*) as unresolved
        FROM qa_issues
        WHERE project_id = ?
          AND status IN ('todo', 'in_progress', 'test_failed')
      `).bind(project.id).first<{ unresolved: number }>()

      return {
        project_id: project.id,
        project_name: project.name,
        project_color: project.color,
        unresolved: row?.unresolved || 0,
      }
    })
  )

  return c.json({ stats })
})


// ===========================
// QA External Routes (no auth, token-based)
// ===========================
export const qaExternalRoutes = new Hono<{ Bindings: Env }>()

// Helper: get project by public token
async function getProjectByToken(db: D1Database, token: string) {
  return db.prepare(
    'SELECT * FROM qa_projects WHERE public_token = ? AND is_public = 1'
  ).bind(token).first()
}

// GET /external/:token - Get project info
qaExternalRoutes.get('/:token', async (c) => {
  const token = c.req.param('token')
  const project = await getProjectByToken(c.env.DB, token)

  if (!project) return c.json({ error: '프로젝트를 찾을 수 없거나 비공개입니다' }, 404)

  return c.json({
    project: {
      id: project.id,
      name: project.name,
      color: project.color,
    },
  })
})

// GET /external/:token/issues - List issues (names masked)
qaExternalRoutes.get('/:token/issues', async (c) => {
  const token = c.req.param('token')
  const project = await getProjectByToken(c.env.DB, token)

  if (!project) return c.json({ error: '프로젝트를 찾을 수 없거나 비공개입니다' }, 404)

  const { results } = await c.env.DB.prepare(`
    SELECT
      i.*,
      u1.name as assignee_name,
      u2.name as created_by_name
    FROM qa_issues i
    LEFT JOIN users u1 ON i.assignee_id = u1.id
    LEFT JOIN users u2 ON i.created_by_user_id = u2.id
    WHERE i.project_id = ?
    ORDER BY
      CASE i.status
        WHEN 'in_progress' THEN 0
        WHEN 'test_failed' THEN 1
        WHEN 'todo' THEN 2
        WHEN 'completed' THEN 3
        WHEN 'cancelled' THEN 4
      END,
      i.created_at DESC
  `).bind(project.id).all()

  // Build a unified name mapping for masking
  const idToLabel = new Map<string, string>()
  let letterIndex = 0

  function getLabel(identifier: string): string {
    if (!identifier) return ''
    if (idToLabel.has(identifier)) return idToLabel.get(identifier)!
    const letter = String.fromCharCode(65 + (letterIndex % 26))
    const label = `담당자${letter}`
    idToLabel.set(identifier, label)
    letterIndex++
    return label
  }

  // Fetch test results and mask names
  const issues = await Promise.all(
    (results || []).map(async (issue: any) => {
      const { results: testResults } = await c.env.DB.prepare(`
        SELECT tr.*, u.name as user_name
        FROM qa_test_results tr
        LEFT JOIN users u ON tr.user_id = u.id
        WHERE tr.issue_id = ?
        ORDER BY tr.created_at DESC
      `).bind(issue.id).all()

      // Mask assignee name
      let maskedAssigneeName = ''
      if (issue.assignee_id) {
        maskedAssigneeName = getLabel(issue.assignee_id)
      }

      // Mask created_by name
      let maskedCreatedByName = ''
      if (issue.created_by_user_id) {
        maskedCreatedByName = getLabel(issue.created_by_user_id)
      } else if (issue.created_by_external) {
        maskedCreatedByName = getLabel(`ext:${issue.created_by_external}`)
      }

      // Mask test result names
      const maskedTestResults = (testResults || []).map((tr: any) => {
        let maskedName = ''
        if (tr.user_id) {
          maskedName = getLabel(tr.user_id)
        } else if (tr.external_name) {
          maskedName = getLabel(`ext:${tr.external_name}`)
        }
        return {
          ...tr,
          user_name: maskedName,
          external_name: tr.external_name ? maskedName : null,
        }
      })

      return {
        ...issue,
        assignee_name: maskedAssigneeName,
        created_by_name: maskedCreatedByName,
        images: JSON.parse(issue.images || '[]'),
        test_results: maskedTestResults,
      }
    })
  )

  return c.json({ issues })
})

// POST /external/:token/issues - Create issue as external tester
qaExternalRoutes.post('/:token/issues', async (c) => {
  const token = c.req.param('token')
  const project = await getProjectByToken(c.env.DB, token)

  if (!project) return c.json({ error: '프로젝트를 찾을 수 없거나 비공개입니다' }, 404)

  const body = await c.req.json<{
    content: string
    created_by_external: string
    images?: { url: string; name: string }[]
  }>()

  if (!body.content?.trim()) {
    return c.json({ error: '내용을 입력해주세요' }, 400)
  }
  if (!body.created_by_external?.trim()) {
    return c.json({ error: '이름을 입력해주세요' }, 400)
  }

  const id = generateId()

  // Auto-increment issue_number
  const maxNum = await c.env.DB.prepare(
    'SELECT MAX(issue_number) as max FROM qa_issues WHERE project_id = ?'
  ).bind(project.id).first<{ max: number | null }>()
  const issueNumber = (maxNum?.max ?? 0) + 1

  await c.env.DB.prepare(`
    INSERT INTO qa_issues (id, project_id, issue_number, content, created_by_external, images)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id, project.id, issueNumber, body.content.trim(),
    body.created_by_external.trim(),
    JSON.stringify(body.images || [])
  ).run()

  const issue = await fetchIssueWithDetails(c.env.DB, id)

  await broadcast(c.env, project.id as string, 'issue:created', issue)

  return c.json({ issue }, 201)
})

// POST /external/:token/issues/:issueId/test - Add test result as external
qaExternalRoutes.post('/:token/issues/:issueId/test', async (c) => {
  const token = c.req.param('token')
  const issueId = c.req.param('issueId')

  const project = await getProjectByToken(c.env.DB, token)
  if (!project) return c.json({ error: '프로젝트를 찾을 수 없거나 비공개입니다' }, 404)

  // Verify issue belongs to this project
  const existing = await c.env.DB.prepare(
    'SELECT * FROM qa_issues WHERE id = ? AND project_id = ?'
  ).bind(issueId, project.id).first()

  if (!existing) return c.json({ error: '이슈를 찾을 수 없습니다' }, 404)

  const body = await c.req.json<{
    external_name: string
    result: 'pass' | 'fail' | 'comment'
    comment?: string
  }>()

  if (!['pass', 'fail', 'comment'].includes(body.result)) {
    return c.json({ error: '잘못된 결과값입니다' }, 400)
  }
  if (!body.external_name?.trim()) {
    return c.json({ error: '이름을 입력해주세요' }, 400)
  }

  const id = generateId()

  await c.env.DB.prepare(`
    INSERT INTO qa_test_results (id, issue_id, external_name, result, comment)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, issueId, body.external_name.trim(), body.result, body.comment || null).run()

  // If result is fail, set issue status to test_failed
  if (body.result === 'fail') {
    await c.env.DB.prepare(`
      UPDATE qa_issues SET status = 'test_failed', updated_at = datetime('now') WHERE id = ?
    `).bind(issueId).run()
  }

  const issue = await fetchIssueWithDetails(c.env.DB, issueId)

  await broadcast(c.env, project.id as string, 'issue:updated', issue)

  return c.json({ issue })
})

// POST /external/:token/images/upload - Upload image as external
qaExternalRoutes.post('/:token/images/upload', async (c) => {
  const token = c.req.param('token')
  const project = await getProjectByToken(c.env.DB, token)

  if (!project) return c.json({ error: '프로젝트를 찾을 수 없거나 비공개입니다' }, 404)

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null

  if (!file) return c.json({ error: '파일이 필요합니다' }, 400)

  // Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ error: '파일 크기는 10MB를 초과할 수 없습니다' }, 400)
  }

  const ext = file.name.split('.').pop() || 'png'
  const key = `qa/${generateId()}.${ext}`

  await c.env.FILES.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type || 'image/png',
    },
  })

  const url = `/api/files/${key}`

  return c.json({ url, key, name: file.name })
})
