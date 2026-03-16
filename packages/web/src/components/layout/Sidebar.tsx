import { useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Calendar,
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

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const navItems = [
  { path: '/', icon: LayoutDashboard, label: '대시보드' },
  { path: '/calendar', icon: Calendar, label: '캘린더' },
  { path: '/kanban', icon: KanbanSquare, label: '칸반' },
  { path: '/docs', icon: FileText, label: '문서' },
  { path: '/vault', icon: KeyRound, label: '비밀번호 금고' },
  { path: '/qa', icon: Bug, label: 'QA' },
]

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const organization = useAuthStore((s) => s.organization)
  const showSettings = user?.is_ceo || user?.is_admin
  const apiBase = import.meta.env.VITE_API_URL || '/api'

  const allItems = showSettings
    ? [...navItems, { path: '/ai', icon: Bot, label: 'AI' }, { path: '/settings', icon: Settings, label: '설정' }]
    : navItems

  return (
    <aside
      className={`flex flex-col bg-gray-900 text-gray-300 transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-gray-800">
        {!collapsed && (
          organization?.logo_url ? (
            <img
              src={`${apiBase}${organization.logo_url.replace(/^\/api/, '')}`}
              alt={organization.name || 'ecode'}
              className="h-8 max-w-[120px] object-contain"
            />
          ) : (
            <span className="text-lg font-bold text-white">ecode</span>
          )
        )}
        <button
          onClick={onToggle}
          className={`p-1 rounded hover:bg-gray-800 ${collapsed ? 'mx-auto' : 'ml-auto'}`}
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
              className={`flex items-center w-full px-4 py-2.5 text-sm transition-colors ${
                active
                  ? 'bg-primary-600/20 text-primary-400 border-r-2 border-primary-400'
                  : 'hover:bg-gray-800 hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={20} />
              {!collapsed && <span className="ml-3">{item.label}</span>}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
