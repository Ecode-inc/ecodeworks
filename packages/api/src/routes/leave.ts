import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

export const leaveRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

leaveRoutes.use('/*', authMiddleware)

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
