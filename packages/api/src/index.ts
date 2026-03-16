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
import { WebSocketRoom } from './durable/WebSocketRoom'

const app = new Hono<{ Bindings: Env }>()

// CORS
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

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

// Phase 5: Vault
app.route('/api/vault', credentialsRoutes)

// Phase 6: QA proxy
app.route('/api/qa', qaRoutes)

// Phase 7: AI API
app.route('/api/v1', aiRoutes)

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
