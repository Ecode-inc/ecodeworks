export interface Env {
  DB: D1Database
  FILES: R2Bucket
  WEBSOCKET_ROOM: DurableObjectNamespace
  JWT_SECRET: string
  VAULT_KEY: string
  QA_API_URL: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_REDIRECT_URI: string
  OPENBANKING_CLIENT_ID: string
  OPENBANKING_CLIENT_SECRET: string
  OPENBANKING_CALLBACK_URL: string
  MASTER_PASSWORD: string
}

// Database entities
export interface Organization {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface Department {
  id: string
  org_id: string
  name: string
  slug: string
  color: string
  order_index: number
  created_at: string
}

export interface User {
  id: string
  org_id: string
  email: string
  password_hash: string
  name: string
  avatar_url: string | null
  is_ceo: number
  is_admin: number
  created_at: string
}

export interface UserDepartment {
  user_id: string
  department_id: string
  role: 'head' | 'member'
}

export interface DepartmentPermission {
  department_id: string
  module: string
  permission: 'none' | 'read' | 'write' | 'admin'
}

export interface RefreshToken {
  user_id: string
  token_hash: string
  expires_at: string
  created_at: string
}

// JWT payload
export interface JWTPayload {
  sub: string       // user_id
  org: string       // org_id
  email: string
  name: string
  is_ceo: boolean
  is_admin: boolean
  iat: number
  exp: number
}

// Auth context attached to requests
export interface AuthUser {
  id: string
  org_id: string
  email: string
  name: string
  is_ceo: boolean
  is_admin: boolean
}

// Module names for RBAC
export type Module = 'calendar' | 'kanban' | 'docs' | 'vault' | 'qa'
export type Permission = 'none' | 'read' | 'write' | 'admin'
