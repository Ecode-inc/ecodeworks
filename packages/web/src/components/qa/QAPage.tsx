import { useState, useEffect } from 'react'
import { qaApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { Bug } from 'lucide-react'

export function QAPage() {
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProject, setSelectedProject] = useState<any>(null)
  const [issues, setIssues] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    qaApi.projects().then(r => {
      setProjects(r.projects || [])
    }).catch((e: any) => {
      useToastStore.getState().addToast('error', 'QA 연결 실패', e.message)
    })
  }, [])

  const loadIssues = async (projectId: string) => {
    setLoading(true)
    try {
      const res = await qaApi.issues(projectId, statusFilter !== 'all' ? statusFilter : undefined)
      setIssues(res.issues || [])
    } catch (e: any) {
      useToastStore.getState().addToast('error', '이슈 로드 실패', e.message)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (selectedProject) loadIssues(selectedProject.id)
  }, [selectedProject, statusFilter])

  const statusColors: Record<string, string> = {
    todo: 'bg-gray-100 text-gray-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  }

  const statusLabels: Record<string, string> = {
    todo: '대기',
    in_progress: '진행중',
    completed: '완료',
    cancelled: '취소',
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Bug size={24} className="text-red-500" />
        <h1 className="text-2xl font-bold text-gray-900">QA 대시보드</h1>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Project list */}
        <div className="col-span-3">
          <div className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">프로젝트</h3>
            <div className="space-y-1">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProject(p)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                    selectedProject?.id === p.id ? 'bg-primary-50 text-primary-700 font-medium' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color || '#3B82F6' }} />
                    {p.name}
                  </div>
                </button>
              ))}
              {projects.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">QA 프로젝트 없음</p>
              )}
            </div>
          </div>
        </div>

        {/* Issues */}
        <div className="col-span-9">
          {selectedProject ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-semibold">{selectedProject.name}</h2>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                  {['all', 'todo', 'in_progress', 'completed'].map(s => (
                    <button key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-2.5 py-1 text-xs rounded-md ${statusFilter === s ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}
                    >
                      {s === 'all' ? '전체' : statusLabels[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border divide-y">
                {issues.map(issue => (
                  <div key={issue.id} className="px-5 py-3 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <p className="text-sm text-gray-800 flex-1">{issue.content}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ml-3 ${statusColors[issue.status] || ''}`}>
                        {statusLabels[issue.status] || issue.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>{new Date(issue.created_at).toLocaleDateString('ko')}</span>
                      {issue.assignee_id && <span>담당: {issue.assignee_name || issue.assignee_id}</span>}
                    </div>
                  </div>
                ))}
                {issues.length === 0 && !loading && (
                  <div className="text-center text-gray-400 py-8">이슈가 없습니다</div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center text-gray-400 py-20">프로젝트를 선택해주세요</div>
          )}
        </div>
      </div>
    </div>
  )
}
