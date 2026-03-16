import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
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
import { ToastContainer } from './components/ui/Toast'

export default function App() {
  const { user, initialized, restore, departments } = useAuthStore()
  const { currentDeptId } = useOrgStore()
  const { connect, disconnect } = useWSStore()
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')

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
          <LoginPage onSwitchToRegister={() => setAuthMode('register')} />
        ) : (
          <RegisterPage onSwitchToLogin={() => setAuthMode('login')} />
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
      </Routes>
      <ToastContainer />
    </AppShell>
  )
}
