import { create } from 'zustand'
import { authApi, setTokens, clearTokens, getStoredRefreshToken } from '../lib/api'
import type { User, Organization, Department } from '../lib/types'

interface AuthStore {
  user: User | null
  organization: Organization | null
  departments: Department[]
  loading: boolean
  initialized: boolean

  login: (email: string, password: string, orgSlug: string) => Promise<void>
  register: (email: string, password: string, name: string, orgName: string) => Promise<void>
  logout: () => void
  restore: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  organization: null,
  departments: [],
  loading: false,
  initialized: false,

  login: async (email, password, orgSlug) => {
    set({ loading: true })
    try {
      const res = await authApi.login({ email, password, orgSlug })
      setTokens(res.accessToken, res.refreshToken)

      // Fetch departments
      const meRes = await authApi.me()

      set({
        user: res.user,
        organization: res.organization,
        departments: meRes.departments,
        loading: false,
      })
    } catch (e) {
      set({ loading: false })
      throw e
    }
  },

  register: async (email, password, name, orgName) => {
    set({ loading: true })
    try {
      const res = await authApi.register({ email, password, name, orgName })
      setTokens(res.accessToken, res.refreshToken)

      const meRes = await authApi.me()

      set({
        user: res.user,
        organization: res.organization,
        departments: meRes.departments,
        loading: false,
      })
    } catch (e) {
      set({ loading: false })
      throw e
    }
  },

  logout: () => {
    clearTokens()
    set({ user: null, organization: null, departments: [], initialized: true })
  },

  restore: async () => {
    const rt = getStoredRefreshToken()
    if (!rt) {
      set({ initialized: true })
      return
    }

    try {
      // refresh will be handled by api.ts automatically
      const meRes = await authApi.me()
      set({
        user: meRes.user,
        departments: meRes.departments,
        initialized: true,
      })

      // Also fetch org
      const { orgApi } = await import('../lib/api')
      const orgRes = await orgApi.get()
      set({ organization: orgRes.organization })
    } catch {
      clearTokens()
      set({ initialized: true })
    }
  },
}))
