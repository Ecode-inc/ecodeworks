import { useAuthStore } from '../../stores/authStore'
import { Calendar, KanbanSquare, FileText, KeyRound, Bug } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

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
