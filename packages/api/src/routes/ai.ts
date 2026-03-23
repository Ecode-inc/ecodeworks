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
import { encrypt, decrypt } from '../lib/crypto'

type Variables = { apiKeyOrgId: string; apiKeyScopes: string[] }

export const aiRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

// GET action guide - JSON format for AI bots (no auth required)
aiRoutes.get('/actions', (c) => {
  return c.json({
    guide: 'All actions use GET with ?key=API_KEY. Parameters via query string.',
    base_url: 'https://ecode-internal-api.justin21lee.workers.dev/api/v1',
    actions: {
      telegram_mapping: {
        'map-telegram-user': 'telegram_user_id, telegram_username, email',
        'unmap-telegram-user': 'telegram_user_id',
        'resolve-telegram-user': 'telegram_user_id or telegram_username',
        'list-telegram-mappings': '',
      },
      user: {
        'update-user-name': 'telegram_user_id or email or user_id, name',
      },
      attendance: {
        'clock-in': 'telegram_user_id or user_id, time (HH:MM), date (YYYY-MM-DD)',
        'clock-out': 'telegram_user_id or user_id, time, date',
        'update-attendance': 'telegram_user_id or user_id, date, clock_in (HH:MM), clock_out (HH:MM), status, note',
        'list-attendance': 'date (YYYY-MM-DD, default today) - 해당일 전체 근태현황',
      },
      calendar: {
        'list-events': 'start (ISO), end (ISO), context (group=공유일정만/private=개인포함), user_id (private시) - 일정 조회',
        'create-event': 'title, start_at (+09:00), end_at, visibility (personal/department/company), importance, freq, byDay, until',
        'update-event': 'id (필수), title, description, start_at, end_at, color, visibility, importance - 전달된 필드만 수정',
      },
      kanban: {
        'list-boards': 'dept_id',
        'get-board': 'id',
        'create-board': 'name, department_id',
        'update-board': 'id, name',
        'list-tasks': 'board_id, assignee_id, done_days (완료태스크 N일이내만, default 전체)',
        'create-task': 'board_id, column_id, title, description, priority, due_date, assignee_ids (comma-separated)',
        'update-task': 'id, title, description, column_id, priority, assignee_id, due_date',
        'update-column': 'id, name, color',
      },
      documents: {
        'search-docs': 'q (search term) - returns folder_path',
        'list-docs': 'dept_id, parent_id, flat=true',
        'get-doc': 'id',
        'create-doc': 'title, content, department_id, parent_id OR parent_name (폴더이름으로 검색), is_folder, visibility',
        'update-doc': 'id, title, content, append (텍스트를 기존에 추가, 또는 append=true&content=텍스트)',
        'doc-history': 'id (문서ID) - 변경 이력 조회',
        'get-doc-share-link': 'q (title search) or id, expiry (1d/7d/30d/none)',
        'get-folder-guide': 'parent_id',
        'update-folder-guide': 'parent_id, content',
        'attach-file-url': 'document_id, url (file URL to download and attach), name (optional filename)',
        'attach-file': 'POST multipart: curl -F "file=@/path/to/file" -F "document_id=ID" URL?key=KEY',
        'list-doc-files': 'document_id',
        'rename-doc-file': 'id (file id), name (new filename)',
      },
      leave: {
        'create-leave': 'telegram_user_id or email or user_id, type (vacation/half_day_am/half_day_pm/sick/special/remote), start_date (YYYY-MM-DD), end_date (YYYY-MM-DD, default=start), reason',
        'list-leaves': 'telegram_user_id (선택), month (YYYY-MM), status (pending/approved/rejected)',
        'approve-leave': 'id (leave request ID)',
      },
      purchases: {
        'create-purchase': 'item_name, unit_price, quantity, item_url, requester_name or requester_email, category, note, date (YYYY-MM-DD), status (requested/ordered/delivered)',
        'create-purchases': 'items (JSON array), requester_name, date, status, note',
        'list-purchases': 'month (YYYY-MM), status, requester_id',
        'purchase-stats': 'month (YYYY-MM), dept_id',
        'update-purchase-status': 'id, status',
        'approve-all-purchases': 'from_status (default:requested), to_status (default:approved), month',
      },
      doc_images: {
        'list-doc-images': 'document_id, tag, person',
        'tag-doc-image': 'id (image ID), tags (comma-separated)',
        'tag-person-in-image': 'id (image ID), name',
        'search-images': 'tag, person, document_id',
        'find-doc-images': 'q (문서 제목 검색, 예: 워크샵), person (인물 필터), tag (태그 필터) - 문서 제목으로 이미지를 한번에 검색',
        'bulk-tag-person': 'image_ids (comma-separated), name',
      },
      doc_files: {
        'list-doc-files': 'document_id',
        'create-weekly-meeting-doc': 'week_date (YYYY-MM-DD, default today), folder_name (default 주간회의)',
      },
      vault: {
        'set-vault-pin': 'pin (4-8자리 숫자), telegram_user_id or user_id or email',
        'create-credential': 'service_name, username, password, url (선택), telegram_user_id or user_id or email',
        'view-credential': 'service_name, pin (4-8자리), telegram_user_id or user_id or email',
      },
    },
    privacy: {
      calendar_context: 'context=group hides personal events, context=private&user_id=X shows personal',
    },
    safety: {
      blocked: ['DELETE operations', 'user/org structure modification'],
      vault_pin: 'credential view requires PIN verification',
    },
  })
})

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

// 근태 현황 조회 (일별)
aiRoutes.get('/action/list-attendance', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'telegram:read') && !checkScope(scopes, 'attendance:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const date = c.req.query('date') || todayKST()

  const { results } = await c.env.DB.prepare(`
    SELECT ar.*, u.name as user_name, u.email as user_email
    FROM attendance_records ar
    JOIN users u ON u.id = ar.user_id
    WHERE ar.org_id = ? AND ar.date = ?
    ORDER BY ar.clock_in
  `).bind(orgId, date).all()

  // Also get all members to show who hasn't clocked in
  const { results: allMembers } = await c.env.DB.prepare(
    'SELECT id, name, email FROM users WHERE org_id = ?'
  ).bind(orgId).all()

  const clockedIds = new Set((results || []).map((r: any) => r.user_id))
  const notClockedIn = (allMembers || []).filter((m: any) => !clockedIds.has(m.id))

  return c.json({
    date,
    records: results || [],
    not_clocked_in: notClockedIn,
    summary: {
      total_members: (allMembers || []).length,
      clocked_in: (results || []).length,
      not_clocked: notClockedIn.length,
    }
  })
})

// 일정 조회 (GET action)
aiRoutes.get('/action/list-events', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'calendar:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const start = c.req.query('start')
  const end = c.req.query('end')
  const context = c.req.query('context') || 'group'  // default: group (hide personal)
  const userId = c.req.query('user_id')

  let query = `SELECT e.*, u.name as user_name FROM events e
    JOIN departments d ON d.id = e.department_id
    LEFT JOIN users u ON u.id = e.user_id
    WHERE d.org_id = ?`
  const params: unknown[] = [orgId]

  if (context === 'group') {
    query += " AND e.visibility != 'personal'"
  } else if (context === 'private' && userId) {
    query += " AND (e.visibility != 'personal' OR e.user_id = ?)"
    params.push(userId)
  }

  if (start) { query += ' AND e.end_at >= ?'; params.push(start) }
  if (end) { query += ' AND e.start_at <= ?'; params.push(end) }

  // Include recurring events
  if (start && end) {
    query = query.replace(
      "AND e.end_at >= ? AND e.start_at <= ?",
      "AND ((e.end_at >= ? AND e.start_at <= ?) OR e.recurrence_rule IS NOT NULL)"
    )
  }

  query += ' ORDER BY e.start_at LIMIT 50'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()

  return c.json({ events: results || [] })
})

// 일정 수정
aiRoutes.get('/action/update-event', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'calendar:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const eventId = c.req.query('id')
  if (!eventId) return c.json({ error: 'id required' }, 400)

  // Verify event belongs to org
  const existing = await c.env.DB.prepare(`
    SELECT e.* FROM events e JOIN departments d ON d.id = e.department_id WHERE e.id = ? AND d.org_id = ?
  `).bind(eventId, orgId).first<any>()
  if (!existing) return c.json({ error: 'Event not found' }, 404)

  const updates: string[] = []
  const values: unknown[] = []

  const title = c.req.query('title')
  const description = c.req.query('description')
  const startAt = c.req.query('start_at')
  const endAt = c.req.query('end_at')
  const color = c.req.query('color')
  const visibility = c.req.query('visibility')
  const importance = c.req.query('importance')
  const allDay = c.req.query('all_day')

  if (title) { updates.push('title = ?'); values.push(title) }
  if (description !== undefined && description !== null) { updates.push('description = ?'); values.push(description) }
  if (startAt) { updates.push('start_at = ?'); values.push(startAt) }
  if (endAt) { updates.push('end_at = ?'); values.push(endAt) }
  if (color) { updates.push('color = ?'); values.push(color) }
  if (visibility) { updates.push('visibility = ?'); values.push(visibility) }
  if (importance) { updates.push('importance = ?'); values.push(importance) }
  if (allDay !== undefined && allDay !== null) { updates.push('all_day = ?'); values.push(allDay === 'true' ? 1 : 0) }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400)

  updates.push("updated_at = datetime('now')")
  values.push(eventId)

  await c.env.DB.prepare(`UPDATE events SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()

  const updated = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first()
  return c.json({ success: true, event: updated })
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
  const visibility = c.req.query('visibility') || 'department'
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

aiRoutes.get('/action/update-event', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'calendar:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const id = c.req.query('id')
  if (!id) return c.json({ error: 'id (event ID) is required' }, 400)

  // Check event exists and belongs to org
  const existing = await c.env.DB.prepare(
    'SELECT e.* FROM events e JOIN users u ON e.user_id = u.id WHERE e.id = ? AND u.org_id = ?'
  ).bind(id, orgId).first()
  if (!existing) return c.json({ error: 'Event not found' }, 404)

  // Parse optional fields
  const title = c.req.query('title')
  const description = c.req.query('description')
  const startAt = c.req.query('start_at')
  const endAt = c.req.query('end_at')
  const allDayParam = c.req.query('all_day')
  const color = c.req.query('color')
  const visibility = c.req.query('visibility')
  const importance = c.req.query('importance')
  const recurrenceRule = c.req.query('recurrence_rule')

  // Validate enums
  if (importance && !['normal', 'important'].includes(importance))
    return c.json({ error: 'importance must be normal or important' }, 400)
  if (visibility && !['personal', 'department', 'company'].includes(visibility))
    return c.json({ error: 'visibility must be personal, department, or company' }, 400)

  // Build dynamic UPDATE
  const updates: string[] = []
  const values: unknown[] = []

  if (title !== undefined && title !== null) { updates.push('title = ?'); values.push(title) }
  if (description !== undefined && description !== null) { updates.push('description = ?'); values.push(description) }
  if (startAt !== undefined && startAt !== null) { updates.push('start_at = ?'); values.push(startAt) }
  if (endAt !== undefined && endAt !== null) { updates.push('end_at = ?'); values.push(endAt) }
  if (allDayParam !== undefined && allDayParam !== null) { updates.push('all_day = ?'); values.push(allDayParam === 'true' ? 1 : 0) }
  if (color !== undefined && color !== null) { updates.push('color = ?'); values.push(color) }
  if (visibility !== undefined && visibility !== null) { updates.push('visibility = ?'); values.push(visibility) }
  if (importance !== undefined && importance !== null) { updates.push('importance = ?'); values.push(importance) }
  if (recurrenceRule !== undefined && recurrenceRule !== null) { updates.push('recurrence_rule = ?'); values.push(recurrenceRule) }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400)

  updates.push("updated_at = datetime('now')")
  values.push(id)

  await c.env.DB.prepare(
    `UPDATE events SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run()

  // Fetch updated event
  const updated = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first()

  return c.json({ success: true, event: updated })
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
  const assigneeIds = c.req.query('assignee_ids')?.split(',').filter(Boolean) || []

  if (!boardId || !columnId || !title) return c.json({ error: 'board_id, column_id, title required' }, 400)

  const board = await c.env.DB.prepare('SELECT b.id FROM boards b JOIN departments d ON d.id = b.department_id WHERE b.id = ? AND d.org_id = ?').bind(boardId, orgId).first()
  if (!board) return c.json({ error: 'Board not found' }, 404)

  const id = generateId()
  const firstAssignee = assigneeIds[0] || null

  const statements = [
    c.env.DB.prepare(
      "INSERT INTO tasks (id, board_id, column_id, title, description, assignee_id, priority, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
    ).bind(id, boardId, columnId, title, description, firstAssignee, priority, dueDate),
    ...assigneeIds.map(uid =>
      c.env.DB.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)').bind(id, uid)
    ),
  ]
  await c.env.DB.batch(statements)

  const task = await c.env.DB.prepare(
    `SELECT t.*,
            GROUP_CONCAT(u.id) as assignee_ids,
            GROUP_CONCAT(u.name) as assignee_names
     FROM tasks t
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     LEFT JOIN users u ON u.id = ta.user_id
     WHERE t.id = ?
     GROUP BY t.id`
  ).bind(id).first()
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
  const assigneeIdsParam = c.req.query('assignee_ids')
  const assigneeId = c.req.query('assignee_id')
  const dueDate = c.req.query('due_date')

  // Resolve assignee_ids from param or fall back to single assignee_id
  const assigneeIds = assigneeIdsParam ? assigneeIdsParam.split(',').filter(Boolean) : null

  if (title) { updates.push('title = ?'); values.push(title) }
  if (description !== undefined && description !== null) { updates.push('description = ?'); values.push(description) }
  if (columnId) { updates.push('column_id = ?'); values.push(columnId) }
  if (priority) { updates.push('priority = ?'); values.push(priority) }
  if (assigneeIds) {
    updates.push('assignee_id = ?'); values.push(assigneeIds[0] || null)
  } else if (assigneeId) {
    updates.push('assignee_id = ?'); values.push(assigneeId)
  }
  if (dueDate) { updates.push('due_date = ?'); values.push(dueDate) }

  if (updates.length === 0 && !assigneeIds) return c.json({ error: 'No fields to update' }, 400)

  const statements: ReturnType<typeof c.env.DB.prepare>[] = []

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')")
    values.push(taskId)
    statements.push(c.env.DB.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).bind(...values))
  }

  // Update junction table if assignee_ids provided
  if (assigneeIds) {
    statements.push(c.env.DB.prepare('DELETE FROM task_assignees WHERE task_id = ?').bind(taskId))
    for (const uid of assigneeIds) {
      statements.push(c.env.DB.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)').bind(taskId, uid))
    }
  } else if (assigneeId) {
    // Single assignee_id: sync to junction table too
    statements.push(c.env.DB.prepare('DELETE FROM task_assignees WHERE task_id = ?').bind(taskId))
    statements.push(c.env.DB.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)').bind(taskId, assigneeId))
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements)
  }

  const task = await c.env.DB.prepare(
    `SELECT t.*,
            GROUP_CONCAT(u.id) as assignee_ids,
            GROUP_CONCAT(u.name) as assignee_names
     FROM tasks t
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     LEFT JOIN users u ON u.id = ta.user_id
     WHERE t.id = ?
     GROUP BY t.id`
  ).bind(taskId).first()
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
  const doneDays = c.req.query('done_days') // only show Done tasks updated within N days

  let query = `SELECT t.*, u.name as assignee_name, bc.name as column_name, b.name as board_name
    FROM tasks t
    JOIN boards b ON b.id = t.board_id
    JOIN departments d ON d.id = b.department_id
    JOIN board_columns bc ON bc.id = t.column_id
    LEFT JOIN users u ON u.id = t.assignee_id
    WHERE d.org_id = ?`
  const params: unknown[] = [orgId]
  if (boardId) { query += ' AND t.board_id = ?'; params.push(boardId) }
  if (assigneeId) { query += ' AND t.assignee_id = ?'; params.push(assigneeId) }

  // Filter Done tasks by recency
  if (doneDays) {
    const cutoff = new Date(Date.now() - parseInt(doneDays) * 86400000).toISOString()
    query += ` AND (NOT (bc.name LIKE '%done%' OR bc.name LIKE '%완료%') OR t.updated_at >= ?)`
    params.push(cutoff)
  }

  query += ' ORDER BY bc.order_index, t.order_index LIMIT 100'

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

// ── User actions (GET-based) ──────────────────────────────────

// 사용자 이름 변경
aiRoutes.get('/action/update-user-name', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'members:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const userId = c.req.query('user_id')
  const tgUserId = c.req.query('telegram_user_id')
  const email = c.req.query('email')
  const name = c.req.query('name')
  if (!name) return c.json({ error: 'name required' }, 400)

  let targetUserId = userId
  // Resolve by telegram user ID
  if (!targetUserId && tgUserId) {
    const mapping = await c.env.DB.prepare('SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1').bind(orgId, tgUserId).first<{ user_id: string }>()
    if (mapping?.user_id) targetUserId = mapping.user_id
  }
  // Resolve by email
  if (!targetUserId && email) {
    const byEmail = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND email = ?').bind(orgId, email).first<{ id: string }>()
    if (byEmail) targetUserId = byEmail.id
  }
  if (!targetUserId) return c.json({ error: 'user_id, telegram_user_id, or email required' }, 400)

  const user = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? AND org_id = ?').bind(targetUserId, orgId).first()
  if (!user) return c.json({ error: 'User not found' }, 404)

  await c.env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, targetUserId).run()
  const updated = await c.env.DB.prepare('SELECT id, name, email FROM users WHERE id = ?').bind(targetUserId).first()
  return c.json({ success: true, user: updated })
})

// ── Document actions (GET-based) ──────────────────────────────

// 문서 검색 - FTS + 폴더 경로 포함
aiRoutes.get('/action/search-docs', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const q = c.req.query('q')
  if (!q) return c.json({ documents: [] })

  const { results } = await c.env.DB.prepare(`
    SELECT d.id, d.title, d.department_id, d.parent_id, d.content, d.visibility, d.shared, d.is_folder, d.created_at, d.updated_at,
           snippet(documents_fts, 1, '<mark>', '</mark>', '...', 64) as snippet
    FROM documents_fts fts
    JOIN documents d ON d.rowid = fts.rowid
    JOIN departments dept ON dept.id = d.department_id
    WHERE documents_fts MATCH ? AND dept.org_id = ?
    ORDER BY rank LIMIT 20
  `).bind(q, orgId).all()

  // Attach folder path for each result
  const docsWithPath = await Promise.all((results || []).map(async (doc: any) => {
    const path: string[] = []
    let pid = doc.parent_id
    while (pid) {
      const parent = await c.env.DB.prepare('SELECT id, title, parent_id FROM documents WHERE id = ?').bind(pid).first<any>()
      if (!parent) break
      path.unshift(parent.title)
      pid = parent.parent_id
    }
    // Count images and files for this document
    const imgCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM doc_images WHERE document_id = ?').bind(doc.id).first<{ cnt: number }>()
    const fileCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM doc_files WHERE document_id = ?').bind(doc.id).first<{ cnt: number }>()

    return {
      ...doc,
      folder_path: path.join(' / ') || '(루트)',
      image_count: imgCount?.cnt || 0,
      file_count: fileCount?.cnt || 0,
    }
  }))

  // Add hint if any doc has images
  const hasImages = docsWithPath.some((d: any) => d.image_count > 0)
  const hint = hasImages
    ? '이미지가 있는 문서가 있습니다. 이미지를 보려면 /action/find-doc-images?q=검색어 를 사용하세요.'
    : null

  return c.json({ documents: docsWithPath, hint })
})

// 문서 목록 (폴더 탐색)
// flat=true 파라미터로 모든 문서를 플랫 리스트로 조회 가능
aiRoutes.get('/action/list-docs', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const parentId = c.req.query('parent_id')
  const deptId = c.req.query('dept_id')
  const flat = c.req.query('flat') // flat=true: return ALL docs regardless of folder

  let query = `SELECT d.id, d.title, d.department_id, d.parent_id, d.is_folder, d.visibility, d.shared, d.order_index, d.created_at, d.updated_at
    FROM documents d
    JOIN departments dept ON dept.id = d.department_id
    WHERE dept.org_id = ?`
  const params: unknown[] = [orgId]

  if (deptId) { query += ' AND d.department_id = ?'; params.push(deptId) }

  if (flat === 'true') {
    // Return all docs flat (no parent_id filter)
  } else if (parentId) {
    query += ' AND d.parent_id = ?'; params.push(parentId)
  } else if (deptId) {
    query += ' AND d.parent_id IS NULL'
  }

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

  const imgCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM doc_images WHERE document_id = ?').bind(docId).first<{ cnt: number }>()
  const fileCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM doc_files WHERE document_id = ?').bind(docId).first<{ cnt: number }>()

  return c.json({
    document: doc,
    image_count: imgCount?.cnt || 0,
    file_count: fileCount?.cnt || 0,
    hint: (imgCount?.cnt || 0) > 0 ? `이 문서에 ${imgCount?.cnt}개의 이미지가 있습니다. /action/find-doc-images?q=제목 으로 조회하세요.` : null,
  })
})

// 문서 생성
aiRoutes.get('/action/create-doc', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const deptId = c.req.query('department_id')
  const title = c.req.query('title')
  const content = c.req.query('content') || ''
  let parentId = c.req.query('parent_id')
  const parentName = c.req.query('parent_name')  // find folder by name
  const isFolder = c.req.query('is_folder') === 'true'
  const visibility = c.req.query('visibility') || 'department'

  if (!title) return c.json({ error: 'title required' }, 400)

  // Resolve parent folder by name if parent_id not provided
  if (!parentId && parentName) {
    const folder = await c.env.DB.prepare(`
      SELECT d.id, d.department_id FROM documents d
      JOIN departments dept ON dept.id = d.department_id
      WHERE d.title LIKE ? AND d.is_folder = 1 AND dept.org_id = ?
      ORDER BY d.created_at DESC LIMIT 1
    `).bind(`%${parentName}%`, orgId).first<{ id: string; department_id: string }>()
    if (folder) parentId = folder.id
  }

  // Find dept: from parent folder, then fallback
  let effectiveDeptId = deptId
  if (!effectiveDeptId && parentId) {
    const parent = await c.env.DB.prepare('SELECT department_id FROM documents WHERE id = ?').bind(parentId).first<{ department_id: string }>()
    if (parent) effectiveDeptId = parent.department_id
  }
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
  const appendParam = c.req.query('append')

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

  // Append mode: if append=true, use content param as append text
  // if append=<actual text>, use that directly (but skip "true"/"1")
  if (appendParam) {
    let textToAppend: string | null = null
    if (appendParam === 'true' || appendParam === '1') {
      textToAppend = content || null
    } else {
      textToAppend = appendParam
    }
    if (textToAppend) {
      const newContent = existing.content ? `${existing.content}\n${textToAppend}` : textToAppend
      updates.push('content = ?'); values.push(newContent)
    }
  } else if (content !== undefined && content !== null) {
    updates.push('content = ?'); values.push(content)
  }

  if (updates.length === 0) return c.json({ error: 'title or content required' }, 400)

  updates.push("updated_at = datetime('now')")
  values.push(docId)

  await c.env.DB.prepare(`UPDATE documents SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()

  // Save version history if content changed
  const updatedDoc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(docId).first<any>()
  if (updatedDoc && updatedDoc.content !== existing.content) {
    const maxVer = await c.env.DB.prepare(
      'SELECT COALESCE(MAX(version_number), 0) as max_ver FROM document_versions WHERE document_id = ?'
    ).bind(docId).first<{ max_ver: number }>()
    const ceoUser = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1').bind(orgId).first<{ id: string }>()
    const versionCreator = ceoUser?.id || ''
    await c.env.DB.prepare(
      'INSERT INTO document_versions (id, document_id, content, version_number, created_by) VALUES (?, ?, ?, ?, ?)'
    ).bind(generateId(), docId, updatedDoc.content, (maxVer?.max_ver ?? 0) + 1, versionCreator).run()
  }

  return c.json({ success: true, document: updatedDoc })
})

// 문서 변경 이력 조회
aiRoutes.get('/action/doc-history', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const docId = c.req.query('id')
  if (!docId) return c.json({ error: 'id required' }, 400)

  const doc = await c.env.DB.prepare(`
    SELECT d.id, d.title FROM documents d JOIN departments dept ON dept.id = d.department_id WHERE d.id = ? AND dept.org_id = ?
  `).bind(docId, orgId).first()
  if (!doc) return c.json({ error: 'Document not found' }, 404)

  const { results } = await c.env.DB.prepare(`
    SELECT dv.id, dv.version_number, dv.created_at, u.name as changed_by,
           SUBSTR(dv.content, 1, 200) as content_preview
    FROM document_versions dv
    LEFT JOIN users u ON u.id = dv.created_by
    WHERE dv.document_id = ?
    ORDER BY dv.version_number DESC
    LIMIT 50
  `).bind(docId).all()

  return c.json({ document: doc, versions: results || [] })
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

// 문서 공유링크 조회 (기존 링크 반환 또는 자동 생성)
aiRoutes.get('/action/get-doc-share-link', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const docId = c.req.query('id')
  const q = c.req.query('q')  // search by title
  const expiry = c.req.query('expiry') || '7d' // 1d, 7d, 30d, none

  // Find doc by ID or by search
  let doc: any = null
  if (docId) {
    doc = await c.env.DB.prepare(`
      SELECT d.* FROM documents d
      JOIN departments dept ON dept.id = d.department_id
      WHERE d.id = ? AND dept.org_id = ?
    `).bind(docId, orgId).first()
  } else if (q) {
    // Search by title (fuzzy match)
    doc = await c.env.DB.prepare(`
      SELECT d.* FROM documents d
      JOIN departments dept ON dept.id = d.department_id
      WHERE d.title LIKE ? AND dept.org_id = ? AND d.is_folder = 0
      ORDER BY d.updated_at DESC LIMIT 1
    `).bind(`%${q}%`, orgId).first()
  }

  if (!doc) return c.json({ error: 'Document not found', url: null })

  // Check for existing active external share link
  const existing = await c.env.DB.prepare(
    "SELECT * FROM doc_share_links WHERE document_id = ? AND share_type = 'external' AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY created_at DESC LIMIT 1"
  ).bind(doc.id).first<any>()

  if (existing) {
    return c.json({
      document: { id: doc.id, title: doc.title },
      url: `https://work.e-code.kr/share/${existing.token}`,
      expires_at: existing.expires_at,
      existing: true,
    })
  }

  // Auto-create a new share link
  const ceoRow = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1').bind(orgId).first<{ id: string }>()
  const creatorId = ceoRow?.id || ''
  const token = crypto.randomUUID()
  const id = generateId()

  let expiresAt: string | null = null
  if (expiry !== 'none') {
    const now = new Date()
    const days = expiry === '1d' ? 1 : expiry === '30d' ? 30 : 7
    now.setDate(now.getDate() + days)
    expiresAt = now.toISOString()
  }

  await c.env.DB.prepare(
    "INSERT INTO doc_share_links (id, document_id, org_id, share_type, token, expires_at, created_by) VALUES (?, ?, ?, 'external', ?, ?, ?)"
  ).bind(id, doc.id, orgId, token, expiresAt, creatorId).run()

  return c.json({
    document: { id: doc.id, title: doc.title },
    url: `https://work.e-code.kr/share/${token}`,
    expires_at: expiresAt,
    existing: false,
  })
})

// ──────────────────────────────────────────────────────────────
// 비품구매 action endpoints
// ──────────────────────────────────────────────────────────────

// Helper: find or create purchase category by name
async function findOrCreateCategory(db: D1Database, orgId: string, name: string): Promise<string> {
  const existing = await db.prepare(
    'SELECT id FROM purchase_categories WHERE org_id = ? AND name = ?'
  ).bind(orgId, name).first<{ id: string }>()
  if (existing) return existing.id

  const id = generateId()
  await db.prepare(
    'INSERT INTO purchase_categories (id, org_id, name) VALUES (?, ?, ?)'
  ).bind(id, orgId, name).run()
  return id
}

// ── 휴가/결재 (GET-based) ──────────────────────────────────

// 휴가 신청
aiRoutes.get('/action/create-leave', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'telegram:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const tgUserId = c.req.query('telegram_user_id')
  const directUserId = c.req.query('user_id')
  const email = c.req.query('email')
  const type = c.req.query('type') || 'vacation' // vacation, half_day_am, half_day_pm, sick, special, remote
  const startDate = c.req.query('start_date')
  const endDate = c.req.query('end_date')
  const reason = c.req.query('reason') || ''

  if (!startDate) return c.json({ error: 'start_date required (YYYY-MM-DD)' }, 400)

  // Resolve user
  let userId = directUserId
  if (!userId && tgUserId) {
    const mapping = await c.env.DB.prepare('SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1').bind(orgId, tgUserId).first<{ user_id: string }>()
    if (mapping?.user_id) userId = mapping.user_id
  }
  if (!userId && email) {
    const byEmail = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND email = ?').bind(orgId, email).first<{ id: string }>()
    if (byEmail) userId = byEmail.id
  }
  if (!userId) {
    const ceo = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1').bind(orgId).first<{ id: string }>()
    userId = ceo?.id
  }
  if (!userId) return c.json({ error: 'User not found' }, 400)

  const finalEndDate = endDate || startDate
  const dept = await c.env.DB.prepare('SELECT department_id FROM user_departments WHERE user_id = ? LIMIT 1').bind(userId).first<{ department_id: string }>()

  // Find approvers
  let approver1Id: string | null = null
  let approver1Status = 'pending'
  if (dept?.department_id) {
    const head = await c.env.DB.prepare("SELECT user_id FROM user_departments WHERE department_id = ? AND role = 'head' AND user_id != ? LIMIT 1").bind(dept.department_id, userId).first<{ user_id: string }>()
    if (head) approver1Id = head.user_id
  }

  const ceo = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1').bind(orgId).first<{ id: string }>()
  const approver2Id = ceo?.id || null

  // If user is CEO, auto-approve everything
  const userInfo = await c.env.DB.prepare('SELECT is_ceo FROM users WHERE id = ?').bind(userId).first<{ is_ceo: number }>()
  let status = 'pending'
  let approver2Status = 'pending'
  if (userInfo?.is_ceo) {
    status = 'approved'
    approver1Status = 'approved'
    approver2Status = 'approved'
  } else if (!approver1Id) {
    approver1Status = 'approved' // no dept head, auto-approve step 1
  }

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO leave_requests (id, org_id, user_id, department_id, type, start_date, end_date, reason, status,
      approver1_id, approver1_status, approver2_id, approver2_status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, orgId, userId, dept?.department_id || null, type, startDate, finalEndDate, reason, status,
    approver1Id, approver1Status, approver2Id, approver2Status, userId).run()

  const userName = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(userId).first<{ name: string }>()

  const typeLabels: Record<string, string> = {
    vacation: '휴가', half_day_am: '오전반차', half_day_pm: '오후반차',
    sick: '병가', special: '특별휴가', remote: '재택근무'
  }

  return c.json({
    success: true,
    request: { id, user_name: userName?.name, type, type_label: typeLabels[type] || type, start_date: startDate, end_date: finalEndDate, status },
    message: status === 'approved'
      ? `${userName?.name}님의 ${typeLabels[type] || type} (${startDate}~${finalEndDate}) 신청 및 자동승인 완료`
      : `${userName?.name}님의 ${typeLabels[type] || type} (${startDate}~${finalEndDate}) 신청 완료. 결재 대기 중.`,
  })
})

// 휴가 목록
aiRoutes.get('/action/list-leaves', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'telegram:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const month = c.req.query('month')
  const status = c.req.query('status')
  const tgUserId = c.req.query('telegram_user_id')

  let userId: string | undefined
  if (tgUserId) {
    const mapping = await c.env.DB.prepare('SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1').bind(orgId, tgUserId).first<{ user_id: string }>()
    if (mapping?.user_id) userId = mapping.user_id
  }

  let query = `SELECT lr.*, u.name as user_name FROM leave_requests lr JOIN users u ON u.id = lr.user_id WHERE lr.org_id = ? AND lr.is_deleted = 0`
  const params: unknown[] = [orgId]

  if (userId) { query += ' AND lr.user_id = ?'; params.push(userId) }
  if (status) { query += ' AND lr.status = ?'; params.push(status) }
  if (month) { query += ' AND lr.start_date >= ? AND lr.start_date < ?'; params.push(`${month}-01`, `${month}-31`) }

  query += ' ORDER BY lr.created_at DESC LIMIT 50'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()

  return c.json({ requests: results || [] })
})

// 휴가 승인
aiRoutes.get('/action/approve-leave', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'telegram:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const leaveId = c.req.query('id')
  if (!leaveId) return c.json({ error: 'id required' }, 400)

  const leave = await c.env.DB.prepare('SELECT * FROM leave_requests WHERE id = ? AND org_id = ?').bind(leaveId, orgId).first<any>()
  if (!leave) return c.json({ error: 'Leave request not found' }, 404)

  const now = new Date().toISOString()

  if (leave.approver1_status === 'pending') {
    await c.env.DB.prepare("UPDATE leave_requests SET approver1_status = 'approved', approver1_at = ?, updated_at = datetime('now') WHERE id = ?").bind(now, leaveId).run()
    return c.json({ success: true, message: '부서장 승인 완료. 대표 승인 대기 중.' })
  }

  if (leave.approver2_status === 'pending' && leave.approver1_status === 'approved') {
    await c.env.DB.prepare("UPDATE leave_requests SET approver2_status = 'approved', approver2_at = ?, status = 'approved', updated_at = datetime('now') WHERE id = ?").bind(now, leaveId).run()
    return c.json({ success: true, message: '최종 승인 완료.' })
  }

  return c.json({ error: '승인할 단계가 없습니다', status: leave.status })
})

// 비품구매 등록 (단건)
aiRoutes.get('/action/create-purchase', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'purchases:write') && !checkScope(scopes, 'telegram:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const itemName = c.req.query('item_name')
  const itemUrl = c.req.query('item_url') || ''
  const unitPrice = parseInt(c.req.query('unit_price') || '0', 10)
  const quantity = parseInt(c.req.query('quantity') || '1', 10)
  const categoryName = c.req.query('category')
  const note = c.req.query('note') || ''
  const tgUserId = c.req.query('telegram_user_id')
  const directUserId = c.req.query('user_id')
  const requesterEmail = c.req.query('requester_email')   // resolve by email
  const requesterName = c.req.query('requester_name')     // resolve by name
  const customDate = c.req.query('date')                  // YYYY-MM-DD
  const initialStatus = c.req.query('status') || 'requested'  // requested, ordered, delivered

  if (!itemName) return c.json({ error: 'item_name required' }, 400)

  // Resolve user: direct ID → telegram → email → name → CEO fallback
  let userId = directUserId
  if (!userId && tgUserId) {
    const mapping = await c.env.DB.prepare(
      'SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1'
    ).bind(orgId, tgUserId).first<{ user_id: string }>()
    if (mapping?.user_id) userId = mapping.user_id
  }
  if (!userId && requesterEmail) {
    const byEmail = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND email = ?').bind(orgId, requesterEmail).first<{ id: string }>()
    if (byEmail) userId = byEmail.id
  }
  if (!userId && requesterName) {
    const byName = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND name = ?').bind(orgId, requesterName).first<{ id: string }>()
    if (byName) userId = byName.id
  }
  if (!userId) {
    const ceo = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1').bind(orgId).first<{ id: string }>()
    userId = ceo?.id || (await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? LIMIT 1').bind(orgId).first<{ id: string }>())?.id || undefined
  }
  if (!userId) return c.json({ error: 'No user found' }, 400)

  // Resolve category
  let categoryId: string | null = null
  if (categoryName) {
    categoryId = await findOrCreateCategory(c.env.DB, orgId, categoryName)
  }

  // Auto-detect department
  const dept = await c.env.DB.prepare('SELECT department_id FROM user_departments WHERE user_id = ? LIMIT 1').bind(userId).first<{ department_id: string }>()

  const totalPrice = quantity * unitPrice
  const id = generateId()

  const createdAt = customDate ? `${customDate} 12:00:00` : new Date().toISOString().replace('T', ' ').slice(0, 19)

  await c.env.DB.prepare(`
    INSERT INTO purchases (
      id, org_id, requester_id, department_id, category_id,
      item_name, item_url, quantity, unit_price, total_price,
      status, note, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'telegram', ?, ?)
  `).bind(
    id, orgId, userId, dept?.department_id || null, categoryId,
    itemName, itemUrl, quantity, unitPrice, totalPrice,
    initialStatus, note, createdAt, createdAt
  ).run()

  const purchase = await c.env.DB.prepare(`
    SELECT p.*, u.name as requester_name, pc.name as category_name
    FROM purchases p
    JOIN users u ON u.id = p.requester_id
    LEFT JOIN purchase_categories pc ON pc.id = p.category_id
    WHERE p.id = ?
  `).bind(id).first()

  return c.json({ success: true, purchase })
})

// 비품구매 등록 (다건)
aiRoutes.get('/action/create-purchases', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'purchases:write') && !checkScope(scopes, 'telegram:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const itemsJson = c.req.query('items')
  const tgUserId = c.req.query('telegram_user_id')
  const directUserId = c.req.query('user_id')
  const requesterEmail = c.req.query('requester_email')
  const requesterName = c.req.query('requester_name')
  const customDate = c.req.query('date')
  const initialStatus = c.req.query('status') || 'requested'
  const note = c.req.query('note') || ''

  if (!itemsJson) return c.json({ error: 'items required (JSON array)' }, 400)

  let items: Array<{ item_name: string; item_url?: string; quantity?: number; unit_price?: number; category?: string }>
  try {
    items = JSON.parse(itemsJson)
  } catch {
    return c.json({ error: 'Invalid items JSON' }, 400)
  }

  if (!Array.isArray(items) || items.length === 0) return c.json({ error: 'items must be a non-empty array' }, 400)

  // Resolve user: direct ID → telegram → email → name → CEO fallback
  let userId = directUserId
  if (!userId && tgUserId) {
    const mapping = await c.env.DB.prepare(
      'SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1'
    ).bind(orgId, tgUserId).first<{ user_id: string }>()
    if (mapping?.user_id) userId = mapping.user_id
  }
  if (!userId && requesterEmail) {
    const byEmail = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND email = ?').bind(orgId, requesterEmail).first<{ id: string }>()
    if (byEmail) userId = byEmail.id
  }
  if (!userId && requesterName) {
    const byName = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND name = ?').bind(orgId, requesterName).first<{ id: string }>()
    if (byName) userId = byName.id
  }
  if (!userId) {
    const ceo = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1').bind(orgId).first<{ id: string }>()
    userId = ceo?.id || (await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? LIMIT 1').bind(orgId).first<{ id: string }>())?.id || undefined
  }
  if (!userId) return c.json({ error: 'No user found' }, 400)

  const dept = await c.env.DB.prepare('SELECT department_id FROM user_departments WHERE user_id = ? LIMIT 1').bind(userId).first<{ department_id: string }>()
  const createdAt = customDate ? `${customDate} 12:00:00` : new Date().toISOString().replace('T', ' ').slice(0, 19)

  const ids: string[] = []
  const statements: D1PreparedStatement[] = []

  for (const item of items) {
    if (!item.item_name) continue
    const id = generateId()
    ids.push(id)
    const quantity = item.quantity || 1
    const unitPrice = item.unit_price || 0
    const totalPrice = quantity * unitPrice

    let categoryId: string | null = null
    if (item.category) {
      categoryId = await findOrCreateCategory(c.env.DB, orgId, item.category)
    }

    statements.push(
      c.env.DB.prepare(`
        INSERT INTO purchases (
          id, org_id, requester_id, department_id, category_id,
          item_name, item_url, quantity, unit_price, total_price,
          status, note, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'telegram', ?, ?)
      `).bind(
        id, orgId, userId, dept?.department_id || null, categoryId,
        item.item_name, item.item_url || '', quantity, unitPrice, totalPrice,
        initialStatus, note, createdAt, createdAt
      )
    )
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements)
  }

  const placeholders = ids.map(() => '?').join(',')
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, u.name as requester_name, pc.name as category_name
     FROM purchases p
     JOIN users u ON u.id = p.requester_id
     LEFT JOIN purchase_categories pc ON pc.id = p.category_id
     WHERE p.id IN (${placeholders})`
  ).bind(...ids).all()

  return c.json({ success: true, purchases: results, count: results.length })
})

// 비품구매 목록
aiRoutes.get('/action/list-purchases', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'purchases:read') && !checkScope(scopes, 'telegram:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const month = c.req.query('month')
  const status = c.req.query('status')
  const requesterId = c.req.query('requester_id')
  const tgUserId = c.req.query('telegram_user_id')

  let query = `
    SELECT p.*, u.name as requester_name, pc.name as category_name, d.name as department_name
    FROM purchases p
    JOIN users u ON u.id = p.requester_id
    LEFT JOIN purchase_categories pc ON pc.id = p.category_id
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE p.org_id = ? AND p.is_deleted = 0`
  const params: unknown[] = [orgId]

  if (status) { query += ' AND p.status = ?'; params.push(status) }

  // Filter by requester (resolve telegram user if needed)
  let filterUserId = requesterId
  if (!filterUserId && tgUserId) {
    const mapping = await c.env.DB.prepare(
      'SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1'
    ).bind(orgId, tgUserId).first<{ user_id: string }>()
    if (mapping?.user_id) filterUserId = mapping.user_id
  }
  if (filterUserId) { query += ' AND p.requester_id = ?'; params.push(filterUserId) }

  if (month) {
    query += " AND p.created_at >= ? AND p.created_at < ?"
    params.push(`${month}-01`, `${month}-31 23:59:59`)
  }

  query += ' ORDER BY p.created_at DESC LIMIT 100'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ purchases: results })
})

// 비품구매 통계
aiRoutes.get('/action/purchase-stats', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'purchases:read') && !checkScope(scopes, 'telegram:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const month = c.req.query('month') || new Date().toISOString().slice(0, 7)
  const deptId = c.req.query('dept_id')

  let baseWhere = 'WHERE p.org_id = ? AND p.is_deleted = 0 AND p.created_at >= ? AND p.created_at < ?'
  const baseParams: unknown[] = [orgId, `${month}-01`, `${month}-31 23:59:59`]

  if (deptId) {
    baseWhere += ' AND p.department_id = ?'
    baseParams.push(deptId)
  }

  const total = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(p.total_price), 0) as total_amount, COUNT(*) as total_count
    FROM purchases p ${baseWhere}
  `).bind(...baseParams).first<{ total_amount: number; total_count: number }>()

  const { results: byCategory } = await c.env.DB.prepare(`
    SELECT pc.name, COALESCE(SUM(p.total_price), 0) as amount, COUNT(*) as count
    FROM purchases p
    LEFT JOIN purchase_categories pc ON pc.id = p.category_id
    ${baseWhere}
    GROUP BY p.category_id
    ORDER BY amount DESC
  `).bind(...baseParams).all()

  const { results: byDepartment } = await c.env.DB.prepare(`
    SELECT d.name, COALESCE(SUM(p.total_price), 0) as amount, COUNT(*) as count
    FROM purchases p
    LEFT JOIN departments d ON d.id = p.department_id
    ${baseWhere}
    GROUP BY p.department_id
    ORDER BY amount DESC
  `).bind(...baseParams).all()

  const { results: byRequester } = await c.env.DB.prepare(`
    SELECT u.name, COALESCE(SUM(p.total_price), 0) as amount, COUNT(*) as count
    FROM purchases p
    JOIN users u ON u.id = p.requester_id
    ${baseWhere}
    GROUP BY p.requester_id
    ORDER BY amount DESC
  `).bind(...baseParams).all()

  return c.json({
    month,
    total_amount: total?.total_amount || 0,
    total_count: total?.total_count || 0,
    by_category: byCategory,
    by_department: byDepartment,
    by_requester: byRequester,
  })
})

// 비품구매 상태 변경
aiRoutes.get('/action/update-purchase-status', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'purchases:write') && !checkScope(scopes, 'telegram:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const purchaseId = c.req.query('id')
  const newStatus = c.req.query('status')

  if (!purchaseId) return c.json({ error: 'id required' }, 400)
  if (!newStatus) return c.json({ error: 'status required' }, 400)

  const validStatuses = ['requested', 'approved', 'ordered', 'delivered', 'returned', 'cancelled']
  if (!validStatuses.includes(newStatus)) {
    return c.json({ error: `Invalid status. Valid: ${validStatuses.join(', ')}` }, 400)
  }

  const purchase = await c.env.DB.prepare(
    'SELECT * FROM purchases WHERE id = ? AND org_id = ? AND is_deleted = 0'
  ).bind(purchaseId, orgId).first<{ id: string; status: string }>()

  if (!purchase) return c.json({ error: '구매 요청을 찾을 수 없습니다' }, 404)

  const now = new Date().toISOString()
  const updates: string[] = ['status = ?']
  const values: unknown[] = [newStatus]

  if (newStatus === 'approved') {
    updates.push('approved_at = ?')
    values.push(now)
  } else if (newStatus === 'ordered') {
    updates.push('ordered_at = ?')
    values.push(now)
  } else if (newStatus === 'delivered') {
    updates.push('delivered_at = ?')
    values.push(now)
  }

  updates.push("updated_at = datetime('now')")
  values.push(purchaseId)

  await c.env.DB.prepare(
    `UPDATE purchases SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run()

  const updated = await c.env.DB.prepare(`
    SELECT p.*, u.name as requester_name, pc.name as category_name
    FROM purchases p
    JOIN users u ON u.id = p.requester_id
    LEFT JOIN purchase_categories pc ON pc.id = p.category_id
    WHERE p.id = ?
  `).bind(purchaseId).first()

  return c.json({ success: true, purchase: updated })
})

// 비품구매 일괄 상태 변경 (전체 승인 등)
aiRoutes.get('/action/approve-all-purchases', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'purchases:write') && !checkScope(scopes, 'telegram:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const fromStatus = c.req.query('from_status') || 'requested'
  const toStatus = c.req.query('to_status') || 'approved'
  const month = c.req.query('month')

  let query = "UPDATE purchases SET status = ?, updated_at = datetime('now')"
  const params: unknown[] = [toStatus]

  if (toStatus === 'approved') { query += ", approved_at = datetime('now')" }
  else if (toStatus === 'ordered') { query += ", ordered_at = datetime('now')" }
  else if (toStatus === 'delivered') { query += ", delivered_at = datetime('now')" }

  query += ' WHERE org_id = ? AND status = ? AND is_deleted = 0'
  params.push(orgId, fromStatus)

  if (month) {
    query += " AND created_at >= ? AND created_at < ?"
    params.push(`${month}-01`, `${month}-31 23:59:59`)
  }

  const result = await c.env.DB.prepare(query).bind(...params).run()

  return c.json({ success: true, updated_count: result.meta.changes })
})

// ──────────────────────────────────────────────────────────────
// 문서 이미지 action endpoints
// ──────────────────────────────────────────────────────────────

// 문서 이미지 목록
aiRoutes.get('/action/list-doc-images', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const documentId = c.req.query('document_id')
  const tag = c.req.query('tag')
  const person = c.req.query('person')

  let query = 'SELECT * FROM doc_images WHERE org_id = ?'
  const params: unknown[] = [orgId]

  if (documentId) {
    query += ' AND document_id = ?'
    params.push(documentId)
  }

  if (tag) {
    query += ' AND tags LIKE ?'
    params.push(`%${tag}%`)
  }

  if (person) {
    query += ' AND people LIKE ?'
    params.push(`%${person}%`)
  }

  query += ' ORDER BY created_at DESC LIMIT 100'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ images: results })
})

// 문서 이미지 태그 추가
aiRoutes.get('/action/tag-doc-image', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const imageId = c.req.query('id')
  const tagsRaw = c.req.query('tags')

  if (!imageId) return c.json({ error: 'id required' }, 400)
  if (!tagsRaw) return c.json({ error: 'tags required (comma-separated)' }, 400)

  const newTags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)

  const image = await c.env.DB.prepare(
    'SELECT id, tags FROM doc_images WHERE id = ? AND org_id = ?'
  ).bind(imageId, orgId).first<{ id: string; tags: string }>()

  if (!image) return c.json({ error: 'Image not found' }, 404)

  let existingTags: string[] = []
  try { existingTags = JSON.parse(image.tags || '[]') } catch { /* ignore */ }

  const merged = Array.from(new Set([...existingTags, ...newTags]))
  await c.env.DB.prepare(
    'UPDATE doc_images SET tags = ? WHERE id = ?'
  ).bind(JSON.stringify(merged), imageId).run()

  const updated = await c.env.DB.prepare('SELECT * FROM doc_images WHERE id = ?').bind(imageId).first()
  return c.json({ success: true, image: updated })
})

// 문서 이미지 인물 태그
aiRoutes.get('/action/tag-person-in-image', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const imageId = c.req.query('id')
  const personName = c.req.query('name')

  if (!imageId) return c.json({ error: 'id required' }, 400)
  if (!personName) return c.json({ error: 'name required' }, 400)

  const image = await c.env.DB.prepare(
    'SELECT id, people FROM doc_images WHERE id = ? AND org_id = ?'
  ).bind(imageId, orgId).first<{ id: string; people: string }>()

  if (!image) return c.json({ error: 'Image not found' }, 404)

  let existingPeople: Array<{ name: string }> = []
  try { existingPeople = JSON.parse(image.people || '[]') } catch { /* ignore */ }

  if (!existingPeople.some(p => p.name === personName)) {
    existingPeople.push({ name: personName })
  }

  await c.env.DB.prepare(
    'UPDATE doc_images SET people = ? WHERE id = ?'
  ).bind(JSON.stringify(existingPeople), imageId).run()

  const updated = await c.env.DB.prepare('SELECT * FROM doc_images WHERE id = ?').bind(imageId).first()
  return c.json({ success: true, image: updated })
})

// 문서 이미지 검색 (태그/인물)
aiRoutes.get('/action/search-images', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const tag = c.req.query('tag')
  const person = c.req.query('person')
  const documentId = c.req.query('document_id')

  let query = 'SELECT * FROM doc_images WHERE org_id = ?'
  const params: unknown[] = [orgId]

  if (documentId) {
    query += ' AND document_id = ?'
    params.push(documentId)
  }

  if (tag) {
    query += ' AND tags LIKE ?'
    params.push(`%${tag}%`)
  }

  if (person) {
    query += ' AND people LIKE ?'
    params.push(`%${person}%`)
  }

  query += ' ORDER BY created_at DESC LIMIT 100'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()

  // Add full URLs
  const org = await c.env.DB.prepare('SELECT slug FROM organizations WHERE id = ?').bind(orgId).first<{ slug: string }>()
  const withUrls = (results || []).map((img: any) => ({
    ...img,
    full_url: `https://ecode-internal-api.justin21lee.workers.dev/api/files/${encodeURI(img.file_url)}`,
  }))

  return c.json({ images: withUrls })
})

// 문서 제목으로 이미지 검색 (한 번에)
aiRoutes.get('/action/find-doc-images', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const q = c.req.query('q')          // 문서 제목 검색어 (예: "워크샵")
  const person = c.req.query('person') // 인물 필터
  const tag = c.req.query('tag')       // 태그 필터

  if (!q) return c.json({ error: 'q (문서 제목 검색어) required' }, 400)

  // 1. Find documents matching the title
  const { results: docs } = await c.env.DB.prepare(`
    SELECT d.id, d.title FROM documents d
    JOIN departments dept ON dept.id = d.department_id
    WHERE d.title LIKE ? AND dept.org_id = ? AND d.is_folder = 0
    LIMIT 5
  `).bind(`%${q}%`, orgId).all()

  if (!docs || docs.length === 0) {
    return c.json({ error: `"${q}" 관련 문서를 찾을 수 없습니다`, documents: [], images: [] })
  }

  // 2. Get images from those documents
  const docIds = docs.map((d: any) => d.id)
  const placeholders = docIds.map(() => '?').join(',')

  let imgQuery = `SELECT * FROM doc_images WHERE org_id = ? AND document_id IN (${placeholders})`
  const imgParams: unknown[] = [orgId, ...docIds]

  if (person) {
    imgQuery += ' AND people LIKE ?'
    imgParams.push(`%${person}%`)
  }
  if (tag) {
    imgQuery += ' AND tags LIKE ?'
    imgParams.push(`%${tag}%`)
  }

  imgQuery += ' ORDER BY created_at DESC LIMIT 50'
  const { results: images } = await c.env.DB.prepare(imgQuery).bind(...imgParams).all()

  const withUrls = (images || []).map((img: any) => ({
    ...img,
    full_url: `https://ecode-internal-api.justin21lee.workers.dev/api/files/${encodeURI(img.file_url)}`,
  }))

  // Generate share link for the first document (so users can view all images in browser)
  let viewUrl: string | null = null
  if (docs.length > 0) {
    const firstDocId = (docs[0] as any).id
    viewUrl = `https://work.e-code.kr/docs/${firstDocId}`
  }

  return c.json({
    documents: docs,
    images: withUrls.slice(0, 5), // limit to 5 preview images
    total_count: withUrls.length,
    view_url: viewUrl,
    message: `"${q}" 관련 문서에서 ${withUrls.length}개의 이미지를 찾았습니다`,
    guide: withUrls.length > 3
      ? `사진이 ${withUrls.length}장 있습니다. 한장씩 보내지 말고 문서 링크로 안내하세요: ${viewUrl}`
      : '사진을 개별 전송해도 됩니다.',
  })
})

// 일괄 인물 태그
aiRoutes.get('/action/bulk-tag-person', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')
  const imageIdsRaw = c.req.query('image_ids')
  const personName = c.req.query('name')

  if (!imageIdsRaw) return c.json({ error: 'image_ids required (comma-separated)' }, 400)
  if (!personName) return c.json({ error: 'name required' }, 400)

  const imageIds = imageIdsRaw.split(',').map(id => id.trim()).filter(Boolean)
  const updated: string[] = []

  for (const imageId of imageIds) {
    const image = await c.env.DB.prepare(
      'SELECT id, people FROM doc_images WHERE id = ? AND org_id = ?'
    ).bind(imageId, orgId).first<{ id: string; people: string }>()

    if (!image) continue

    let existingPeople: Array<{ name: string }> = []
    try { existingPeople = JSON.parse(image.people || '[]') } catch { /* ignore */ }

    if (!existingPeople.some(p => p.name === personName)) {
      existingPeople.push({ name: personName })
      await c.env.DB.prepare(
        'UPDATE doc_images SET people = ? WHERE id = ?'
      ).bind(JSON.stringify(existingPeople), imageId).run()
    }

    updated.push(imageId)
  }

  return c.json({ success: true, updated_count: updated.length, updated_ids: updated })
})

// ══════════════════════════════════════════════════════════════
// Document Files Actions
// ══════════════════════════════════════════════════════════════

// List doc files
aiRoutes.get('/action/list-doc-files', async (c) => {
  const orgId = c.get('apiKeyOrgId')
  const documentId = c.req.query('document_id')

  if (!documentId) return c.json({ error: 'document_id is required' }, 400)

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM doc_files WHERE document_id = ? AND org_id = ? ORDER BY created_at DESC'
  ).bind(documentId, orgId).all()

  return c.json({ files: results })
})

// Create weekly meeting document
aiRoutes.get('/action/create-weekly-meeting-doc', async (c) => {
  const orgId = c.get('apiKeyOrgId')
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000) // KST
  const todayKST = now.toISOString().slice(0, 10)
  const weekDate = c.req.query('week_date') || todayKST
  const folderName = c.req.query('folder_name') || '주간회의'

  // Calculate week number
  const date = new Date(weekDate + 'T00:00:00+09:00')
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const weekNum = Math.ceil(date.getDate() / 7)

  const title = `${year}년 ${month}월 ${weekNum}주차 주간회의`

  // Find any department for this org
  const dept = await c.env.DB.prepare(
    'SELECT id FROM departments WHERE org_id = ? ORDER BY order_index ASC LIMIT 1'
  ).bind(orgId).first<{ id: string }>()

  if (!dept) return c.json({ error: 'No department found in organization' }, 404)

  // Get real user_id for FK
  const ceoUser = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1').bind(orgId).first<{ id: string }>()
  const creatorId = ceoUser?.id || (await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? LIMIT 1').bind(orgId).first<{ id: string }>())?.id || ''

  // Find or create the folder
  let folder = await c.env.DB.prepare(
    "SELECT id FROM documents WHERE department_id = ? AND is_folder = 1 AND title = ? AND parent_id IS NULL"
  ).bind(dept.id, folderName).first<{ id: string }>()

  if (!folder) {
    const folderId = generateId()
    await c.env.DB.prepare(`
      INSERT INTO documents (id, department_id, title, content, parent_id, is_folder, visibility, created_by, created_at, updated_at)
      VALUES (?, ?, ?, '', NULL, 1, 'company', ?, datetime('now'), datetime('now'))
    `).bind(folderId, dept.id, folderName, creatorId).run()
    folder = { id: folderId }
  }

  // Check if document with same title already exists
  const existing = await c.env.DB.prepare(
    "SELECT id, title FROM documents WHERE parent_id = ? AND title = ? AND is_folder = 0"
  ).bind(folder.id, title).first<{ id: string; title: string }>()

  if (existing) {
    return c.json({ document: existing, message: 'Document already exists', created: false })
  }

  // Create the document inside the folder
  const docId = generateId()
  const content = `# ${title}\n\n## 참석자\n\n## 안건\n\n## 논의 내용\n\n## 결정 사항\n\n## 다음 액션 아이템\n\n`

  await c.env.DB.prepare(`
    INSERT INTO documents (id, department_id, title, content, parent_id, is_folder, visibility, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, 'company', ?, datetime('now'), datetime('now'))
  `).bind(docId, dept.id, title, content, folder.id, creatorId).run()

  const document = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(docId).first()

  return c.json({ document, created: true, folder_id: folder.id })
})

// ── 문서 파일 첨부 (URL → R2 다운로드) ─────────────────────────
aiRoutes.get('/action/attach-file-url', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const documentId = c.req.query('document_id')
  const fileUrl = c.req.query('url')
  const fileName = c.req.query('name')

  if (!documentId) return c.json({ error: 'document_id required' }, 400)
  if (!fileUrl) return c.json({ error: 'url required' }, 400)

  // Verify document belongs to org
  const doc = await c.env.DB.prepare(`
    SELECT d.id, d.department_id FROM documents d
    JOIN departments dept ON dept.id = d.department_id
    WHERE d.id = ? AND dept.org_id = ?
  `).bind(documentId, orgId).first<{ id: string; department_id: string }>()
  if (!doc) return c.json({ error: 'Document not found' }, 404)

  // Get org slug for R2 key
  const org = await c.env.DB.prepare('SELECT slug FROM organizations WHERE id = ?').bind(orgId).first<{ slug: string }>()
  if (!org) return c.json({ error: 'Organization not found' }, 404)

  // Download the file
  let fileData: ArrayBuffer
  let contentType = 'application/octet-stream'
  let resolvedName = fileName || ''
  try {
    const resp = await fetch(fileUrl)
    if (!resp.ok) return c.json({ error: `Failed to download file: ${resp.status}` }, 400)
    fileData = await resp.arrayBuffer()
    contentType = resp.headers.get('content-type') || contentType
    if (!resolvedName) {
      // Try to get filename from URL or content-disposition
      const cd = resp.headers.get('content-disposition')
      if (cd) {
        const match = cd.match(/filename[*]?=(?:UTF-8''|"?)([^";]+)/)
        if (match) resolvedName = decodeURIComponent(match[1])
      }
      if (!resolvedName) {
        const urlPath = new URL(fileUrl).pathname
        resolvedName = urlPath.split('/').pop() || 'file'
      }
    }
  } catch (e) {
    return c.json({ error: `Download failed: ${e instanceof Error ? e.message : 'unknown'}` }, 400)
  }

  const timestamp = Date.now()
  const r2Key = `${org.slug}/docs/${documentId}/files/${timestamp}_${resolvedName}`

  // Upload to R2
  await c.env.FILES.put(r2Key, fileData, {
    httpMetadata: { contentType },
  })

  // Get creator user for FK
  const creator = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1').bind(orgId).first<{ id: string }>()
    || await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? LIMIT 1').bind(orgId).first<{ id: string }>()
  const uploadedBy = creator?.id || ''

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO doc_files (id, document_id, org_id, file_url, file_name, file_size, mime_type, uploaded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(id, documentId, orgId, r2Key, resolvedName, fileData.byteLength, contentType, uploadedBy).run()

  const record = await c.env.DB.prepare('SELECT * FROM doc_files WHERE id = ?').bind(id).first()

  // Build public URL
  const publicUrl = `https://ecode-internal-api.justin21lee.workers.dev/api/files/${r2Key}`

  return c.json({ success: true, file: record, public_url: publicUrl })
})

// ── 문서 파일 첨부 (multipart/form-data) ────────────────────────
// Usage: curl -F "file=@/path/to/file.pdf" -F "document_id=xxx" "URL/action/attach-file?key=API_KEY"
aiRoutes.post('/action/attach-file', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const documentId = formData.get('document_id') as string | null

  if (!file) return c.json({ error: 'file is required (multipart form field)' }, 400)
  if (!documentId) return c.json({ error: 'document_id is required' }, 400)

  // Verify document belongs to org
  const doc = await c.env.DB.prepare(`
    SELECT d.id, d.department_id FROM documents d
    JOIN departments dept ON dept.id = d.department_id
    WHERE d.id = ? AND dept.org_id = ?
  `).bind(documentId, orgId).first<{ id: string; department_id: string }>()
  if (!doc) return c.json({ error: 'Document not found' }, 404)

  const org = await c.env.DB.prepare('SELECT slug FROM organizations WHERE id = ?').bind(orgId).first<{ slug: string }>()
  if (!org) return c.json({ error: 'Organization not found' }, 404)

  const fileName = file.name || 'file'
  const contentType = file.type || 'application/octet-stream'
  const timestamp = Date.now()
  const r2Key = `${org.slug}/docs/${documentId}/files/${timestamp}_${fileName}`

  const arrayBuffer = await file.arrayBuffer()
  await c.env.FILES.put(r2Key, arrayBuffer, {
    httpMetadata: { contentType },
  })

  const creator = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1').bind(orgId).first<{ id: string }>()
    || await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? LIMIT 1').bind(orgId).first<{ id: string }>()
  const uploadedBy = creator?.id || ''

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO doc_files (id, document_id, org_id, file_url, file_name, file_size, mime_type, uploaded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(id, documentId, orgId, r2Key, fileName, arrayBuffer.byteLength, contentType, uploadedBy).run()

  const record = await c.env.DB.prepare('SELECT * FROM doc_files WHERE id = ?').bind(id).first()
  const publicUrl = `https://ecode-internal-api.justin21lee.workers.dev/api/files/${r2Key}`

  return c.json({ success: true, file: record, public_url: publicUrl })
})

// ── 문서 첨부파일 목록 ────────────────────────────────────────
aiRoutes.get('/action/list-doc-files', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const documentId = c.req.query('document_id')
  if (!documentId) return c.json({ error: 'document_id required' }, 400)

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM doc_files WHERE document_id = ? AND org_id = ? ORDER BY created_at DESC'
  ).bind(documentId, orgId).all()

  return c.json({ files: results })
})

// ── 첨부파일 이름 변경 ──────────────────────────────────────────
aiRoutes.get('/action/rename-doc-file', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'docs:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const fileId = c.req.query('id')
  const newName = c.req.query('name')

  if (!fileId) return c.json({ error: 'id required' }, 400)
  if (!newName) return c.json({ error: 'name required' }, 400)

  const file = await c.env.DB.prepare(
    'SELECT id FROM doc_files WHERE id = ? AND org_id = ?'
  ).bind(fileId, orgId).first<{ id: string }>()

  if (!file) return c.json({ error: 'File not found' }, 404)

  await c.env.DB.prepare(
    'UPDATE doc_files SET file_name = ? WHERE id = ? AND org_id = ?'
  ).bind(newName, fileId, orgId).run()

  const updated = await c.env.DB.prepare('SELECT * FROM doc_files WHERE id = ?').bind(fileId).first()
  return c.json({ success: true, file: updated })
})

// ── Vault PIN & Credential Actions ──────────────────────────────

// Helper: resolve user from telegram_user_id / user_id / email
async function resolveVaultUser(c: any, orgId: string): Promise<{ userId: string } | { error: string }> {
  const tgUserId = c.req.query('telegram_user_id')
  const directUserId = c.req.query('user_id')
  const email = c.req.query('email')

  let userId = directUserId
  if (!userId && tgUserId) {
    const mapping = await c.env.DB.prepare(
      'SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1'
    ).bind(orgId, tgUserId).first() as { user_id: string } | null
    if (!mapping?.user_id) return { error: '매핑된 이코드 사용자를 찾을 수 없습니다' }
    userId = mapping.user_id
  }
  if (!userId && email) {
    const user = await c.env.DB.prepare('SELECT id FROM users WHERE org_id = ? AND email = ?').bind(orgId, email).first() as { id: string } | null
    if (!user) return { error: `사용자를 찾을 수 없습니다: ${email}` }
    userId = user.id
  }
  if (!userId) return { error: 'telegram_user_id, user_id, or email required' }
  return { userId }
}

// Set vault PIN
aiRoutes.get('/action/set-vault-pin', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'vault:write') && !checkScope(scopes, 'telegram:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const pin = c.req.query('pin')
  if (!pin || !/^\d{4,8}$/.test(pin)) return c.json({ error: 'PIN must be 4-8 digits' }, 400)

  const resolved = await resolveVaultUser(c, orgId)
  if ('error' in resolved) return c.json({ error: resolved.error }, 400)
  const { userId } = resolved

  // SHA-256 hash the PIN
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)
  const pinHash = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')

  await c.env.DB.prepare('UPDATE users SET vault_pin_hash = ? WHERE id = ? AND org_id = ?').bind(pinHash, userId, orgId).run()

  return c.json({ success: true, message: 'Vault PIN set' })
})

// Create credential (AI)
aiRoutes.get('/action/create-credential', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'vault:write') && !checkScope(scopes, 'telegram:write')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const serviceName = c.req.query('service_name')
  const username = c.req.query('username')
  const password = c.req.query('password')
  const url = c.req.query('url') || ''

  if (!serviceName || !username || !password) return c.json({ error: 'service_name, username, password required' }, 400)

  const resolved = await resolveVaultUser(c, orgId)
  if ('error' in resolved) return c.json({ error: resolved.error }, 400)
  const { userId } = resolved

  // Get user's department
  const dept = await c.env.DB.prepare('SELECT department_id FROM user_departments WHERE user_id = ? LIMIT 1').bind(userId).first<{ department_id: string }>()
  if (!dept) return c.json({ error: 'User has no department' }, 400)

  const id = generateId()
  const usernameEnc = await encrypt(username, c.env.VAULT_KEY)
  const passwordEnc = await encrypt(password, c.env.VAULT_KEY)

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO credentials (id, department_id, service_name, url, username_enc, password_enc, notes_enc, created_by, visibility)
       VALUES (?, ?, ?, ?, ?, ?, '', ?, 'department')`
    ).bind(id, dept.department_id, serviceName, url, usernameEnc, passwordEnc, userId),
    c.env.DB.prepare(
      'INSERT INTO credential_access_log (id, credential_id, user_id, action, ip_address) VALUES (?, ?, ?, ?, ?)'
    ).bind(generateId(), id, userId, 'create', 'ai-api'),
  ])

  return c.json({ success: true, credential: { id, service_name: serviceName, url, department_id: dept.department_id } })
})

// View credential (requires PIN verification)
aiRoutes.get('/action/view-credential', async (c) => {
  const scopes = c.get('apiKeyScopes')
  if (!checkScope(scopes, 'vault:read') && !checkScope(scopes, 'telegram:read')) return c.json({ error: 'Insufficient scope' }, 403)
  const orgId = c.get('apiKeyOrgId')

  const serviceName = c.req.query('service_name')
  const pin = c.req.query('pin')

  if (!serviceName) return c.json({ error: 'service_name required' }, 400)
  if (!pin) return c.json({ error: 'pin required for credential viewing' }, 400)

  const resolved = await resolveVaultUser(c, orgId)
  if ('error' in resolved) return c.json({ error: resolved.error }, 400)
  const { userId } = resolved

  // Verify PIN
  const dbUser = await c.env.DB.prepare('SELECT vault_pin_hash FROM users WHERE id = ? AND org_id = ?').bind(userId, orgId).first<{ vault_pin_hash: string }>()
  if (!dbUser?.vault_pin_hash) return c.json({ error: 'Vault PIN not set. Use set-vault-pin first.' }, 400)

  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)
  const pinHash = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')

  if (pinHash !== dbUser.vault_pin_hash) return c.json({ error: 'Invalid PIN' }, 403)

  // Find credential by service_name (visible to user)
  const cred = await c.env.DB.prepare(
    `SELECT c.* FROM credentials c
     JOIN departments d ON d.id = c.department_id
     WHERE d.org_id = ? AND c.service_name LIKE ? LIMIT 1`
  ).bind(orgId, `%${serviceName}%`).first<any>()

  if (!cred) return c.json({ error: `Credential not found: ${serviceName}` }, 404)

  // Decrypt
  const decryptedUsername = await decrypt(cred.username_enc, c.env.VAULT_KEY)
  const decryptedPassword = await decrypt(cred.password_enc, c.env.VAULT_KEY)
  const notes = cred.notes_enc ? await decrypt(cred.notes_enc, c.env.VAULT_KEY) : ''

  // Audit log
  await c.env.DB.prepare(
    'INSERT INTO credential_access_log (id, credential_id, user_id, action, ip_address) VALUES (?, ?, ?, ?, ?)'
  ).bind(generateId(), cred.id, userId, 'view', 'ai-api').run()

  return c.json({
    credential: {
      id: cred.id,
      service_name: cred.service_name,
      url: cred.url,
      username: decryptedUsername,
      password: decryptedPassword,
      notes,
    },
  })
})
