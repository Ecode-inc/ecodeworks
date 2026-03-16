import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { leaveApi, membersApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import {
  CalendarDays,
  Plus,
  Upload,
  X,
  ChevronDown,
  ChevronRight,
  Trash2,
  RotateCcw,
  Check,
  XCircle,
  Paperclip,
} from 'lucide-react'
import dayjs from 'dayjs'

const typeLabels: Record<string, string> = {
  vacation: '휴가',
  half_day_am: '오전반차',
  half_day_pm: '오후반차',
  sick: '병가',
  special: '특별휴가',
  remote: '재택근무',
}

const statusLabels: Record<string, string> = {
  pending: '대기',
  approved: '승인',
  rejected: '반려',
  cancelled: '취소',
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
}

const leaveTypes = [
  { value: 'vacation', label: '휴가' },
  { value: 'half_day_am', label: '오전반차' },
  { value: 'half_day_pm', label: '오후반차' },
  { value: 'sick', label: '병가' },
  { value: 'special', label: '특별휴가' },
  { value: 'remote', label: '재택근무' },
]

interface ApprovalStep {
  role: string
  status: string
}

export function LeavePage() {
  const { user, departments } = useAuthStore()
  const isManager = user?.is_ceo || user?.is_admin || departments.some(d => d.role === 'head')
  const isCeo = user?.is_ceo

  const [myRequests, setMyRequests] = useState<any[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([])
  const [trashItems, setTrashItems] = useState<any[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadMyRequests = useCallback(async () => {
    try {
      const res = await leaveApi.list({ user_id: user?.id })
      setMyRequests(res.requests || [])
    } catch {
      // ignore
    }
  }, [user?.id])

  const loadPendingApprovals = useCallback(async () => {
    if (!isManager) return
    try {
      const res = await leaveApi.list({ status: 'pending' })
      // Filter out own requests
      setPendingApprovals((res.requests || []).filter((r: any) => r.user_id !== user?.id))
    } catch {
      // ignore
    }
  }, [isManager, user?.id])

  const loadTrash = useCallback(async () => {
    if (!isCeo) return
    try {
      const res = await leaveApi.trash()
      setTrashItems(res.requests || [])
    } catch {
      // ignore
    }
  }, [isCeo])

  useEffect(() => {
    loadMyRequests()
    loadPendingApprovals()
  }, [loadMyRequests, loadPendingApprovals])

  useEffect(() => {
    if (showTrash) loadTrash()
  }, [showTrash, loadTrash])

  const handleCancel = async (id: string) => {
    try {
      await leaveApi.cancel(id)
      useToastStore.getState().addToast('success', '취소되었습니다')
      loadMyRequests()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '취소 실패'
      useToastStore.getState().addToast('error', '취소 실패', msg)
    }
  }

  const handleSoftDelete = async (id: string) => {
    try {
      await leaveApi.softDelete(id)
      useToastStore.getState().addToast('success', '삭제되었습니다')
      loadMyRequests()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '삭제 실패'
      useToastStore.getState().addToast('error', '삭제 실패', msg)
    }
  }

  const handleApprove = async (id: string) => {
    try {
      await leaveApi.approve(id)
      useToastStore.getState().addToast('success', '승인되었습니다')
      loadPendingApprovals()
      loadMyRequests()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '승인 실패'
      useToastStore.getState().addToast('error', '승인 실패', msg)
    }
  }

  const handleRestore = async (id: string) => {
    try {
      await leaveApi.restore(id)
      useToastStore.getState().addToast('success', '복원되었습니다')
      loadTrash()
      loadMyRequests()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '복원 실패'
      useToastStore.getState().addToast('error', '복원 실패', msg)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CalendarDays size={24} /> 휴가/결재
        </h1>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus size={16} className="mr-1" /> 휴가/결재 신청
        </Button>
      </div>

      {/* My Leave Requests */}
      <MyRequestsTable
        requests={myRequests}
        onCancel={handleCancel}
        onDelete={handleSoftDelete}
        userId={user?.id}
      />

      {/* Pending Approvals (managers only) */}
      {isManager && pendingApprovals.length > 0 && (
        <PendingApprovalsSection
          requests={pendingApprovals}
          onApprove={handleApprove}
          onRefresh={() => { loadPendingApprovals(); loadMyRequests() }}
        />
      )}

      {/* Trash (CEO only) */}
      {isCeo && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <button
            onClick={() => setShowTrash(!showTrash)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
          >
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Trash2 size={18} /> 휴지통
            </h3>
            {showTrash ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          {showTrash && (
            <div className="border-t">
              {trashItems.length === 0 ? (
                <p className="px-4 py-8 text-center text-gray-400">삭제된 항목이 없습니다</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">신청자</th>
                        <th className="text-left px-4 py-2 font-medium">유형</th>
                        <th className="text-left px-4 py-2 font-medium">기간</th>
                        <th className="text-left px-4 py-2 font-medium">사유</th>
                        <th className="text-left px-4 py-2 font-medium">작업</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {trashItems.map((item: any) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-900">{item.user_name || '-'}</td>
                          <td className="px-4 py-2">{typeLabels[item.type] || item.type}</td>
                          <td className="px-4 py-2 text-gray-600">
                            {dayjs(item.start_date).format('MM/DD')} - {dayjs(item.end_date).format('MM/DD')}
                          </td>
                          <td className="px-4 py-2 text-gray-500 text-xs max-w-[200px] truncate">{item.reason || '-'}</td>
                          <td className="px-4 py-2">
                            <Button size="sm" variant="secondary" onClick={() => handleRestore(item.id)}>
                              <RotateCcw size={14} className="mr-1" /> 복원
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      <CreateLeaveModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          setShowCreateModal(false)
          loadMyRequests()
        }}
        loading={loading}
        setLoading={setLoading}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// My Requests Table
// ──────────────────────────────────────────────────────────────
function MyRequestsTable({
  requests,
  onCancel,
  onDelete,
  userId,
}: {
  requests: any[]
  onCancel: (id: string) => void
  onDelete: (id: string) => void
  userId?: string
}) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b">
        <h3 className="font-semibold text-gray-900">내 휴가/결재 내역</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">유형</th>
              <th className="text-left px-4 py-2 font-medium">기간</th>
              <th className="text-left px-4 py-2 font-medium">사유</th>
              <th className="text-left px-4 py-2 font-medium">상태</th>
              <th className="text-left px-4 py-2 font-medium">결재 진행</th>
              <th className="text-left px-4 py-2 font-medium">첨부</th>
              <th className="text-left px-4 py-2 font-medium">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {requests.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">신청 내역이 없습니다</td>
              </tr>
            ) : requests.map((req: any) => (
              <tr key={req.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">
                  {typeLabels[req.type] || req.type}
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {dayjs(req.start_date).format('MM/DD')}
                  {req.start_date !== req.end_date && ` - ${dayjs(req.end_date).format('MM/DD')}`}
                </td>
                <td className="px-4 py-2 text-gray-500 text-xs max-w-[200px] truncate">{req.reason || '-'}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[req.status] || 'bg-gray-100 text-gray-600'}`}>
                    {statusLabels[req.status] || req.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <ApprovalChain approvals={req.approvals} />
                </td>
                <td className="px-4 py-2">
                  {req.attachment_url ? (
                    <a
                      href={req.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline flex items-center gap-1"
                    >
                      <Paperclip size={14} /> 파일
                    </a>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    {req.status === 'pending' && (
                      <Button size="sm" variant="secondary" onClick={() => onCancel(req.id)}>
                        취소
                      </Button>
                    )}
                    {req.user_id === userId && (
                      <Button size="sm" variant="ghost" onClick={() => onDelete(req.id)}>
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Approval Chain Display
// ──────────────────────────────────────────────────────────────
function ApprovalChain({ approvals }: { approvals?: ApprovalStep[] }) {
  if (!approvals || approvals.length === 0) {
    return <span className="text-gray-400 text-xs">-</span>
  }

  const getIcon = (status: string) => {
    if (status === 'approved') return <Check size={12} className="text-green-600" />
    if (status === 'rejected') return <XCircle size={12} className="text-red-600" />
    return <span className="text-yellow-500 text-xs">&#x23F3;</span>
  }

  const getRoleLabel = (role: string) => {
    if (role === 'dept_head') return '부서장'
    if (role === 'ceo') return '대표'
    return role
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      {approvals.map((step, i) => (
        <span key={i} className="flex items-center gap-0.5">
          {i > 0 && <span className="text-gray-300 mx-0.5">&rarr;</span>}
          <span className="text-gray-600">{getRoleLabel(step.role)}</span>
          {getIcon(step.status)}
        </span>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Pending Approvals Section
// ──────────────────────────────────────────────────────────────
function PendingApprovalsSection({
  requests,
  onApprove,
  onRefresh,
}: {
  requests: any[]
  onApprove: (id: string) => void
  onRefresh: () => void
}) {
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectComment, setRejectComment] = useState('')
  const [rejecting, setRejecting] = useState(false)

  const handleReject = async () => {
    if (!rejectId) return
    setRejecting(true)
    try {
      await leaveApi.reject(rejectId, rejectComment || undefined)
      useToastStore.getState().addToast('success', '반려되었습니다')
      setRejectId(null)
      setRejectComment('')
      onRefresh()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '반려 실패'
      useToastStore.getState().addToast('error', '반려 실패', msg)
    } finally {
      setRejecting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b">
        <h3 className="font-semibold text-gray-900">결재 대기</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">신청자</th>
              <th className="text-left px-4 py-2 font-medium">유형</th>
              <th className="text-left px-4 py-2 font-medium">기간</th>
              <th className="text-left px-4 py-2 font-medium">사유</th>
              <th className="text-left px-4 py-2 font-medium">첨부</th>
              <th className="text-left px-4 py-2 font-medium">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {requests.map((req: any) => (
              <tr key={req.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">{req.user_name || '-'}</td>
                <td className="px-4 py-2">{typeLabels[req.type] || req.type}</td>
                <td className="px-4 py-2 text-gray-600">
                  {dayjs(req.start_date).format('MM/DD')}
                  {req.start_date !== req.end_date && ` - ${dayjs(req.end_date).format('MM/DD')}`}
                </td>
                <td className="px-4 py-2 text-gray-500 text-xs max-w-[200px] truncate">{req.reason || '-'}</td>
                <td className="px-4 py-2">
                  {req.attachment_url ? (
                    <a
                      href={req.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline flex items-center gap-1"
                    >
                      <Paperclip size={14} /> 파일
                    </a>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <Button size="sm" onClick={() => onApprove(req.id)}>
                      <Check size={14} className="mr-1" /> 승인
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setRejectId(req.id)}>
                      <X size={14} className="mr-1" /> 반려
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reject Comment Modal */}
      <Modal open={!!rejectId} onClose={() => { setRejectId(null); setRejectComment('') }} title="반려 사유">
        <div className="space-y-4">
          <textarea
            value={rejectComment}
            onChange={e => setRejectComment(e.target.value)}
            placeholder="반려 사유를 입력하세요 (선택)"
            className="w-full border rounded-lg px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setRejectId(null); setRejectComment('') }}>
              취소
            </Button>
            <Button variant="danger" onClick={handleReject} loading={rejecting}>
              반려
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Create Leave Modal
// ──────────────────────────────────────────────────────────────
function CreateLeaveModal({
  open,
  onClose,
  onCreated,
  loading,
  setLoading,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
  loading: boolean
  setLoading: (v: boolean) => void
}) {
  const { user, departments } = useAuthStore()
  const isManager = user?.is_ceo || user?.is_admin || departments.some(d => d.role === 'head')

  const [leaveType, setLeaveType] = useState('vacation')
  const [startDate, setStartDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [reason, setReason] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Proxy (대리 신청)
  const [proxyMode, setProxyMode] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [orgMembers, setOrgMembers] = useState<any[]>([])

  useEffect(() => {
    if (proxyMode && orgMembers.length === 0) {
      membersApi.list().then(res => setOrgMembers(res.members || [])).catch(() => {})
    }
  }, [proxyMode, orgMembers.length])

  const isHalfDay = leaveType === 'half_day_am' || leaveType === 'half_day_pm'

  // Reset end date when switching to half-day
  useEffect(() => {
    if (isHalfDay) {
      setEndDate(startDate)
    }
  }, [isHalfDay, startDate])

  const handleFileUpload = async (file: File) => {
    setUploading(true)
    try {
      const res = await leaveApi.upload(file)
      setAttachmentUrl(res.url)
      useToastStore.getState().addToast('success', '파일 업로드 완료')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '업로드 실패'
      useToastStore.getState().addToast('error', '업로드 실패', msg)
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  const handleSubmit = async () => {
    if (!startDate || !endDate) {
      useToastStore.getState().addToast('error', '날짜를 선택해주세요')
      return
    }
    setLoading(true)
    try {
      await leaveApi.create({
        ...(proxyMode && selectedUserId ? { user_id: selectedUserId } : {}),
        type: leaveType,
        start_date: startDate,
        end_date: isHalfDay ? startDate : endDate,
        reason,
        attachment_url: attachmentUrl || undefined,
      })
      useToastStore.getState().addToast('success', '신청이 완료되었습니다')
      // Reset form
      setLeaveType('vacation')
      setStartDate(dayjs().format('YYYY-MM-DD'))
      setEndDate(dayjs().format('YYYY-MM-DD'))
      setReason('')
      setAttachmentUrl('')
      setProxyMode(false)
      setSelectedUserId('')
      onCreated()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '신청 실패'
      useToastStore.getState().addToast('error', '신청 실패', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={proxyMode ? '조직원 휴가/결재 대리 신청' : '휴가/결재 신청'} width="max-w-lg">
      <div className="space-y-4">
        {/* Proxy mode toggle (managers only) */}
        {isManager && (
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={proxyMode}
                onChange={e => { setProxyMode(e.target.checked); setSelectedUserId('') }}
                className="rounded"
              />
              <span className="font-medium text-gray-700">조직원 대리 신청</span>
            </label>
            {proxyMode && (
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">대상 직원 선택</option>
                {orgMembers.filter(m => m.id !== user?.id).map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email}){m.departments?.map((d: any) => ` - ${d.name}`).join('')}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">유형</label>
          <select
            value={leaveType}
            onChange={e => setLeaveType(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {leaveTypes.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
            <input
              type="date"
              value={isHalfDay ? startDate : endDate}
              onChange={e => setEndDate(e.target.value)}
              disabled={isHalfDay}
              min={startDate}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
            />
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">사유</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="사유를 입력하세요"
            className="w-full border rounded-lg px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* File Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">첨부파일 (선택)</label>
          {attachmentUrl ? (
            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border">
              <Paperclip size={16} className="text-gray-500" />
              <span className="text-sm text-gray-700 flex-1 truncate">{attachmentUrl}</span>
              <button onClick={() => setAttachmentUrl('')} className="p-1 hover:bg-gray-200 rounded">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <Upload size={24} className="mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-500">
                {uploading ? '업로드 중...' : '파일을 드래그하거나 클릭하여 업로드'}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(file)
                }}
              />
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            신청
          </Button>
        </div>
      </div>
    </Modal>
  )
}
