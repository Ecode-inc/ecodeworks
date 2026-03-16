import { Hono } from 'hono'
import type { Env } from '../types'
import { apiKeyMiddleware } from '../middleware/apiKey'
import { generateId } from '../lib/id'

type Variables = { apiKeyOrgId: string; apiKeyScopes: string[] }

export const aiRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

// OpenAPI spec
aiRoutes.get('/openapi.json', (c) => {
  return c.json({
    openapi: '3.0.0',
    info: {
      title: 'ecode Internal API',
      version: '1.0.0',
      description: 'AI assistant API for ecode internal platform',
    },
    servers: [{ url: '/api/v1' }],
    paths: {
      '/calendar/events': {
        get: {
          summary: 'List calendar events',
          parameters: [
            { name: 'dept_id', in: 'query', schema: { type: 'string' } },
            { name: 'start', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'end', in: 'query', schema: { type: 'string', format: 'date-time' } },
          ],
          responses: { '200': { description: 'List of events' } },
        },
      },
      '/tasks': {
        get: {
          summary: 'List tasks',
          parameters: [
            { name: 'board_id', in: 'query', schema: { type: 'string' } },
            { name: 'assignee_id', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'List of tasks' } },
        },
      },
      '/docs/search': {
        get: {
          summary: 'Search documents',
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Search results' } },
        },
      },
    },
    components: {
      securitySchemes: {
        apiKey: { type: 'http', scheme: 'bearer' },
      },
    },
    security: [{ apiKey: [] }],
  })
})

// Protected endpoints
aiRoutes.use('/*', apiKeyMiddleware)

function checkScope(scopes: string[], required: string): boolean {
  return scopes.includes('*') || scopes.includes(required)
}

// Calendar events
aiRoutes.get('/calendar/events', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'calendar:read')) {
    return c.json({ error: 'Insufficient scope' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const deptId = c.req.query('dept_id')
  const start = c.req.query('start')
  const end = c.req.query('end')

  let query = `SELECT e.* FROM events e
    JOIN departments d ON d.id = e.department_id
    WHERE d.org_id = ?`
  const params: unknown[] = [orgId]

  if (deptId) { query += ' AND e.department_id = ?'; params.push(deptId) }
  if (start) { query += ' AND e.end_at >= ?'; params.push(start) }
  if (end) { query += ' AND e.start_at <= ?'; params.push(end) }

  query += ' ORDER BY e.start_at LIMIT 100'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ events: results })
})

// Tasks
aiRoutes.get('/tasks', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'kanban:read')) {
    return c.json({ error: 'Insufficient scope' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const boardId = c.req.query('board_id')
  const assigneeId = c.req.query('assignee_id')

  let query = `SELECT t.*, u.name as assignee_name FROM tasks t
    JOIN boards b ON b.id = t.board_id
    JOIN departments d ON d.id = b.department_id
    LEFT JOIN users u ON u.id = t.assignee_id
    WHERE d.org_id = ?`
  const params: unknown[] = [orgId]

  if (boardId) { query += ' AND t.board_id = ?'; params.push(boardId) }
  if (assigneeId) { query += ' AND t.assignee_id = ?'; params.push(assigneeId) }

  query += ' ORDER BY t.updated_at DESC LIMIT 100'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ tasks: results })
})

// Search docs
aiRoutes.get('/docs/search', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:read')) {
    return c.json({ error: 'Insufficient scope' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const q = c.req.query('q')
  if (!q) return c.json({ documents: [] })

  const { results } = await c.env.DB.prepare(`
    SELECT d.id, d.title, d.department_id, d.created_at,
           snippet(documents_fts, 1, '<mark>', '</mark>', '...', 32) as snippet
    FROM documents_fts fts
    JOIN documents d ON d.rowid = fts.rowid
    JOIN departments dept ON dept.id = d.department_id
    WHERE documents_fts MATCH ? AND dept.org_id = ?
    ORDER BY rank LIMIT 20
  `).bind(q, orgId).all()

  return c.json({ documents: results })
})

// API key management (requires auth middleware instead - handled in separate route)
aiRoutes.post('/keys', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'admin')) {
    return c.json({ error: 'Insufficient scope' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const { name, scopes: newScopes } = await c.req.json<{ name: string; scopes: string[] }>()

  const id = generateId()
  const rawKey = `ek_${generateId().replace(/-/g, '')}${generateId().replace(/-/g, '').slice(0, 16)}`
  const keyPrefix = rawKey.slice(0, 10)

  const encoded = new TextEncoder().encode(rawKey)
  const hash = await crypto.subtle.digest('SHA-256', encoded)
  const keyHash = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')

  await c.env.DB.prepare(
    'INSERT INTO api_keys (id, org_id, name, key_hash, key_prefix, scopes) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, orgId, name, keyHash, keyPrefix, JSON.stringify(newScopes || ['*'])).run()

  // Return the raw key only once
  return c.json({ id, name, key: rawKey, prefix: keyPrefix, scopes: newScopes }, 201)
})
