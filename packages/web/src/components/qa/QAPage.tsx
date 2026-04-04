import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { qaApi, membersApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import {
  Bug, Plus, Trash2, Edit2, ChevronDown, ChevronUp,
  Play, Pause, Check, X, Search, Image as ImageIcon, Send,
  ThumbsUp, ThumbsDown, MessageSquare,
  Eye, EyeOff, MoreVertical, Link,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────

type IssueStatus = 'todo' | 'in_progress' | 'completed' | 'cancelled' | 'test_failed'

interface TestResult {
  id: string
  result: 'pass' | 'fail' | 'comment'
  comment?: string
  member_name: string
  created_at: string
}

interface QAIssue {
  id: string
  project_id: string
  issue_number: number
  content: string
  status: IssueStatus
  assignee_id: string | null
  assignee_name: string | null
  created_by: string
  created_by_name: string
  images: { url: string; name: string }[]
  test_results: TestResult[]
  created_at: string
  updated_at: string
}

interface QAProject {
  id: string
  name: string
  color: string
  is_public: boolean | number
  sort_order: number
  issue_count?: {
    todo: number
    in_progress: number
    completed: number
    test_failed: number
    cancelled: number
  }
}

interface MemberOption {
  id: string
  name: string
  email: string
}

// ── Status config ──────────────────────────────────────

const STATUS_CONFIG: Record<IssueStatus, { label: string; color: string; bg: string; border: string }> = {
  todo: { label: '작업예정', color: 'text-gray-600', bg: 'bg-gray-100', border: 'border-gray-300' },
  in_progress: { label: '진행중', color: 'text-blue-600', bg: 'bg-blue-100', border: 'border-blue-300' },
  completed: { label: '완료', color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-300' },
  test_failed: { label: '테스트실패', color: 'text-red-600', bg: 'bg-red-100', border: 'border-red-300' },
  cancelled: { label: '취소', color: 'text-gray-400', bg: 'bg-gray-50', border: 'border-gray-200' },
}

const STATUS_PRIORITY: Record<IssueStatus, number> = {
  in_progress: 0,
  test_failed: 1,
  todo: 2,
  completed: 3,
  cancelled: 4,
}

// Section display order for grouped view
const SECTION_ORDER: { status: IssueStatus; label: string; defaultOpen: boolean; filter?: (i: QAIssue) => boolean }[] = [
  { status: 'test_failed', label: '테스트실패', defaultOpen: true },
  { status: 'in_progress', label: '진행중', defaultOpen: true },
  { status: 'todo', label: '작업예정', defaultOpen: true },
  { status: 'completed', label: '완료', defaultOpen: false, filter: (i) => !i.test_results?.some(t => t.result === 'pass') },
  { status: 'completed', label: '테스트완료', defaultOpen: false, filter: (i) => !!i.test_results?.some(t => t.result === 'pass') },
  { status: 'cancelled', label: '취소', defaultOpen: false },
]

function sortIssues(issues: QAIssue[]): QAIssue[] {
  return [...issues].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99
    const pb = STATUS_PRIORITY[b.status] ?? 99
    if (pa !== pb) return pa - pb
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const d = new Date(dateStr).getTime()
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}일 전`
  return new Date(dateStr).toLocaleDateString('ko-KR')
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── Main Component ─────────────────────────────────────

export function QAPage() {
  const { user } = useAuthStore()
  const toast = useToastStore.getState()
  const isManager = user?.is_ceo || user?.is_admin

  // Data
  const [projects, setProjects] = useState<QAProject[]>([])
  const [issues, setIssues] = useState<QAIssue[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingIssues, setLoadingIssues] = useState(false)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [editingProject, setEditingProject] = useState<QAProject | null>(null)
  const [showProjectMenu, setShowProjectMenu] = useState<string | null>(null)

  const selectedProject = projects.find(p => p.id === selectedProjectId)

  // ── Load projects ──
  const loadProjects = useCallback(async () => {
    try {
      const res = await qaApi.qaProjects()
      setProjects(res.projects || [])
      return res.projects || []
    } catch (e: any) {
      toast.addToast('error', 'QA 프로젝트 로드 실패', e.message)
      return []
    } finally {
      setLoadingProjects(false)
    }
  }, [])

  // ── Load issues ──
  const loadIssues = useCallback(async (projectId: string) => {
    setLoadingIssues(true)
    try {
      const params: { status?: string; assignee_id?: string } = {}
      if (statusFilter) params.status = statusFilter
      if (assigneeFilter) params.assignee_id = assigneeFilter
      const res = await qaApi.qaIssues(projectId, params)
      setIssues(res.issues || [])
    } catch (e: any) {
      toast.addToast('error', '이슈 로드 실패', e.message)
    } finally {
      setLoadingIssues(false)
    }
  }, [statusFilter, assigneeFilter])

  // ── Load members ──
  const loadMembers = useCallback(async () => {
    try {
      const res = await membersApi.list()
      setMembers((res.members || []).map((m: any) => ({ id: m.id, name: m.name, email: m.email })))
    } catch { /* ignore */ }
  }, [])

  // Init
  useEffect(() => {
    loadProjects().then(projs => {
      if (projs.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projs[0].id)
      }
    })
    loadMembers()
  }, [])

  // Load issues when project/filter changes
  useEffect(() => {
    if (selectedProjectId) {
      loadIssues(selectedProjectId)
    }
  }, [selectedProjectId, statusFilter, assigneeFilter])

  // Auto-refresh every 30s
  useEffect(() => {
    if (!selectedProjectId) return
    const interval = setInterval(() => {
      loadIssues(selectedProjectId)
    }, 30000)
    return () => clearInterval(interval)
  }, [selectedProjectId, statusFilter, assigneeFilter])

  // ── Filtered & sorted issues ──
  const displayIssues = useMemo(() => {
    let filtered = issues
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(i =>
        i.content.toLowerCase().includes(q) ||
        String(i.issue_number).includes(q) ||
        (i.assignee_name && i.assignee_name.toLowerCase().includes(q)) ||
        (i.created_by_name && i.created_by_name.toLowerCase().includes(q))
      )
    }
    return sortIssues(filtered)
  }, [issues, searchQuery])

  // ── Status counts ──
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { total: issues.length }
    for (const s of Object.keys(STATUS_CONFIG)) {
      counts[s] = issues.filter(i => i.status === s).length
    }
    return counts
  }, [issues])

  // ── Issue handlers ──
  const handleUpdateIssue = async (id: string, data: any) => {
    try {
      const res = await qaApi.qaIssueUpdate(id, data)
      setIssues(prev => prev.map(i => i.id === id ? { ...i, ...res.issue } : i))
    } catch (e: any) {
      toast.addToast('error', '수정 실패', e.message)
    }
  }

  const handleDeleteIssue = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    try {
      await qaApi.qaIssueDelete(id)
      setIssues(prev => prev.filter(i => i.id !== id))
      toast.addToast('success', '이슈 삭제 완료')
    } catch (e: any) {
      toast.addToast('error', '삭제 실패', e.message)
    }
  }

  const handleTestIssue = async (id: string, result: string, comment?: string) => {
    try {
      const res = await qaApi.qaIssueTest(id, result, comment)
      setIssues(prev => prev.map(i => i.id === id ? { ...i, ...res.issue } : i))
    } catch (e: any) {
      toast.addToast('error', '테스트 기록 실패', e.message)
    }
  }

  const handleCreateIssue = async (content: string, images: { url: string; name: string }[]) => {
    if (!selectedProjectId) return
    try {
      const res = await qaApi.qaIssueCreate(selectedProjectId, { content, images })
      setIssues(prev => [res.issue, ...prev])
      toast.addToast('success', '이슈 등록 완료')
    } catch (e: any) {
      toast.addToast('error', '이슈 등록 실패', e.message)
    }
  }

  // ── Project handlers ──
  const handleProjectSave = async (data: { name: string; color: string; is_public: boolean }) => {
    try {
      if (editingProject) {
        const res = await qaApi.qaProjectUpdate(editingProject.id, data)
        setProjects(prev => prev.map(p => p.id === editingProject.id ? { ...p, ...res.project } : p))
        toast.addToast('success', '프로젝트 수정 완료')
      } else {
        const res = await qaApi.qaProjectCreate(data)
        setProjects(prev => [...prev, res.project])
        setSelectedProjectId(res.project.id)
        toast.addToast('success', '프로젝트 생성 완료')
      }
      setShowProjectModal(false)
      setEditingProject(null)
    } catch (e: any) {
      toast.addToast('error', '저장 실패', e.message)
    }
  }

  const handleProjectDelete = async (id: string) => {
    if (!confirm('프로젝트와 모든 이슈가 삭제됩니다. 정말 삭제하시겠습니까?')) return
    try {
      await qaApi.qaProjectDelete(id)
      setProjects(prev => prev.filter(p => p.id !== id))
      if (selectedProjectId === id) {
        const remaining = projects.filter(p => p.id !== id)
        setSelectedProjectId(remaining.length > 0 ? remaining[0].id : null)
      }
      toast.addToast('success', '프로젝트 삭제 완료')
    } catch (e: any) {
      toast.addToast('error', '삭제 실패', e.message)
    }
    setShowProjectMenu(null)
  }

  const handleTogglePublic = async (project: QAProject) => {
    try {
      const res = await qaApi.qaProjectUpdate(project.id, { is_public: !project.is_public })
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, ...res.project } : p))
    } catch (e: any) {
      toast.addToast('error', '변경 실패', e.message)
    }
    setShowProjectMenu(null)
  }

  // ── Unresolved count for a project ──
  const getUnresolvedCount = (project: QAProject) => {
    if (!project.issue_count) return 0
    return (project.issue_count.todo || 0) + (project.issue_count.in_progress || 0) + (project.issue_count.test_failed || 0)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bug size={24} className="text-red-500" />
          <h1 className="text-2xl font-bold text-gray-900">QA 대시보드</h1>
        </div>
        {isManager && (
          <Button size="sm" onClick={() => { setEditingProject(null); setShowProjectModal(true) }}>
            <Plus size={14} className="mr-1" /> 프로젝트
          </Button>
        )}
      </div>

      {/* Project Tabs */}
      {projects.length > 0 && (
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 overflow-x-auto">
          {projects.map(project => {
            const isActive = project.id === selectedProjectId
            const unresolved = getUnresolvedCount(project)
            return (
              <div key={project.id} className="relative flex-shrink-0">
                <button
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`px-4 py-2 text-sm rounded-lg whitespace-nowrap flex items-center gap-2 transition-colors ${
                    isActive
                      ? 'bg-white shadow-sm font-medium text-gray-900'
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: project.color || '#6b7280' }}
                  />
                  {project.name}
                  {unresolved > 0 && (
                    <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
                      {unresolved}
                    </span>
                  )}
                </button>
                {/* Project context menu */}
                {isActive && isManager && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowProjectMenu(showProjectMenu === project.id ? null : project.id) }}
                    className="absolute -right-1 top-1 p-0.5 text-gray-400 hover:text-gray-600 rounded"
                  >
                    <MoreVertical size={12} />
                  </button>
                )}
                {showProjectMenu === project.id && (
                  <ProjectContextMenu
                    project={project}
                    onEdit={() => { setEditingProject(project); setShowProjectModal(true); setShowProjectMenu(null) }}
                    onDelete={() => handleProjectDelete(project.id)}
                    onTogglePublic={() => handleTogglePublic(project)}
                    onClose={() => setShowProjectMenu(null)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedProject ? (
        <>
          {/* Status Counts */}
          <div className="flex flex-wrap gap-2 mb-4">
            <StatusBadge label="전체" count={statusCounts.total} active={statusFilter === ''} onClick={() => setStatusFilter('')} color="bg-gray-200 text-gray-700" />
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <StatusBadge
                key={key}
                label={cfg.label}
                count={statusCounts[key] || 0}
                active={statusFilter === key}
                onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
                color={`${cfg.bg} ${cfg.color}`}
              />
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="검색..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <select
              value={assigneeFilter}
              onChange={e => setAssigneeFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">모든 담당자</option>
              <option value="unassigned">미배정</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Issues */}
          {loadingIssues ? (
            <div className="text-center text-gray-500 py-10">로딩 중...</div>
          ) : displayIssues.length === 0 ? (
            <div className="text-center text-gray-400 py-10">
              {searchQuery || statusFilter || assigneeFilter ? '검색 결과가 없습니다' : '등록된 이슈가 없습니다'}
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {SECTION_ORDER.map((section, idx) => {
                const sectionIssues = displayIssues.filter(i => {
                  if (i.status !== section.status) return false
                  if (section.filter) return section.filter(i)
                  return true
                })
                if (sectionIssues.length === 0) return null
                return (
                  <IssueSection
                    key={`${section.status}-${idx}`}
                    label={section.label}
                    status={section.status}
                    issues={sectionIssues}
                    defaultOpen={section.defaultOpen}
                    members={members}
                    onUpdate={handleUpdateIssue}
                    onDelete={handleDeleteIssue}
                    onTest={handleTestIssue}
                  />
                )
              })}
            </div>
          )}

          {/* Issue Input */}
          <IssueInput onSubmit={handleCreateIssue} />
        </>
      ) : (
        <div className="text-center text-gray-400 py-20">
          {loadingProjects ? (
            <p>프로젝트를 불러오는 중...</p>
          ) : projects.length === 0 ? (
            <div>
              <p className="mb-2">QA 프로젝트가 없습니다</p>
              {isManager && <p className="text-sm">"+ 프로젝트" 버튼으로 새 프로젝트를 만드세요</p>}
            </div>
          ) : (
            <p>프로젝트를 선택해주세요</p>
          )}
        </div>
      )}

      {/* Project Create/Edit Modal */}
      <ProjectModal
        open={showProjectModal}
        project={editingProject}
        onClose={() => { setShowProjectModal(false); setEditingProject(null) }}
        onSave={handleProjectSave}
      />
    </div>
  )
}

// ── Status Badge ───────────────────────────────────────

function StatusBadge({ label, count, active, onClick, color }: {
  label: string; count: number; active: boolean; onClick: () => void; color: string
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-full font-medium transition-all ${color} ${
        active ? 'ring-2 ring-primary-500 ring-offset-1' : 'opacity-70 hover:opacity-100'
      }`}
    >
      {label} {count}
    </button>
  )
}

// ── Project Context Menu ───────────────────────────────

function ProjectContextMenu({ project, onEdit, onDelete, onTogglePublic, onClose }: {
  project: QAProject; onEdit: () => void; onDelete: () => void; onTogglePublic: () => void; onClose: () => void
}) {
  useEffect(() => {
    const handler = () => onClose()
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [onClose])

  const copyShareLink = () => {
    if (project.public_token) {
      navigator.clipboard.writeText(`${window.location.origin}/qa-test/${project.public_token}`)
      useToastStore.getState().addToast('success', '공유 링크가 복사되었습니다')
    } else {
      useToastStore.getState().addToast('error', '먼저 공개 전환해주세요')
    }
    onClose()
  }

  return (
    <div
      className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border py-1 z-20 w-44"
      onClick={e => e.stopPropagation()}
    >
      <button onClick={onEdit} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
        <Edit2 size={14} /> 수정
      </button>
      <button onClick={copyShareLink} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
        <Link size={14} /> 공유 링크 복사
      </button>
      <button onClick={onTogglePublic} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
        {project.is_public ? <><EyeOff size={14} /> 비공개 전환</> : <><Eye size={14} /> 공개 전환</>}
      </button>
      <button onClick={onDelete} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
        <Trash2 size={14} /> 삭제
      </button>
    </div>
  )
}

// ── Project Modal ──────────────────────────────────────

function ProjectModal({ open, project, onClose, onSave }: {
  open: boolean; project: QAProject | null; onClose: () => void
  onSave: (data: { name: string; color: string; is_public: boolean }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [isPublic, setIsPublic] = useState(true)
  const [loading, setLoading] = useState(false)

  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']

  useEffect(() => {
    if (project) {
      setName(project.name)
      setColor(project.color || '#3b82f6')
      setIsPublic(!!project.is_public)
    } else {
      setName('')
      setColor('#3b82f6')
      setIsPublic(true)
    }
  }, [project, open])

  const handleSubmit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      await onSave({ name: name.trim(), color, is_public: isPublic })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={project ? '프로젝트 수정' : '새 프로젝트'} width="max-w-sm">
      <div className="space-y-4">
        <Input label="프로젝트 이름" value={name} onChange={e => setName(e.target.value)} placeholder="예: 한국어앱 QA" required />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">색상</label>
          <div className="flex gap-2">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="rounded" />
          <span className="text-gray-700">공개 프로젝트</span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button onClick={handleSubmit} loading={loading} disabled={!name.trim()}>저장</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Issue Section (collapsible) ────────────────────────

function IssueSection({ label, status, issues, defaultOpen, members, onUpdate, onDelete, onTest }: {
  label: string; status: IssueStatus; issues: QAIssue[]; defaultOpen: boolean
  members: MemberOption[]
  onUpdate: (id: string, data: any) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onTest: (id: string, result: string, comment?: string) => Promise<void>
}) {
  const [open, setOpen] = useState(defaultOpen)
  const cfg = STATUS_CONFIG[status]

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${cfg.bg} ${cfg.color}`}
      >
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        {label}
        <span className="text-xs opacity-70">({issues.length})</span>
      </button>
      {open && (
        <div className="space-y-1 mt-1">
          {issues.map(issue => (
            <IssueCard
              key={issue.id}
              issue={issue}
              members={members}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onTest={onTest}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Issue Card ─────────────────────────────────────────

function IssueCard({ issue, members, onUpdate, onDelete, onTest }: {
  issue: QAIssue; members: MemberOption[]
  onUpdate: (id: string, data: any) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onTest: (id: string, result: string, comment?: string) => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(issue.content)
  const [showAssignee, setShowAssignee] = useState(false)
  const [showTestFail, setShowTestFail] = useState(false)
  const [showCommentModal, setShowCommentModal] = useState(false)
  const [testComment, setTestComment] = useState('')
  const [viewImage, setViewImage] = useState<string | null>(null)

  const passTesters = issue.test_results?.filter(t => t.result === 'pass') || []
  const failTesters = issue.test_results?.filter(t => t.result === 'fail') || []
  const commentTesters = issue.test_results?.filter(t => t.result === 'comment') || []

  const wrap = async (fn: () => Promise<void>) => {
    setLoading(true)
    try { await fn() } finally { setLoading(false) }
  }

  const handleStatusChange = (status: IssueStatus) => wrap(() => onUpdate(issue.id, { status }))
  const handleAssign = (memberId: string | null) => {
    setShowAssignee(false)
    return wrap(() => onUpdate(issue.id, { assignee_id: memberId }))
  }

  const handleEditSave = async () => {
    if (!editContent.trim() || editContent === issue.content) {
      setEditContent(issue.content)
      setIsEditing(false)
      return
    }
    setLoading(true)
    try {
      await onUpdate(issue.id, { content: editContent.trim() })
      setIsEditing(false)
    } finally {
      setLoading(false)
    }
  }

  const handleTestPass = () => wrap(() => onTest(issue.id, 'pass'))
  const handleTestFail = async () => {
    if (!testComment.trim()) return
    setLoading(true)
    try {
      await onTest(issue.id, 'fail', testComment.trim())
      setTestComment('')
      setShowTestFail(false)
    } finally {
      setLoading(false)
    }
  }
  const handleAddComment = async () => {
    if (!testComment.trim()) return
    setLoading(true)
    try {
      await onTest(issue.id, 'comment', testComment.trim())
      setTestComment('')
      setShowCommentModal(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className={`rounded border px-3 py-1.5 bg-white ${loading ? 'opacity-50' : ''} ${
        issue.status === 'in_progress' ? 'border-blue-300 bg-blue-50/30' :
        issue.status === 'test_failed' ? 'border-red-300 bg-red-50/30' : ''
      }`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* Issue number */}
          <span className="text-xs font-mono text-gray-400 flex-shrink-0">#{issue.issue_number}</span>

          {/* Created by */}
          <span className="text-xs text-gray-400 flex-shrink-0">{issue.created_by_name}</span>

          {/* Content */}
          {isEditing ? (
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onBlur={handleEditSave}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleEditSave() }
                if (e.key === 'Escape') { setEditContent(issue.content); setIsEditing(false) }
              }}
              autoFocus
              rows={3}
              className="flex-1 text-gray-800 text-sm min-w-0 px-1 py-0.5 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          ) : (
            <p
              onClick={() => setIsExpanded(!isExpanded)}
              onDoubleClick={e => { e.stopPropagation(); setIsEditing(true) }}
              title="클릭: 펼치기/접기, 더블클릭: 수정"
              className={`flex-1 text-gray-800 text-sm min-w-0 cursor-pointer hover:bg-gray-50 px-1 rounded ${
                isExpanded ? 'whitespace-pre-wrap' : 'truncate'
              } ${issue.status === 'cancelled' ? 'line-through text-gray-400' : ''}`}
            >
              {issue.content}
            </p>
          )}

          {/* Expand toggle */}
          {!isEditing && issue.content.length > 50 && (
            <button onClick={() => setIsExpanded(!isExpanded)} className="p-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0">
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}

          {/* Image thumbnails */}
          {issue.images && issue.images.length > 0 && (
            <div className="flex gap-0.5 flex-shrink-0 items-center">
              {issue.images.slice(0, 2).map((img, idx) => (
                <img
                  key={idx}
                  src={img.url}
                  alt={img.name || ''}
                  onClick={() => setViewImage(img.url)}
                  className="w-6 h-6 object-cover rounded border cursor-pointer hover:opacity-80"
                />
              ))}
              {issue.images.length > 2 && (
                <button onClick={() => setViewImage(issue.images[2].url)} className="text-xs text-gray-400 hover:text-blue-500">
                  +{issue.images.length - 2}
                </button>
              )}
            </div>
          )}

          {/* Assignee */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowAssignee(!showAssignee)}
              className={`text-xs px-1.5 py-0.5 rounded ${
                issue.assignee_name ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {issue.assignee_name || '-'}
            </button>
            {showAssignee && (
              <AssigneeDropdown
                members={members}
                currentId={issue.assignee_id}
                onSelect={handleAssign}
                onClose={() => setShowAssignee(false)}
              />
            )}
          </div>

          {/* Time */}
          <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:inline">{timeAgo(issue.created_at)}</span>

          {/* Action buttons */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {issue.status === 'todo' && (
              <>
                <button onClick={() => handleStatusChange('in_progress')} disabled={loading} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="시작">
                  <Play size={14} />
                </button>
                <button onClick={() => handleStatusChange('completed')} disabled={loading} className="p-1 text-green-600 hover:bg-green-50 rounded" title="바로 완료">
                  <Check size={14} />
                </button>
              </>
            )}
            {issue.status === 'in_progress' && (
              <>
                <button onClick={() => handleStatusChange('todo')} disabled={loading} className="p-1 text-gray-500 hover:bg-gray-100 rounded" title="대기">
                  <Pause size={14} />
                </button>
                <button onClick={() => handleStatusChange('completed')} disabled={loading} className="p-1 text-green-600 hover:bg-green-50 rounded" title="완료">
                  <Check size={14} />
                </button>
                <button onClick={() => handleStatusChange('cancelled')} disabled={loading} className="p-1 text-red-500 hover:bg-red-50 rounded" title="취소">
                  <X size={14} />
                </button>
              </>
            )}
            {(issue.status === 'completed' || issue.status === 'test_failed') && (
              <>
                <button onClick={handleTestPass} disabled={loading} className="p-1 text-green-600 hover:bg-green-50 rounded" title="테스트 이상없음">
                  <ThumbsUp size={14} />
                </button>
                <button onClick={() => setShowTestFail(true)} disabled={loading} className="p-1 text-orange-500 hover:bg-orange-50 rounded" title="테스트 이상있음">
                  <ThumbsDown size={14} />
                </button>
              </>
            )}
            {issue.status === 'test_failed' && (
              <>
                <button onClick={() => handleStatusChange('in_progress')} disabled={loading} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="다시 진행">
                  <Play size={14} />
                </button>
                <button onClick={() => handleStatusChange('completed')} disabled={loading} className="p-1 text-green-600 hover:bg-green-50 rounded" title="완료 처리">
                  <Check size={14} />
                </button>
              </>
            )}
            {issue.status === 'cancelled' && (
              <button onClick={() => handleStatusChange('todo')} disabled={loading} className="p-1 text-gray-500 hover:bg-gray-100 rounded" title="다시 열기">
                <Play size={14} />
              </button>
            )}
            {/* Comment */}
            <button onClick={() => setShowCommentModal(true)} disabled={loading} className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded" title="코멘트 추가">
              <MessageSquare size={14} />
            </button>
            {/* Delete */}
            {issue.status !== 'completed' && (
              <button onClick={() => onDelete(issue.id)} disabled={loading} className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded" title="삭제">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {/* Pass testers (without comments) */}
          {passTesters.filter(t => !t.comment).length > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <ThumbsUp size={12} className="text-green-500" />
              <span className="text-xs text-green-600">{passTesters.filter(t => !t.comment).map(t => t.member_name).join(', ')}</span>
            </div>
          )}
        </div>

        {/* Test results with comments */}
        {(passTesters.some(t => t.comment) || failTesters.length > 0 || commentTesters.length > 0) && (
          <div className="mt-1 pl-8 space-y-1">
            {passTesters.filter(t => t.comment).map(t => (
              <div key={t.id} className="flex items-start gap-1 text-xs">
                <ThumbsUp size={12} className="text-green-500 mt-0.5 flex-shrink-0" />
                <span className="text-green-600 font-medium">{t.member_name}</span>
                <span className="text-gray-400">{formatDate(t.created_at)}</span>
                <span className="text-gray-600">{t.comment}</span>
              </div>
            ))}
            {failTesters.map(t => (
              <div key={t.id} className="flex items-start gap-1 text-xs">
                <ThumbsDown size={12} className="text-orange-500 mt-0.5 flex-shrink-0" />
                <span className="text-orange-600 font-medium">{t.member_name}</span>
                <span className="text-gray-400">{formatDate(t.created_at)}</span>
                <span className="text-gray-600">{t.comment}</span>
              </div>
            ))}
            {commentTesters.map(t => (
              <div key={t.id} className="flex items-start gap-1 text-xs">
                <MessageSquare size={12} className="text-blue-500 mt-0.5 flex-shrink-0" />
                <span className="text-blue-600 font-medium">{t.member_name}</span>
                <span className="text-gray-400">{formatDate(t.created_at)}</span>
                <span className="text-gray-600">{t.comment}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Test fail modal */}
      {showTestFail && (
        <InlineModal title="테스트 이상 내용" onClose={() => { setShowTestFail(false); setTestComment('') }}>
          <textarea
            value={testComment}
            onChange={e => setTestComment(e.target.value)}
            placeholder="이상 내용을 입력하세요..."
            className="w-full p-2 border rounded resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
            rows={3}
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => { setShowTestFail(false); setTestComment('') }} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded">취소</button>
            <button onClick={handleTestFail} disabled={loading || !testComment.trim()} className="px-3 py-1.5 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50">등록</button>
          </div>
        </InlineModal>
      )}

      {/* Comment modal */}
      {showCommentModal && (
        <InlineModal title="코멘트 추가" onClose={() => { setShowCommentModal(false); setTestComment('') }}>
          <textarea
            value={testComment}
            onChange={e => setTestComment(e.target.value)}
            placeholder="코멘트를 입력하세요..."
            className="w-full p-2 border rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => { setShowCommentModal(false); setTestComment('') }} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded">취소</button>
            <button onClick={handleAddComment} disabled={loading || !testComment.trim()} className="px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50">등록</button>
          </div>
        </InlineModal>
      )}

      {/* Image viewer */}
      {viewImage && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setViewImage(null)}>
          <img src={viewImage} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
          <button onClick={() => setViewImage(null)} className="absolute top-4 right-4 text-white hover:text-gray-300">
            <X size={24} />
          </button>
        </div>
      )}
    </>
  )
}

// ── Inline Modal (lightweight) ─────────────────────────

function InlineModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-4 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-medium mb-2">{title}</h3>
        {children}
      </div>
    </div>
  )
}

// ── Assignee Dropdown ──────────────────────────────────

function AssigneeDropdown({ members, currentId, onSelect, onClose }: {
  members: MemberOption[]; currentId: string | null; onSelect: (id: string | null) => void; onClose: () => void
}) {
  useEffect(() => {
    const handler = () => {
      // close on outside click with a small delay
      setTimeout(() => onClose(), 0)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [onClose])

  return (
    <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border py-1 z-20 w-40 max-h-60 overflow-y-auto" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => onSelect(null)}
        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${!currentId ? 'font-medium text-blue-600' : 'text-gray-600'}`}
      >
        미배정
      </button>
      {members.map(m => (
        <button
          key={m.id}
          onClick={() => onSelect(m.id)}
          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${currentId === m.id ? 'font-medium text-blue-600' : 'text-gray-600'}`}
        >
          {m.name}
        </button>
      ))}
    </div>
  )
}

// ── Issue Input ────────────────────────────────────────

function IssueInput({ onSubmit }: { onSubmit: (content: string, images: { url: string; name: string }[]) => Promise<void> }) {
  const [content, setContent] = useState('')
  const [images, setImages] = useState<{ url: string; name: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const result = await qaApi.qaImageUpload(file)
      setImages(prev => [...prev, { url: result.url, name: result.name }])
    } catch (e) {
      console.error('Image upload failed:', e)
      useToastStore.getState().addToast('error', '이미지 업로드 실패')
    } finally {
      setUploading(false)
    }
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          handleUpload(file)
        }
      }
    }
  }, [handleUpload])

  const handleSubmit = async () => {
    if (!content.trim()) return
    setSubmitting(true)
    try {
      await onSubmit(content.trim(), images)
      setContent('')
      setImages([])
    } finally {
      setSubmitting(false)
    }
  }

  const removeImage = (index: number) => setImages(prev => prev.filter((_, i) => i !== index))

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSubmit() }
        }}
        placeholder="이슈 내용을 입력하세요... (Ctrl+V로 이미지 붙여넣기)"
        className="w-full p-4 resize-none focus:outline-none rounded-t-lg"
        rows={3}
      />

      {/* Image previews */}
      {images.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <img src={img.url} alt={img.name} className="w-20 h-20 object-cover rounded border" />
              <button
                onClick={() => removeImage(idx)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-2 border-t bg-gray-50 rounded-b-lg">
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); e.target.value = '' }} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors disabled:opacity-50">
            <ImageIcon size={20} />
          </button>
          {uploading && <span className="text-sm text-gray-500">업로드 중...</span>}
        </div>
        <button
          onClick={handleSubmit}
          disabled={!content.trim() || submitting}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={16} />
          <span className="hidden sm:inline">등록</span>
        </button>
      </div>
    </div>
  )
}
