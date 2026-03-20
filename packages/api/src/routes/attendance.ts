import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const attendanceRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

attendanceRoutes.use('/*', authMiddleware)

// ──────────────────────────────────────────────────────────────
// Personal: GET /today
// ──────────────────────────────────────────────────────────────
attendanceRoutes.get('/today', async (c) => {
  const user = c.get('user')
  const today = new Date().toISOString().slice(0, 10)

  const record = await c.env.DB.prepare(
    'SELECT * FROM attendance_records WHERE org_id = ? AND user_id = ? AND date = ?'
  ).bind(user.org_id, user.id, today).first()

  return c.json({ record: record || null })
})

// ──────────────────────────────────────────────────────────────
// Personal: GET /my
// ──────────────────────────────────────────────────────────────
attendanceRoutes.get('/my', async (c) => {
  const user = c.get('user')
  const month = c.req.query('month')
  const start = c.req.query('start')
  const end = c.req.query('end')

  let query = 'SELECT * FROM attendance_records WHERE org_id = ? AND user_id = ?'
  const params: unknown[] = [user.org_id, user.id]

  if (month) {
    // month format: YYYY-MM
    query += ' AND date >= ? AND date <= ?'
    params.push(`${month}-01`)
    params.push(`${month}-31`)
  } else if (start && end) {
    query += ' AND date >= ? AND date <= ?'
    params.push(start, end)
  }

  query += ' ORDER BY date DESC LIMIT 100'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ records: results })
})

// ──────────────────────────────────────────────────────────────
// Personal: POST /clock-in
// ──────────────────────────────────────────────────────────────
attendanceRoutes.post('/clock-in', async (c) => {
  const user = c.get('user')
  const body: { source?: string; note?: string } = await c.req.json<{ source?: string; note?: string }>().catch(() => ({ source: undefined, note: undefined }))
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()
  const source = body.source || 'web'
  const note = body.note || ''

  // Check if already clocked in today
  const existing = await c.env.DB.prepare(
    'SELECT * FROM attendance_records WHERE org_id = ? AND user_id = ? AND date = ?'
  ).bind(user.org_id, user.id, today).first()

  if (existing) {
    if (existing.clock_in) {
      return c.json({ error: '이미 출근 처리되었습니다', record: existing }, 409)
    }
    // Update existing record with clock_in
    await c.env.DB.prepare(
      `UPDATE attendance_records SET clock_in = ?, clock_in_source = ?, note = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(now, source, note || existing.note, existing.id).run()

    const record = await c.env.DB.prepare('SELECT * FROM attendance_records WHERE id = ?').bind(existing.id).first()
    return c.json({ record })
  }

  // Auto-detect user's primary department
  const dept = await c.env.DB.prepare(
    'SELECT department_id FROM user_departments WHERE user_id = ? LIMIT 1'
  ).bind(user.id).first<{ department_id: string }>()

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO attendance_records (id, org_id, user_id, department_id, date, clock_in, clock_in_source, status, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'present', ?)
  `).bind(id, user.org_id, user.id, dept?.department_id || null, today, now, source, note).run()

  const record = await c.env.DB.prepare('SELECT * FROM attendance_records WHERE id = ?').bind(id).first()
  return c.json({ record }, 201)
})

// ──────────────────────────────────────────────────────────────
// Personal: POST /clock-out
// ──────────────────────────────────────────────────────────────
attendanceRoutes.post('/clock-out', async (c) => {
  const user = c.get('user')
  const body: { source?: string; note?: string } = await c.req.json<{ source?: string; note?: string }>().catch(() => ({ source: undefined, note: undefined }))
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()
  const source = body.source || 'web'
  const note = body.note || ''

  const existing = await c.env.DB.prepare(
    'SELECT * FROM attendance_records WHERE org_id = ? AND user_id = ? AND date = ?'
  ).bind(user.org_id, user.id, today).first()

  if (!existing) {
    return c.json({ error: '오늘 출근 기록이 없습니다' }, 404)
  }

  if (existing.clock_out) {
    return c.json({ error: '이미 퇴근 처리되었습니다', record: existing }, 409)
  }

  const noteValue = note || (existing.note as string) || ''
  await c.env.DB.prepare(
    `UPDATE attendance_records SET clock_out = ?, clock_out_source = ?, note = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(now, source, noteValue, existing.id).run()

  const record = await c.env.DB.prepare('SELECT * FROM attendance_records WHERE id = ?').bind(existing.id).first()
  return c.json({ record })
})

// ──────────────────────────────────────────────────────────────
// Management: GET /team-members (all org members with dept info)
// ──────────────────────────────────────────────────────────────
attendanceRoutes.get('/team-members', async (c) => {
  const user = c.get('user')

  // Check attendance admin flag
  const userRow = await c.env.DB.prepare('SELECT is_attendance_admin FROM users WHERE id = ?').bind(user.id).first<{ is_attendance_admin: number }>()
  const isAttendanceAdmin = !!userRow?.is_attendance_admin

  if (!user.is_ceo && !user.is_admin && !isAttendanceAdmin) {
    // Check if dept head
    const headCheck = await c.env.DB.prepare(
      "SELECT department_id FROM user_departments WHERE user_id = ? AND role = 'head'"
    ).bind(user.id).first()
    if (!headCheck) {
      return c.json({ error: '권한이 없습니다' }, 403)
    }
  }

  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_url, u.position_id,
           p.name as position_name, p.level as position_level,
           GROUP_CONCAT(d.id || '::' || d.name || '::' || COALESCE(d.color,''), '|||') as dept_info
    FROM users u
    LEFT JOIN positions p ON p.id = u.position_id
    LEFT JOIN user_departments ud ON ud.user_id = u.id
    LEFT JOIN departments d ON d.id = ud.department_id
    WHERE u.org_id = ?
    GROUP BY u.id
    ORDER BY u.name
  `).bind(user.org_id).all()

  const members = results.map((r: any) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    avatar_url: r.avatar_url,
    position_id: r.position_id,
    position_name: r.position_name,
    position_level: r.position_level,
    departments: r.dept_info
      ? (r.dept_info as string).split('|||').map((d: string) => {
          const [id, name, color] = d.split('::')
          return { id, name, color }
        })
      : [],
  }))

  return c.json({ members })
})

// ──────────────────────────────────────────────────────────────
// Management: GET /team-monthly (all records for a month)
// ──────────────────────────────────────────────────────────────
attendanceRoutes.get('/team-monthly', async (c) => {
  const user = c.get('user')
  const month = c.req.query('month') // YYYY-MM

  if (!month) {
    return c.json({ error: 'month query parameter is required (YYYY-MM)' }, 400)
  }

  // Check attendance admin flag
  const userRow = await c.env.DB.prepare('SELECT is_attendance_admin FROM users WHERE id = ?').bind(user.id).first<{ is_attendance_admin: number }>()
  const isAttendanceAdmin = !!userRow?.is_attendance_admin

  if (!user.is_ceo && !user.is_admin && !isAttendanceAdmin) {
    const headCheck = await c.env.DB.prepare(
      "SELECT department_id FROM user_departments WHERE user_id = ? AND role = 'head'"
    ).bind(user.id).first()
    if (!headCheck) {
      return c.json({ error: '권한이 없습니다' }, 403)
    }
  }

  const { results } = await c.env.DB.prepare(`
    SELECT ar.*, u.name as user_name, u.email as user_email
    FROM attendance_records ar
    JOIN users u ON u.id = ar.user_id
    WHERE ar.org_id = ? AND ar.date >= ? AND ar.date <= ?
    ORDER BY ar.date ASC, u.name ASC
  `).bind(user.org_id, `${month}-01`, `${month}-31`).all()

  return c.json({ records: results })
})

// ──────────────────────────────────────────────────────────────
// Management: GET /team
// ──────────────────────────────────────────────────────────────
attendanceRoutes.get('/team', async (c) => {
  const user = c.get('user')
  const deptId = c.req.query('dept_id')
  const date = c.req.query('date')
  const month = c.req.query('month')

  // Check attendance admin flag
  const userRow = await c.env.DB.prepare('SELECT is_attendance_admin FROM users WHERE id = ?').bind(user.id).first<{ is_attendance_admin: number }>()
  const isAttendanceAdmin = !!userRow?.is_attendance_admin

  // Permission check: CEO/admin/attendance_admin can see all; dept head can see their dept only
  if (!user.is_ceo && !user.is_admin && !isAttendanceAdmin) {
    if (!deptId) {
      return c.json({ error: '부서 ID가 필요합니다' }, 400)
    }
    const membership = await c.env.DB.prepare(
      'SELECT role FROM user_departments WHERE user_id = ? AND department_id = ?'
    ).bind(user.id, deptId).first<{ role: string }>()

    if (membership?.role !== 'head') {
      return c.json({ error: '부서장만 조회할 수 있습니다' }, 403)
    }
  }

  let query = `
    SELECT ar.*, u.name as user_name, u.email as user_email
    FROM attendance_records ar
    JOIN users u ON u.id = ar.user_id
    WHERE ar.org_id = ?`
  const params: unknown[] = [user.org_id]

  if (deptId) {
    query += ' AND ar.department_id = ?'
    params.push(deptId)
  }

  if (date) {
    query += ' AND ar.date = ?'
    params.push(date)
  } else if (month) {
    query += ' AND ar.date >= ? AND ar.date <= ?'
    params.push(`${month}-01`, `${month}-31`)
  }

  query += ' ORDER BY ar.date DESC, u.name ASC LIMIT 500'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ records: results })
})

// ──────────────────────────────────────────────────────────────
// Management: GET /stats
// ──────────────────────────────────────────────────────────────
attendanceRoutes.get('/stats', async (c) => {
  const user = c.get('user')
  const deptId = c.req.query('dept_id')
  const month = c.req.query('month')

  // Check attendance admin flag
  const userRow = await c.env.DB.prepare('SELECT is_attendance_admin FROM users WHERE id = ?').bind(user.id).first<{ is_attendance_admin: number }>()
  const isAttendanceAdmin = !!userRow?.is_attendance_admin

  // Permission check
  if (!user.is_ceo && !user.is_admin && !isAttendanceAdmin) {
    if (!deptId) {
      return c.json({ error: '부서 ID가 필요합니다' }, 400)
    }
    const membership = await c.env.DB.prepare(
      'SELECT role FROM user_departments WHERE user_id = ? AND department_id = ?'
    ).bind(user.id, deptId).first<{ role: string }>()

    if (membership?.role !== 'head') {
      return c.json({ error: '부서장만 조회할 수 있습니다' }, 403)
    }
  }

  let query = `
    SELECT
      ar.user_id,
      u.name as user_name,
      COUNT(*) as total_records,
      SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) as present_count,
      SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END) as late_count,
      SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
      SUM(CASE WHEN ar.status = 'remote' THEN 1 ELSE 0 END) as remote_count,
      SUM(CASE WHEN ar.status = 'vacation' THEN 1 ELSE 0 END) as vacation_count,
      SUM(CASE WHEN ar.status = 'half_day' THEN 1 ELSE 0 END) as half_day_count
    FROM attendance_records ar
    JOIN users u ON u.id = ar.user_id
    WHERE ar.org_id = ?`
  const params: unknown[] = [user.org_id]

  if (deptId) {
    query += ' AND ar.department_id = ?'
    params.push(deptId)
  }

  if (month) {
    query += ' AND ar.date >= ? AND ar.date <= ?'
    params.push(`${month}-01`, `${month}-31`)
  }

  query += ' GROUP BY ar.user_id ORDER BY u.name'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ stats: results })
})
