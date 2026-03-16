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
  update: (id: string, data: { is_admin?: boolean; position_id?: string }) =>
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
  list: (params: { dept_id?: string; parent_id?: string }) => {
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
}

// Vault
export const vaultApi = {
  list: (deptId: string) =>
    request<{ credentials: any[] }>(`/vault?dept_id=${deptId}`),
  get: (id: string, deptId: string) =>
    request<{ credential: any }>(`/vault/${id}?dept_id=${deptId}`),
  create: (deptId: string, data: { service_name: string; url?: string; username: string; password: string; notes?: string }) =>
    request<{ credential: any }>(`/vault?dept_id=${deptId}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, deptId: string, data: any) =>
    request<{ success: boolean }>(`/vault/${id}?dept_id=${deptId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string, deptId: string) =>
    request<{ success: boolean }>(`/vault/${id}?dept_id=${deptId}`, { method: 'DELETE' }),
  auditLog: (id: string, deptId: string) =>
    request<{ logs: any[] }>(`/vault/${id}/log?dept_id=${deptId}`),
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
