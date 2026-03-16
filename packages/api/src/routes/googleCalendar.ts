import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { encrypt, decrypt } from '../lib/crypto'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const googleCalendarRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

googleCalendarRoutes.use('/*', authMiddleware)

// Check if Google OAuth is configured
googleCalendarRoutes.get('/status', async (c) => {
  const user = c.get('user')

  if (!c.env.GOOGLE_CLIENT_ID) {
    return c.json({ connected: false, available: false, lastSyncedAt: null })
  }

  const sync = await c.env.DB.prepare(
    'SELECT last_synced_at FROM google_calendar_sync WHERE user_id = ?'
  ).bind(user.id).first()

  return c.json({ connected: !!sync, available: true, lastSyncedAt: sync?.last_synced_at || null })
})

// Start OAuth2 flow
googleCalendarRoutes.post('/connect', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) {
    return c.json({ error: 'Google Calendar not configured' }, 503)
  }
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ]

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${c.env.GOOGLE_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(c.env.GOOGLE_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes.join(' '))}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${c.get('user').id}`

  return c.json({ authUrl })
})

// OAuth2 callback
googleCalendarRoutes.get('/callback', async (c) => {
  const code = c.req.query('code')
  const userId = c.req.query('state')

  if (!code || !userId) {
    return c.json({ error: 'Missing code or state' }, 400)
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: c.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return c.json({ error: 'Failed to exchange code' }, 400)
  }

  const tokens = await tokenRes.json() as {
    access_token: string
    refresh_token: string
  }

  // Encrypt tokens
  const accessEnc = await encrypt(tokens.access_token, c.env.VAULT_KEY)
  const refreshEnc = await encrypt(tokens.refresh_token, c.env.VAULT_KEY)

  await c.env.DB.prepare(
    `INSERT INTO google_calendar_sync (user_id, access_token_enc, refresh_token_enc)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       access_token_enc = excluded.access_token_enc,
       refresh_token_enc = excluded.refresh_token_enc`
  ).bind(userId, accessEnc, refreshEnc).run()

  // Redirect to frontend
  return c.redirect('/?google_connected=1')
})

// Manual sync
googleCalendarRoutes.post('/sync', async (c) => {
  const user = c.get('user')
  const deptId = c.req.query('dept_id')
  if (!deptId) return c.json({ error: 'dept_id required' }, 400)

  const sync = await c.env.DB.prepare(
    'SELECT * FROM google_calendar_sync WHERE user_id = ?'
  ).bind(user.id).first<any>()

  if (!sync) {
    return c.json({ error: 'Google Calendar not connected' }, 400)
  }

  let accessToken = await decrypt(sync.access_token_enc, c.env.VAULT_KEY)
  const refreshToken = await decrypt(sync.refresh_token_enc, c.env.VAULT_KEY)

  // Try fetching events, refresh token if needed
  let eventsUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=250&singleEvents=true'
  if (sync.sync_token) {
    eventsUrl += `&syncToken=${sync.sync_token}`
  } else {
    // Initial sync: last 30 days to next 90 days
    const timeMin = new Date(Date.now() - 30 * 86400000).toISOString()
    const timeMax = new Date(Date.now() + 90 * 86400000).toISOString()
    eventsUrl += `&timeMin=${timeMin}&timeMax=${timeMax}`
  }

  let res = await fetch(eventsUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  // Token expired, refresh
  if (res.status === 401) {
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }),
    })

    if (!refreshRes.ok) {
      return c.json({ error: 'Failed to refresh Google token' }, 400)
    }

    const newTokens = await refreshRes.json() as { access_token: string }
    accessToken = newTokens.access_token

    // Save new access token
    const newAccessEnc = await encrypt(accessToken, c.env.VAULT_KEY)
    await c.env.DB.prepare(
      'UPDATE google_calendar_sync SET access_token_enc = ? WHERE user_id = ?'
    ).bind(newAccessEnc, user.id).run()

    res = await fetch(eventsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  }

  if (!res.ok) {
    // If syncToken is invalid, reset
    if (res.status === 410) {
      await c.env.DB.prepare(
        'UPDATE google_calendar_sync SET sync_token = NULL WHERE user_id = ?'
      ).bind(user.id).run()
      return c.json({ error: 'Sync token expired, please sync again' }, 400)
    }
    return c.json({ error: 'Failed to fetch Google events' }, 400)
  }

  const data = await res.json() as {
    items: any[]
    nextSyncToken?: string
  }

  let synced = 0
  for (const item of data.items || []) {
    if (item.status === 'cancelled') {
      await c.env.DB.prepare(
        'DELETE FROM events WHERE google_event_id = ? AND user_id = ?'
      ).bind(item.id, user.id).run()
      continue
    }

    const startAt = item.start?.dateTime || item.start?.date || ''
    const endAt = item.end?.dateTime || item.end?.date || ''
    const allDay = !!item.start?.date

    const existing = await c.env.DB.prepare(
      'SELECT id FROM events WHERE google_event_id = ? AND user_id = ?'
    ).bind(item.id, user.id).first()

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE events SET title = ?, description = ?, start_at = ?, end_at = ?, all_day = ?, updated_at = datetime('now')
         WHERE google_event_id = ? AND user_id = ?`
      ).bind(item.summary || '', item.description || '', startAt, endAt, allDay ? 1 : 0, item.id, user.id).run()
    } else {
      await c.env.DB.prepare(
        `INSERT INTO events (id, department_id, user_id, title, description, start_at, end_at, all_day, google_event_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(generateId(), deptId, user.id, item.summary || '', item.description || '', startAt, endAt, allDay ? 1 : 0, item.id).run()
    }
    synced++
  }

  // Save sync token
  if (data.nextSyncToken) {
    await c.env.DB.prepare(
      "UPDATE google_calendar_sync SET sync_token = ?, last_synced_at = datetime('now') WHERE user_id = ?"
    ).bind(data.nextSyncToken, user.id).run()
  }

  return c.json({ synced, nextSyncToken: !!data.nextSyncToken })
})

