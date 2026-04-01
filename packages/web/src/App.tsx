import { useEffect, useState } from 'react'
import { VersionCheck } from './components/layout/VersionCheck'
import { Routes, Route, useLocation, Link } from 'react-router-dom'
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
import { AttendancePage } from './components/attendance/AttendancePage'
import { LeavePage } from './components/attendance/LeavePage'
import { SettingsPage } from './components/settings/SettingsPage'
import { AIPage } from './components/ai/AIPage'
import { AIGuidePage } from './components/ai/AIGuidePage'
import { ToastContainer } from './components/ui/Toast'
import { SuperAdminPage } from './components/super/SuperAdminPage'
import { SharedDocPage } from './components/docs/SharedDocPage'
import { PurchasesPage } from './components/purchases/PurchasesPage'
import { BankingPage } from './components/banking/BankingPage'
import { AIBoardPublic } from './components/ai/AIBoardPublic'

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

  // Public AI Board - no auth required
  if (location.pathname === '/board' || location.pathname.startsWith('/board/') || location.pathname.startsWith('/board-view/')) {
    return <AIBoardPublic />
  }

  // Public shared document page - no auth required
  const shareMatch = location.pathname.match(/^\/(share|view)\/(.+)/)
  if (shareMatch) {
    const token = shareMatch[2]
    return (
      <>
        <SharedDocPage token={token} />
        <ToastContainer />
      </>
    )
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

  // Auto-select first department only on initial load (not when user selects "전체")
  const initialDeptSet = useState(false)
  useEffect(() => {
    if (departments.length > 0 && !currentDeptId && !initialDeptSet[0]) {
      initialDeptSet[1](true)
      // Don't auto-select - let user see "전체 부서" by default
    }
  }, [departments])

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
      <VersionCheck />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/leave" element={<LeavePage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/kanban" element={<KanbanPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/docs/:docId" element={<DocsPage />} />
        <Route path="/vault" element={<VaultPage />} />
        <Route path="/qa" element={<QAPage />} />
        <Route path="/ai" element={<AIPage />} />

        <Route path="/banking" element={<BankingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <ToastContainer />
    </AppShell>
  )
}

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
      <p className="text-lg text-gray-600 mb-6">페이지를 찾을 수 없습니다</p>
      <Link
        to="/"
        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
      >
        대시보드로 돌아가기
      </Link>
    </div>
  )
}
