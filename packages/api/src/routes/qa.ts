import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'

type Variables = { user: AuthUser }

export const qaRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

qaRoutes.use('/*', authMiddleware)

// Proxy to QA Dashboard API
async function proxyToQA(env: Env, path: string, init?: RequestInit): Promise<Response> {
  if (!env.QA_API_URL) {
    return new Response(JSON.stringify({ error: 'QA_API_URL not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = `${env.QA_API_URL}/api${path}`
  return fetch(url, init)
}

// List QA projects
qaRoutes.get('/projects', async (c) => {
  const res = await proxyToQA(c.env, '/projects')
  const data = await res.json()
  return c.json(data)
})

// Get QA project issues
qaRoutes.get('/projects/:id/issues', async (c) => {
  const projectId = c.req.param('id')
  const status = c.req.query('status')
  const path = `/issues/project/${projectId}${status ? `?status=${status}` : ''}`
  const res = await proxyToQA(c.env, path)
  const data = await res.json()
  return c.json(data)
})

// QA stats
qaRoutes.get('/stats', async (c) => {
  const res = await proxyToQA(c.env, '/projects')
  const data = await res.json() as { projects: any[] }

  // Aggregate stats across projects
  const stats = {
    totalProjects: data.projects?.length || 0,
    projects: data.projects || [],
  }

  return c.json({ stats })
})
