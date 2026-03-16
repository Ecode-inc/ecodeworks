import { useEffect, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useOrgStore } from './stores/orgStore'
import { useWSStore } from './stores/wsStore'
import { getAccessToken } from './lib/api'
import { AppShell } from './components/layout/AppShell'
import { LoginPage } from './components/auth/LoginPage'
import { RegisterPage } from './components/auth/RegisterPage'
import { DashboardPage } from './components/dashboard/DashboardPage'
import { CalendarPage } from './components/calendar/CalendarPage'
import { KanbanPage } from './components/kanban/KanbanPage'
import { DocsPage } from './components/docs/DocsPage'
import { VaultPage } from './components/vault/VaultPage'
import { QAPage } from './components/qa/QAPage'
import { SettingsPage } from './components/settings/SettingsPage'
import { AIPage } from './components/ai/AIPage'
import { AIGuidePage } from './components/ai/AIGuidePage'
import { ToastContainer } from './components/ui/Toast'
import { SuperAdminPage } from './components/super/SuperAdminPage'

export default function App() {
  const { user, initialized, restore, departments } = useAuthStore()
  const { currentDeptId } = useOrgStore()
  const { connect, disconnect } = useWSStore()
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [joinOrgSlug, setJoinOrgSlug] = useState<string | null>(null)
  const location = useLocation()

  // AI API Guide page when ?key= is present
  const searchParams = new URLSearchParams(location.search)
  const apiKey = searchParams.get('key')
  if (apiKey) {
    return <AIGuidePage apiKey={apiKey} />
  }

  // Super admin page is completely separate - render it immediately if on /super path
  if (location.pathname.startsWith('/super')) {
    return (
      <>
        <SuperAdminPage />
        <ToastContainer />
      </>
    )
  }

  // Restore session on mount
  useEffect(() => {
    restore()
  }, [])

  // Auto-select first department
  useEffect(() => {
    if (departments.length > 0 && !currentDeptId) {
      useOrgStore.getState().setCurrentDeptId(departments[0].id)
    }
  }, [departments, currentDeptId])

  // WebSocket connection
  useEffect(() => {
    if (user && currentDeptId) {
      const token = getAccessToken()
      if (token) {
        connect(currentDeptId, token)
      }
    }
    return () => disconnect()
  }, [user, currentDeptId])

  // Loading
  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  // Not logged in
  if (!user) {
    return (
      <>
        {authMode === 'login' ? (
          <LoginPage onSwitchToRegister={(orgSlug?: string | null) => {
            setJoinOrgSlug(orgSlug || null)
            setAuthMode('register')
          }} />
        ) : (
          <RegisterPage onSwitchToLogin={() => { setJoinOrgSlug(null); setAuthMode('login') }} orgSlug={joinOrgSlug} />
        )}
        <ToastContainer />
      </>
    )
  }

  // Logged in
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/kanban" element={<KanbanPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/vault" element={<VaultPage />} />
        <Route path="/qa" element={<QAPage />} />
        <Route path="/ai" element={<AIPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
      <ToastContainer />
    </AppShell>
  )
}
