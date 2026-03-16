import { useMemo, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Calendar,
  Clock,
  CalendarDays,
  KanbanSquare,
  FileText,
  KeyRound,
  Bug,
  Settings,
  Bot,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { leaveApi } from '../../lib/api'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const navItems = [
  { path: '/', icon: LayoutDashboard, label: '대시보드' },
  { path: '/calendar', icon: Calendar, label: '캘린더' },
  { path: '/attendance', icon: Clock, label: '근태관리' },
  { path: '/leave', icon: CalendarDays, label: '휴가/결재', badgeKey: 'leave' as const },
  { path: '/kanban', icon: KanbanSquare, label: '칸반' },
  { path: '/docs', icon: FileText, label: '문서' },
  { path: '/vault', icon: KeyRound, label: '비밀번호 금고' },
  { path: '/qa', icon: Bug, label: 'QA' },
]

/** Returns true if the color is light (should use dark text on top) */
function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  // Relative luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const organization = useAuthStore((s) => s.organization)
  const showSettings = user?.is_ceo || user?.is_admin
  const apiBase = import.meta.env.VITE_API_URL || '/api'
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0)

  useEffect(() => {
    if (user) {
      leaveApi.pendingCount()
        .then(res => setPendingLeaveCount(res.count))
        .catch(() => {})
    }
  }, [user, location.pathname])

  const allItems = showSettings
    ? [...navItems, { path: '/ai', icon: Bot, label: 'AI' }, { path: '/settings', icon: Settings, label: '설정' }]
    : navItems

  const theme = organization?.sidebar_theme || 'dark'
  const customColor = organization?.sidebar_color || '#111827'

  const themeStyles = useMemo(() => {
    if (theme === 'light') {
      return {
        bg: 'bg-white border-r border-gray-200',
        text: 'text-gray-700',
        hoverBg: 'hover:bg-gray-100 hover:text-gray-900',
        activeBg: 'bg-primary-50 text-primary-600 border-r-2 border-primary-600',
        borderColor: 'border-gray-200',
        toggleHover: 'hover:bg-gray-100',
        logoText: 'text-gray-900',
        logoBg: '',
      }
    }
    if (theme === 'custom') {
      const light = isLightColor(customColor)
      return {
        bg: '', // will use inline style
        text: light ? 'text-gray-800' : 'text-gray-200',
        hoverBg: light ? 'hover:bg-black/10 hover:text-gray-900' : 'hover:bg-white/10 hover:text-white',
        activeBg: light
          ? 'bg-black/10 text-gray-900 border-r-2 border-gray-900'
          : 'bg-white/15 text-white border-r-2 border-white',
        borderColor: light ? 'border-gray-300' : 'border-white/20',
        toggleHover: light ? 'hover:bg-black/10' : 'hover:bg-white/10',
        logoText: light ? 'text-gray-900' : 'text-white',
        logoBg: '',
      }
    }
    // dark (default)
    return {
      bg: 'bg-gray-900',
      text: 'text-gray-300',
      hoverBg: 'hover:bg-gray-800 hover:text-white',
      activeBg: 'bg-primary-600/20 text-primary-400 border-r-2 border-primary-400',
      borderColor: 'border-gray-800',
      toggleHover: 'hover:bg-gray-800',
      logoText: 'text-white',
      logoBg: '',
    }
  }, [theme, customColor])

  const inlineStyle = theme === 'custom' ? { backgroundColor: customColor } : undefined

  return (
    <aside
      className={`flex flex-col transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-56'
      } ${themeStyles.bg} ${themeStyles.text}`}
      style={inlineStyle}
    >
      {/* Logo */}
      <div className={`flex items-center h-14 px-4 border-b ${themeStyles.borderColor}`}>
        {!collapsed && (
          organization?.logo_url ? (
            <div className={theme === 'dark' ? 'bg-white/90 rounded px-1.5 py-0.5' : ''}>
              <img
                src={`${apiBase}${organization.logo_url.replace(/^\/api/, '')}`}
                alt={organization?.name || '이코드웍스'}
                className="h-7 max-w-[120px] object-contain"
              />
            </div>
          ) : (
            <span className={`text-lg font-bold ${themeStyles.logoText}`}>이코드웍스</span>
          )
        )}
        <button
          onClick={onToggle}
          className={`p-1 rounded ${themeStyles.toggleHover} ${collapsed ? 'mx-auto' : 'ml-auto'}`}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2">
        {allItems.map((item) => {
          const active = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path))

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`relative flex items-center w-full px-4 py-2.5 text-sm transition-colors ${
                active
                  ? themeStyles.activeBg
                  : themeStyles.hoverBg
              }`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={20} />
              {!collapsed && <span className="ml-3 flex-1 text-left">{item.label}</span>}
              {'badgeKey' in item && item.badgeKey === 'leave' && pendingLeaveCount > 0 && (
                <span className={`${collapsed ? 'absolute top-0.5 right-0.5' : 'ml-auto'} bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1`}>
                  {pendingLeaveCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
