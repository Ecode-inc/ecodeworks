import { useState, useEffect } from 'react'
import { qaApi, deptApi, membersApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Bug, Plus, ExternalLink, Eye, Trash2, Edit2 } from 'lucide-react'

interface QALink {
  id: string
  org_id: string
  name: string
  url: string
  visibility: string
  department_id: string | null
  created_by: string
  shared_with: string[]
  has_new: boolean
  created_at: string
  updated_at: string
}

interface DeptOption {
  id: string
  name: string
}

interface MemberOption {
  id: string
  name: string
  email: string
}

export function QAPage() {
  const { user } = useAuthStore()
  const [links, setLinks] = useState<QALink[]>([])
  const [selectedLink, setSelectedLink] = useState<QALink | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingLink, setEditingLink] = useState<QALink | null>(null)

  const isManager = user?.is_ceo || user?.is_admin

  const loadLinks = async () => {
    try {
      const res = await qaApi.listLinks()
      setLinks(res.links || [])
    } catch (e: any) {
      useToastStore.getState().addToast('error', 'QA 프로젝트 로드 실패', e.message)
    }
  }

  useEffect(() => {
    loadLinks()
  }, [])

  const handleSelectLink = (link: QALink) => {
    setSelectedLink(link)
  }

  const handleMarkSeen = async () => {
    if (!selectedLink) return
    try {
      await qaApi.markSeen(selectedLink.id)
      setLinks(prev => prev.map(l => l.id === selectedLink.id ? { ...l, has_new: false } : l))
      setSelectedLink(prev => prev ? { ...prev, has_new: false } : null)
    } catch (e: any) {
      useToastStore.getState().addToast('error', '확인 실패', e.message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    try {
      await qaApi.deleteLink(id)
      useToastStore.getState().addToast('success', '삭제 완료')
      if (selectedLink?.id === id) setSelectedLink(null)
      loadLinks()
    } catch (e: any) {
      useToastStore.getState().addToast('error', '삭제 실패', e.message)
    }
  }

  const handleEdit = (link: QALink) => {
    setEditingLink(link)
    setShowModal(true)
  }

  const visibilityLabel = (v: string) => {
    switch (v) {
      case 'company': return '조직전체'
      case 'department': return '부서'
      case 'personal': return '개인'
      default: return v
    }
  }

  const visibilityColor = (v: string) => {
    switch (v) {
      case 'company': return 'bg-green-100 text-green-700'
      case 'department': return 'bg-blue-100 text-blue-700'
      case 'personal': return 'bg-purple-100 text-purple-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bug size={24} className="text-red-500" />
          <h1 className="text-2xl font-bold text-gray-900">QA 대시보드</h1>
        </div>
        {isManager && (
          <Button size="sm" onClick={() => { setEditingLink(null); setShowModal(true) }}>
            <Plus size={14} className="mr-1" /> 프로젝트 연결
          </Button>
        )}
      </div>

      {/* Tab bar */}
      {links.length > 0 && (
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 overflow-x-auto">
          {links.map(link => (
            <button
              key={link.id}
              onClick={() => handleSelectLink(link)}
              className={`px-4 py-2 text-sm rounded-lg whitespace-nowrap flex items-center gap-2 transition-colors ${
                selectedLink?.id === link.id
                  ? 'bg-white shadow-sm font-medium text-gray-900'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              {link.name}
              {link.has_new && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Selected project view */}
      {selectedLink ? (
        <div>
          <div className="bg-white rounded-xl border p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">{selectedLink.name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full ${visibilityColor(selectedLink.visibility)}`}>
                  {visibilityLabel(selectedLink.visibility)}
                </span>
                {selectedLink.has_new && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">NEW</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={selectedLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                >
                  <ExternalLink size={14} /> 새 탭에서 열기
                </a>
                {selectedLink.has_new && (
                  <Button variant="secondary" size="sm" onClick={handleMarkSeen}>
                    <Eye size={14} className="mr-1" /> 확인
                  </Button>
                )}
                {isManager && (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => handleEdit(selectedLink)}>
                      <Edit2 size={14} />
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(selectedLink.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {selectedLink.visibility === 'personal' && selectedLink.shared_with.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                공유 대상: {selectedLink.shared_with.length}명
              </p>
            )}
          </div>

          {/* iframe embed */}
          <div className="bg-white rounded-xl border overflow-hidden" style={{ height: 'calc(100vh - 320px)' }}>
            <iframe
              src={selectedLink.url}
              className="w-full h-full border-0"
              title={selectedLink.name}
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          </div>
        </div>
      ) : (
        <div className="text-center text-gray-400 py-20">
          {links.length === 0 ? (
            <div>
              <p className="mb-2">연결된 QA 프로젝트가 없습니다</p>
              {isManager && <p className="text-sm">위의 &quot;프로젝트 연결&quot; 버튼으로 QA 프로젝트를 추가하세요</p>}
            </div>
          ) : (
            <p>프로젝트를 선택해주세요</p>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      <LinkModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingLink(null) }}
        link={editingLink}
        onSave={() => {
          loadLinks()
          setShowModal(false)
          setEditingLink(null)
        }}
      />
    </div>
  )
}

function LinkModal({ open, onClose, link, onSave }: {
  open: boolean
  onClose: () => void
  link: QALink | null
  onSave: () => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [visibility, setVisibility] = useState('company')
  const [departmentId, setDepartmentId] = useState('')
  const [sharedWith, setSharedWith] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const [departments, setDepartments] = useState<DeptOption[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [deptsLoaded, setDeptsLoaded] = useState(false)
  const [membersLoaded, setMembersLoaded] = useState(false)

  useEffect(() => {
    if (link) {
      setName(link.name)
      setUrl(link.url)
      setVisibility(link.visibility)
      setDepartmentId(link.department_id || '')
      setSharedWith(link.shared_with || [])
    } else {
      setName('')
      setUrl('')
      setVisibility('company')
      setDepartmentId('')
      setSharedWith([])
    }
  }, [link, open])

  useEffect(() => {
    if (!open) return
    if (!deptsLoaded) {
      deptApi.list().then(res => {
        setDepartments((res.departments || []).map((d: any) => ({ id: d.id, name: d.name })))
        setDeptsLoaded(true)
      }).catch(() => {})
    }
  }, [open, deptsLoaded])

  useEffect(() => {
    if (visibility === 'personal' && !membersLoaded) {
      membersApi.list().then(res => {
        setMembers((res.members || []).map((m: any) => ({ id: m.id, name: m.name, email: m.email })))
        setMembersLoaded(true)
      }).catch(() => {})
    }
  }, [visibility, membersLoaded])

  const toggleSharedWith = (userId: string) => {
    setSharedWith(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  const handleSubmit = async () => {
    if (!name || !url) return
    setLoading(true)
    try {
      const data: any = { name, url, visibility }
      if (visibility === 'department' && departmentId) {
        data.department_id = departmentId
      }
      if (visibility === 'personal' && sharedWith.length > 0) {
        data.shared_with = sharedWith
      }
      if (link) {
        await qaApi.updateLink(link.id, data)
      } else {
        await qaApi.createLink(data)
      }
      onSave()
    } catch (e: any) {
      useToastStore.getState().addToast('error', '저장 실패', e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={link ? 'QA 프로젝트 수정' : 'QA 프로젝트 연결'} width="max-w-lg">
      <div className="space-y-4">
        <Input label="프로젝트 이름" value={name} onChange={e => setName(e.target.value)} placeholder="예: 한국어앱" required />
        <Input label="QA URL" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://qa-dashboard-web.pages.dev" required />

        {/* Visibility selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">공개 범위</label>
          <div className="flex gap-2">
            {[
              { value: 'company', label: '조직전체' },
              { value: 'department', label: '부서' },
              { value: 'personal', label: '개인' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setVisibility(opt.value)}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                  visibility === opt.value
                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Department selector */}
        {visibility === 'department' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">부서 선택</label>
            <select
              value={departmentId}
              onChange={e => setDepartmentId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">부서를 선택하세요</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Shared with selector */}
        {visibility === 'personal' && (
          <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
            <label className="block text-sm font-medium text-gray-700">공유 대상</label>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {members.map(m => (
                <label key={m.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sharedWith.includes(m.id)}
                    onChange={() => toggleSharedWith(m.id)}
                    className="rounded"
                  />
                  <span>{m.name}</span>
                  <span className="text-xs text-gray-400">{m.email}</span>
                </label>
              ))}
              {members.length === 0 && (
                <p className="text-xs text-gray-400 py-2">멤버를 불러오는 중...</p>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button onClick={handleSubmit} loading={loading}>저장</Button>
        </div>
      </div>
    </Modal>
  )
}
