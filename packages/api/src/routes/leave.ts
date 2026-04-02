import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const leaveRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

leaveRoutes.use('/*', authMiddleware)

// ──────────────────────────────────────────────────────────────
// GET /balance - get leave balance for a user
// ──────────────────────────────────────────────────────────────
leaveRoutes.get('/balance', async (c) => {
  const user = c.get('user')
  const userId = c.req.query('user_id') || user.id
  const year = parseInt(c.req.query('year') || String(new Date().getFullYear()))

  // Get user's hire_date
  const userRow = await c.env.DB.prepare(
    'SELECT hire_date FROM users WHERE id = ? AND org_id = ?'
  ).bind(userId, user.org_id).first<{ hire_date: string }>()

  if (!userRow) {
    return c.json({ error: '사용자를 찾을 수 없습니다' }, 404)
  }

  const hireDate = userRow.hire_date || `${year}-01-01`

  // Check if there's an 'annual' type adjustment (overrides accrual)
  const annualOverride = await c.env.DB.prepare(
    "SELECT SUM(days) as total FROM leave_balance_adjustments WHERE user_id = ? AND org_id = ? AND year = ? AND type = 'annual'"
  ).bind(userId, user.org_id, year).first<{ total: number | null }>()

  let accrued: number
  if (annualOverride?.total !== null && annualOverride?.total !== undefined) {
    accrued = annualOverride.total
  } else {
    // Calculate accrued months: months from max(hire_date, year-01-01) to min(today, year-12-31)
    const yearStart = new Date(`${year}-01-01T00:00:00Z`)
    const yearEnd = new Date(`${year}-12-31T23:59:59Z`)
    const hireDateObj = new Date(`${hireDate}T00:00:00Z`)
    const today = new Date()

    const startDate = hireDateObj > yearStart ? hireDateObj : yearStart
    const endDate = today < yearEnd ? today : yearEnd

    if (startDate > endDate) {
      accrued = 0
    } else {
      const months = (endDate.getFullYear() - startDate.getFullYear()) * 12
        + (endDate.getMonth() - startDate.getMonth())
        + (endDate.getDate() >= startDate.getDate() ? 1 : 0)
      accrued = Math.min(Math.max(months, 0), 12)
    }
  }

  // Get adjustments (bonus + deduction + carryover, excluding annual)
  const adjRow = await c.env.DB.prepare(
    "SELECT SUM(days) as total FROM leave_balance_adjustments WHERE user_id = ? AND org_id = ? AND year = ? AND type != 'annual'"
  ).bind(userId, user.org_id, year).first<{ total: number | null }>()
  const adjustments = adjRow?.total || 0

  // Calculate used days: approved leave requests in year (excluding remote)
  const yearStartStr = `${year}-01-01`
  const yearEndStr = `${year}-12-31`

  // Get approved leave requests that fall within this year (excluding remote)
  const { results: leaveResults } = await c.env.DB.prepare(`
    SELECT type, start_date, end_date FROM leave_requests
    WHERE user_id = ? AND org_id = ? AND status = 'approved' AND is_deleted = 0
      AND type != 'remote'
      AND start_date <= ? AND end_date >= ?
  `).bind(userId, user.org_id, yearEndStr, yearStartStr).all<{ type: string; start_date: string; end_date: string }>()

  let used = 0
  const detailsMap: Record<string, number> = {}

  for (const lr of leaveResults || []) {
    if (lr.type === 'half_day_am' || lr.type === 'half_day_pm') {
      used += 0.5
      detailsMap[lr.type] = (detailsMap[lr.type] || 0) + 0.5
    } else {
      // Count days within the year range
      const s = new Date(Math.max(new Date(lr.start_date).getTime(), new Date(yearStartStr).getTime()))
      const e = new Date(Math.min(new Date(lr.end_date).getTime(), new Date(yearEndStr).getTime()))
      const days = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
      used += days
      detailsMap[lr.type] = (detailsMap[lr.type] || 0) + days
    }
  }

  const remaining = accrued + adjustments - used

  return c.json({
    user_id: userId,
    year,
    hire_date: hireDate,
    accrued,
    adjustments,
    used,
    remaining,
    details: detailsMap,
  })
})

// ──────────────────────────────────────────────────────────────
// GET /balances - get leave balances for all users (managers only)
// ──────────────────────────────────────────────────────────────
leaveRoutes.get('/balances', async (c) => {
  const user = c.get('user')
  const year = parseInt(c.req.query('year') || String(new Date().getFullYear()))

  // Check permissions: CEO, admin, or attendance_admin
  const userCheck = await c.env.DB.prepare('SELECT is_attendance_admin FROM users WHERE id = ?').bind(user.id).first<{ is_attendance_admin: number }>()
  const isAttendanceAdmin = !!userCheck?.is_attendance_admin
  const isDeptHead = await c.env.DB.prepare("SELECT department_id FROM user_departments WHERE user_id = ? AND role = 'head' LIMIT 1").bind(user.id).first()

  if (!user.is_ceo && !user.is_admin && !isAttendanceAdmin && !isDeptHead) {
    return c.json({ error: '권한이 없습니다' }, 403)
  }

  // Get all users in org
  const { results: users } = await c.env.DB.prepare(
    'SELECT id, name, hire_date FROM users WHERE org_id = ?'
  ).bind(user.org_id).all<{ id: string; name: string; hire_date: string }>()

  // Get all adjustments for the year
  const { results: allAdj } = await c.env.DB.prepare(
    'SELECT user_id, type, SUM(days) as total FROM leave_balance_adjustments WHERE org_id = ? AND year = ? GROUP BY user_id, type'
  ).bind(user.org_id, year).all<{ user_id: string; type: string; total: number }>()

  // Build adjustment map: { userId: { annual: X, other: Y } }
  const adjMap: Record<string, { annual: number; other: number }> = {}
  for (const adj of allAdj || []) {
    if (!adjMap[adj.user_id]) adjMap[adj.user_id] = { annual: 0, other: 0 }
    if (adj.type === 'annual') {
      adjMap[adj.user_id].annual += adj.total
    } else {
      adjMap[adj.user_id].other += adj.total
    }
  }

  // Get all approved leave requests for the year (excluding remote)
  const yearStartStr = `${year}-01-01`
  const yearEndStr = `${year}-12-31`
  const { results: allLeave } = await c.env.DB.prepare(`
    SELECT user_id, type, start_date, end_date FROM leave_requests
    WHERE org_id = ? AND status = 'approved' AND is_deleted = 0
      AND type != 'remote'
      AND start_date <= ? AND end_date >= ?
  `).bind(user.org_id, yearEndStr, yearStartStr).all<{ user_id: string; type: string; start_date: string; end_date: string }>()

  // Build used map
  const usedMap: Record<string, number> = {}
  for (const lr of allLeave || []) {
    if (!usedMap[lr.user_id]) usedMap[lr.user_id] = 0
    if (lr.type === 'half_day_am' || lr.type === 'half_day_pm') {
      usedMap[lr.user_id] += 0.5
    } else {
      const s = new Date(Math.max(new Date(lr.start_date).getTime(), new Date(yearStartStr).getTime()))
      const e = new Date(Math.min(new Date(lr.end_date).getTime(), new Date(yearEndStr).getTime()))
      const days = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
      usedMap[lr.user_id] += days
    }
  }

  const today = new Date()
  const yearStart = new Date(`${year}-01-01T00:00:00Z`)
  const yearEnd = new Date(`${year}-12-31T23:59:59Z`)

  const balances = (users || []).map(u => {
    const hireDate = u.hire_date || `${year}-01-01`
    const adj = adjMap[u.id] || { annual: 0, other: 0 }

    let accrued: number
    if (adj.annual !== 0) {
      accrued = adj.annual
    } else {
      const hireDateObj = new Date(`${hireDate}T00:00:00Z`)
      const startDate = hireDateObj > yearStart ? hireDateObj : yearStart
      const endDate = today < yearEnd ? today : yearEnd
      if (startDate > endDate) {
        accrued = 0
      } else {
        const months = (endDate.getFullYear() - startDate.getFullYear()) * 12
          + (endDate.getMonth() - startDate.getMonth())
          + (endDate.getDate() >= startDate.getDate() ? 1 : 0)
        accrued = Math.min(Math.max(months, 0), 12)
      }
    }

    const adjustments = adj.other
    const used = usedMap[u.id] || 0
    const remaining = accrued + adjustments - used

    return {
      user_id: u.id,
      user_name: u.name,
      hire_date: hireDate,
      accrued,
      adjustments,
      used,
      remaining,
    }
  })

  return c.json({ balances, year })
})

// ──────────────────────────────────────────────────────────────
// POST /balance/adjust - adjust leave balance
// ──────────────────────────────────────────────────────────────
leaveRoutes.post('/balance/adjust', async (c) => {
  const user = c.get('user')

  // Check permissions: CEO, admin, or attendance_admin
  const userCheck = await c.env.DB.prepare('SELECT is_attendance_admin FROM users WHERE id = ?').bind(user.id).first<{ is_attendance_admin: number }>()
  const isAttendanceAdmin = !!userCheck?.is_attendance_admin

  if (!user.is_ceo && !user.is_admin && !isAttendanceAdmin) {
    return c.json({ error: 'CEO, 관리자 또는 근태관리자만 조정할 수 있습니다' }, 403)
  }

  const body = await c.req.json<{
    user_id: string
    year: number
    type: string
    days: number
    reason?: string
  }>()

  const { user_id, year: adjYear, type, days, reason } = body
  if (!user_id || !adjYear || !type || days === undefined) {
    return c.json({ error: 'user_id, year, type, days는 필수입니다' }, 400)
  }

  const validTypes = ['annual', 'bonus', 'deduction', 'carryover']
  if (!validTypes.includes(type)) {
    return c.json({ error: '유효하지 않은 조정 유형입니다' }, 400)
  }

  // Verify user belongs to same org
  const targetUser = await c.env.DB.prepare(
    'SELECT id FROM users WHERE id = ? AND org_id = ?'
  ).bind(user_id, user.org_id).first()

  if (!targetUser) {
    return c.json({ error: '사용자를 찾을 수 없습니다' }, 404)
  }

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO leave_balance_adjustments (id, org_id, user_id, year, type, days, reason, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.org_id, user_id, adjYear, type, days, reason || '', user.id).run()

  return c.json({ adjustment: { id, user_id, year: adjYear, type, days, reason: reason || '' } }, 201)
})

// ──────────────────────────────────────────────────────────────
// Helper: check if user is dept head for a given department
// ──────────────────────────────────────────────────────────────
async function isDeptHead(db: D1Database, userId: string, deptId: string): Promise<boolean> {
  const row = await db.prepare(
    'SELECT role FROM user_departments WHERE user_id = ? AND department_id = ?'
  ).bind(userId, deptId).first<{ role: string }>()
  return row?.role === 'head'
}

// ──────────────────────────────────────────────────────────────
// Helper: get user's primary department
// ──────────────────────────────────────────────────────────────
async function getUserDepartment(db: D1Database, userId: string): Promise<{ department_id: string; role: string } | null> {
  const row = await db.prepare(
    'SELECT department_id, role FROM user_departments WHERE user_id = ? LIMIT 1'
  ).bind(userId).first<{ department_id: string; role: string }>()
  return row || null
}

// ──────────────────────────────────────────────────────────────
// Helper: find dept head for a department
// ──────────────────────────────────────────────────────────────
async function findDeptHead(db: D1Database, deptId: string): Promise<string | null> {
  const row = await db.prepare(
    "SELECT user_id FROM user_departments WHERE department_id = ? AND role = 'head' LIMIT 1"
  ).bind(deptId).first<{ user_id: string }>()
  return row?.user_id || null
}

// ──────────────────────────────────────────────────────────────
// Helper: find CEO of an org
// ──────────────────────────────────────────────────────────────
async function findCeo(db: D1Database, orgId: string): Promise<string | null> {
  const row = await db.prepare(
    'SELECT id FROM users WHERE org_id = ? AND is_ceo = 1 LIMIT 1'
  ).bind(orgId).first<{ id: string }>()
  return row?.id || null
}

// ──────────────────────────────────────────────────────────────
// Helper: get org slug
// ──────────────────────────────────────────────────────────────
async function getOrgSlug(db: D1Database, orgId: string): Promise<string> {
  const row = await db.prepare(
    'SELECT slug FROM organizations WHERE id = ?'
  ).bind(orgId).first<{ slug: string }>()
  return row?.slug || 'unknown'
}

// ──────────────────────────────────────────────────────────────
// Helper: update attendance records for approved leave
// ──────────────────────────────────────────────────────────────
async function updateAttendanceForLeave(
  db: D1Database,
  orgId: string,
  userId: string,
  departmentId: string | null,
  startDate: string,
  endDate: string,
  leaveType: string
): Promise<void> {
  // Determine attendance status based on leave type
  const status = leaveType === 'remote' ? 'remote'
    : (leaveType === 'half_day_am' || leaveType === 'half_day_pm') ? 'half_day'
    : 'vacation'

  // Generate dates between start and end (inclusive)
  const start = new Date(startDate)
  const end = new Date(endDate)
  const statements: D1PreparedStatement[] = []

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10)
    const id = generateId()
    statements.push(
      db.prepare(`
        INSERT INTO attendance_records (id, org_id, user_id, department_id, date, status, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(org_id, user_id, date) DO UPDATE SET status = ?, note = ?, updated_at = datetime('now')
      `).bind(id, orgId, userId, departmentId, dateStr, status, `휴가 승인`, status, `휴가 승인`)
    )
  }

  if (statements.length > 0) {
    await db.batch(statements)
  }
}

// ──────────────────────────────────────────────────────────────
// POST /upload - upload attachment to R2
// ──────────────────────────────────────────────────────────────
leaveRoutes.post('/upload', async (c) => {
  const user = c.get('user')
  const formData = await c.req.formData()
  const file = formData.get('file') as unknown as File | null

  if (!file || typeof file === 'string') {
    return c.json({ error: '파일이 필요합니다' }, 400)
  }

  const leaveId = formData.get('leave_id') as string || generateId()
  const orgSlug = await getOrgSlug(c.env.DB, user.org_id)
  const key = `${orgSlug}/leave/${leaveId}/${file.name}`

  await c.env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  })

  return c.json({ attachment_url: key })
})

// ──────────────────────────────────────────────────────────────
// GET /pending-count - count pending approvals for current user
// ──────────────────────────────────────────────────────────────
leaveRoutes.get('/pending-count', async (c) => {
  const user = c.get('user')
  let count = 0

  if (user.is_ceo) {
    // CEO: count where approver2_id = me AND approver2_status = 'pending' AND approver1_status = 'approved'
    const row = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM leave_requests
      WHERE org_id = ? AND approver2_id = ? AND approver2_status = 'pending'
        AND approver1_status = 'approved' AND status = 'pending' AND is_deleted = 0
    `).bind(user.org_id, user.id).first<{ cnt: number }>()
    count = row?.cnt || 0
  } else {
    // Dept head: count where approver1_id = me AND approver1_status = 'pending'
    const row = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM leave_requests
      WHERE org_id = ? AND approver1_id = ? AND approver1_status = 'pending'
        AND status = 'pending' AND is_deleted = 0
    `).bind(user.org_id, user.id).first<{ cnt: number }>()
    count = row?.cnt || 0
  }

  return c.json({ count })
})

// ──────────────────────────────────────────────────────────────
// GET /trash - list soft-deleted items (CEO/admin only)
// ──────────────────────────────────────────────────────────────
leaveRoutes.get('/trash', async (c) => {
  const user = c.get('user')
  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'CEO 또는 관리자만 조회할 수 있습니다' }, 403)
  }

  const { results } = await c.env.DB.prepare(`
    SELECT lr.*, u.name as user_name, u.email as user_email
    FROM leave_requests lr
    JOIN users u ON u.id = lr.user_id
    WHERE lr.org_id = ? AND lr.is_deleted = 1
    ORDER BY lr.updated_at DESC
    LIMIT 100
  `).bind(user.org_id).all()

  return c.json({ leave_requests: results })
})

// ──────────────────────────────────────────────────────────────
// GET / - list leave requests
// ──────────────────────────────────────────────────────────────
leaveRoutes.get('/', async (c) => {
  const user = c.get('user')
  const status = c.req.query('status')
  const userId = c.req.query('user_id')
  const deptId = c.req.query('dept_id')
  const month = c.req.query('month')
  const includeDeleted = c.req.query('include_deleted')

  let query = `
    SELECT lr.*, u.name as user_name, u.email as user_email
    FROM leave_requests lr
    JOIN users u ON u.id = lr.user_id
    WHERE lr.org_id = ?`
  const params: unknown[] = [user.org_id]

  // Soft delete filter
  if (includeDeleted !== '1') {
    query += ' AND lr.is_deleted = 0'
  }

  // Visibility: regular user sees own, dept head sees dept, CEO/admin/attendance_admin sees all
  // Check attendance admin flag
  const userRow = await c.env.DB.prepare('SELECT is_attendance_admin FROM users WHERE id = ?').bind(user.id).first<{ is_attendance_admin: number }>()
  const isAttendanceAdmin = !!userRow?.is_attendance_admin

  if (!user.is_ceo && !user.is_admin && !isAttendanceAdmin) {
    // Check if user is a dept head for any department
    const headDepts = await c.env.DB.prepare(
      "SELECT department_id FROM user_departments WHERE user_id = ? AND role = 'head'"
    ).bind(user.id).all()
    const headDeptIds = (headDepts.results || []).map((r: any) => r.department_id)

    if (headDeptIds.length > 0) {
      const placeholders = headDeptIds.map(() => '?').join(',')
      query += ` AND (lr.user_id = ? OR lr.department_id IN (${placeholders}))`
      params.push(user.id, ...headDeptIds)
    } else {
      // Regular user: sees own only
      query += ' AND lr.user_id = ?'
      params.push(user.id)
    }
  }

  if (status) {
    query += ' AND lr.status = ?'
    params.push(status)
  }

  if (userId) {
    query += ' AND lr.user_id = ?'
    params.push(userId)
  }

  if (deptId) {
    query += ' AND lr.department_id = ?'
    params.push(deptId)
  }

  if (month) {
    // month format: YYYY-MM
    query += ' AND lr.start_date <= ? AND lr.end_date >= ?'
    params.push(`${month}-31`, `${month}-01`)
  }

  query += ' ORDER BY lr.created_at DESC LIMIT 200'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ leave_requests: results })
})

// ──────────────────────────────────────────────────────────────
// GET /:id - get single leave request
// ──────────────────────────────────────────────────────────────
leaveRoutes.get('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const leave = await c.env.DB.prepare(`
    SELECT lr.*, u.name as user_name, u.email as user_email,
      a1.name as approver1_name, a2.name as approver2_name
    FROM leave_requests lr
    JOIN users u ON u.id = lr.user_id
    LEFT JOIN users a1 ON a1.id = lr.approver1_id
    LEFT JOIN users a2 ON a2.id = lr.approver2_id
    WHERE lr.id = ? AND lr.org_id = ?
  `).bind(id, user.org_id).first()

  if (!leave) {
    return c.json({ error: '휴가 신청을 찾을 수 없습니다' }, 404)
  }

  return c.json({ leave_request: leave })
})

// ──────────────────────────────────────────────────────────────
// POST / - create leave request
// ──────────────────────────────────────────────────────────────
leaveRoutes.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{
    user_id?: string
    type: string
    start_date: string
    end_date: string
    reason?: string
    attachment_url?: string
  }>()

  const { type, start_date, end_date, reason, attachment_url } = body
  if (!type || !start_date || !end_date) {
    return c.json({ error: 'type, start_date, end_date는 필수입니다' }, 400)
  }

  const validTypes = ['vacation', 'half_day_am', 'half_day_pm', 'sick', 'special', 'remote']
  if (!validTypes.includes(type)) {
    return c.json({ error: '유효하지 않은 휴가 유형입니다' }, 400)
  }

  // Determine the target user
  const targetUserId = body.user_id || user.id
  const isOnBehalf = targetUserId !== user.id

  // If creating on behalf, check permissions
  if (isOnBehalf) {
    const targetDept = await getUserDepartment(c.env.DB, targetUserId)
    if (!user.is_ceo && !user.is_admin) {
      // Must be dept head of the target user's department
      if (!targetDept || !(await isDeptHead(c.env.DB, user.id, targetDept.department_id))) {
        return c.json({ error: '대리 신청 권한이 없습니다' }, 403)
      }
    }
  }

  // Auto-detect department
  const targetDept = await getUserDepartment(c.env.DB, targetUserId)
  const departmentId = targetDept?.department_id || null

  // Auto-assign approvers
  let approver1Id: string | null = null
  let approver1Status = 'pending'
  let approver1At: string | null = null

  let approver2Id: string | null = null
  let approver2Status = 'pending'
  let approver2At: string | null = null

  let overallStatus = 'pending'

  // Find dept head for approver1
  if (departmentId) {
    approver1Id = await findDeptHead(c.env.DB, departmentId)
  }

  // Find CEO for approver2
  approver2Id = await findCeo(c.env.DB, user.org_id)

  const now = new Date().toISOString()

  // If the creator IS the dept head (creating for self or on behalf of dept member)
  if (approver1Id && approver1Id === user.id) {
    approver1Status = 'approved'
    approver1At = now
  }

  // If the creator IS the CEO, auto-approve both steps
  if (user.is_ceo) {
    approver1Status = 'approved'
    approver1At = approver1At || now
    approver2Status = 'approved'
    approver2At = now
    overallStatus = 'approved'
  }

  const id = generateId()

  await c.env.DB.prepare(`
    INSERT INTO leave_requests (
      id, org_id, user_id, department_id, type, start_date, end_date,
      reason, attachment_url, status,
      approver1_id, approver1_status, approver1_at,
      approver2_id, approver2_status, approver2_at,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.org_id, targetUserId, departmentId, type, start_date, end_date,
    reason || '', attachment_url || '', overallStatus,
    approver1Id, approver1Status, approver1At,
    approver2Id, approver2Status, approver2At,
    user.id
  ).run()

  // If CEO auto-approved, update attendance records
  if (overallStatus === 'approved') {
    await updateAttendanceForLeave(
      c.env.DB, user.org_id, targetUserId, departmentId,
      start_date, end_date, type
    )
  }

  const leave = await c.env.DB.prepare(
    'SELECT * FROM leave_requests WHERE id = ?'
  ).bind(id).first()

  return c.json({ leave_request: leave }, 201)
})

// ──────────────────────────────────────────────────────────────
// PATCH /:id - update leave request (only if pending, by creator)
// ──────────────────────────────────────────────────────────────
leaveRoutes.patch('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const leave = await c.env.DB.prepare(
    'SELECT * FROM leave_requests WHERE id = ? AND org_id = ?'
  ).bind(id, user.org_id).first<{
    id: string; status: string; created_by: string; user_id: string
  }>()

  if (!leave) {
    return c.json({ error: '휴가 신청을 찾을 수 없습니다' }, 404)
  }

  if (leave.status !== 'pending') {
    return c.json({ error: '대기 중인 신청만 수정할 수 있습니다' }, 400)
  }

  if (leave.created_by !== user.id) {
    return c.json({ error: '본인이 작성한 신청만 수정할 수 있습니다' }, 403)
  }

  const body = await c.req.json<{
    type?: string
    start_date?: string
    end_date?: string
    reason?: string
    attachment_url?: string
  }>()

  const updates: string[] = []
  const values: unknown[] = []

  if (body.type) {
    const validTypes = ['vacation', 'half_day_am', 'half_day_pm', 'sick', 'special', 'remote']
    if (!validTypes.includes(body.type)) {
      return c.json({ error: '유효하지 않은 휴가 유형입니다' }, 400)
    }
    updates.push('type = ?')
    values.push(body.type)
  }
  if (body.start_date) { updates.push('start_date = ?'); values.push(body.start_date) }
  if (body.end_date) { updates.push('end_date = ?'); values.push(body.end_date) }
  if (body.reason !== undefined) { updates.push('reason = ?'); values.push(body.reason) }
  if (body.attachment_url !== undefined) { updates.push('attachment_url = ?'); values.push(body.attachment_url) }

  if (updates.length === 0) {
    return c.json({ error: '수정할 항목이 없습니다' }, 400)
  }

  updates.push("updated_at = datetime('now')")
  values.push(id, user.org_id)

  await c.env.DB.prepare(
    `UPDATE leave_requests SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`
  ).bind(...values).run()

  const updated = await c.env.DB.prepare(
    'SELECT * FROM leave_requests WHERE id = ?'
  ).bind(id).first()

  return c.json({ leave_request: updated })
})

// ──────────────────────────────────────────────────────────────
// POST /:id/cancel - cancel own request
// ──────────────────────────────────────────────────────────────
leaveRoutes.post('/:id/cancel', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const leave = await c.env.DB.prepare(
    'SELECT * FROM leave_requests WHERE id = ? AND org_id = ?'
  ).bind(id, user.org_id).first<{ id: string; user_id: string; status: string }>()

  if (!leave) {
    return c.json({ error: '휴가 신청을 찾을 수 없습니다' }, 404)
  }

  if (leave.user_id !== user.id) {
    return c.json({ error: '본인의 신청만 취소할 수 있습니다' }, 403)
  }

  if (leave.status === 'cancelled') {
    return c.json({ error: '이미 취소된 신청입니다' }, 400)
  }

  await c.env.DB.prepare(
    "UPDATE leave_requests SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run()

  const updated = await c.env.DB.prepare(
    'SELECT * FROM leave_requests WHERE id = ?'
  ).bind(id).first()

  return c.json({ leave_request: updated })
})

// ──────────────────────────────────────────────────────────────
// POST /:id/delete - soft delete
// ──────────────────────────────────────────────────────────────
leaveRoutes.post('/:id/delete', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const leave = await c.env.DB.prepare(
    'SELECT * FROM leave_requests WHERE id = ? AND org_id = ?'
  ).bind(id, user.org_id).first<{ id: string; user_id: string; created_by: string }>()

  if (!leave) {
    return c.json({ error: '휴가 신청을 찾을 수 없습니다' }, 404)
  }

  // Allow deletion by creator, the applicant, or CEO/admin
  if (leave.user_id !== user.id && leave.created_by !== user.id && !user.is_ceo && !user.is_admin) {
    return c.json({ error: '삭제 권한이 없습니다' }, 403)
  }

  await c.env.DB.prepare(
    "UPDATE leave_requests SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run()

  return c.json({ success: true })
})

// ──────────────────────────────────────────────────────────────
// POST /:id/restore - restore from trash (CEO/admin only)
// ──────────────────────────────────────────────────────────────
leaveRoutes.post('/:id/restore', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  if (!user.is_ceo && !user.is_admin) {
    return c.json({ error: 'CEO 또는 관리자만 복원할 수 있습니다' }, 403)
  }

  const leave = await c.env.DB.prepare(
    'SELECT * FROM leave_requests WHERE id = ? AND org_id = ? AND is_deleted = 1'
  ).bind(id, user.org_id).first()

  if (!leave) {
    return c.json({ error: '삭제된 휴가 신청을 찾을 수 없습니다' }, 404)
  }

  await c.env.DB.prepare(
    "UPDATE leave_requests SET is_deleted = 0, updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run()

  const updated = await c.env.DB.prepare(
    'SELECT * FROM leave_requests WHERE id = ?'
  ).bind(id).first()

  return c.json({ leave_request: updated })
})

// ──────────────────────────────────────────────────────────────
// POST /:id/approve - approve at current stage
// ──────────────────────────────────────────────────────────────
leaveRoutes.post('/:id/approve', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const leave = await c.env.DB.prepare(
    'SELECT * FROM leave_requests WHERE id = ? AND org_id = ? AND is_deleted = 0'
  ).bind(id, user.org_id).first<{
    id: string; status: string; user_id: string; department_id: string | null
    type: string; start_date: string; end_date: string
    approver1_id: string | null; approver1_status: string
    approver2_id: string | null; approver2_status: string
  }>()

  if (!leave) {
    return c.json({ error: '휴가 신청을 찾을 수 없습니다' }, 404)
  }

  if (leave.status !== 'pending') {
    return c.json({ error: '대기 중인 신청만 승인할 수 있습니다' }, 400)
  }

  const now = new Date().toISOString()

  // Check if user is approver1 (dept head)
  if (leave.approver1_id === user.id && leave.approver1_status === 'pending') {
    // If same person is both approver1 and approver2, approve both at once
    if (leave.approver2_id === user.id) {
      await c.env.DB.prepare(`
        UPDATE leave_requests
        SET approver1_status = 'approved', approver1_at = ?,
            approver2_status = 'approved', approver2_at = ?,
            status = 'approved', updated_at = datetime('now')
        WHERE id = ?
      `).bind(now, now, id).run()

      await updateAttendanceForLeave(
        c.env.DB, user.org_id, leave.user_id, leave.department_id,
        leave.start_date, leave.end_date, leave.type
      )

      const updated = await c.env.DB.prepare(
        'SELECT * FROM leave_requests WHERE id = ?'
      ).bind(id).first()
      return c.json({ leave_request: updated })
    }

    await c.env.DB.prepare(`
      UPDATE leave_requests
      SET approver1_status = 'approved', approver1_at = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(now, id).run()

    // If no approver2, auto-approve overall
    if (!leave.approver2_id) {
      await c.env.DB.prepare(`
        UPDATE leave_requests SET status = 'approved', updated_at = datetime('now') WHERE id = ?
      `).bind(id).run()

      await updateAttendanceForLeave(
        c.env.DB, user.org_id, leave.user_id, leave.department_id,
        leave.start_date, leave.end_date, leave.type
      )
    }

    const updated = await c.env.DB.prepare(
      'SELECT * FROM leave_requests WHERE id = ?'
    ).bind(id).first()
    return c.json({ leave_request: updated })
  }

  // Check if user is approver2 (CEO)
  if (leave.approver2_id === user.id && leave.approver2_status === 'pending') {
    if (leave.approver1_status !== 'approved' && leave.approver1_id) {
      return c.json({ error: '1차 승인이 완료되지 않았습니다' }, 400)
    }

    await c.env.DB.prepare(`
      UPDATE leave_requests
      SET approver2_status = 'approved', approver2_at = ?, status = 'approved', updated_at = datetime('now')
      WHERE id = ?
    `).bind(now, id).run()

    await updateAttendanceForLeave(
      c.env.DB, user.org_id, leave.user_id, leave.department_id,
      leave.start_date, leave.end_date, leave.type
    )

    const updated = await c.env.DB.prepare(
      'SELECT * FROM leave_requests WHERE id = ?'
    ).bind(id).first()
    return c.json({ leave_request: updated })
  }

  return c.json({ error: '승인 권한이 없습니다' }, 403)
})

// ──────────────────────────────────────────────────────────────
// POST /:id/reject - reject at current stage
// ──────────────────────────────────────────────────────────────
leaveRoutes.post('/:id/reject', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const body = await c.req.json<{ comment?: string }>().catch(() => ({}))
  const comment = (body as { comment?: string }).comment || ''

  const leave = await c.env.DB.prepare(
    'SELECT * FROM leave_requests WHERE id = ? AND org_id = ? AND is_deleted = 0'
  ).bind(id, user.org_id).first<{
    id: string; status: string
    approver1_id: string | null; approver1_status: string
    approver2_id: string | null; approver2_status: string
  }>()

  if (!leave) {
    return c.json({ error: '휴가 신청을 찾을 수 없습니다' }, 404)
  }

  if (leave.status !== 'pending') {
    return c.json({ error: '대기 중인 신청만 반려할 수 있습니다' }, 400)
  }

  const now = new Date().toISOString()

  // Check if user is approver1
  if (leave.approver1_id === user.id && leave.approver1_status === 'pending') {
    await c.env.DB.prepare(`
      UPDATE leave_requests
      SET approver1_status = 'rejected', approver1_at = ?, approver1_comment = ?,
          status = 'rejected', updated_at = datetime('now')
      WHERE id = ?
    `).bind(now, comment, id).run()

    const updated = await c.env.DB.prepare(
      'SELECT * FROM leave_requests WHERE id = ?'
    ).bind(id).first()
    return c.json({ leave_request: updated })
  }

  // Check if user is approver2
  if (leave.approver2_id === user.id && leave.approver2_status === 'pending') {
    await c.env.DB.prepare(`
      UPDATE leave_requests
      SET approver2_status = 'rejected', approver2_at = ?, approver2_comment = ?,
          status = 'rejected', updated_at = datetime('now')
      WHERE id = ?
    `).bind(now, comment, id).run()

    const updated = await c.env.DB.prepare(
      'SELECT * FROM leave_requests WHERE id = ?'
    ).bind(id).first()
    return c.json({ leave_request: updated })
  }

  return c.json({ error: '반려 권한이 없습니다' }, 403)
})
