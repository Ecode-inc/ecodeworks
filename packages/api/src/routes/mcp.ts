/**
 * MCP (Model Context Protocol) Server Routes
 *
 * Exposes the ecode platform to AI assistants via JSON-RPC 2.0.
 * Endpoint: POST /api/mcp
 *
 * Implements:
 * - initialize: server info and capabilities
 * - tools/list: available tools
 * - tools/call: execute a tool
 *
 * SAFETY: Same restrictions as AI API:
 * - No DELETE operations
 * - Vault metadata only (no passwords)
 * - No user/org modifications
 */

import { Hono } from 'hono'
import type { Env } from '../types'
import { generateId } from '../lib/id'

type Variables = { apiKeyOrgId: string; apiKeyScopes: string[] }

export const mcpRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

// ── Auth middleware (reuse API key logic) ────────────────────

async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key)
  const hash = await crypto.subtle.digest('SHA-256', encoded)
  const bytes = new Uint8Array(hash)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function checkScope(scopes: string[], required: string): boolean {
  return scopes.includes('*') || scopes.includes(required)
}

// ── JSON-RPC types ──────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

function jsonRpcSuccess(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

function jsonRpcError(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } }
}

// ── Tool definitions ────────────────────────────────────────

interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'list_calendar_events',
    description: '캘린더 일정 목록 조회. 부서별, 날짜 범위로 필터링 가능.',
    inputSchema: {
      type: 'object',
      properties: {
        dept_id: { type: 'string', description: '부서 ID (선택)' },
        start: { type: 'string', description: '시작일 ISO 8601 (선택)' },
        end: { type: 'string', description: '종료일 ISO 8601 (선택)' },
      },
    },
  },
  {
    name: 'create_calendar_event',
    description: '캘린더 일정 생성',
    inputSchema: {
      type: 'object',
      properties: {
        department_id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        start_at: { type: 'string' },
        end_at: { type: 'string' },
        all_day: { type: 'boolean' },
        visibility: { type: 'string', enum: ['personal', 'department', 'company', 'shared'] },
      },
      required: ['department_id', 'title', 'start_at', 'end_at'],
    },
  },
  {
    name: 'list_tasks',
    description: '칸반 태스크 목록 조회',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: { type: 'string', description: '보드 ID (선택)' },
        assignee_id: { type: 'string', description: '담당자 ID (선택)' },
      },
    },
  },
  {
    name: 'create_task',
    description: '칸반 태스크 생성',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: { type: 'string' },
        column_id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        due_date: { type: 'string' },
      },
      required: ['board_id', 'column_id', 'title'],
    },
  },
  {
    name: 'update_task',
    description: '칸반 태스크 수정',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        column_id: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        assignee_id: { type: 'string' },
        due_date: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_boards',
    description: '칸반 보드 목록',
    inputSchema: {
      type: 'object',
      properties: {
        dept_id: { type: 'string', description: '부서 ID (선택)' },
      },
    },
  },
  {
    name: 'get_board',
    description: '보드 상세 (컬럼 포함)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'search_documents',
    description: '문서 전문 검색',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: '검색 쿼리' },
      },
      required: ['q'],
    },
  },
  {
    name: 'get_document',
    description: '문서 상세 조회',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_document',
    description: '문서 생성',
    inputSchema: {
      type: 'object',
      properties: {
        department_id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        parent_id: { type: 'string' },
      },
      required: ['department_id', 'title'],
    },
  },
  {
    name: 'update_document',
    description: '문서 수정',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_members',
    description: '조직 멤버 목록',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_departments',
    description: '부서 목록',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_vault_credentials',
    description: '비밀번호 금고 메타데이터 목록 (비밀번호 미포함)',
    inputSchema: {
      type: 'object',
      properties: {
        dept_id: { type: 'string', description: '부서 ID (선택)' },
      },
    },
  },
  {
    name: 'log_telegram_command',
    description: '텔레그램 명령 로그 기록',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'string' },
        telegram_user_id: { type: 'string' },
        command: { type: 'string' },
        args: { type: 'string' },
        response_summary: { type: 'string' },
      },
      required: ['chat_id', 'telegram_user_id'],
    },
  },
  {
    name: 'resolve_telegram_user',
    description: '텔레그램 사용자 -> 이코드 사용자 매핑 조회',
    inputSchema: {
      type: 'object',
      properties: {
        telegram_user_id: { type: 'string' },
      },
      required: ['telegram_user_id'],
    },
  },
]

// ── Tool execution ──────────────────────────────────────────

type ToolResult = { content: Array<{ type: 'text'; text: string }> }

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  orgId: string,
  scopes: string[],
  db: D1Database,
): Promise<ToolResult> {
  const text = (data: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  })

  switch (toolName) {
    // ── Calendar ──────────────────────────────────────────
    case 'list_calendar_events': {
      if (!checkScope(scopes, 'calendar:read')) throw new Error('Insufficient scope: calendar:read required')

      let query = `SELECT e.* FROM events e
        JOIN departments d ON d.id = e.department_id
        WHERE d.org_id = ?`
      const params: unknown[] = [orgId]

      if (args.dept_id) { query += ' AND e.department_id = ?'; params.push(args.dept_id) }
      if (args.start) { query += ' AND e.end_at >= ?'; params.push(args.start) }
      if (args.end) { query += ' AND e.start_at <= ?'; params.push(args.end) }

      query += ' ORDER BY e.start_at LIMIT 100'
      const { results } = await db.prepare(query).bind(...params).all()
      return text({ events: results })
    }

    case 'create_calendar_event': {
      if (!checkScope(scopes, 'calendar:write')) throw new Error('Insufficient scope: calendar:write required')
      if (!args.department_id || !args.title || !args.start_at || !args.end_at) {
        throw new Error('department_id, title, start_at, end_at are required')
      }

      const dept = await db.prepare('SELECT id FROM departments WHERE id = ? AND org_id = ?')
        .bind(args.department_id, orgId).first()
      if (!dept) throw new Error('Department not found in organization')

      const id = generateId()
      await db.prepare(`
        INSERT INTO events (id, department_id, user_id, title, description, start_at, end_at, all_day, color, created_at, updated_at)
        VALUES (?, ?, 'ai-mcp', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        id,
        args.department_id,
        args.title,
        (args.description as string) || '',
        args.start_at,
        args.end_at,
        args.all_day ? 1 : 0,
        '#3B82F6',
      ).run()

      const event = await db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first()
      return text({ event })
    }

    // ── Tasks ────────────────────────────────────────────
    case 'list_tasks': {
      if (!checkScope(scopes, 'kanban:read')) throw new Error('Insufficient scope: kanban:read required')

      let query = `SELECT t.*, u.name as assignee_name FROM tasks t
        JOIN boards b ON b.id = t.board_id
        JOIN departments d ON d.id = b.department_id
        LEFT JOIN users u ON u.id = t.assignee_id
        WHERE d.org_id = ?`
      const params: unknown[] = [orgId]

      if (args.board_id) { query += ' AND t.board_id = ?'; params.push(args.board_id) }
      if (args.assignee_id) { query += ' AND t.assignee_id = ?'; params.push(args.assignee_id) }

      query += ' ORDER BY t.updated_at DESC LIMIT 100'
      const { results } = await db.prepare(query).bind(...params).all()
      return text({ tasks: results })
    }

    case 'create_task': {
      if (!checkScope(scopes, 'kanban:write')) throw new Error('Insufficient scope: kanban:write required')
      if (!args.board_id || !args.column_id || !args.title) {
        throw new Error('board_id, column_id, title are required')
      }

      const board = await db.prepare(`
        SELECT b.id FROM boards b
        JOIN departments d ON d.id = b.department_id
        WHERE b.id = ? AND d.org_id = ?
      `).bind(args.board_id, orgId).first()
      if (!board) throw new Error('Board not found in organization')

      const col = await db.prepare('SELECT id FROM board_columns WHERE id = ? AND board_id = ?')
        .bind(args.column_id, args.board_id).first()
      if (!col) throw new Error('Column not found in board')

      const id = generateId()
      await db.prepare(`
        INSERT INTO tasks (id, board_id, column_id, title, description, assignee_id, priority, labels, due_date, order_index, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        id,
        args.board_id,
        args.column_id,
        args.title,
        (args.description as string) || '',
        (args.assignee_id as string) || null,
        (args.priority as string) || 'medium',
        '[]',
        (args.due_date as string) || null,
        0,
      ).run()

      const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first()
      return text({ task })
    }

    case 'update_task': {
      if (!checkScope(scopes, 'kanban:write')) throw new Error('Insufficient scope: kanban:write required')
      if (!args.id) throw new Error('id is required')

      const existing = await db.prepare(`
        SELECT t.id FROM tasks t
        JOIN boards b ON b.id = t.board_id
        JOIN departments d ON d.id = b.department_id
        WHERE t.id = ? AND d.org_id = ?
      `).bind(args.id, orgId).first()
      if (!existing) throw new Error('Task not found')

      const allowedFields = ['title', 'description', 'column_id', 'assignee_id', 'priority', 'due_date', 'order_index']
      const sets: string[] = []
      const params: unknown[] = []

      for (const field of allowedFields) {
        if (args[field] !== undefined) {
          sets.push(`${field} = ?`)
          params.push(args[field])
        }
      }

      if (sets.length === 0) throw new Error('No valid fields to update')

      sets.push("updated_at = datetime('now')")
      params.push(args.id)

      await db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()
      const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').bind(args.id).first()
      return text({ task })
    }

    // ── Boards ───────────────────────────────────────────
    case 'list_boards': {
      if (!checkScope(scopes, 'kanban:read')) throw new Error('Insufficient scope: kanban:read required')

      let query = `SELECT b.* FROM boards b
        JOIN departments d ON d.id = b.department_id
        WHERE d.org_id = ?`
      const params: unknown[] = [orgId]

      if (args.dept_id) { query += ' AND b.department_id = ?'; params.push(args.dept_id) }

      query += ' ORDER BY b.created_at DESC LIMIT 100'
      const { results } = await db.prepare(query).bind(...params).all()
      return text({ boards: results })
    }

    case 'get_board': {
      if (!checkScope(scopes, 'kanban:read')) throw new Error('Insufficient scope: kanban:read required')
      if (!args.id) throw new Error('id is required')

      const boardRow = await db.prepare(`
        SELECT b.* FROM boards b
        JOIN departments d ON d.id = b.department_id
        WHERE b.id = ? AND d.org_id = ?
      `).bind(args.id, orgId).first()
      if (!boardRow) throw new Error('Board not found')

      const { results: columns } = await db.prepare(
        'SELECT * FROM board_columns WHERE board_id = ? ORDER BY order_index',
      ).bind(args.id).all()

      return text({ board: boardRow, columns })
    }

    // ── Documents ────────────────────────────────────────
    case 'search_documents': {
      if (!checkScope(scopes, 'docs:read')) throw new Error('Insufficient scope: docs:read required')
      if (!args.q) throw new Error('q is required')

      const { results } = await db.prepare(`
        SELECT d.id, d.title, d.department_id, d.created_at,
               snippet(documents_fts, 1, '<mark>', '</mark>', '...', 32) as snippet
        FROM documents_fts fts
        JOIN documents d ON d.rowid = fts.rowid
        JOIN departments dept ON dept.id = d.department_id
        WHERE documents_fts MATCH ? AND dept.org_id = ?
        ORDER BY rank LIMIT 20
      `).bind(args.q, orgId).all()

      return text({ documents: results })
    }

    case 'get_document': {
      if (!checkScope(scopes, 'docs:read')) throw new Error('Insufficient scope: docs:read required')
      if (!args.id) throw new Error('id is required')

      const doc = await db.prepare(`
        SELECT d.* FROM documents d
        JOIN departments dept ON dept.id = d.department_id
        WHERE d.id = ? AND dept.org_id = ?
      `).bind(args.id, orgId).first()
      if (!doc) throw new Error('Document not found')

      return text({ document: doc })
    }

    case 'create_document': {
      if (!checkScope(scopes, 'docs:write')) throw new Error('Insufficient scope: docs:write required')
      if (!args.department_id || !args.title) {
        throw new Error('department_id and title are required')
      }

      const dept = await db.prepare('SELECT id FROM departments WHERE id = ? AND org_id = ?')
        .bind(args.department_id, orgId).first()
      if (!dept) throw new Error('Department not found in organization')

      const id = generateId()
      await db.prepare(`
        INSERT INTO documents (id, department_id, parent_id, title, content, is_folder, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 'ai-mcp', datetime('now'), datetime('now'))
      `).bind(
        id,
        args.department_id,
        (args.parent_id as string) || null,
        args.title,
        (args.content as string) || '',
      ).run()

      const doc = await db.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first()
      return text({ document: doc })
    }

    case 'update_document': {
      if (!checkScope(scopes, 'docs:write')) throw new Error('Insufficient scope: docs:write required')
      if (!args.id) throw new Error('id is required')

      const existingDoc = await db.prepare(`
        SELECT d.id FROM documents d
        JOIN departments dept ON dept.id = d.department_id
        WHERE d.id = ? AND dept.org_id = ?
      `).bind(args.id, orgId).first()
      if (!existingDoc) throw new Error('Document not found')

      const allowedFields = ['title', 'content', 'parent_id', 'order_index']
      const sets: string[] = []
      const params: unknown[] = []

      for (const field of allowedFields) {
        if (args[field] !== undefined) {
          sets.push(`${field} = ?`)
          params.push(args[field])
        }
      }

      if (sets.length === 0) throw new Error('No valid fields to update')

      sets.push("updated_at = datetime('now')")
      params.push(args.id)

      await db.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()
      const doc = await db.prepare('SELECT * FROM documents WHERE id = ?').bind(args.id).first()
      return text({ document: doc })
    }

    // ── Members / Departments ────────────────────────────
    case 'list_members': {
      if (!checkScope(scopes, 'members:read')) throw new Error('Insufficient scope: members:read required')

      const { results } = await db.prepare(
        'SELECT id, name, email, avatar_url, is_ceo, created_at FROM users WHERE org_id = ? ORDER BY name',
      ).bind(orgId).all()

      return text({ members: results })
    }

    case 'list_departments': {
      if (!checkScope(scopes, 'departments:read')) throw new Error('Insufficient scope: departments:read required')

      const { results } = await db.prepare(
        'SELECT id, name, slug, color, order_index, created_at FROM departments WHERE org_id = ? ORDER BY order_index',
      ).bind(orgId).all()

      return text({ departments: results })
    }

    // ── Vault ────────────────────────────────────────────
    case 'list_vault_credentials': {
      if (!checkScope(scopes, 'vault:read')) throw new Error('Insufficient scope: vault:read required')

      let query = `SELECT c.id, c.department_id, c.service_name, c.url, c.created_by, c.created_at, c.updated_at
        FROM credentials c
        JOIN departments d ON d.id = c.department_id
        WHERE d.org_id = ?`
      const params: unknown[] = [orgId]

      if (args.dept_id) { query += ' AND c.department_id = ?'; params.push(args.dept_id) }

      query += ' ORDER BY c.service_name LIMIT 100'
      const { results } = await db.prepare(query).bind(...params).all()
      return text({ credentials: results })
    }

    // ── Telegram ─────────────────────────────────────────
    case 'log_telegram_command': {
      if (!checkScope(scopes, 'telegram:write')) throw new Error('Insufficient scope: telegram:write required')
      if (!args.chat_id || !args.telegram_user_id) {
        throw new Error('chat_id and telegram_user_id are required')
      }

      const id = generateId()
      await db.prepare(`
        INSERT INTO telegram_command_log (id, org_id, chat_id, telegram_user_id, user_id, command, args, response_summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        orgId,
        args.chat_id,
        args.telegram_user_id,
        null,
        (args.command as string) || '',
        (args.args as string) || '',
        (args.response_summary as string) || '',
      ).run()

      const log = await db.prepare('SELECT * FROM telegram_command_log WHERE id = ?').bind(id).first()
      return text({ log })
    }

    case 'resolve_telegram_user': {
      if (!checkScope(scopes, 'telegram:read')) throw new Error('Insufficient scope: telegram:read required')
      if (!args.telegram_user_id) throw new Error('telegram_user_id is required')

      const mapping = await db.prepare(
        'SELECT * FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1',
      ).bind(orgId, args.telegram_user_id).first()

      if (!mapping) return text({ mapping: null, user: null })

      let user = null
      if (mapping.user_id) {
        user = await db.prepare(
          'SELECT id, name, email, avatar_url, is_ceo, created_at FROM users WHERE id = ? AND org_id = ?',
        ).bind(mapping.user_id, orgId).first()
      }

      return text({ mapping, user })
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}

// ── Main MCP endpoint ───────────────────────────────────────

mcpRoutes.post('/', async (c) => {
  // Authenticate via API key
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ek_')) {
    return c.json(jsonRpcError(null, -32000, 'Invalid API key format'), 401)
  }

  const apiKey = authHeader.slice(7)
  const keyHashValue = await hashKey(apiKey)

  const row = await c.env.DB.prepare(
    'SELECT ak.org_id, ak.scopes FROM api_keys ak WHERE ak.key_hash = ?',
  ).bind(keyHashValue).first<{ org_id: string; scopes: string }>()

  if (!row) {
    return c.json(jsonRpcError(null, -32000, 'Invalid API key'), 401)
  }

  const orgId = row.org_id
  const scopes: string[] = JSON.parse(row.scopes)

  // Parse JSON-RPC request
  let rpcReq: JsonRpcRequest
  try {
    rpcReq = await c.req.json<JsonRpcRequest>()
  } catch {
    return c.json(jsonRpcError(null, -32700, 'Parse error'))
  }

  if (rpcReq.jsonrpc !== '2.0' || !rpcReq.method) {
    return c.json(jsonRpcError(rpcReq.id ?? null, -32600, 'Invalid request'))
  }

  const reqId = rpcReq.id ?? null

  // Handle MCP methods
  switch (rpcReq.method) {
    case 'initialize':
      return c.json(jsonRpcSuccess(reqId, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'ecode-internal', version: '1.0.0' },
      }))

    case 'notifications/initialized':
      // Client acknowledgement; no response needed for notifications but we return success
      return c.json(jsonRpcSuccess(reqId, {}))

    case 'tools/list':
      return c.json(jsonRpcSuccess(reqId, { tools: TOOLS }))

    case 'tools/call': {
      const params = rpcReq.params as { name?: string; arguments?: Record<string, unknown> } | undefined
      if (!params?.name) {
        return c.json(jsonRpcError(reqId, -32602, 'Missing tool name in params'))
      }

      const toolDef = TOOLS.find(t => t.name === params.name)
      if (!toolDef) {
        return c.json(jsonRpcError(reqId, -32602, `Unknown tool: ${params.name}`))
      }

      try {
        const result = await executeTool(params.name, params.arguments || {}, orgId, scopes, c.env.DB)
        return c.json(jsonRpcSuccess(reqId, result))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Tool execution failed'
        return c.json(jsonRpcSuccess(reqId, {
          content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
          isError: true,
        }))
      }
    }

    default:
      return c.json(jsonRpcError(reqId, -32601, `Method not found: ${rpcReq.method}`))
  }
})
