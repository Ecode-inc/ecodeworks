import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { dashboardApi } from '../../lib/api'
import type { DashboardStats } from '../../lib/api'
import { Calendar, KanbanSquare, FileText, KeyRound, Bug, ClipboardCheck, Users, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'

const modules = [
  { key: 'calendar', icon: Calendar, label: '캘린더', path: '/calendar', color: 'bg-blue-500', desc: '일정 관리' },
  { key: 'kanban', icon: KanbanSquare, label: '업무보드', path: '/kanban', color: 'bg-green-500', desc: '업무 관리' },
  { key: 'docs', icon: FileText, label: '문서', path: '/docs', color: 'bg-purple-500', desc: '마크다운 위키' },
  { key: 'vault', icon: KeyRound, label: '비밀번호 금고', path: '/vault', color: 'bg-amber-500', desc: '자격증명 관리' },
  { key: 'qa', icon: Bug, label: 'QA', path: '/qa', color: 'bg-red-500', desc: 'QA 대시보드' },
]

export function DashboardPage() {
  const { user, organization } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dashboardApi.stats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          안녕하세요, {user?.name}님
        </h1>
        <p className="text-gray-500 mt-1">
          {organization?.name} 대시보드
        </p>
      </div>

      {/* Stat widgets */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="animate-spin mr-2" size={20} />
          <span>통계 불러오는 중...</span>
        </div>
      ) : stats ? (
        <div className="mb-8 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                  <Calendar size={20} />
                </div>
                <span className="text-sm text-gray-500">이번 주 일정</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.eventsThisWeek}</p>
            </div>

            <div className="bg-white border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-green-100 text-green-600">
                  <KanbanSquare size={20} />
                </div>
                <span className="text-sm text-gray-500">진행 중 태스크</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.pendingTasks}</p>
            </div>

            <div className="bg-white border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-orange-100 text-orange-600">
                  <ClipboardCheck size={20} />
                </div>
                <span className="text-sm text-gray-500">대기 중 결재</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.pendingLeave + stats.pendingPurchases}</p>
            </div>

            <div className="bg-white border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-teal-100 text-teal-600">
                  <Users size={20} />
                </div>
                <span className="text-sm text-gray-500">오늘 출근</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.todayAttendance}</p>
            </div>
          </div>

          {/* Recent documents */}
          {stats.recentDocs.length > 0 && (
            <div className="bg-white border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <FileText size={16} />
                최근 업데이트된 문서
              </h3>
              <ul className="divide-y">
                {stats.recentDocs.map((doc) => (
                  <li
                    key={doc.id}
                    className="py-2 flex items-center justify-between cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
                    onClick={() => navigate(`/docs/${doc.id}`)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                      <p className="text-xs text-gray-400">{doc.author_name}</p>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                      {dayjs(doc.updated_at.endsWith('Z') ? doc.updated_at : doc.updated_at + 'Z').format('MM/DD HH:mm')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}

      {/* Module navigation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod) => (
          <button
            key={mod.key}
            onClick={() => navigate(mod.path)}
            className="flex items-start gap-4 p-5 bg-white rounded-xl border hover:border-gray-300 hover:shadow-sm transition-all text-left"
          >
            <div className={`p-3 rounded-lg ${mod.color} text-white`}>
              <mod.icon size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{mod.label}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{mod.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
