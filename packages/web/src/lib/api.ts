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
  update: (data: { name: string }) =>
    request<{ organization: any }>('/organizations', { method: 'PATCH', body: JSON.stringify(data) }),
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
  invite: (data: { email: string; password: string; name: string; departmentId: string; role?: string }) =>
    request<{ member: any }>('/members', { method: 'POST', body: JSON.stringify(data) }),
  addDepartment: (id: string, departmentId: string, role?: string) =>
    request<{ success: boolean }>(`/members/${id}/departments`, { method: 'POST', body: JSON.stringify({ departmentId, role }) }),
  removeDepartment: (id: string, deptId: string) =>
    request<{ success: boolean }>(`/members/${id}/departments/${deptId}`, { method: 'DELETE' }),
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
  create: (deptId: string, name: string) =>
    request<{ board: any }>(`/boards?dept_id=${deptId}`, { method: 'POST', body: JSON.stringify({ name }) }),
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
  create: (deptId: string, data: { title: string; content?: string; parent_id?: string; is_folder?: boolean }) =>
    request<{ document: any }>(`/docs?dept_id=${deptId}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { title?: string; content?: string; parent_id?: string }) =>
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
  projects: () => request<{ projects: any[] }>('/qa/projects'),
  issues: (projectId: string, status?: string) =>
    request<{ issues: any[] }>(`/qa/projects/${projectId}/issues${status ? `?status=${status}` : ''}`),
  stats: () => request<{ stats: any }>('/qa/stats'),
}
