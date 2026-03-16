/**
 * AI API Routes
 *
 * SAFETY RESTRICTIONS:
 * - DELETE operations are BLOCKED on all resources (no bulk or single delete)
 * - Vault passwords are NEVER exposed; only metadata (service_name, url, created_at) is accessible
 * - User/member/department/organization modifications are BLOCKED
 * - DROP/TRUNCATE or any destructive data operations are not available
 *
 * Available scopes:
 *   calendar:read, calendar:write
 *   kanban:read, kanban:write
 *   docs:read, docs:write
 *   vault:read (metadata only, no decryption)
 *   members:read
 *   departments:read
 */

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
      description: [
        'AI assistant API for ecode internal platform.',
        '',
        'SAFETY RESTRICTIONS:',
        '- DELETE operations are BLOCKED on all resources',
        '- Vault passwords are NEVER exposed (metadata only)',
        '- User/member/department/organization modifications are BLOCKED',
        '- DROP/TRUNCATE or any destructive data operations are not available',
      ].join('\n'),
    },
    servers: [{ url: '/api/v1' }],
    paths: {
      // ── Calendar ──────────────────────────────────────────────
      '/calendar/events': {
        get: {
          summary: 'List calendar events',
          operationId: 'listCalendarEvents',
          tags: ['Calendar'],
          parameters: [
            { name: 'dept_id', in: 'query', schema: { type: 'string' }, description: 'Filter by department ID' },
            { name: 'start', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Start of date range (ISO 8601)' },
            { name: 'end', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'End of date range (ISO 8601)' },
            { name: 'context', in: 'query', schema: { type: 'string', enum: ['group', 'private'] }, description: 'group=그룹방(개인일정 제외), private=1:1채팅(개인일정 포함)' },
            { name: 'user_id', in: 'query', schema: { type: 'string' }, description: 'private context에서 개인일정을 볼 사용자 ID' },
          ],
          responses: {
            '200': {
              description: 'List of calendar events',
              content: { 'application/json': { schema: { type: 'object', properties: {
                events: { type: 'array', items: { '$ref': '#/components/schemas/CalendarEvent' } },
              } } } },
            },
          },
        },
        post: {
          summary: 'Create a calendar event',
          operationId: 'createCalendarEvent',
          tags: ['Calendar'],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { '$ref': '#/components/schemas/CalendarEventInput' } } },
          },
          responses: {
            '201': { description: 'Event created', content: { 'application/json': { schema: { '$ref': '#/components/schemas/CalendarEvent' } } } },
          },
        },
      },
      '/calendar/events/{id}': {
        get: {
          summary: 'Get a calendar event by ID',
          operationId: 'getCalendarEvent',
          tags: ['Calendar'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Calendar event detail' } },
        },
        patch: {
          summary: 'Update a calendar event',
          operationId: 'updateCalendarEvent',
          tags: ['Calendar'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { '$ref': '#/components/schemas/CalendarEventInput' } } },
          },
          responses: { '200': { description: 'Event updated' } },
        },
      },
      // ── Tasks ─────────────────────────────────────────────────
      '/tasks': {
        get: {
          summary: 'List tasks',
          operationId: 'listTasks',
          tags: ['Tasks'],
          parameters: [
            { name: 'board_id', in: 'query', schema: { type: 'string' }, description: 'Filter by board ID' },
            { name: 'assignee_id', in: 'query', schema: { type: 'string' }, description: 'Filter by assignee user ID' },
          ],
          responses: {
            '200': {
              description: 'List of tasks',
              content: { 'application/json': { schema: { type: 'object', properties: {
                tasks: { type: 'array', items: { '$ref': '#/components/schemas/Task' } },
              } } } },
            },
          },
        },
        post: {
          summary: 'Create a task',
          operationId: 'createTask',
          tags: ['Tasks'],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { '$ref': '#/components/schemas/TaskInput' } } },
          },
          responses: { '201': { description: 'Task created' } },
        },
      },
      '/tasks/{id}': {
        get: {
          summary: 'Get a task by ID',
          operationId: 'getTask',
          tags: ['Tasks'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Task detail' } },
        },
        patch: {
          summary: 'Update a task',
          operationId: 'updateTask',
          tags: ['Tasks'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { '$ref': '#/components/schemas/TaskInput' } } },
          },
          responses: { '200': { description: 'Task updated' } },
        },
      },
      // ── Boards ────────────────────────────────────────────────
      '/boards': {
        get: {
          summary: 'List boards',
          operationId: 'listBoards',
          tags: ['Boards'],
          parameters: [
            { name: 'dept_id', in: 'query', schema: { type: 'string' }, description: 'Filter by department ID' },
          ],
          responses: {
            '200': {
              description: 'List of boards',
              content: { 'application/json': { schema: { type: 'object', properties: {
                boards: { type: 'array', items: { '$ref': '#/components/schemas/Board' } },
              } } } },
            },
          },
        },
      },
      '/boards/{id}': {
        get: {
          summary: 'Get a board with columns',
          operationId: 'getBoard',
          tags: ['Boards'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Board detail with columns' } },
        },
      },
      // ── Documents ─────────────────────────────────────────────
      '/docs/search': {
        get: {
          summary: 'Search documents by full-text query',
          operationId: 'searchDocuments',
          tags: ['Documents'],
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Search query' },
          ],
          responses: {
            '200': {
              description: 'Search results with snippets',
              content: { 'application/json': { schema: { type: 'object', properties: {
                documents: { type: 'array', items: { '$ref': '#/components/schemas/DocumentSearchResult' } },
              } } } },
            },
          },
        },
      },
      '/docs/{id}': {
        get: {
          summary: 'Get a document by ID',
          operationId: 'getDocument',
          tags: ['Documents'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Document detail' } },
        },
        patch: {
          summary: 'Update a document',
          operationId: 'updateDocument',
          tags: ['Documents'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { '$ref': '#/components/schemas/DocumentInput' } } },
          },
          responses: { '200': { description: 'Document updated' } },
        },
      },
      '/docs': {
        post: {
          summary: 'Create a document',
          operationId: 'createDocument',
          tags: ['Documents'],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { '$ref': '#/components/schemas/DocumentInput' } } },
          },
          responses: { '201': { description: 'Document created' } },
        },
      },
      // ── Vault (metadata only) ─────────────────────────────────
      '/vault/credentials': {
        get: {
          summary: 'List vault credential metadata (NO passwords or decrypted data)',
          operationId: 'listVaultCredentials',
          tags: ['Vault'],
          parameters: [
            { name: 'dept_id', in: 'query', schema: { type: 'string' }, description: 'Filter by department ID' },
          ],
          responses: {
            '200': {
              description: 'List of credential metadata (service_name, url, created_at only)',
              content: { 'application/json': { schema: { type: 'object', properties: {
                credentials: { type: 'array', items: { '$ref': '#/components/schemas/VaultCredentialMeta' } },
              } } } },
            },
          },
        },
      },
      // ── Members ───────────────────────────────────────────────
      '/members': {
        get: {
          summary: 'List organization members',
          operationId: 'listMembers',
          tags: ['Members'],
          responses: {
            '200': {
              description: 'List of members',
              content: { 'application/json': { schema: { type: 'object', properties: {
                members: { type: 'array', items: { '$ref': '#/components/schemas/Member' } },
              } } } },
            },
          },
        },
      },
      // ── Departments ───────────────────────────────────────────
      '/departments': {
        get: {
          summary: 'List organization departments',
          operationId: 'listDepartments',
          tags: ['Departments'],
          responses: {
            '200': {
              description: 'List of departments',
              content: { 'application/json': { schema: { type: 'object', properties: {
                departments: { type: 'array', items: { '$ref': '#/components/schemas/Department' } },
              } } } },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        apiKey: { type: 'http', scheme: 'bearer' },
      },
      schemas: {
        CalendarEvent: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            department_id: { type: 'string' },
            user_id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            start_at: { type: 'string', format: 'date-time' },
            end_at: { type: 'string', format: 'date-time' },
            all_day: { type: 'integer', enum: [0, 1] },
            color: { type: 'string' },
            visibility: { type: 'string', enum: ['personal', 'department', 'company', 'shared'] },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        CalendarEventInput: {
          type: 'object',
          required: ['title', 'start_at', 'end_at', 'department_id'],
          properties: {
            department_id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            start_at: { type: 'string', format: 'date-time' },
            end_at: { type: 'string', format: 'date-time' },
            all_day: { type: 'boolean' },
            color: { type: 'string' },
            visibility: { type: 'string', enum: ['personal', 'department', 'company', 'shared'] },
          },
        },
        Task: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            board_id: { type: 'string' },
            column_id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            assignee_id: { type: 'string', nullable: true },
            assignee_name: { type: 'string', nullable: true },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            labels: { type: 'string', description: 'JSON array of label strings' },
            due_date: { type: 'string', nullable: true, format: 'date' },
            order_index: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        TaskInput: {
          type: 'object',
          required: ['board_id', 'column_id', 'title'],
          properties: {
            board_id: { type: 'string' },
            column_id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            assignee_id: { type: 'string', nullable: true },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            labels: { type: 'string', description: 'JSON array of label strings' },
            due_date: { type: 'string', nullable: true, format: 'date' },
            order_index: { type: 'integer' },
          },
        },
        Board: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            department_id: { type: 'string' },
            name: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        DocumentSearchResult: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            department_id: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            snippet: { type: 'string', description: 'Highlighted snippet from content' },
          },
        },
        Document: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            department_id: { type: 'string' },
            parent_id: { type: 'string', nullable: true },
            title: { type: 'string' },
            content: { type: 'string' },
            is_folder: { type: 'integer', enum: [0, 1] },
            order_index: { type: 'integer' },
            created_by: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        DocumentInput: {
          type: 'object',
          required: ['department_id', 'title'],
          properties: {
            department_id: { type: 'string' },
            parent_id: { type: 'string', nullable: true },
            title: { type: 'string' },
            content: { type: 'string' },
            is_folder: { type: 'boolean' },
          },
        },
        VaultCredentialMeta: {
          type: 'object',
          description: 'Metadata only - passwords and encrypted fields are NEVER returned',
          properties: {
            id: { type: 'string' },
            department_id: { type: 'string' },
            service_name: { type: 'string' },
            url: { type: 'string' },
            created_by: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Member: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            avatar_url: { type: 'string', nullable: true },
            is_ceo: { type: 'integer', enum: [0, 1] },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Department: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
            color: { type: 'string' },
            order_index: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
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

// KST (UTC+9) helpers
function nowKST(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}
function todayKST(): string {
  return nowKST().toISOString().slice(0, 10)
}
function nowKSTString(): string {
  const d = nowKST()
  return d.toISOString().replace('Z', '+09:00')
}

// ──────────────────────────────────────────────────────────────
// Safety: Block ALL DELETE operations via AI API
// ──────────────────────────────────────────────────────────────
aiRoutes.delete('/*', (c) => {
  return c.json({ error: 'DELETE operations are not allowed via AI API' }, 403)
})

// ──────────────────────────────────────────────────────────────
// Calendar events
// ──────────────────────────────────────────────────────────────
aiRoutes.get('/calendar/events', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'calendar:read')) {
    return c.json({ error: 'Insufficient scope: calendar:read required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const deptId = c.req.query('dept_id')
  const start = c.req.query('start')
  const end = c.req.query('end')
  // context: 'group' = Telegram group (no personal events), 'private' = 1:1 chat (personal allowed)
  const context = c.req.query('context')
  // user_id: whose personal events to show in private context
  const userId = c.req.query('user_id')

  let query = `SELECT e.* FROM events e
    JOIN departments d ON d.id = e.department_id
    WHERE d.org_id = ?`
  const params: unknown[] = [orgId]

  if (context === 'group') {
    // Group chat: never expose personal events
    query += " AND e.visibility != 'personal'"
  } else if (context === 'private' && userId) {
    // Private 1:1: show personal events only for that user
    query += " AND (e.visibility != 'personal' OR e.user_id = ?)"
    params.push(userId)
  }

  if (deptId) { query += ' AND e.department_id = ?'; params.push(deptId) }
  if (start) { query += ' AND e.end_at >= ?'; params.push(start) }
  if (end) { query += ' AND e.start_at <= ?'; params.push(end) }

  query += ' ORDER BY e.start_at LIMIT 100'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ events: results })
})

aiRoutes.get('/calendar/events/:id', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'calendar:read')) {
    return c.json({ error: 'Insufficient scope: calendar:read required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const id = c.req.param('id')

  const event = await c.env.DB.prepare(`
    SELECT e.* FROM events e
    JOIN departments d ON d.id = e.department_id
    WHERE e.id = ? AND d.org_id = ?
  `).bind(id, orgId).first()

  if (!event) return c.json({ error: 'Event not found' }, 404)
  return c.json({ event })
})

aiRoutes.post('/calendar/events', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'calendar:write')) {
    return c.json({ error: 'Insufficient scope: calendar:write required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const body = await c.req.json<{
    department_id: string
    title: string
    description?: string
    start_at: string
    end_at: string
    all_day?: boolean
    color?: string
    visibility?: string
  }>()

  if (!body.department_id || !body.title || !body.start_at || !body.end_at) {
    return c.json({ error: 'department_id, title, start_at, end_at are required' }, 400)
  }

  // Verify department belongs to org
  const dept = await c.env.DB.prepare('SELECT id FROM departments WHERE id = ? AND org_id = ?')
    .bind(body.department_id, orgId).first()
  if (!dept) return c.json({ error: 'Department not found in organization' }, 404)

  // Get a real user_id for FK
  const ceoUser = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1').bind(orgId).first<{ id: string }>()
  const apiUserId = ceoUser?.id || (await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? LIMIT 1').bind(orgId).first<{ id: string }>())?.id || ''

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO events (id, department_id, user_id, title, description, start_at, end_at, all_day, color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id,
    body.department_id,
    apiUserId,
    body.title,
    body.description || '',
    body.start_at,
    body.end_at,
    body.all_day ? 1 : 0,
    body.color || '#3B82F6'
  ).run()

  const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first()
  return c.json({ event }, 201)
})

aiRoutes.patch('/calendar/events/:id', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'calendar:write')) {
    return c.json({ error: 'Insufficient scope: calendar:write required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const id = c.req.param('id')

  // Verify event belongs to org
  const existing = await c.env.DB.prepare(`
    SELECT e.id FROM events e
    JOIN departments d ON d.id = e.department_id
    WHERE e.id = ? AND d.org_id = ?
  `).bind(id, orgId).first()
  if (!existing) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<Record<string, unknown>>()
  const allowedFields = ['title', 'description', 'start_at', 'end_at', 'all_day', 'color', 'visibility']
  const sets: string[] = []
  const params: unknown[] = []

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (field === 'all_day') {
        sets.push(`${field} = ?`)
        params.push(body[field] ? 1 : 0)
      } else {
        sets.push(`${field} = ?`)
        params.push(body[field])
      }
    }
  }

  if (sets.length === 0) return c.json({ error: 'No valid fields to update' }, 400)

  sets.push("updated_at = datetime('now')")
  params.push(id)

  await c.env.DB.prepare(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()
  const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first()
  return c.json({ event })
})

// ──────────────────────────────────────────────────────────────
// Tasks
// ──────────────────────────────────────────────────────────────
aiRoutes.get('/tasks', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'kanban:read')) {
    return c.json({ error: 'Insufficient scope: kanban:read required' }, 403)
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

aiRoutes.get('/tasks/:id', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'kanban:read')) {
    return c.json({ error: 'Insufficient scope: kanban:read required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const id = c.req.param('id')

  const task = await c.env.DB.prepare(`
    SELECT t.*, u.name as assignee_name FROM tasks t
    JOIN boards b ON b.id = t.board_id
    JOIN departments d ON d.id = b.department_id
    LEFT JOIN users u ON u.id = t.assignee_id
    WHERE t.id = ? AND d.org_id = ?
  `).bind(id, orgId).first()

  if (!task) return c.json({ error: 'Task not found' }, 404)
  return c.json({ task })
})

aiRoutes.post('/tasks', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'kanban:write')) {
    return c.json({ error: 'Insufficient scope: kanban:write required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const body = await c.req.json<{
    board_id: string
    column_id: string
    title: string
    description?: string
    assignee_id?: string
    priority?: string
    labels?: string
    due_date?: string
    order_index?: number
  }>()

  if (!body.board_id || !body.column_id || !body.title) {
    return c.json({ error: 'board_id, column_id, title are required' }, 400)
  }

  // Verify board belongs to org
  const board = await c.env.DB.prepare(`
    SELECT b.id FROM boards b
    JOIN departments d ON d.id = b.department_id
    WHERE b.id = ? AND d.org_id = ?
  `).bind(body.board_id, orgId).first()
  if (!board) return c.json({ error: 'Board not found in organization' }, 404)

  // Verify column belongs to board
  const col = await c.env.DB.prepare('SELECT id FROM board_columns WHERE id = ? AND board_id = ?')
    .bind(body.column_id, body.board_id).first()
  if (!col) return c.json({ error: 'Column not found in board' }, 404)

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO tasks (id, board_id, column_id, title, description, assignee_id, priority, labels, due_date, order_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id,
    body.board_id,
    body.column_id,
    body.title,
    body.description || '',
    body.assignee_id || null,
    body.priority || 'medium',
    body.labels || '[]',
    body.due_date || null,
    body.order_index ?? 0
  ).run()

  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first()
  return c.json({ task }, 201)
})

aiRoutes.patch('/tasks/:id', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'kanban:write')) {
    return c.json({ error: 'Insufficient scope: kanban:write required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const id = c.req.param('id')

  // Verify task belongs to org
  const existing = await c.env.DB.prepare(`
    SELECT t.id FROM tasks t
    JOIN boards b ON b.id = t.board_id
    JOIN departments d ON d.id = b.department_id
    WHERE t.id = ? AND d.org_id = ?
  `).bind(id, orgId).first()
  if (!existing) return c.json({ error: 'Task not found' }, 404)

  const body = await c.req.json<Record<string, unknown>>()
  const allowedFields = ['title', 'description', 'column_id', 'assignee_id', 'priority', 'labels', 'due_date', 'order_index']
  const sets: string[] = []
  const params: unknown[] = []

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`)
      params.push(body[field])
    }
  }

  if (sets.length === 0) return c.json({ error: 'No valid fields to update' }, 400)

  sets.push("updated_at = datetime('now')")
  params.push(id)

  await c.env.DB.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()
  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first()
  return c.json({ task })
})

// ──────────────────────────────────────────────────────────────
// Boards (read-only)
// ──────────────────────────────────────────────────────────────
aiRoutes.get('/boards', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'kanban:read')) {
    return c.json({ error: 'Insufficient scope: kanban:read required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const deptId = c.req.query('dept_id')

  let query = `SELECT b.* FROM boards b
    JOIN departments d ON d.id = b.department_id
    WHERE d.org_id = ?`
  const params: unknown[] = [orgId]

  if (deptId) { query += ' AND b.department_id = ?'; params.push(deptId) }

  query += ' ORDER BY b.created_at DESC LIMIT 100'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ boards: results })
})

aiRoutes.get('/boards/:id', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'kanban:read')) {
    return c.json({ error: 'Insufficient scope: kanban:read required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const id = c.req.param('id')

  const board = await c.env.DB.prepare(`
    SELECT b.* FROM boards b
    JOIN departments d ON d.id = b.department_id
    WHERE b.id = ? AND d.org_id = ?
  `).bind(id, orgId).first()
  if (!board) return c.json({ error: 'Board not found' }, 404)

  const { results: columns } = await c.env.DB.prepare(
    'SELECT * FROM board_columns WHERE board_id = ? ORDER BY order_index'
  ).bind(id).all()

  return c.json({ board, columns })
})

// ──────────────────────────────────────────────────────────────
// Documents
// ──────────────────────────────────────────────────────────────
aiRoutes.get('/docs/search', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:read')) {
    return c.json({ error: 'Insufficient scope: docs:read required' }, 403)
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

aiRoutes.get('/docs/:id', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:read')) {
    return c.json({ error: 'Insufficient scope: docs:read required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const id = c.req.param('id')

  const doc = await c.env.DB.prepare(`
    SELECT d.* FROM documents d
    JOIN departments dept ON dept.id = d.department_id
    WHERE d.id = ? AND dept.org_id = ?
  `).bind(id, orgId).first()

  if (!doc) return c.json({ error: 'Document not found' }, 404)
  return c.json({ document: doc })
})

aiRoutes.post('/docs', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:write')) {
    return c.json({ error: 'Insufficient scope: docs:write required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const body = await c.req.json<{
    department_id: string
    title: string
    content?: string
    parent_id?: string
    is_folder?: boolean
  }>()

  if (!body.department_id || !body.title) {
    return c.json({ error: 'department_id and title are required' }, 400)
  }

  // Verify department belongs to org
  const dept = await c.env.DB.prepare('SELECT id FROM departments WHERE id = ? AND org_id = ?')
    .bind(body.department_id, orgId).first()
  if (!dept) return c.json({ error: 'Department not found in organization' }, 404)

  const docCeoUser = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1').bind(orgId).first<{ id: string }>()
  const docApiUserId = docCeoUser?.id || (await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? LIMIT 1').bind(orgId).first<{ id: string }>())?.id || ''

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO documents (id, department_id, parent_id, title, content, is_folder, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id,
    body.department_id,
    body.parent_id || null,
    body.title,
    body.content || '',
    body.is_folder ? 1 : 0,
    docApiUserId,
  ).run()

  const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first()
  return c.json({ document: doc }, 201)
})

aiRoutes.patch('/docs/:id', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:write')) {
    return c.json({ error: 'Insufficient scope: docs:write required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const id = c.req.param('id')

  // Verify document belongs to org
  const existing = await c.env.DB.prepare(`
    SELECT d.id FROM documents d
    JOIN departments dept ON dept.id = d.department_id
    WHERE d.id = ? AND dept.org_id = ?
  `).bind(id, orgId).first()
  if (!existing) return c.json({ error: 'Document not found' }, 404)

  const body = await c.req.json<Record<string, unknown>>()
  const allowedFields = ['title', 'content', 'parent_id', 'order_index']
  const sets: string[] = []
  const params: unknown[] = []

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`)
      params.push(body[field])
    }
  }

  if (sets.length === 0) return c.json({ error: 'No valid fields to update' }, 400)

  sets.push("updated_at = datetime('now')")
  params.push(id)

  await c.env.DB.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()
  const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first()
  return c.json({ document: doc })
})

// ──────────────────────────────────────────────────────────────
// Vault credentials (metadata only - NO passwords)
// ──────────────────────────────────────────────────────────────
aiRoutes.get('/vault/credentials', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'vault:read')) {
    return c.json({ error: 'Insufficient scope: vault:read required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const deptId = c.req.query('dept_id')

  let query = `SELECT c.id, c.department_id, c.service_name, c.url, c.created_by, c.created_at, c.updated_at
    FROM credentials c
    JOIN departments d ON d.id = c.department_id
    WHERE d.org_id = ?`
  const params: unknown[] = [orgId]

  if (deptId) { query += ' AND c.department_id = ?'; params.push(deptId) }

  query += ' ORDER BY c.service_name LIMIT 100'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ credentials: results })
})

// ──────────────────────────────────────────────────────────────
// Members (read-only)
// ──────────────────────────────────────────────────────────────
aiRoutes.get('/members', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'members:read')) {
    return c.json({ error: 'Insufficient scope: members:read required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')

  const { results } = await c.env.DB.prepare(
    'SELECT id, name, email, avatar_url, is_ceo, created_at FROM users WHERE org_id = ? ORDER BY name'
  ).bind(orgId).all()

  return c.json({ members: results })
})

// ──────────────────────────────────────────────────────────────
// Departments (read-only)
// ──────────────────────────────────────────────────────────────
aiRoutes.get('/departments', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'departments:read')) {
    return c.json({ error: 'Insufficient scope: departments:read required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')

  const { results } = await c.env.DB.prepare(
    'SELECT id, name, slug, color, order_index, created_at FROM departments WHERE org_id = ? ORDER BY order_index'
  ).bind(orgId).all()

  return c.json({ departments: results })
})

// ──────────────────────────────────────────────────────────────
// API key management (requires admin scope)
// ──────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────
// Telegram
// ──────────────────────────────────────────────────────────────

// List telegram chats
aiRoutes.get('/telegram/chats', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'telegram:read')) {
    return c.json({ error: 'Insufficient scope: telegram:read required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM telegram_chats WHERE org_id = ? ORDER BY created_at DESC'
  ).bind(orgId).all()

  return c.json({ chats: results })
})

// List telegram user mappings
aiRoutes.get('/telegram/mappings', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'telegram:read')) {
    return c.json({ error: 'Insufficient scope: telegram:read required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM telegram_user_mappings WHERE org_id = ? ORDER BY created_at DESC'
  ).bind(orgId).all()

  return c.json({ mappings: results })
})

// Log a telegram command
aiRoutes.post('/telegram/logs', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'telegram:write')) {
    return c.json({ error: 'Insufficient scope: telegram:write required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const body = await c.req.json<{
    chat_id: string
    telegram_user_id: string
    user_id?: string
    command: string
    args?: string
    response_summary?: string
  }>()

  if (!body.chat_id || !body.telegram_user_id || !body.command) {
    return c.json({ error: 'chat_id, telegram_user_id, and command are required' }, 400)
  }

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO telegram_command_log (id, org_id, chat_id, telegram_user_id, user_id, command, args, response_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    orgId,
    body.chat_id,
    body.telegram_user_id,
    body.user_id || null,
    body.command,
    body.args || '',
    body.response_summary || ''
  ).run()

  const log = await c.env.DB.prepare('SELECT * FROM telegram_command_log WHERE id = ?').bind(id).first()
  return c.json({ log }, 201)
})

// Resolve telegram user to ecode user
aiRoutes.get('/telegram/resolve-user', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'telegram:read')) {
    return c.json({ error: 'Insufficient scope: telegram:read required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const telegramUserId = c.req.query('telegram_user_id')

  if (!telegramUserId) {
    return c.json({ error: 'telegram_user_id query parameter is required' }, 400)
  }

  const mapping = await c.env.DB.prepare(
    'SELECT * FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1'
  ).bind(orgId, telegramUserId).first()

  if (!mapping) {
    return c.json({ mapping: null, user: null })
  }

  let user = null
  if (mapping.user_id) {
    user = await c.env.DB.prepare(
      'SELECT id, name, email, avatar_url, is_ceo, created_at FROM users WHERE id = ? AND org_id = ?'
    ).bind(mapping.user_id, orgId).first()
  }

  return c.json({ mapping, user })
})

// ──────────────────────────────────────────────────────────────
// Attendance (via Telegram / AI)
// ──────────────────────────────────────────────────────────────
aiRoutes.post('/attendance/clock-in', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'attendance:write') && !checkScope(scopes, 'telegram:write')) {
    return c.json({ error: 'Insufficient scope: attendance:write required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const body = await c.req.json<{
    user_id?: string
    telegram_user_id?: string
    source?: string
    note?: string
  }>()

  let userId = body.user_id
  if (!userId && body.telegram_user_id) {
    const mapping = await c.env.DB.prepare(
      'SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1'
    ).bind(orgId, body.telegram_user_id).first<{ user_id: string }>()
    if (!mapping) return c.json({ error: 'Telegram user not mapped' }, 404)
    userId = mapping.user_id
  }

  if (!userId) return c.json({ error: 'user_id or telegram_user_id required' }, 400)

  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()
  const source = body.source || 'telegram'

  const existing = await c.env.DB.prepare(
    'SELECT * FROM attendance_records WHERE org_id = ? AND user_id = ? AND date = ?'
  ).bind(orgId, userId, today).first()

  if (existing && existing.clock_in) {
    return c.json({ error: 'Already clocked in', record: existing }, 409)
  }

  const dept = await c.env.DB.prepare(
    'SELECT department_id FROM user_departments WHERE user_id = ? LIMIT 1'
  ).bind(userId).first<{ department_id: string }>()

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO attendance_records (id, org_id, user_id, department_id, date, clock_in, clock_in_source, status, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'present', ?)
  `).bind(id, orgId, userId, dept?.department_id || null, today, now, source, body.note || '').run()

  const record = await c.env.DB.prepare('SELECT * FROM attendance_records WHERE id = ?').bind(id).first()
  return c.json({ record }, 201)
})

aiRoutes.post('/attendance/clock-out', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'attendance:write') && !checkScope(scopes, 'telegram:write')) {
    return c.json({ error: 'Insufficient scope: attendance:write required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const body = await c.req.json<{
    user_id?: string
    telegram_user_id?: string
    source?: string
    note?: string
  }>()

  let userId = body.user_id
  if (!userId && body.telegram_user_id) {
    const mapping = await c.env.DB.prepare(
      'SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1'
    ).bind(orgId, body.telegram_user_id).first<{ user_id: string }>()
    if (!mapping) return c.json({ error: 'Telegram user not mapped' }, 404)
    userId = mapping.user_id
  }

  if (!userId) return c.json({ error: 'user_id or telegram_user_id required' }, 400)

  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()
  const source = body.source || 'telegram'

  const existing = await c.env.DB.prepare(
    'SELECT * FROM attendance_records WHERE org_id = ? AND user_id = ? AND date = ?'
  ).bind(orgId, userId, today).first()

  if (!existing) return c.json({ error: 'No clock-in record for today' }, 404)
  if (existing.clock_out) return c.json({ error: 'Already clocked out', record: existing }, 409)

  await c.env.DB.prepare(
    `UPDATE attendance_records SET clock_out = ?, clock_out_source = ?, note = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(now, source, body.note || (existing.note as string) || '', existing.id).run()

  const record = await c.env.DB.prepare('SELECT * FROM attendance_records WHERE id = ?').bind(existing.id).first()
  return c.json({ record })
})

aiRoutes.get('/attendance/team', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'attendance:read') && !checkScope(scopes, 'telegram:read')) {
    return c.json({ error: 'Insufficient scope: attendance:read required' }, 403)
  }

  const orgId = c.get('apiKeyOrgId')
  const deptId = c.req.query('dept_id')
  const date = c.req.query('date') || new Date().toISOString().slice(0, 10)

  let query = `
    SELECT ar.*, u.name as user_name, u.email as user_email
    FROM attendance_records ar
    JOIN users u ON u.id = ar.user_id
    WHERE ar.org_id = ? AND ar.date = ?`
  const params: unknown[] = [orgId, date]

  if (deptId) {
    query += ' AND ar.department_id = ?'
    params.push(deptId)
  }

  query += ' ORDER BY u.name LIMIT 200'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ records: results })
})

// ──────────────────────────────────────────────────────────────
// API key management (requires admin scope)
// ──────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────
// GET-based action endpoints for bots that can only do GET (e.g. OpenClaw web_fetch)
// All params via query string, key via ?key=ek_XXX
// URL format: /api/v1/action/{tool}?key=ek_XXX&param1=val1&param2=val2
// ──────────────────────────────────────────────────────────────

aiRoutes.get('/action/map-telegram-user', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'telegram:write')) return c.json({ error: 'Insufficient scope' }, 403)

  const orgId = c.get('apiKeyOrgId')
  const tgUserId = c.req.query('telegram_user_id')
  const tgUsername = c.req.query('telegram_username') || ''
  const tgDisplayName = c.req.query('telegram_display_name') || ''
  const email = c.req.query('email')
  const userId = c.req.query('user_id')

  if (!tgUserId) return c.json({ error: 'telegram_user_id required' }, 400)

  // Resolve ecode user
  let ecodeUserId: string | null = null
  if (email) {
    const user = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND email = ?').bind(orgId, email).first<{ id: string }>()
    if (!user) return c.json({ error: `이코드 사용자를 찾을 수 없습니다: ${email}` }, 404)
    ecodeUserId = user.id
  } else if (userId) {
    ecodeUserId = userId
  }

  // Upsert
  const existing = await c.env.DB.prepare('SELECT id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ?').bind(orgId, tgUserId).first<{ id: string }>()
  if (existing) {
    const sets: string[] = ['is_active = 1']
    const vals: unknown[] = []
    if (ecodeUserId) { sets.push('user_id = ?'); vals.push(ecodeUserId) }
    if (tgUsername) { sets.push('telegram_username = ?'); vals.push(tgUsername) }
    if (tgDisplayName) { sets.push('telegram_display_name = ?'); vals.push(tgDisplayName) }
    vals.push(existing.id)
    await c.env.DB.prepare(`UPDATE telegram_user_mappings SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
  } else {
    await c.env.DB.prepare(
      'INSERT INTO telegram_user_mappings (id, org_id, telegram_user_id, telegram_username, telegram_display_name, user_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(generateId(), orgId, tgUserId, tgUsername, tgDisplayName, ecodeUserId).run()
  }

  const result = await c.env.DB.prepare(
    'SELECT m.*, u.name as user_name, u.email as user_email FROM telegram_user_mappings m LEFT JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.telegram_user_id = ?'
  ).bind(orgId, tgUserId).first()

  return c.json({ success: true, mapping: result })
})

aiRoutes.get('/action/unmap-telegram-user', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'telegram:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const tgUserId = c.req.query('telegram_user_id')
  if (!tgUserId) return c.json({ error: 'telegram_user_id required' }, 400)

  await c.env.DB.prepare('UPDATE telegram_user_mappings SET user_id = NULL WHERE org_id = ? AND telegram_user_id = ?').bind(orgId, tgUserId).run()
  return c.json({ success: true })
})

aiRoutes.get('/action/resolve-telegram-user', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'telegram:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const tgUserId = c.req.query('telegram_user_id')
  const tgUsername = c.req.query('telegram_username')

  let mapping: Record<string, unknown> | null = null
  if (tgUserId) {
    mapping = await c.env.DB.prepare('SELECT * FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1').bind(orgId, tgUserId).first()
  } else if (tgUsername) {
    mapping = await c.env.DB.prepare('SELECT * FROM telegram_user_mappings WHERE org_id = ? AND telegram_username = ? AND is_active = 1').bind(orgId, tgUsername).first()
  } else {
    return c.json({ error: 'telegram_user_id or telegram_username required' }, 400)
  }

  if (!mapping) return c.json({ mapping: null, user: null })

  let user = null
  if (mapping.user_id) {
    user = await c.env.DB.prepare('SELECT id, name, email, is_ceo FROM users WHERE id = ? AND org_id = ?').bind(mapping.user_id, orgId).first()
  }
  return c.json({ mapping, user })
})

aiRoutes.get('/action/list-telegram-mappings', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'telegram:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const { results } = await c.env.DB.prepare(
    'SELECT m.*, u.name as user_name, u.email as user_email FROM telegram_user_mappings m LEFT JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.is_active = 1 ORDER BY m.created_at'
  ).bind(orgId).all()
  return c.json({ mappings: results })
})

// clock-in: ?time=10:00 으로 시간 지정 가능, ?date=2026-03-16 으로 날짜 지정 가능
aiRoutes.get('/action/clock-in', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'telegram:write') && !checkScope(scopes, 'attendance:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const tgUserId = c.req.query('telegram_user_id')
  const directUserId = c.req.query('user_id')
  const note = c.req.query('note') || ''
  const customTime = c.req.query('time')   // e.g. "10:00"
  const customDate = c.req.query('date')   // e.g. "2026-03-16"

  let userId = directUserId
  if (!userId && tgUserId) {
    const mapping = await c.env.DB.prepare('SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1').bind(orgId, tgUserId).first<{ user_id: string }>()
    if (!mapping?.user_id) return c.json({ error: '매핑된 이코드 사용자를 찾을 수 없습니다' }, 404)
    userId = mapping.user_id
  }
  if (!userId) return c.json({ error: 'user_id or telegram_user_id required' }, 400)

  const date = customDate || todayKST()
  const clockIn = customTime ? `${date}T${customTime}:00+09:00` : nowKSTString()

  const dept = await c.env.DB.prepare('SELECT department_id FROM user_departments WHERE user_id = ? LIMIT 1').bind(userId).first<{ department_id: string }>()

  const existing = await c.env.DB.prepare('SELECT id FROM attendance_records WHERE org_id = ? AND user_id = ? AND date = ?').bind(orgId, userId, date).first()
  if (existing) return c.json({ error: '이미 출근 기록이 있습니다', record: existing })

  const id = generateId()
  await c.env.DB.prepare(
    'INSERT INTO attendance_records (id, org_id, user_id, department_id, date, clock_in, clock_in_source, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, orgId, userId, dept?.department_id || null, date, clockIn, 'telegram', note).run()

  const record = await c.env.DB.prepare('SELECT * FROM attendance_records WHERE id = ?').bind(id).first()
  return c.json({ success: true, record })
})

// clock-out: ?time=19:00 으로 시간 지정 가능
aiRoutes.get('/action/clock-out', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'telegram:write') && !checkScope(scopes, 'attendance:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const tgUserId = c.req.query('telegram_user_id')
  const directUserId = c.req.query('user_id')
  const note = c.req.query('note') || ''
  const customTime = c.req.query('time')
  const customDate = c.req.query('date')

  let userId = directUserId
  if (!userId && tgUserId) {
    const mapping = await c.env.DB.prepare('SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1').bind(orgId, tgUserId).first<{ user_id: string }>()
    if (!mapping?.user_id) return c.json({ error: '매핑된 이코드 사용자를 찾을 수 없습니다' }, 404)
    userId = mapping.user_id
  }
  if (!userId) return c.json({ error: 'user_id or telegram_user_id required' }, 400)

  const date = customDate || todayKST()
  const clockOut = customTime ? `${date}T${customTime}:00+09:00` : nowKSTString()

  const record = await c.env.DB.prepare('SELECT id, clock_out FROM attendance_records WHERE org_id = ? AND user_id = ? AND date = ?').bind(orgId, userId, date).first<{ id: string; clock_out: string | null }>()
  if (!record) return c.json({ error: '해당 날짜 출근 기록이 없습니다' }, 404)
  if (record.clock_out) return c.json({ error: '이미 퇴근 기록이 있습니다' })

  await c.env.DB.prepare("UPDATE attendance_records SET clock_out = ?, clock_out_source = 'telegram', note = CASE WHEN note = '' THEN ? ELSE note || ' | ' || ? END, updated_at = datetime('now') WHERE id = ?").bind(clockOut, note, note, record.id).run()

  const updated = await c.env.DB.prepare('SELECT * FROM attendance_records WHERE id = ?').bind(record.id).first()
  return c.json({ success: true, record: updated })
})

// 근태 시간 수정: 이미 등록된 출퇴근 시간 변경
aiRoutes.get('/action/update-attendance', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'telegram:write') && !checkScope(scopes, 'attendance:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const tgUserId = c.req.query('telegram_user_id')
  const directUserId = c.req.query('user_id')
  const date = c.req.query('date') || todayKST()
  const clockInTime = c.req.query('clock_in')      // "10:00"
  const clockOutTime = c.req.query('clock_out')     // "19:00"
  const status = c.req.query('status')              // present, late, remote, vacation, etc.
  const note = c.req.query('note')

  let userId = directUserId
  if (!userId && tgUserId) {
    const mapping = await c.env.DB.prepare('SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1').bind(orgId, tgUserId).first<{ user_id: string }>()
    if (!mapping?.user_id) return c.json({ error: '매핑된 이코드 사용자를 찾을 수 없습니다' }, 404)
    userId = mapping.user_id
  }
  if (!userId) return c.json({ error: 'user_id or telegram_user_id required' }, 400)

  const record = await c.env.DB.prepare('SELECT id FROM attendance_records WHERE org_id = ? AND user_id = ? AND date = ?').bind(orgId, userId, date).first<{ id: string }>()
  if (!record) return c.json({ error: '해당 날짜 근태 기록이 없습니다' }, 404)

  const updates: string[] = []
  const values: unknown[] = []

  if (clockInTime) { updates.push('clock_in = ?'); values.push(`${date}T${clockInTime}:00+09:00`) }
  if (clockOutTime) { updates.push('clock_out = ?'); values.push(`${date}T${clockOutTime}:00+09:00`) }
  if (status) { updates.push('status = ?'); values.push(status) }
  if (note !== undefined && note !== null) { updates.push('note = ?'); values.push(note) }

  if (updates.length === 0) return c.json({ error: 'clock_in, clock_out, status, or note required' }, 400)

  updates.push("updated_at = datetime('now')")
  values.push(record.id)

  await c.env.DB.prepare(`UPDATE attendance_records SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()

  const updated = await c.env.DB.prepare('SELECT * FROM attendance_records WHERE id = ?').bind(record.id).first()
  return c.json({ success: true, record: updated })
})

aiRoutes.get('/action/create-event', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'calendar:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const deptId = c.req.query('department_id') || ''
  const title = c.req.query('title')
  const startAt = c.req.query('start_at')
  const endAt = c.req.query('end_at')
  const allDay = c.req.query('all_day') === 'true'
  const color = c.req.query('color') || '#3B82F6'
  const visibility = c.req.query('visibility') || 'personal'
  const importance = c.req.query('importance') || 'normal'
  // user_id: resolve from telegram_user_id or direct user_id
  const tgUserId = c.req.query('telegram_user_id')
  const directUserId = c.req.query('user_id')

  if (!title || !startAt || !endAt) return c.json({ error: 'title, start_at, end_at required' }, 400)

  // Resolve user (must be a real user for FK constraint)
  let userId = directUserId || null
  if (tgUserId) {
    const mapping = await c.env.DB.prepare('SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1').bind(orgId, tgUserId).first<{ user_id: string }>()
    if (mapping?.user_id) userId = mapping.user_id
  }
  // Fallback: use org's first user (CEO)
  if (!userId) {
    const firstUser = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1').bind(orgId).first<{ id: string }>()
    if (!firstUser) {
      const anyUser = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? LIMIT 1').bind(orgId).first<{ id: string }>()
      userId = anyUser?.id || null
    } else {
      userId = firstUser.id
    }
  }
  if (!userId) return c.json({ error: 'No user found in organization' }, 400)

  // If no dept_id, find user's first department
  let effectiveDeptId = deptId
  if (!effectiveDeptId) {
    const dept = await c.env.DB.prepare('SELECT department_id FROM user_departments WHERE user_id = ? LIMIT 1').bind(userId).first<{ department_id: string }>()
    effectiveDeptId = dept?.department_id || ''
  }

  // Recurrence: freq, interval, byDay (comma-separated), until
  const freq = c.req.query('freq')       // daily, weekly, monthly, yearly
  const interval = c.req.query('interval') || '1'
  const byDay = c.req.query('byDay')     // e.g. "MO,TU,FR"
  const until = c.req.query('until')     // e.g. "2026-08-31"
  let recurrenceRule: string | null = null
  if (freq) {
    const rule: Record<string, unknown> = { freq, interval: parseInt(interval) }
    if (byDay) rule.byDay = byDay.split(',')
    if (until) rule.until = until
    recurrenceRule = JSON.stringify(rule)
  }

  const id = generateId()
  await c.env.DB.prepare(
    "INSERT INTO events (id, department_id, user_id, title, start_at, end_at, all_day, color, visibility, importance, recurrence_rule, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
  ).bind(id, effectiveDeptId, userId, title, startAt, endAt, allDay ? 1 : 0, color, visibility, importance, recurrenceRule).run()

  const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first()
  return c.json({ success: true, event })
})

aiRoutes.get('/action/create-task', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'kanban:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const boardId = c.req.query('board_id')
  const columnId = c.req.query('column_id')
  const title = c.req.query('title')
  const description = c.req.query('description') || ''
  const priority = c.req.query('priority') || 'medium'
  const dueDate = c.req.query('due_date') || null

  if (!boardId || !columnId || !title) return c.json({ error: 'board_id, column_id, title required' }, 400)

  const board = await c.env.DB.prepare('SELECT b.id FROM boards b JOIN departments d ON d.id = b.department_id WHERE b.id = ? AND d.org_id = ?').bind(boardId, orgId).first()
  if (!board) return c.json({ error: 'Board not found' }, 404)

  const id = generateId()
  await c.env.DB.prepare(
    "INSERT INTO tasks (id, board_id, column_id, title, description, priority, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
  ).bind(id, boardId, columnId, title, description, priority, dueDate).run()

  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first()
  return c.json({ success: true, task })
})

// 태스크 수정
aiRoutes.get('/action/update-task', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'kanban:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const taskId = c.req.query('id')
  if (!taskId) return c.json({ error: 'id required' }, 400)

  const existing = await c.env.DB.prepare(`
    SELECT t.id FROM tasks t JOIN boards b ON b.id = t.board_id JOIN departments d ON d.id = b.department_id WHERE t.id = ? AND d.org_id = ?
  `).bind(taskId, orgId).first()
  if (!existing) return c.json({ error: 'Task not found' }, 404)

  const updates: string[] = []
  const values: unknown[] = []
  const title = c.req.query('title')
  const description = c.req.query('description')
  const columnId = c.req.query('column_id')
  const priority = c.req.query('priority')
  const assigneeId = c.req.query('assignee_id')
  const dueDate = c.req.query('due_date')

  if (title) { updates.push('title = ?'); values.push(title) }
  if (description !== undefined && description !== null) { updates.push('description = ?'); values.push(description) }
  if (columnId) { updates.push('column_id = ?'); values.push(columnId) }
  if (priority) { updates.push('priority = ?'); values.push(priority) }
  if (assigneeId) { updates.push('assignee_id = ?'); values.push(assigneeId) }
  if (dueDate) { updates.push('due_date = ?'); values.push(dueDate) }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400)
  updates.push("updated_at = datetime('now')")
  values.push(taskId)

  await c.env.DB.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first()
  return c.json({ success: true, task })
})

// 보드 목록
aiRoutes.get('/action/list-boards', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'kanban:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const deptId = c.req.query('dept_id')

  let query = 'SELECT b.* FROM boards b JOIN departments d ON d.id = b.department_id WHERE d.org_id = ?'
  const params: unknown[] = [orgId]
  if (deptId) { query += ' AND b.department_id = ?'; params.push(deptId) }
  query += ' ORDER BY b.created_at DESC LIMIT 50'

  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ boards: results })
})

// 보드 상세 (컬럼+태스크 포함)
aiRoutes.get('/action/get-board', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'kanban:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const boardId = c.req.query('id')
  if (!boardId) return c.json({ error: 'id required' }, 400)

  const board = await c.env.DB.prepare('SELECT b.* FROM boards b JOIN departments d ON d.id = b.department_id WHERE b.id = ? AND d.org_id = ?').bind(boardId, orgId).first()
  if (!board) return c.json({ error: 'Board not found' }, 404)

  const { results: columns } = await c.env.DB.prepare('SELECT * FROM board_columns WHERE board_id = ? ORDER BY order_index').bind(boardId).all()
  const { results: tasks } = await c.env.DB.prepare('SELECT t.*, u.name as assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.board_id = ? ORDER BY t.order_index').bind(boardId).all()

  return c.json({ board, columns, tasks })
})

// 태스크 목록
aiRoutes.get('/action/list-tasks', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'kanban:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const boardId = c.req.query('board_id')
  const assigneeId = c.req.query('assignee_id')

  let query = 'SELECT t.*, u.name as assignee_name FROM tasks t JOIN boards b ON b.id = t.board_id JOIN departments d ON d.id = b.department_id LEFT JOIN users u ON u.id = t.assignee_id WHERE d.org_id = ?'
  const params: unknown[] = [orgId]
  if (boardId) { query += ' AND t.board_id = ?'; params.push(boardId) }
  if (assigneeId) { query += ' AND t.assignee_id = ?'; params.push(assigneeId) }
  query += ' ORDER BY t.updated_at DESC LIMIT 100'

  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ tasks: results })
})

// 보드 이름 변경
aiRoutes.get('/action/update-board', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'kanban:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const boardId = c.req.query('id')
  const name = c.req.query('name')
  if (!boardId || !name) return c.json({ error: 'id and name required' }, 400)

  const board = await c.env.DB.prepare('SELECT b.id FROM boards b JOIN departments d ON d.id = b.department_id WHERE b.id = ? AND d.org_id = ?').bind(boardId, orgId).first()
  if (!board) return c.json({ error: 'Board not found' }, 404)

  await c.env.DB.prepare('UPDATE boards SET name = ? WHERE id = ?').bind(name, boardId).run()
  const updated = await c.env.DB.prepare('SELECT * FROM boards WHERE id = ?').bind(boardId).first()
  return c.json({ success: true, board: updated })
})

// 컬럼 이름 변경
aiRoutes.get('/action/update-column', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'kanban:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const colId = c.req.query('id')
  const name = c.req.query('name')
  const color = c.req.query('color')
  if (!colId) return c.json({ error: 'id required' }, 400)

  // Verify ownership
  const col = await c.env.DB.prepare(`
    SELECT bc.id FROM board_columns bc JOIN boards b ON b.id = bc.board_id JOIN departments d ON d.id = b.department_id WHERE bc.id = ? AND d.org_id = ?
  `).bind(colId, orgId).first()
  if (!col) return c.json({ error: 'Column not found' }, 404)

  const updates: string[] = []
  const values: unknown[] = []
  if (name) { updates.push('name = ?'); values.push(name) }
  if (color) { updates.push('color = ?'); values.push(color) }
  if (updates.length === 0) return c.json({ error: 'name or color required' }, 400)
  values.push(colId)

  await c.env.DB.prepare(`UPDATE board_columns SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  const updated = await c.env.DB.prepare('SELECT * FROM board_columns WHERE id = ?').bind(colId).first()
  return c.json({ success: true, column: updated })
})

// 보드 생성
aiRoutes.get('/action/create-board', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'kanban:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const deptId = c.req.query('department_id')
  const name = c.req.query('name')
  if (!name) return c.json({ error: 'name required' }, 400)

  let effectiveDeptId = deptId
  if (!effectiveDeptId) {
    const dept = await c.env.DB.prepare('SELECT id FROM departments WHERE org_id = ? ORDER BY order_index LIMIT 1').bind(orgId).first<{ id: string }>()
    effectiveDeptId = dept?.id || ''
  }
  if (!effectiveDeptId) return c.json({ error: 'No department found' }, 400)

  const boardId = generateId()
  const cols = [
    { name: 'To Do', color: '#6B7280', order: 0 },
    { name: 'In Progress', color: '#3B82F6', order: 1 },
    { name: 'Done', color: '#10B981', order: 2 },
  ]

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO boards (id, department_id, name) VALUES (?, ?, ?)').bind(boardId, effectiveDeptId, name),
    ...cols.map(col => c.env.DB.prepare('INSERT INTO board_columns (id, board_id, name, color, order_index) VALUES (?, ?, ?, ?, ?)').bind(generateId(), boardId, col.name, col.color, col.order)),
  ])

  const board = await c.env.DB.prepare('SELECT * FROM boards WHERE id = ?').bind(boardId).first()
  return c.json({ success: true, board })
})

// ── Document actions (GET-based) ──────────────────────────────

// 문서 검색
aiRoutes.get('/action/search-docs', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const q = c.req.query('q')
  if (!q) return c.json({ documents: [] })

  const { results } = await c.env.DB.prepare(`
    SELECT d.id, d.title, d.department_id, d.content, d.visibility, d.shared, d.is_folder, d.created_at, d.updated_at,
           snippet(documents_fts, 1, '<mark>', '</mark>', '...', 64) as snippet
    FROM documents_fts fts
    JOIN documents d ON d.rowid = fts.rowid
    JOIN departments dept ON dept.id = d.department_id
    WHERE documents_fts MATCH ? AND dept.org_id = ?
    ORDER BY rank LIMIT 20
  `).bind(q, orgId).all()

  return c.json({ documents: results })
})

// 문서 목록 (폴더 탐색)
aiRoutes.get('/action/list-docs', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const parentId = c.req.query('parent_id')
  const deptId = c.req.query('dept_id')

  let query = `SELECT d.id, d.title, d.department_id, d.parent_id, d.is_folder, d.visibility, d.shared, d.order_index, d.created_at, d.updated_at
    FROM documents d
    JOIN departments dept ON dept.id = d.department_id
    WHERE dept.org_id = ?`
  const params: unknown[] = [orgId]

  if (deptId) { query += ' AND d.department_id = ?'; params.push(deptId) }
  if (parentId) { query += ' AND d.parent_id = ?'; params.push(parentId) }
  else if (deptId) { query += ' AND d.parent_id IS NULL' }

  query += ' ORDER BY d.is_folder DESC, d.order_index ASC LIMIT 100'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()

  // Auto-include folder AI guide if browsing a specific folder
  if (parentId) {
    const guide = await c.env.DB.prepare(
      "SELECT content FROM documents d JOIN departments dept ON dept.id = d.department_id WHERE d.parent_id = ? AND d.title = 'AI' AND dept.org_id = ?"
    ).bind(parentId, orgId).first<{ content: string }>()
    return c.json({ documents: results, folder_guide: guide?.content || null })
  } else {
    return c.json({ documents: results, folder_guide: null })
  }
})

// 문서 상세 (내용 포함)
aiRoutes.get('/action/get-doc', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const docId = c.req.query('id')
  if (!docId) return c.json({ error: 'id required' }, 400)

  const doc = await c.env.DB.prepare(`
    SELECT d.* FROM documents d
    JOIN departments dept ON dept.id = d.department_id
    WHERE d.id = ? AND dept.org_id = ?
  `).bind(docId, orgId).first()

  if (!doc) return c.json({ error: 'Document not found' }, 404)
  return c.json({ document: doc })
})

// 문서 생성
aiRoutes.get('/action/create-doc', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const deptId = c.req.query('department_id')
  const title = c.req.query('title')
  const content = c.req.query('content') || ''
  const parentId = c.req.query('parent_id')
  const isFolder = c.req.query('is_folder') === 'true'
  const visibility = c.req.query('visibility') || 'department'

  if (!title) return c.json({ error: 'title required' }, 400)

  // Find dept
  let effectiveDeptId = deptId
  if (!effectiveDeptId) {
    const dept = await c.env.DB.prepare('SELECT id FROM departments WHERE org_id = ? LIMIT 1').bind(orgId).first<{ id: string }>()
    effectiveDeptId = dept?.id || ''
  }

  // Get real user for FK
  const docCeo = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1').bind(orgId).first<{ id: string }>()
  const creatorId = docCeo?.id || (await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? LIMIT 1').bind(orgId).first<{ id: string }>())?.id || ''

  const id = generateId()
  await c.env.DB.prepare(
    "INSERT INTO documents (id, department_id, parent_id, title, content, is_folder, created_by, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
  ).bind(id, effectiveDeptId, parentId || null, title, content, isFolder ? 1 : 0, creatorId, visibility).run()

  const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first()
  return c.json({ success: true, document: doc })
})

// 문서 수정
aiRoutes.get('/action/update-doc', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const docId = c.req.query('id')
  const title = c.req.query('title')
  const content = c.req.query('content')
  const appendContent = c.req.query('append')  // append mode: add to existing content

  if (!docId) return c.json({ error: 'id required' }, 400)

  // Always read current document first
  const existing = await c.env.DB.prepare(`
    SELECT d.* FROM documents d
    JOIN departments dept ON dept.id = d.department_id
    WHERE d.id = ? AND dept.org_id = ?
  `).bind(docId, orgId).first<any>()
  if (!existing) return c.json({ error: 'Document not found' }, 404)

  const updates: string[] = []
  const values: unknown[] = []
  if (title) { updates.push('title = ?'); values.push(title) }
  if (appendContent) {
    // Append: add new content to existing (preserves existing data)
    const newContent = existing.content ? `${existing.content}\n${appendContent}` : appendContent
    updates.push('content = ?'); values.push(newContent)
  } else if (content !== undefined && content !== null) {
    updates.push('content = ?'); values.push(content)
  }

  if (updates.length === 0) return c.json({ error: 'title or content required' }, 400)

  updates.push("updated_at = datetime('now')")
  values.push(docId)

  await c.env.DB.prepare(`UPDATE documents SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()

  const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(docId).first()
  return c.json({ success: true, document: doc })
})

// 폴더 AI 가이드 조회
aiRoutes.get('/action/get-folder-guide', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const parentId = c.req.query('parent_id')
  if (!parentId) return c.json({ error: 'parent_id required' }, 400)

  const guide = await c.env.DB.prepare(
    "SELECT d.* FROM documents d JOIN departments dept ON dept.id = d.department_id WHERE d.parent_id = ? AND d.title = 'AI' AND dept.org_id = ?"
  ).bind(parentId, orgId).first()

  return c.json({ document: guide || null })
})

// 폴더 AI 가이드 생성/갱신
aiRoutes.get('/action/update-folder-guide', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const parentId = c.req.query('parent_id')
  const content = c.req.query('content') || ''
  if (!parentId) return c.json({ error: 'parent_id required' }, 400)

  // Check folder exists and belongs to org
  const folder = await c.env.DB.prepare(
    "SELECT d.id, d.department_id FROM documents d JOIN departments dept ON dept.id = d.department_id WHERE d.id = ? AND d.is_folder = 1 AND dept.org_id = ?"
  ).bind(parentId, orgId).first<{ id: string; department_id: string }>()
  if (!folder) return c.json({ error: 'Folder not found' }, 404)

  // Check if AI guide already exists
  const existing = await c.env.DB.prepare(
    "SELECT d.id FROM documents d JOIN departments dept ON dept.id = d.department_id WHERE d.parent_id = ? AND d.title = 'AI' AND dept.org_id = ?"
  ).bind(parentId, orgId).first<{ id: string }>()

  if (existing) {
    // Update existing guide
    await c.env.DB.prepare(
      "UPDATE documents SET content = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(content, existing.id).run()
    const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(existing.id).first()
    return c.json({ success: true, document: doc })
  } else {
    // Create new AI guide doc
    const docCeo = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1').bind(orgId).first<{ id: string }>()
    const creatorId = docCeo?.id || (await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? LIMIT 1').bind(orgId).first<{ id: string }>())?.id || ''

    const id = generateId()
    await c.env.DB.prepare(
      "INSERT INTO documents (id, department_id, parent_id, title, content, is_folder, created_by, visibility, created_at, updated_at) VALUES (?, ?, ?, 'AI', ?, 0, ?, 'department', datetime('now'), datetime('now'))"
    ).bind(id, folder.department_id, parentId, content, creatorId).run()

    const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first()
    return c.json({ success: true, document: doc })
  }
})
