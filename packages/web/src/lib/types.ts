export interface User {
  id: string
  email: string
  name: string
  avatar_url: string | null
  is_ceo: boolean
  org_id: string
}

export interface Organization {
  id: string
  name: string
  slug: string
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
