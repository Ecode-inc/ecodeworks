export interface User {
  id: string
  email: string
  name: string
  avatar_url: string | null
  is_ceo: boolean
  is_admin: boolean
  is_attendance_admin?: boolean
  org_id: string
  position_id?: string
  position_name?: string
  position_level?: number
}

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url?: string
  sidebar_theme?: 'dark' | 'light' | 'custom'
  sidebar_color?: string
}

export interface Department {
  id: string
  name: string
  slug: string
  color: string
  role?: 'head' | 'member'
}

export interface AuthResponse {
  user: User
  organization: Organization
  accessToken: string
  refreshToken: string
}

export interface TokenRefreshResponse {
  accessToken: string
  refreshToken: string
}
