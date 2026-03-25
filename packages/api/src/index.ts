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
import { aiBoardRoutes } from './routes/aiBoard'
import { WebSocketRoom } from './durable/WebSocketRoom'

const app = new Hono<{ Bindings: Env }>()

// CORS
app.use('/*', cors({
  origin: (origin) => {
    const allowed = ['https://work.e-code.kr', 'https://ecode-internal.pages.dev']
    return allowed.includes(origin) || origin?.endsWith('.ecode-internal.pages.dev') ? origin : 'https://work.e-code.kr'
  },
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Vault-Token'],
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
    'SELECT s.*, d.department_id FROM doc_share_links s LEFT JOIN documents d ON d.id = s.document_id WHERE s.token = ? AND s.is_active = 1'
  ).bind(token).first<{ document_id: string; expires_at: string | null; department_id: string }>()

  let title = '이코드웍스 - 공유 문서'
  let description = '공유된 문서를 확인하세요'
  let ogImage = ''
  let siteName = '이코드웍스'

  if (share && (!share.expires_at || new Date(share.expires_at) >= new Date())) {
    const doc = await c.env.DB.prepare('SELECT title, content FROM documents WHERE id = ?').bind(share.document_id).first<{ title: string; content: string }>()
    if (doc) {
      title = doc.title
      // Strip markdown syntax and extract meaningful text
      const cleanContent = (doc.content || '')
        .replace(/!\[.*?\]\(.*?\)/g, '') // remove images
        .replace(/\[([^\]]*)\]\(.*?\)/g, '$1') // links → text
        .replace(/#{1,6}\s*/g, '') // headings
        .replace(/[*_`~>|]/g, '') // formatting chars
        .replace(/\n+/g, ' ') // newlines → space
        .trim()
      description = cleanContent.slice(0, 200) || '공유된 문서를 확인하세요'
    }

    // Get org logo for OG image
    if (share.department_id) {
      const dept = await c.env.DB.prepare('SELECT org_id FROM departments WHERE id = ?').bind(share.department_id).first<{ org_id: string }>()
      if (dept) {
        const org = await c.env.DB.prepare('SELECT name, logo_url FROM organizations WHERE id = ?').bind(dept.org_id).first<{ name: string; logo_url: string }>()
        if (org) {
          siteName = org.name || '이코드웍스'
          if (org.logo_url) {
            ogImage = `https://ecode-internal-api.justin21lee.workers.dev${org.logo_url.replace(/^\/api/, '/api')}`
          }
        }
      }
    }
  }

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeTitle = esc(title)
  const safeDesc = esc(description)
  const safeSiteName = esc(siteName)

  return c.html(`<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8"><title>${safeTitle} - ${safeSiteName}</title>
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDesc}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${safeSiteName}">
<meta property="og:url" content="https://work.e-code.kr/share/${token}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">\n<meta property="og:image:width" content="200">\n<meta property="og:image:height" content="200">` : ''}
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDesc}">
${ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}">` : ''}
<meta name="description" content="${safeDesc}">
</head><body><script>window.location.replace("https://work.e-code.kr/view/${token}")</script><noscript><a href="https://work.e-code.kr/view/${token}">문서 보기</a></noscript></body></html>`)
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

// AI Board (authenticated)
app.route('/api/ai-board', aiBoardRoutes)

// AI Board public read-only (no auth required)
app.get('/api/ai-board-public', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100)
  const offset = parseInt(c.req.query('offset') || '0')
  const tag = c.req.query('tag') || ''

  let query = `SELECT p.id, p.title, p.content, p.author_name, p.is_ai, p.likes, p.tags, p.created_at,
       (SELECT COUNT(*) FROM ai_board_comments c WHERE c.post_id = p.id) as comment_count
     FROM ai_board_posts p`
  const params: unknown[] = []

  if (tag) {
    query += ` WHERE p.tags LIKE ?`
    params.push(`%"${tag}"%`)
  }

  query += ` ORDER BY p.pinned DESC, p.created_at DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const { results: posts } = await c.env.DB.prepare(query).bind(...params).all()

  // Collect all unique tags
  const allTagsSet = new Set<string>()
  const { results: allPosts } = await c.env.DB.prepare(
    'SELECT tags FROM ai_board_posts WHERE tags != \'[]\' AND tags IS NOT NULL'
  ).all()
  for (const p of allPosts) {
    try { const arr = JSON.parse((p as any).tags || '[]'); arr.forEach((t: string) => allTagsSet.add(t)) } catch {}
  }

  // Get org logo
  let logo_url = ''
  if (posts.length > 0) {
    const firstPost = await c.env.DB.prepare('SELECT org_id FROM ai_board_posts WHERE id = ?').bind((posts[0] as any).id).first<{ org_id: string }>()
    if (firstPost) {
      const org = await c.env.DB.prepare('SELECT logo_url FROM organizations WHERE id = ?').bind(firstPost.org_id).first<{ logo_url: string }>()
      if (org?.logo_url) logo_url = `https://ecode-internal-api.justin21lee.workers.dev${org.logo_url.replace(/^\/api/, '/api')}`
    }
  }

  return c.json({ posts, logo_url, all_tags: Array.from(allTagsSet).sort() })
})

app.get('/api/ai-board-public/:id', async (c) => {
  const id = c.req.param('id')
  const post = await c.env.DB.prepare(
    `SELECT id, title, content, author_name, is_ai, likes, tags, created_at FROM ai_board_posts WHERE id = ?`
  ).bind(id).first()
  if (!post) return c.json({ error: 'Not found' }, 404)
  const { results: comments } = await c.env.DB.prepare(
    'SELECT id, author_name, is_ai, content, created_at FROM ai_board_comments WHERE post_id = ? ORDER BY created_at ASC'
  ).bind(id).all()
  return c.json({ post, comments })
})

// Public like (IP-based, no auth)
app.post('/api/ai-board-public/:id/like', async (c) => {
  const id = c.req.param('id')
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'

  const post = await c.env.DB.prepare('SELECT id FROM ai_board_posts WHERE id = ?').bind(id).first()
  if (!post) return c.json({ error: 'Not found' }, 404)

  const existing = await c.env.DB.prepare(
    "SELECT id FROM ai_board_likes WHERE post_id = ? AND ip_address = ? AND user_id = ''"
  ).bind(id, ip).first()

  if (existing) {
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM ai_board_likes WHERE post_id = ? AND ip_address = ? AND user_id = ''").bind(id, ip),
      c.env.DB.prepare('UPDATE ai_board_posts SET likes = MAX(0, likes - 1) WHERE id = ?').bind(id),
    ])
  } else {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO ai_board_likes (post_id, user_id, ip_address) VALUES (?, '', ?)").bind(id, ip),
      c.env.DB.prepare('UPDATE ai_board_posts SET likes = likes + 1 WHERE id = ?').bind(id),
    ])
  }

  const updated = await c.env.DB.prepare('SELECT likes FROM ai_board_posts WHERE id = ?').bind(id).first<{ likes: number }>()
  return c.json({ likes: updated?.likes || 0, liked: !existing })
})

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
