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
import { encrypt, decrypt } from '../lib/crypto'

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
    description: '캘린더 일정 목록 조회. context=group이면 개인일정 제외, context=private이면 해당 user_id의 개인일정 포함.',
    inputSchema: {
      type: 'object',
      properties: {
        dept_id: { type: 'string', description: '부서 ID (선택)' },
        start: { type: 'string', description: '시작일 ISO 8601 (선택)' },
        end: { type: 'string', description: '종료일 ISO 8601 (선택)' },
        context: { type: 'string', enum: ['group', 'private'], description: 'group=그룹방(개인일정 제외), private=1:1(개인일정 포함)' },
        user_id: { type: 'string', description: 'private context에서 개인일정을 볼 사용자 ID' },
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
    name: 'set_vault_pin',
    description: '금고 PIN 설정 (4-8자리 숫자)',
    inputSchema: {
      type: 'object',
      properties: {
        pin: { type: 'string', description: '4-8자리 숫자 PIN' },
        telegram_user_id: { type: 'string', description: '텔레그램 사용자 ID' },
        user_id: { type: 'string', description: '이코드 사용자 ID' },
        email: { type: 'string', description: '이메일' },
      },
      required: ['pin'],
    },
  },
  {
    name: 'create_credential',
    description: '금고에 자격증명 생성',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: { type: 'string', description: '서비스 이름' },
        username: { type: 'string', description: '사용자명' },
        password: { type: 'string', description: '비밀번호' },
        url: { type: 'string', description: 'URL (선택)' },
        telegram_user_id: { type: 'string', description: '텔레그램 사용자 ID' },
        user_id: { type: 'string', description: '이코드 사용자 ID' },
        email: { type: 'string', description: '이메일' },
      },
      required: ['service_name', 'username', 'password'],
    },
  },
  {
    name: 'view_credential',
    description: '금고 자격증명 조회 (PIN 필요)',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: { type: 'string', description: '서비스 이름' },
        pin: { type: 'string', description: '금고 PIN' },
        telegram_user_id: { type: 'string', description: '텔레그램 사용자 ID' },
        user_id: { type: 'string', description: '이코드 사용자 ID' },
        email: { type: 'string', description: '이메일' },
      },
      required: ['service_name', 'pin'],
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
    description: '텔레그램 사용자 -> 이코드 사용자 매핑 조회. telegram_user_id 또는 telegram_username(@없이)으로 검색.',
    inputSchema: {
      type: 'object',
      properties: {
        telegram_user_id: { type: 'string', description: '텔레그램 숫자 ID' },
        telegram_username: { type: 'string', description: '텔레그램 username (@없이, 예: SL)' },
      },
    },
  },
  {
    name: 'map_telegram_user',
    description: '텔레그램 사용자를 이코드 사용자에 매핑 등록/수정. "@SL 은 ecode@e-code.kr 매핑해줘" 같은 요청 처리용. email로 이코드 사용자를 찾아서 매핑.',
    inputSchema: {
      type: 'object',
      properties: {
        telegram_user_id: { type: 'string', description: '텔레그램 숫자 ID' },
        telegram_username: { type: 'string', description: '텔레그램 username (@없이)' },
        telegram_display_name: { type: 'string', description: '텔레그램 표시 이름' },
        email: { type: 'string', description: '매핑할 이코드 사용자 이메일' },
        user_id: { type: 'string', description: '매핑할 이코드 사용자 ID (email 대신 사용 가능)' },
      },
      required: ['telegram_user_id'],
    },
  },
  {
    name: 'unmap_telegram_user',
    description: '텔레그램 사용자 매핑 해제 (이코드 사용자 연결만 끊음, 기록은 유지)',
    inputSchema: {
      type: 'object',
      properties: {
        telegram_user_id: { type: 'string', description: '텔레그램 숫자 ID' },
      },
      required: ['telegram_user_id'],
    },
  },
  {
    name: 'list_telegram_mappings',
    description: '모든 텔레그램-이코드 사용자 매핑 목록 조회',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_folder_guide',
    description: '폴더의 AI 가이드 문서 조회. 해당 폴더의 콘텐츠를 어떻게 관리할지 가이드가 있으면 반환.',
    inputSchema: {
      type: 'object',
      properties: {
        parent_id: { type: 'string', description: '폴더 ID' },
      },
      required: ['parent_id'],
    },
  },
  {
    name: 'update_folder_guide',
    description: '폴더의 AI 가이드 문서 생성 또는 갱신',
    inputSchema: {
      type: 'object',
      properties: {
        parent_id: { type: 'string', description: '폴더 ID' },
        content: { type: 'string', description: '가이드 내용' },
      },
      required: ['parent_id', 'content'],
    },
  },
  {
    name: 'list_disciplines',
    description: '징계 내역 조회. 특정 사용자의 징계 목록을 확인합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: '사용자 ID (선택, 미지정 시 전체 조회)' },
      },
    },
  },
  {
    name: 'create_discipline',
    description: '징계 등록. 감봉, 연차삭감, 대표면담, 반성문 중 하나를 등록합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: '대상 사용자 ID' },
        type: { type: 'string', enum: ['감봉', '연차삭감', '대표면담', '반성문'], description: '징계 유형' },
        reason: { type: 'string', description: '징계 사유' },
        amount: { type: 'number', description: '감봉액(원) 또는 삭감 연차일수. 감봉/연차삭감 시 필수' },
        created_by: { type: 'string', description: '징계 등록자 (선택)' },
      },
      required: ['user_id', 'type'],
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
  env?: Env,
): Promise<ToolResult> {
  const text = (data: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  })

  // Get a real user_id for FK constraints
  const ceoRow = await db.prepare('SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1').bind(orgId).first<{ id: string }>()
  const ceoId = ceoRow?.id || (await db.prepare('SELECT id FROM users WHERE org_id = ? LIMIT 1').bind(orgId).first<{ id: string }>())?.id || ''

  switch (toolName) {
    // ── Calendar ──────────────────────────────────────────
    case 'list_calendar_events': {
      if (!checkScope(scopes, 'calendar:read')) throw new Error('Insufficient scope: calendar:read required')

      let query = `SELECT e.* FROM events e
        JOIN departments d ON d.id = e.department_id
        WHERE d.org_id = ?`
      const params: unknown[] = [orgId]

      // Privacy: group context hides personal events, private shows only for that user
      if (args.context === 'group') {
        query += " AND e.visibility != 'personal'"
      } else if (args.context === 'private' && args.user_id) {
        query += " AND (e.visibility != 'personal' OR e.user_id = ?)"
        params.push(args.user_id)
      }

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
        VALUES (?, ?, ceoId, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
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
        VALUES (?, ?, ?, ?, ?, 0, ceoId, datetime('now'), datetime('now'))
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

    case 'set_vault_pin': {
      if (!checkScope(scopes, 'vault:write') && !checkScope(scopes, 'telegram:write')) throw new Error('Insufficient scope')
      const pinVal = String(args.pin || '')
      if (!pinVal || !/^\d{4,8}$/.test(pinVal)) throw new Error('PIN must be 4-8 digits')

      // Resolve user
      let userId = args.user_id as string | undefined
      if (!userId && args.telegram_user_id) {
        const mapping = await db.prepare('SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1').bind(orgId, args.telegram_user_id).first<{ user_id: string }>()
        if (!mapping?.user_id) throw new Error('Telegram user mapping not found')
        userId = mapping.user_id
      }
      if (!userId && args.email) {
        const user = await db.prepare('SELECT id FROM users WHERE org_id = ? AND email = ?').bind(orgId, args.email).first<{ id: string }>()
        if (!user) throw new Error(`User not found: ${args.email}`)
        userId = user.id
      }
      if (!userId) throw new Error('telegram_user_id, user_id, or email required')

      const encoder = new TextEncoder()
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(pinVal))
      const pinHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
      await db.prepare('UPDATE users SET vault_pin_hash = ? WHERE id = ? AND org_id = ?').bind(pinHash, userId, orgId).run()
      return text({ success: true, message: 'Vault PIN set' })
    }

    case 'create_credential': {
      if (!checkScope(scopes, 'vault:write') && !checkScope(scopes, 'telegram:write')) throw new Error('Insufficient scope')
      if (!args.service_name || !args.username || !args.password) throw new Error('service_name, username, password required')

      let userId = args.user_id as string | undefined
      if (!userId && args.telegram_user_id) {
        const mapping = await db.prepare('SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1').bind(orgId, args.telegram_user_id).first<{ user_id: string }>()
        if (!mapping?.user_id) throw new Error('Telegram user mapping not found')
        userId = mapping.user_id
      }
      if (!userId && args.email) {
        const user = await db.prepare('SELECT id FROM users WHERE org_id = ? AND email = ?').bind(orgId, args.email).first<{ id: string }>()
        if (!user) throw new Error(`User not found: ${args.email}`)
        userId = user.id
      }
      if (!userId) throw new Error('telegram_user_id, user_id, or email required')

      const dept = await db.prepare('SELECT department_id FROM user_departments WHERE user_id = ? LIMIT 1').bind(userId).first<{ department_id: string }>()
      if (!dept) throw new Error('User has no department')

      const credId = generateId()
      if (!env) throw new Error('Environment not available')
      const usernameEnc = await encrypt(args.username as string, env.VAULT_KEY)
      const passwordEnc = await encrypt(args.password as string, env.VAULT_KEY)

      await db.batch([
        db.prepare(`INSERT INTO credentials (id, department_id, service_name, url, username_enc, password_enc, notes_enc, created_by, visibility) VALUES (?, ?, ?, ?, ?, ?, '', ?, 'department')`).bind(credId, dept.department_id, args.service_name, args.url || '', usernameEnc, passwordEnc, userId),
        db.prepare('INSERT INTO credential_access_log (id, credential_id, user_id, action, ip_address) VALUES (?, ?, ?, ?, ?)').bind(generateId(), credId, userId, 'create', 'mcp'),
      ])
      return text({ success: true, credential: { id: credId, service_name: args.service_name, url: args.url || '' } })
    }

    case 'view_credential': {
      if (!checkScope(scopes, 'vault:read') && !checkScope(scopes, 'telegram:read')) throw new Error('Insufficient scope')
      if (!args.service_name) throw new Error('service_name required')
      if (!args.pin) throw new Error('pin required')

      let userId = args.user_id as string | undefined
      if (!userId && args.telegram_user_id) {
        const mapping = await db.prepare('SELECT user_id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1').bind(orgId, args.telegram_user_id).first<{ user_id: string }>()
        if (!mapping?.user_id) throw new Error('Telegram user mapping not found')
        userId = mapping.user_id
      }
      if (!userId && args.email) {
        const user = await db.prepare('SELECT id FROM users WHERE org_id = ? AND email = ?').bind(orgId, args.email).first<{ id: string }>()
        if (!user) throw new Error(`User not found: ${args.email}`)
        userId = user.id
      }
      if (!userId) throw new Error('telegram_user_id, user_id, or email required')

      // Verify PIN
      const dbUser = await db.prepare('SELECT vault_pin_hash FROM users WHERE id = ? AND org_id = ?').bind(userId, orgId).first<{ vault_pin_hash: string }>()
      if (!dbUser?.vault_pin_hash) throw new Error('Vault PIN not set')
      const encoder2 = new TextEncoder()
      const pinStr = String(args.pin)
      const hashBuffer2 = await crypto.subtle.digest('SHA-256', encoder2.encode(pinStr))
      const pinHash2 = Array.from(new Uint8Array(hashBuffer2)).map(b => b.toString(16).padStart(2, '0')).join('')
      if (pinHash2 !== dbUser.vault_pin_hash) throw new Error('Invalid PIN')

      const cred = await db.prepare(`SELECT c.* FROM credentials c JOIN departments d ON d.id = c.department_id WHERE d.org_id = ? AND c.service_name LIKE ? LIMIT 1`).bind(orgId, `%${args.service_name}%`).first<any>()
      if (!cred) throw new Error(`Credential not found: ${args.service_name}`)

      if (!env) throw new Error('Environment not available')
      const decUsername = await decrypt(cred.username_enc, env.VAULT_KEY)
      const decPassword = await decrypt(cred.password_enc, env.VAULT_KEY)
      const decNotes = cred.notes_enc ? await decrypt(cred.notes_enc, env.VAULT_KEY) : ''

      await db.prepare('INSERT INTO credential_access_log (id, credential_id, user_id, action, ip_address) VALUES (?, ?, ?, ?, ?)').bind(generateId(), cred.id, userId, 'view', 'mcp').run()

      return text({ credential: { id: cred.id, service_name: cred.service_name, url: cred.url, username: decUsername, password: decPassword, notes: decNotes } })
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

      let mapping: Record<string, unknown> | null = null

      // Search by telegram_user_id or telegram_username
      if (args.telegram_user_id) {
        mapping = await db.prepare(
          'SELECT * FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ? AND is_active = 1',
        ).bind(orgId, args.telegram_user_id).first()
      } else if (args.telegram_username) {
        mapping = await db.prepare(
          'SELECT * FROM telegram_user_mappings WHERE org_id = ? AND telegram_username = ? AND is_active = 1',
        ).bind(orgId, args.telegram_username).first()
      } else {
        throw new Error('telegram_user_id or telegram_username is required')
      }

      if (!mapping) return text({ mapping: null, user: null })

      let user = null
      if (mapping.user_id) {
        user = await db.prepare(
          'SELECT id, name, email, avatar_url, is_ceo, created_at FROM users WHERE id = ? AND org_id = ?',
        ).bind(mapping.user_id, orgId).first()
      }

      return text({ mapping, user })
    }

    case 'map_telegram_user': {
      if (!checkScope(scopes, 'telegram:write')) throw new Error('Insufficient scope: telegram:write required')
      if (!args.telegram_user_id) throw new Error('telegram_user_id is required')

      // Resolve ecode user by email or user_id
      let ecodeUserId: string | null = null
      if (args.email) {
        const user = await db.prepare(
          'SELECT id FROM users WHERE org_id = ? AND email = ?',
        ).bind(orgId, args.email).first<{ id: string }>()
        if (!user) throw new Error(`이코드 사용자를 찾을 수 없습니다: ${args.email}`)
        ecodeUserId = user.id
      } else if (args.user_id) {
        const user = await db.prepare(
          'SELECT id FROM users WHERE org_id = ? AND id = ?',
        ).bind(orgId, args.user_id).first<{ id: string }>()
        if (!user) throw new Error(`이코드 사용자를 찾을 수 없습니다: ${args.user_id}`)
        ecodeUserId = user.id
      }

      // Upsert mapping
      const existing = await db.prepare(
        'SELECT id FROM telegram_user_mappings WHERE org_id = ? AND telegram_user_id = ?',
      ).bind(orgId, args.telegram_user_id).first<{ id: string }>()

      if (existing) {
        // Update existing mapping
        const updates: string[] = []
        const vals: unknown[] = []
        if (ecodeUserId !== null) { updates.push('user_id = ?'); vals.push(ecodeUserId) }
        if (args.telegram_username) { updates.push('telegram_username = ?'); vals.push(args.telegram_username) }
        if (args.telegram_display_name) { updates.push('telegram_display_name = ?'); vals.push(args.telegram_display_name) }
        updates.push('is_active = 1')
        vals.push(existing.id)
        await db.prepare(`UPDATE telegram_user_mappings SET ${updates.join(', ')} WHERE id = ?`).bind(...vals).run()
      } else {
        // Create new mapping
        const id = generateId()
        await db.prepare(
          'INSERT INTO telegram_user_mappings (id, org_id, telegram_user_id, telegram_username, telegram_display_name, user_id) VALUES (?, ?, ?, ?, ?, ?)',
        ).bind(
          id, orgId, args.telegram_user_id,
          (args.telegram_username as string) || '',
          (args.telegram_display_name as string) || '',
          ecodeUserId,
        ).run()
      }

      // Return the result
      const result = await db.prepare(
        'SELECT m.*, u.name as user_name, u.email as user_email FROM telegram_user_mappings m LEFT JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.telegram_user_id = ?',
      ).bind(orgId, args.telegram_user_id).first()

      return text({ mapping: result, message: ecodeUserId ? '매핑 완료' : '텔레그램 사용자 등록됨 (이코드 사용자 미연결)' })
    }

    case 'unmap_telegram_user': {
      if (!checkScope(scopes, 'telegram:write')) throw new Error('Insufficient scope: telegram:write required')
      if (!args.telegram_user_id) throw new Error('telegram_user_id is required')

      await db.prepare(
        'UPDATE telegram_user_mappings SET user_id = NULL WHERE org_id = ? AND telegram_user_id = ?',
      ).bind(orgId, args.telegram_user_id).run()

      return text({ success: true, message: '매핑 해제 완료' })
    }

    case 'list_telegram_mappings': {
      if (!checkScope(scopes, 'telegram:read')) throw new Error('Insufficient scope: telegram:read required')

      const { results } = await db.prepare(
        'SELECT m.*, u.name as user_name, u.email as user_email FROM telegram_user_mappings m LEFT JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.is_active = 1 ORDER BY m.created_at',
      ).bind(orgId).all()

      return text({ mappings: results })
    }

    // ── Folder AI Guide ──────────────────────────────────
    case 'get_folder_guide': {
      if (!checkScope(scopes, 'docs:read')) throw new Error('Insufficient scope: docs:read required')
      if (!args.parent_id) throw new Error('parent_id is required')

      const guide = await db.prepare(
        "SELECT d.* FROM documents d JOIN departments dept ON dept.id = d.department_id WHERE d.parent_id = ? AND d.title = 'AI' AND dept.org_id = ?"
      ).bind(args.parent_id, orgId).first()

      return text({ document: guide || null })
    }

    case 'update_folder_guide': {
      if (!checkScope(scopes, 'docs:write')) throw new Error('Insufficient scope: docs:write required')
      if (!args.parent_id || !args.content) throw new Error('parent_id and content are required')

      // Check folder exists and belongs to org
      const folder = await db.prepare(
        "SELECT d.id, d.department_id FROM documents d JOIN departments dept ON dept.id = d.department_id WHERE d.id = ? AND d.is_folder = 1 AND dept.org_id = ?"
      ).bind(args.parent_id, orgId).first<{ id: string; department_id: string }>()
      if (!folder) throw new Error('Folder not found')

      // Check if AI guide already exists
      const existingGuide = await db.prepare(
        "SELECT d.id FROM documents d JOIN departments dept ON dept.id = d.department_id WHERE d.parent_id = ? AND d.title = 'AI' AND dept.org_id = ?"
      ).bind(args.parent_id, orgId).first<{ id: string }>()

      if (existingGuide) {
        await db.prepare(
          "UPDATE documents SET content = ?, updated_at = datetime('now') WHERE id = ?"
        ).bind(args.content, existingGuide.id).run()
        const doc = await db.prepare('SELECT * FROM documents WHERE id = ?').bind(existingGuide.id).first()
        return text({ document: doc })
      } else {
        const id = generateId()
        await db.prepare(
          "INSERT INTO documents (id, department_id, parent_id, title, content, is_folder, created_by, visibility, created_at, updated_at) VALUES (?, ?, ?, 'AI', ?, 0, ceoId, 'department', datetime('now'), datetime('now'))"
        ).bind(id, folder.department_id, args.parent_id, args.content).run()
        const doc = await db.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first()
        return text({ document: doc })
      }
    }

    case 'list_disciplines': {
      if (!checkScope(scopes, 'members:read')) throw new Error('Insufficient scope: members:read required')
      let query = 'SELECT d.*, u.name as user_name FROM disciplines d LEFT JOIN users u ON u.id = d.user_id WHERE d.org_id = ?'
      const params: unknown[] = [orgId]
      if (args.user_id) { query += ' AND d.user_id = ?'; params.push(args.user_id) }
      query += ' ORDER BY d.created_at DESC LIMIT 100'
      const { results } = await db.prepare(query).bind(...params).all()
      return text({ disciplines: results })
    }

    case 'create_discipline': {
      if (!checkScope(scopes, 'members:write')) throw new Error('Insufficient scope: members:write required')
      const validTypes = ['감봉', '연차삭감', '대표면담', '반성문']
      if (!args.user_id) throw new Error('user_id is required')
      if (!args.type || !validTypes.includes(args.type as string)) throw new Error(`type must be one of: ${validTypes.join(', ')}`)
      const user = await db.prepare('SELECT id, name FROM users WHERE id = ? AND org_id = ?').bind(args.user_id, orgId).first<{ id: string; name: string }>()
      if (!user) throw new Error('해당 조직에 사용자를 찾을 수 없습니다')
      const did = generateId()
      await db.prepare('INSERT INTO disciplines (id, org_id, user_id, type, reason, amount, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))').bind(did, orgId, args.user_id, args.type, args.reason || '', args.amount || 0, args.created_by || '').run()
      const discipline = await db.prepare('SELECT d.*, u.name as user_name FROM disciplines d LEFT JOIN users u ON u.id = d.user_id WHERE d.id = ?').bind(did).first()
      return text({ success: true, discipline })
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
        const result = await executeTool(params.name, params.arguments || {}, orgId, scopes, c.env.DB, c.env)
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
