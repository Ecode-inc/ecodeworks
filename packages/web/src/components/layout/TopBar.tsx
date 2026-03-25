import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useWSStore } from '../../stores/wsStore'
import { notificationApi } from '../../lib/api'
import { LogOut, Wifi, WifiOff, User, Menu, Bell } from 'lucide-react'
import { DeptSelector } from './DeptSelector'

interface TopBarProps {
  onMenuToggle: () => void
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)

  if (diff < 60) return '방금 전'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`
  return new Date(dateStr).toLocaleDateString('ko-KR')
}

function typeIcon(type: string): string {
  switch (type) {
    case 'board_post': return '\u{1F4CB}'
    case 'board_comment': return '\u{1F4AC}'
    case 'task_assigned': return '\u2705'
    case 'doc_updated': return '\u{1F4DD}'
    default: return '\u{1F514}'
  }
}

export function TopBar({ onMenuToggle }: TopBarProps) {
  const { user, organization, logout } = useAuthStore()
  const { connected, onlineUsers } = useWSStore()
  const navigate = useNavigate()

  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await notificationApi.count()
      setUnreadCount(data.count)
    } catch {
      // silently ignore
    }
  }, [])

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await notificationApi.list({ limit: 20 })
      setNotifications(data.notifications)
    } catch {
      // silently ignore
    }
  }, [])

  // Poll unread count every 30 seconds
  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (notifOpen) {
      fetchNotifications()
    }
  }, [notifOpen, fetchNotifications])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    if (notifOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [notifOpen])

  const handleNotificationClick = async (notif: any) => {
    if (!notif.is_read) {
      try {
        await notificationApi.markRead(notif.id)
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: 1 } : n))
        setUnreadCount(prev => Math.max(0, prev - 1))
      } catch {
        // ignore
      }
    }
    if (notif.link) {
      navigate(notif.link)
    }
    setNotifOpen(false)
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))
      setUnreadCount(0)
    } catch {
      // ignore
    }
  }

  return (
    <header className="h-14 bg-white border-b flex items-center justify-between px-3 sm:px-4 shrink-0">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        {/* Hamburger menu - mobile only */}
        <button
          onClick={onMenuToggle}
          className="p-2 text-gray-500 hover:text-gray-700 md:hidden flex-shrink-0"
        >
          <Menu size={20} />
        </button>

        <span className="hidden sm:inline text-sm font-medium text-gray-600 truncate">
          {organization?.name}
        </span>
        <div className="max-w-[120px] sm:max-w-none">
          <DeptSelector />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {/* Online indicator - hidden on mobile */}
        <div className="hidden md:flex items-center gap-1.5 text-sm text-gray-500">
          {connected ? (
            <Wifi size={16} className="text-green-500" />
          ) : (
            <WifiOff size={16} className="text-gray-400" />
          )}
          {onlineUsers.length > 0 && (
            <span>{onlineUsers.length} online</span>
          )}
        </div>

        {/* Notification Bell */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setNotifOpen(prev => !prev)}
            className="relative p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            title="알림"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border shadow-lg max-h-96 overflow-y-auto z-50">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white rounded-t-xl">
                <h3 className="text-sm font-semibold text-gray-800">알림</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                  >
                    모두 읽음
                  </button>
                )}
              </div>

              {/* Notification list */}
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  알림이 없습니다
                </div>
              ) : (
                <div>
                  {notifications.map(notif => (
                    <button
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b last:border-b-0 ${
                        !notif.is_read ? 'bg-blue-50/50 border-l-2 border-l-blue-400' : ''
                      }`}
                    >
                      <div className="flex gap-2.5">
                        <span className="text-base flex-shrink-0 mt-0.5">{typeIcon(notif.type)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{notif.title}</p>
                          {notif.body && (
                            <p className="text-xs text-gray-500 truncate mt-0.5">{notif.body}</p>
                          )}
                          <p className="text-[11px] text-gray-400 mt-1">{timeAgo(notif.created_at)}</p>
                        </div>
                        {!notif.is_read && (
                          <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* User */}
        <div className="flex items-center gap-2 px-2 py-1 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            <User size={14} className="text-primary-600" />
          </div>
          <span className="hidden sm:inline text-sm font-medium text-gray-700">
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
