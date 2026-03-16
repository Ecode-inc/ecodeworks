import { useAuthStore } from '../../stores/authStore'
import { useWSStore } from '../../stores/wsStore'
import { LogOut, Wifi, WifiOff, User } from 'lucide-react'
import { DeptSelector } from './DeptSelector'

export function TopBar() {
  const { user, organization, logout } = useAuthStore()
  const { connected, onlineUsers } = useWSStore()

  return (
    <header className="h-14 bg-white border-b flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gray-600">
          {organization?.name}
        </span>
        <DeptSelector />
      </div>

      <div className="flex items-center gap-3">
        {/* Online indicator */}
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          {connected ? (
            <Wifi size={16} className="text-green-500" />
          ) : (
            <WifiOff size={16} className="text-gray-400" />
          )}
          {onlineUsers.length > 0 && (
            <span>{onlineUsers.length} online</span>
          )}
        </div>

        {/* User */}
        <div className="flex items-center gap-2 px-2 py-1 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center">
            <User size={14} className="text-primary-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">
            {user?.name}
            {user?.position_name && (
              <span className="ml-1 text-xs text-gray-400">{user.position_name}</span>
            )}
          </span>
        </div>

        <button
          onClick={logout}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          title="로그아웃"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}
