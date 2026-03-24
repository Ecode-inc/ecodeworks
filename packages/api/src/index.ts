import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'
import { authRoutes } from './routes/auth'
import { organizationsRoutes } from './routes/organizations'
import { departmentsRoutes } from './routes/departments'
import { membersRoutes } from './routes/members'
import { calendarRoutes } from './routes/calendar'
import { googleCalendarRoutes } from './routes/googleCalendar'
import { boardsRoutes } from './routes/boards'
import { tasksRoutes } from './routes/tasks'
import { documentsRoutes } from './routes/documents'
import { credentialsRoutes } from './routes/credentials'
import { qaRoutes } from './routes/qa'
import { aiRoutes } from './routes/ai'
import { aiKeysRoutes } from './routes/aiKeys'
import { telegramRoutes } from './routes/telegram'
import { superAdminRoutes } from './routes/superAdmin'
import { joinRequestsRoutes } from './routes/joinRequests'
import { positionsRoutes } from './routes/positions'
import { mcpRoutes } from './routes/mcp'
import { attendanceRoutes } from './routes/attendance'
import { leaveRoutes } from './routes/leave'
import { purchasesRoutes } from './routes/purchases'
import { docImagesRoutes } from './routes/docImages'
import { docFilesRoutes } from './routes/docFiles'
import { bankingRoutes } from './routes/banking'
import { WebSocketRoom } from './durable/WebSocketRoom'

const app = new Hono<{ Bindings: Env }>()

// CORS
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err.message, err.stack)
  return c.json({ error: err.message }, 500)
})

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'ecode-internal-api' }))

// Phase 1: Auth + RBAC
app.route('/api/auth', authRoutes)
app.route('/api/organizations', organizationsRoutes)
app.route('/api/departments', departmentsRoutes)
app.route('/api/members', membersRoutes)

// Phase 2: Calendar
app.route('/api/calendar', calendarRoutes)
app.route('/api/calendar/google', googleCalendarRoutes)

// Phase 3: Kanban
app.route('/api/boards', boardsRoutes)
app.route('/api/tasks', tasksRoutes)

// Phase 4: Documents
app.route('/api/docs', documentsRoutes)

// OG meta for link preview (Telegram, etc.) - serves HTML with meta tags
app.get('/share/:token', async (c) => {
  const token = c.req.param('token')
  const share = await c.env.DB.prepare(
    'SELECT * FROM doc_share_links WHERE token = ? AND is_active = 1'
  ).bind(token).first<{ document_id: string; expires_at: string | null }>()

  let title = '이코드웍스 - 공유 문서'
  let description = '공유된 문서를 확인하세요'

  if (share && (!share.expires_at || new Date(share.expires_at) >= new Date())) {
    const doc = await c.env.DB.prepare('SELECT title, content FROM documents WHERE id = ?').bind(share.document_id).first<{ title: string; content: string }>()
    if (doc) {
      title = `${doc.title} - 이코드웍스`
      description = (doc.content || '').replace(/[#*_`\[\]]/g, '').slice(0, 150)
    }
  }

  const safeTitle = title.replace(/"/g, '&quot;')
  const safeDesc = description.replace(/"/g, '&quot;')

  return c.html(`<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8"><title>${safeTitle}</title>
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDesc}">
<meta property="og:type" content="article">
<meta property="og:url" content="https://work.e-code.kr/share/${token}">
<meta name="description" content="${safeDesc}">
<meta http-equiv="refresh" content="0;url=https://work.e-code.kr/share/${token}">
</head><body>Redirecting...</body></html>`)
})

// Public share link JSON API (no auth required)
app.get('/api/share/:token', async (c) => {
  const token = c.req.param('token')
  const share = await c.env.DB.prepare(
    'SELECT * FROM doc_share_links WHERE token = ? AND is_active = 1'
  ).bind(token).first<{ document_id: string; expires_at: string | null }>()

  if (!share) {
    return c.json({ error: '링크가 만료되었거나 유효하지 않습니다' }, 404)
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return c.json({ error: '링크가 만료되었거나 유효하지 않습니다' }, 410)
  }

  const doc = await c.env.DB.prepare(
    'SELECT id, title, content, created_at, updated_at FROM documents WHERE id = ?'
  ).bind(share.document_id).first()

  if (!doc) {
    return c.json({ error: '문서를 찾을 수 없습니다' }, 404)
  }

  return c.json({ document: doc })
})

// Phase 5: Vault
app.route('/api/vault', credentialsRoutes)

// Phase 6: QA proxy
app.route('/api/qa', qaRoutes)

// Phase 7: AI API
app.route('/api/v1', aiRoutes)
app.route('/api/ai/keys', aiKeysRoutes)

// Phase 8: Telegram integration
app.route('/api/telegram', telegramRoutes)

// Phase 9: Super Admin (SaaS management)
app.route('/api/super', superAdminRoutes)

// Phase 10: MCP (Model Context Protocol) server
app.route('/api/mcp', mcpRoutes)

// Attendance
app.route('/api/attendance', attendanceRoutes)

// Leave / Approval
app.route('/api/leave', leaveRoutes)

// Purchases
app.route('/api/purchases', purchasesRoutes)

// Document Images
app.route('/api/doc-images', docImagesRoutes)

// Document Files
app.route('/api/doc-files', docFilesRoutes)

// Positions
app.route('/api/positions', positionsRoutes)

// Join Requests
app.route('/api/join-requests', joinRequestsRoutes)

// Banking (Open Banking)
app.route('/api/banking', bankingRoutes)

// File serving from R2
app.get('/api/files/*', async (c) => {
  const key = c.req.path.replace('/api/files/', '')
  const object = await c.env.FILES.get(key)
  if (!object) return c.json({ error: 'Not found' }, 404)
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control', 'public, max-age=86400')
  return new Response(object.body, { headers })
})

// WebSocket upgrade (department-scoped rooms)
app.get('/ws', async (c) => {
  const deptId = c.req.query('dept_id')
  const token = c.req.query('token')

  if (!deptId || !token) {
    return c.json({ error: 'Missing dept_id or token' }, 400)
  }

  const { verifyJWT } = await import('./lib/jwt')
  try {
    const payload = await verifyJWT(token, c.env.JWT_SECRET)
    const id = c.env.WEBSOCKET_ROOM.idFromName(deptId)
    const room = c.env.WEBSOCKET_ROOM.get(id)

    const url = new URL(c.req.url)
    url.searchParams.set('user_id', payload.sub)
    const newRequest = new Request(url.toString(), c.req.raw)
    return room.fetch(newRequest)
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

export default app
export { WebSocketRoom }
