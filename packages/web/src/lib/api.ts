import type { AuthResponse, TokenRefreshResponse } from './types'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

let accessToken: string | null = null
let refreshTokenValue: string | null = null
let refreshPromise: Promise<void> | null = null

export function setTokens(access: string, refresh: string) {
  accessToken = access
  refreshTokenValue = refresh
  localStorage.setItem('refreshToken', refresh)
}

export function clearTokens() {
  accessToken = null
  refreshTokenValue = null
  localStorage.removeItem('refreshToken')
}

export function getStoredRefreshToken(): string | null {
  return refreshTokenValue || localStorage.getItem('refreshToken')
}

export function getAccessToken(): string | null {
  return accessToken
}

async function refreshAccessToken(): Promise<void> {
  const rt = getStoredRefreshToken()
  if (!rt) throw new Error('No refresh token')

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  })

  if (!res.ok) {
    clearTokens()
    throw new Error('Token refresh failed')
  }

  const data: TokenRefreshResponse = await res.json()
  setTokens(data.accessToken, data.refreshToken)
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // If no access token but refresh token exists, refresh first
  if (!accessToken && getStoredRefreshToken()) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null })
    }
    await refreshPromise
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401 && getStoredRefreshToken()) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null })
    }
    await refreshPromise
    headers['Authorization'] = `Bearer ${accessToken}`
    res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error((error as any).error || `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

// Auth
export const authApi = {
  register: (data: { email: string; password: string; name: string; orgName: string }) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string; orgSlug: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<{ user: any; departments: any[] }>('/auth/me'),
}

// Organizations
export const orgApi = {
  get: () => request<{ organization: any }>('/organizations'),
  update: (data: { name?: string; sidebar_theme?: string; sidebar_color?: string }) =>
    request<{ organization: any }>('/organizations', { method: 'PATCH', body: JSON.stringify(data) }),
  updateSlug: (slug: string) =>
    request<{ organization: any }>('/organizations/slug', { method: 'PATCH', body: JSON.stringify({ slug }) }),
  uploadLogo: async (file: File): Promise<{ logo_url: string }> => {
    const formData = new FormData()
    formData.append('file', file)

    const headers: Record<string, string> = {}
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const res = await fetch(`${API_BASE}/organizations/logo`, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error((error as any).error || `HTTP ${res.status}`)
    }

    return res.json()
  },
}

// Dashboard
export interface DashboardStats {
  eventsThisWeek: number
  pendingTasks: number
  pendingLeave: number
  pendingPurchases: number
  recentDocs: { id: string; title: string; updated_at: string; created_by: string; author_name: string }[]
  todayAttendance: number
}

export const dashboardApi = {
  stats: () => request<DashboardStats>('/organizations/dashboard'),
}

// Departments
export const deptApi = {
  list: () => request<{ departments: any[] }>('/departments'),
  create: (data: { name: string; color?: string }) =>
    request<{ department: any }>('/departments', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; color?: string }) =>
    request<{ department: any }>(`/departments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/departments/${id}`, { method: 'DELETE' }),
  updatePermissions: (id: string, permissions: { module: string; permission: string }[]) =>
    request<{ success: boolean }>(`/departments/${id}/permissions`, { method: 'PATCH', body: JSON.stringify({ permissions }) }),
}

// Members
export const membersApi = {
  list: () => request<{ members: any[] }>('/members'),
  get: (id: string) => request<{ member: any; departments: any[] }>(`/members/${id}`),
  invite: (data: { email: string; password: string; name: string; departmentId: string; role?: string; positionId?: string }) =>
    request<{ member: any }>('/members', { method: 'POST', body: JSON.stringify(data) }),
  addDepartment: (id: string, departmentId: string, role?: string) =>
    request<{ success: boolean }>(`/members/${id}/departments`, { method: 'POST', body: JSON.stringify({ departmentId, role }) }),
  removeDepartment: (id: string, deptId: string) =>
    request<{ success: boolean }>(`/members/${id}/departments/${deptId}`, { method: 'DELETE' }),
  update: (id: string, data: { is_admin?: boolean; position_id?: string; is_attendance_admin?: number; hire_date?: string }) =>
    request<{ member: any }>(`/members/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
}

// Positions
export const positionsApi = {
  list: () => request<{ positions: any[] }>('/positions'),
  create: (data: { name: string; level: number }) =>
    request<{ position: any }>('/positions', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; level?: number }) =>
    request<{ position: any }>(`/positions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/positions/${id}`, { method: 'DELETE' }),
  seed: () =>
    request<{ positions: any[] }>('/positions/seed', { method: 'POST' }),
}

// Calendar
export const calendarApi = {
  listEvents: (params: { dept_id?: string; start?: string; end?: string }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString()
    return request<{ events: any[] }>(`/calendar/events${qs ? `?${qs}` : ''}`)
  },
  createEvent: (deptId: string, data: any) =>
    request<{ event: any }>(`/calendar/events?dept_id=${deptId}`, { method: 'POST', body: JSON.stringify(data) }),
  updateEvent: (id: string, data: any) =>
    request<{ event: any }>(`/calendar/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteEvent: (id: string) =>
    request<{ success: boolean }>(`/calendar/events/${id}`, { method: 'DELETE' }),
  googleStatus: () => request<{ connected: boolean; available?: boolean; lastSyncedAt: string | null }>('/calendar/google/status'),
  googleConnect: () => request<{ authUrl: string }>('/calendar/google/connect', { method: 'POST' }),
  googleSync: (deptId: string) =>
    request<{ synced: number }>(`/calendar/google/sync?dept_id=${deptId}`, { method: 'POST' }),
}

// Kanban
export const boardsApi = {
  list: (deptId?: string) =>
    request<{ boards: any[] }>(`/boards${deptId ? `?dept_id=${deptId}` : ''}`),
  get: (id: string) =>
    request<{ board: any; columns: any[]; tasks: any[] }>(`/boards/${id}`),
  create: (deptId: string, name: string, visibility?: string) =>
    request<{ board: any }>(`/boards?dept_id=${deptId}`, { method: 'POST', body: JSON.stringify({ name, visibility }) }),
  update: (id: string, data: { name?: string; visibility?: string }) =>
    request<{ board: any }>(`/boards/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/boards/${id}`, { method: 'DELETE' }),
  addColumn: (boardId: string, data: { name: string; color?: string; wip_limit?: number }) =>
    request<{ column: any }>(`/boards/${boardId}/columns`, { method: 'POST', body: JSON.stringify(data) }),
  updateColumn: (colId: string, data: any) =>
    request<{ column: any }>(`/boards/columns/${colId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteColumn: (colId: string) =>
    request<{ success: boolean }>(`/boards/columns/${colId}`, { method: 'DELETE' }),
  reorderColumns: (boardId: string, orders: { id: string; order_index: number }[]) =>
    request<{ success: boolean }>(`/boards/${boardId}/columns/reorder`, { method: 'PATCH', body: JSON.stringify({ orders }) }),
}

export const tasksApi = {
  all: (params?: { assignee_id?: string }) => {
    const qs = params?.assignee_id ? `?assignee_id=${params.assignee_id}` : ''
    return request<{ tasks: any[] }>(`/tasks/all${qs}`)
  },
  get: (id: string) => request<{ task: any }>(`/tasks/${id}`),
  create: (data: any) =>
    request<{ task: any }>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    request<{ task: any }>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
  reorder: (tasks: { id: string; column_id: string; order_index: number }[]) =>
    request<{ success: boolean }>('/tasks/reorder', { method: 'PATCH', body: JSON.stringify({ tasks }) }),
}

// Documents
export const docsApi = {
  list: (params: { dept_id?: string; parent_id?: string; flat?: string }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString()
    return request<{ documents: any[] }>(`/docs${qs ? `?${qs}` : ''}`)
  },
  get: (id: string) => request<{ document: any }>(`/docs/${id}`),
  create: (deptId: string, data: { title: string; content?: string; parent_id?: string; is_folder?: boolean; visibility?: string; shared?: boolean }) =>
    request<{ document: any }>(`/docs?dept_id=${deptId}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { title?: string; content?: string; parent_id?: string; visibility?: string; shared?: boolean; expected_updated_at?: string }) =>
    request<{ document: any }>(`/docs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/docs/${id}`, { method: 'DELETE' }),
  search: (q: string, deptId?: string) =>
    request<{ documents: any[] }>(`/docs/search?q=${encodeURIComponent(q)}${deptId ? `&dept_id=${deptId}` : ''}`),
  versions: (id: string) => request<{ versions: any[] }>(`/docs/${id}/versions`),
  getVersion: (id: string, versionId: string) => request<{ version: any }>(`/docs/${id}/versions/${versionId}`),
  linkedTasks: (id: string) => request<{ tasks: any[] }>(`/docs/${id}/tasks`),
}

// Document Share Links
export const docShareApi = {
  create: (docId: string, data: { share_type: string; expires_at?: string; internal_scope?: string; internal_target_ids?: string[] }) =>
    request<{ share: any; url: string }>(`/docs/${docId}/share`, { method: 'POST', body: JSON.stringify(data) }),
  list: (docId: string) => request<{ shares: any[] }>(`/docs/${docId}/shares`),
  delete: (shareId: string) => request<{ success: boolean }>(`/docs/shares/${shareId}`, { method: 'DELETE' }),
}

// Public share view (no auth needed)
export async function fetchSharedDoc(token: string): Promise<{ document: any }> {
  const base = import.meta.env.VITE_API_URL || '/api'
  const res = await fetch(`${base}/share/${token}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}

// Vault
export const vaultApi = {
  list: (deptId: string) =>
    request<{ credentials: any[] }>(`/vault?dept_id=${deptId}`),
  get: (id: string, deptId: string, vaultToken?: string) => {
    const params = new URLSearchParams({ dept_id: deptId })
    if (vaultToken) params.set('vault_token', vaultToken)
    return request<{ credential: any }>(`/vault/${id}?${params.toString()}`)
  },
  create: (deptId: string, data: { service_name: string; url?: string; username: string; password: string; notes?: string }) =>
    request<{ credential: any }>(`/vault?dept_id=${deptId}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, deptId: string, data: any) =>
    request<{ success: boolean }>(`/vault/${id}?dept_id=${deptId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string, deptId: string) =>
    request<{ success: boolean }>(`/vault/${id}?dept_id=${deptId}`, { method: 'DELETE' }),
  auditLog: (id: string, deptId: string) =>
    request<{ logs: any[] }>(`/vault/${id}/log?dept_id=${deptId}`),
  setPin: (pin: string) =>
    request<{ success: boolean }>('/vault/pin', { method: 'POST', body: JSON.stringify({ pin }) }),
  verifyPin: (pin: string) =>
    request<{ vault_token: string; expires_in: number }>('/vault/pin/verify', { method: 'POST', body: JSON.stringify({ pin }) }),
  pinStatus: () =>
    request<{ has_pin: boolean; unlocked: boolean }>('/vault/pin/status'),
}

// QA
export const qaApi = {
  listLinks: () => request<{ links: any[] }>('/qa/links'),
  createLink: (data: { name: string; url: string; visibility: string; department_id?: string; shared_with?: string[] }) =>
    request<{ link: any }>('/qa/links', { method: 'POST', body: JSON.stringify(data) }),
  updateLink: (id: string, data: any) =>
    request<{ link: any }>(`/qa/links/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteLink: (id: string) =>
    request<{ success: boolean }>(`/qa/links/${id}`, { method: 'DELETE' }),
  markSeen: (id: string) =>
    request<{ success: boolean }>(`/qa/links/${id}/seen`, { method: 'POST' }),
}

// Attendance
export const attendanceApi = {
  today: () => request<{ record: any }>('/attendance/today'),
  clockIn: (data?: { note?: string }) =>
    request<{ record: any }>('/attendance/clock-in', { method: 'POST', body: JSON.stringify(data || {}) }),
  clockOut: (data?: { note?: string }) =>
    request<{ record: any }>('/attendance/clock-out', { method: 'POST', body: JSON.stringify(data || {}) }),
  my: (params: { month?: string; start?: string; end?: string }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString()
    return request<{ records: any[] }>(`/attendance/my${qs ? '?' + qs : ''}`)
  },
  team: (params: { dept_id?: string; date?: string; month?: string }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString()
    return request<{ records: any[] }>(`/attendance/team${qs ? '?' + qs : ''}`)
  },
  stats: (params: { dept_id?: string; month?: string }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString()
    return request<{ stats: any }>(`/attendance/stats${qs ? '?' + qs : ''}`)
  },
  teamMonthly: (month: string) =>
    request<{ records: any[] }>(`/attendance/team-monthly?month=${month}`),
  teamMembers: () =>
    request<{ members: any[] }>('/attendance/team-members'),
}

// AI API Key Management
export const aiApi = {
  listKeys: () => request<{ keys: any[] }>('/ai/keys'),
  createKey: (data: { name: string; scopes: string[] }) =>
    request<{ id: string; name: string; key: string; prefix: string; scopes: string[] }>('/ai/keys', { method: 'POST', body: JSON.stringify(data) }),
  deleteKey: (id: string) =>
    request<{ success: boolean }>(`/ai/keys/${id}`, { method: 'DELETE' }),
}

// Super Admin API (uses separate token from sessionStorage)
const superRequest = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const token = sessionStorage.getItem('superToken')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error((error as Record<string, string>).error || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const superApi = {
  login: (email: string, password: string) =>
    superRequest<{ admin: { id: string; email: string; name: string }; token: string }>(
      '/super/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }
    ),
  setup: (data: { email: string; password: string; name: string }) =>
    superRequest<{ success: boolean; message: string }>(
      '/super/auth/setup', { method: 'POST', body: JSON.stringify(data) }
    ),
  dashboard: () =>
    superRequest<{ totalOrgs: number; totalUsers: number; planDistribution: { plan: string; cnt: number }[]; activeOrgs: number }>(
      '/super/dashboard'
    ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listOrgs: () =>
    superRequest<{ organizations: any[] }>('/super/organizations'),
  getOrg: (id: string) =>
    superRequest<{ organization: any; users: any[]; departments: any[] }>(`/super/organizations/${id}`),
  updateOrg: (id: string, data: { name?: string; slug?: string }) =>
    superRequest<{ organization: any }>(`/super/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  suspendOrg: (id: string) =>
    superRequest<{ success: boolean }>(`/super/organizations/${id}/suspend`, { method: 'POST' }),
  activateOrg: (id: string) =>
    superRequest<{ success: boolean }>(`/super/organizations/${id}/activate`, { method: 'POST' }),
  getSubscription: (id: string) =>
    superRequest<{ subscription: any }>(`/super/organizations/${id}/subscription`),
  updateSubscription: (id: string, data: Record<string, unknown>) =>
    superRequest<{ subscription: any }>(`/super/organizations/${id}/subscription`, { method: 'PATCH', body: JSON.stringify(data) }),
  auditLog: (params?: Record<string, string>) => {
    const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString() : ''
    return superRequest<{ logs: any[] }>(`/super/audit${qs ? '?' + qs : ''}`)
  },
}

// Document Images
export const docImageApi = {
  list: (params: { document_id: string; tag?: string; person?: string }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v) as [string,string][]).toString()
    return request<{ images: any[] }>(`/doc-images?${qs}`)
  },
  upload: async (documentId: string, file: File, tags?: string[]): Promise<{ image: any }> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('document_id', documentId)
    if (tags?.length) formData.append('tags', tags.join(','))
    const headers: Record<string, string> = {}
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
    const res = await fetch(`${API_BASE}/doc-images/upload`, { method: 'POST', headers, body: formData })
    if (!res.ok) throw new Error('Upload failed')
    return res.json()
  },
  update: (id: string, data: { tags?: string[]; people?: {name: string}[]; ai_description?: string }) =>
    request<{ image: any }>(`/doc-images/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/doc-images/${id}`, { method: 'DELETE' }),
  tagPerson: (id: string, name: string) =>
    request<{ image: any }>(`/doc-images/${id}/tag-person`, { method: 'POST', body: JSON.stringify({ name }) }),
  search: (params: { tag?: string; person?: string; document_id?: string }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v) as [string,string][]).toString()
    return request<{ images: any[] }>(`/doc-images/search?${qs}`)
  },
}

// Join Requests
export const joinRequestApi = {
  submit: (data: { orgSlug: string; email: string; password: string; name: string; message?: string; departmentId?: string }) =>
    request<{ success: boolean; message: string }>('/join-requests', { method: 'POST', body: JSON.stringify(data) }),
  departments: (orgSlug: string) =>
    request<{ departments: { id: string; name: string; color: string }[] }>(`/join-requests/departments?orgSlug=${encodeURIComponent(orgSlug)}`),
  list: () => request<{ requests: any[] }>('/join-requests'),
  count: () => request<{ count: number }>('/join-requests/count'),
  approve: (id: string, data: { departmentId?: string; role?: string }) =>
    request<{ member: any }>(`/join-requests/${id}/approve`, { method: 'POST', body: JSON.stringify(data) }),
  reject: (id: string) =>
    request<{ success: boolean }>(`/join-requests/${id}/reject`, { method: 'POST' }),
}

// Leave Management
export const leaveApi = {
  list: (params?: { status?: string; user_id?: string; dept_id?: string; month?: string; include_deleted?: string }) => {
    const qs = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v) as [string, string][]).toString()
    return request<{ requests: any[] }>(`/leave${qs ? '?' + qs : ''}`)
  },
  get: (id: string) => request<{ request: any }>(`/leave/${id}`),
  create: (data: any) => request<{ request: any }>('/leave', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request<{ request: any }>(`/leave/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  cancel: (id: string) => request<{ success: boolean }>(`/leave/${id}/cancel`, { method: 'POST' }),
  softDelete: (id: string) => request<{ success: boolean }>(`/leave/${id}/delete`, { method: 'POST' }),
  restore: (id: string) => request<{ success: boolean }>(`/leave/${id}/restore`, { method: 'POST' }),
  approve: (id: string) => request<{ request: any }>(`/leave/${id}/approve`, { method: 'POST' }),
  reject: (id: string, comment?: string) => request<{ request: any }>(`/leave/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) }),
  pendingCount: () => request<{ count: number }>('/leave/pending-count'),
  trash: () => request<{ requests: any[] }>('/leave/trash'),
  balance: (params: { user_id?: string; year?: number }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])).toString()
    return request<{ user_id: string; year: number; hire_date: string; accrued: number; adjustments: number; used: number; remaining: number; details: Record<string, number> }>(`/leave/balance${qs ? '?' + qs : ''}`)
  },
  balances: (year: number) =>
    request<{ balances: { user_id: string; user_name: string; hire_date: string; accrued: number; adjustments: number; used: number; remaining: number }[]; year: number }>(`/leave/balances?year=${year}`),
  adjust: (data: { user_id: string; year: number; type: string; days: number; reason: string }) =>
    request<{ adjustment: any }>('/leave/balance/adjust', { method: 'POST', body: JSON.stringify(data) }),
  upload: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData()
    formData.append('file', file)

    const headers: Record<string, string> = {}
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const res = await fetch(`${API_BASE}/leave/upload`, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error((error as any).error || `HTTP ${res.status}`)
    }

    return res.json()
  },
}

// Purchase Management
export const purchaseApi = {
  list: (params?: { status?: string; month?: string; dept_id?: string; category_id?: string }) => {
    const qs = new URLSearchParams(Object.entries(params || {}).filter(([,v]) => v) as [string,string][]).toString()
    return request<{ purchases: any[] }>(`/purchases${qs ? '?' + qs : ''}`)
  },
  get: (id: string) => request<{ purchase: any }>(`/purchases/${id}`),
  create: (data: any) => request<{ purchase: any }>('/purchases', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request<{ purchase: any }>(`/purchases/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  approve: (id: string) => request<{ purchase: any }>(`/purchases/${id}/approve`, { method: 'POST' }),
  reject: (id: string, comment?: string) => request<{ purchase: any }>(`/purchases/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) }),
  order: (id: string) => request<{ purchase: any }>(`/purchases/${id}/order`, { method: 'POST' }),
  deliver: (id: string) => request<{ purchase: any }>(`/purchases/${id}/deliver`, { method: 'POST' }),
  returnItem: (id: string) => request<{ purchase: any }>(`/purchases/${id}/return`, { method: 'POST' }),
  cancel: (id: string) => request<{ purchase: any }>(`/purchases/${id}/cancel`, { method: 'POST' }),
  softDelete: (id: string) => request<{ success: boolean }>(`/purchases/${id}/delete`, { method: 'POST' }),
  stats: (params?: { month?: string; dept_id?: string }) => {
    const qs = new URLSearchParams(Object.entries(params || {}).filter(([,v]) => v) as [string,string][]).toString()
    return request<{ stats: any }>(`/purchases/stats${qs ? '?' + qs : ''}`)
  },
  categories: () => request<{ categories: any[] }>('/purchases/categories'),
  createCategory: (data: { name: string; color?: string }) => request<{ category: any }>('/purchases/categories', { method: 'POST', body: JSON.stringify(data) }),
  seedCategories: () => request<{ categories: any[] }>('/purchases/categories/seed', { method: 'POST' }),
}

// Document Files
export const docFileApi = {
  list: (documentId: string) =>
    request<{ files: any[] }>(`/doc-files?document_id=${documentId}`),
  upload: async (documentId: string, file: File): Promise<{ file: any }> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('document_id', documentId)
    const headers: Record<string, string> = {}
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
    const res = await fetch(`${API_BASE}/doc-files/upload`, { method: 'POST', headers, body: formData })
    if (!res.ok) throw new Error('Upload failed')
    return res.json()
  },
  delete: (id: string) =>
    request<{ success: boolean }>(`/doc-files/${id}`, { method: 'DELETE' }),
}

// Banking (Open Banking)
export const bankingApi = {
  connect: () => request<{ authUrl: string }>('/banking/connect', { method: 'POST' }),
  accounts: () => request<{ accounts: any[] }>('/banking/accounts'),
  balance: (id: string) => request<any>(`/banking/balance?connection_id=${id}`),
  transactions: (id: string, from: string, to: string) =>
    request<any>(`/banking/transactions?connection_id=${id}&from_date=${from}&to_date=${to}`),
  disconnect: (id: string) => request<{ success: boolean }>(`/banking/accounts/${id}`, { method: 'DELETE' }),
}

// AI Board
export const aiBoardApi = {
  list: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const q = qs.toString()
    return request<{ posts: any[] }>(`/ai-board${q ? '?' + q : ''}`)
  },
  get: (id: string) => request<{ post: any; comments: any[] }>(`/ai-board/${id}`),
  create: (data: { title: string; content: string; tags?: string[]; is_private?: boolean }) =>
    request<{ post: any }>('/ai-board', { method: 'POST', body: JSON.stringify(data) }),
  comment: (postId: string, content: string) =>
    request<{ comment: any }>(`/ai-board/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/ai-board/${id}`, { method: 'DELETE' }),
  deleteComment: (commentId: string) =>
    request<{ success: boolean }>(`/ai-board/comments/${commentId}`, { method: 'DELETE' }),
  like: (id: string) =>
    request<{ likes: number }>(`/ai-board/${id}/like`, { method: 'POST' }),
}

// Notifications
export const notificationApi = {
  list: (params?: { limit?: number; unread_only?: number }) => {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.unread_only !== undefined) qs.set('unread_only', String(params.unread_only))
    const q = qs.toString()
    return request<{ notifications: any[] }>(`/notifications${q ? '?' + q : ''}`)
  },
  count: () => request<{ count: number }>('/notifications/count'),
  markRead: (id: string) => request<{ success: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => request<{ success: boolean }>('/notifications/read-all', { method: 'POST' }),
}

// Telegram Integration
export const telegramApi = {
  listChats: () => request<{ chats: any[] }>('/telegram/chats'),
  createChat: (data: { chat_id: string; chat_type: string; chat_title: string }) =>
    request<{ chat: any }>('/telegram/chats', { method: 'POST', body: JSON.stringify(data) }),
  updateChat: (id: string, data: any) =>
    request<{ chat: any }>(`/telegram/chats/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteChat: (id: string) =>
    request<{ success: boolean }>(`/telegram/chats/${id}`, { method: 'DELETE' }),
  listMappings: () => request<{ mappings: any[] }>('/telegram/mappings'),
  createMapping: (data: any) =>
    request<{ mapping: any }>('/telegram/mappings', { method: 'POST', body: JSON.stringify(data) }),
  updateMapping: (id: string, data: any) =>
    request<{ mapping: any }>(`/telegram/mappings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteMapping: (id: string) =>
    request<{ success: boolean }>(`/telegram/mappings/${id}`, { method: 'DELETE' }),
  listLogs: (params?: { chat_id?: string; telegram_user_id?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams(
      Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])
    ).toString()
    return request<{ logs: any[] }>(`/telegram/logs${qs ? '?' + qs : ''}`)
  },
}
