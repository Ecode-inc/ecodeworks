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
  const [allRequests, setAllRequests] = useState<any[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([])
  const [trashItems, setTrashItems] = useState<any[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [loading, setLoading] = useState(false)
  const [myBalance, setMyBalance] = useState<{ accrued: number; adjustments: number; used: number; remaining: number } | null>(null)
  const [allBalances, setAllBalances] = useState<any[]>([])
  const [balanceYear, setBalanceYear] = useState(new Date().getFullYear())
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<{ user_id: string; user_name: string } | null>(null)

  const loadBalance = useCallback(async () => {
    try {
      const res = await leaveApi.balance({ year: balanceYear })
      setMyBalance(res)
    } catch {
      // ignore
    }
  }, [balanceYear])

  const loadAllBalances = useCallback(async () => {
    if (!isManager) return
    try {
      const res = await leaveApi.balances(balanceYear)
      setAllBalances(res.balances || [])
    } catch {
      // ignore
    }
  }, [isManager, balanceYear])

  const loadMyRequests = useCallback(async () => {
    try {
      // Load ALL visible (for managers) and filter "mine" on client
      const res = await leaveApi.list({}) as any
      const items = res.leave_requests || res.requests || []
      setMyRequests(items.filter((r: any) => r.user_id === user?.id))
      setAllRequests(items)
    } catch {
      // ignore
    }
  }, [user?.id])

  const loadPendingApprovals = useCallback(async () => {
    if (!isManager) return
    try {
      const res = await leaveApi.list({ status: 'pending' }) as any
      const items = res.leave_requests || res.requests || []
      // Filter out own requests
      setPendingApprovals(items.filter((r: any) => r.user_id !== user?.id))
    } catch {
      // ignore
    }
  }, [isManager, user?.id])

  const loadTrash = useCallback(async () => {
    if (!isCeo) return
    try {
      const res = await leaveApi.trash() as any
      setTrashItems(res.leave_requests || res.requests || [])
    } catch {
      // ignore
    }
  }, [isCeo])

  useEffect(() => {
    loadMyRequests()
    loadPendingApprovals()
    loadBalance()
    loadAllBalances()
  }, [loadMyRequests, loadPendingApprovals, loadBalance, loadAllBalances])

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

      {/* Balance Summary */}
      {myBalance && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">{balanceYear}년 휴가 현황</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setBalanceYear(y => y - 1)}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                >
                  &lt;
                </button>
                <span className="text-sm font-medium text-gray-700 px-2">{balanceYear}</span>
                <button
                  onClick={() => setBalanceYear(y => y + 1)}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                >
                  &gt;
                </button>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-gray-500">발생</span>
                <span className="ml-1.5 font-semibold text-gray-900">{myBalance.accrued}일</span>
              </div>
              {myBalance.adjustments !== 0 && (
                <div>
                  <span className="text-gray-500">조정</span>
                  <span className={`ml-1.5 font-semibold ${myBalance.adjustments > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {myBalance.adjustments > 0 ? '+' : ''}{myBalance.adjustments}일
                  </span>
                </div>
              )}
              <div>
                <span className="text-gray-500">사용</span>
                <span className="ml-1.5 font-semibold text-orange-600">{myBalance.used}일</span>
              </div>
              <div>
                <span className="text-gray-500">잔여</span>
                <span className={`ml-1.5 font-semibold ${myBalance.remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {myBalance.remaining}일
                </span>
              </div>
            </div>
            {/* Progress bar */}
            {(myBalance.accrued + myBalance.adjustments) > 0 && (
              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-primary-600 h-2.5 rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, (myBalance.used / (myBalance.accrued + myBalance.adjustments)) * 100))}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {Math.round((myBalance.used / Math.max(1, myBalance.accrued + myBalance.adjustments)) * 100)}% 사용
                </p>
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* All Requests (managers only) */}
      {isManager && <AllRequestsSection requests={allRequests} currentUserId={user?.id} />}

      {/* All Balances Table (managers only) */}
      {isManager && allBalances.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">전체 휴가 현황 ({balanceYear}년)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">이름</th>
                  <th className="text-left px-4 py-2 font-medium">입사일</th>
                  <th className="text-right px-4 py-2 font-medium">발생</th>
                  <th className="text-right px-4 py-2 font-medium">조정</th>
                  <th className="text-right px-4 py-2 font-medium">사용</th>
                  <th className="text-right px-4 py-2 font-medium">잔여</th>
                  {(user?.is_ceo || user?.is_admin) && (
                    <th className="text-left px-4 py-2 font-medium">작업</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {allBalances.map((b: any) => (
                  <tr key={b.user_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{b.user_name}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{b.hire_date ? dayjs(b.hire_date).format('YYYY-MM') : '-'}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{b.accrued}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={b.adjustments > 0 ? 'text-blue-600' : b.adjustments < 0 ? 'text-red-600' : 'text-gray-400'}>
                        {b.adjustments > 0 ? '+' : ''}{b.adjustments}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-orange-600">{b.used}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`font-semibold ${b.remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {b.remaining}
                      </span>
                    </td>
                    {(user?.is_ceo || user?.is_admin) && (
                      <td className="px-4 py-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setAdjustTarget({ user_id: b.user_id, user_name: b.user_name })
                            setShowAdjustModal(true)
                          }}
                        >
                          조정
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjust Modal */}
      {showAdjustModal && adjustTarget && (
        <AdjustBalanceModal
          open={showAdjustModal}
          onClose={() => { setShowAdjustModal(false); setAdjustTarget(null) }}
          onAdjusted={() => {
            setShowAdjustModal(false)
            setAdjustTarget(null)
            loadBalance()
            loadAllBalances()
          }}
          userId={adjustTarget.user_id}
          userName={adjustTarget.user_name}
          year={balanceYear}
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
      {/* Mobile card view */}
      <div className="md:hidden divide-y">
        {requests.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400">신청 내역이 없습니다</div>
        ) : requests.map((req: any) => (
          <div key={req.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-gray-900 text-sm">{typeLabels[req.type] || req.type}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[req.status] || 'bg-gray-100 text-gray-600'}`}>
                {statusLabels[req.status] || req.status}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {dayjs(req.start_date).format('MM/DD')}
              {req.start_date !== req.end_date && ` - ${dayjs(req.end_date).format('MM/DD')}`}
            </div>
            {req.reason && <div className="text-xs text-gray-400 mt-1 truncate">{req.reason}</div>}
            <div className="flex items-center gap-2 mt-2">
              <ApprovalChain approvals={req.approvals} />
              {req.attachment_url && (
                <a href={req.attachment_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 flex items-center gap-1 text-xs">
                  <Paperclip size={12} /> 파일
                </a>
              )}
              {req.status === 'pending' && (
                <Button size="sm" variant="secondary" onClick={() => onCancel(req.id)}>취소</Button>
              )}
              {req.user_id === userId && (
                <Button size="sm" variant="ghost" onClick={() => onDelete(req.id)}><Trash2 size={14} /></Button>
              )}
            </div>
          </div>
        ))}
      </div>
      {/* Desktop table view */}
      <div className="hidden md:block overflow-x-auto">
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
      {/* Mobile card view */}
      <div className="md:hidden divide-y">
        {requests.map((req: any) => (
          <div key={req.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-gray-900 text-sm">{req.user_name || '-'}</span>
              <span className="text-xs text-gray-500">{typeLabels[req.type] || req.type}</span>
            </div>
            <div className="text-xs text-gray-500">
              {dayjs(req.start_date).format('MM/DD')}
              {req.start_date !== req.end_date && ` - ${dayjs(req.end_date).format('MM/DD')}`}
            </div>
            {req.reason && <div className="text-xs text-gray-400 mt-1 truncate">{req.reason}</div>}
            <div className="flex items-center gap-2 mt-2">
              {req.attachment_url && (
                <a href={req.attachment_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 flex items-center gap-1 text-xs">
                  <Paperclip size={12} /> 파일
                </a>
              )}
              <Button size="sm" onClick={() => onApprove(req.id)}>
                <Check size={14} className="mr-1" /> 승인
              </Button>
              <Button size="sm" variant="danger" onClick={() => setRejectId(req.id)}>
                <X size={14} className="mr-1" /> 반려
              </Button>
            </div>
          </div>
        ))}
      </div>
      {/* Desktop table view */}
      <div className="hidden md:block overflow-x-auto">
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
      membersApi.list().then(res => setOrgMembers(res.members || [])).catch((e) => { console.error(e) })
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

// ──────────────────────────────────────────────────────────────
// Adjust Balance Modal
// ──────────────────────────────────────────────────────────────
function AdjustBalanceModal({
  open,
  onClose,
  onAdjusted,
  userId,
  userName,
  year,
}: {
  open: boolean
  onClose: () => void
  onAdjusted: () => void
  userId: string
  userName: string
  year: number
}) {
  const [adjType, setAdjType] = useState('bonus')
  const [days, setDays] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const adjTypeLabels: Record<string, string> = {
    annual: '연차 기본 설정',
    bonus: '추가 부여',
    deduction: '차감',
    carryover: '이월',
  }

  const handleSubmit = async () => {
    const daysNum = parseFloat(days)
    if (isNaN(daysNum) || daysNum === 0) {
      useToastStore.getState().addToast('error', '일수를 입력해주세요')
      return
    }
    setSaving(true)
    try {
      await leaveApi.adjust({
        user_id: userId,
        year,
        type: adjType,
        days: daysNum,
        reason,
      })
      useToastStore.getState().addToast('success', '휴가가 조정되었습니다')
      onAdjusted()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '조정 실패'
      useToastStore.getState().addToast('error', '조정 실패', msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${userName} - ${year}년 휴가 조정`}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">조정 유형</label>
          <select
            value={adjType}
            onChange={e => setAdjType(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {Object.entries(adjTypeLabels).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">일수 (음수 가능, 0.5 단위)</label>
          <input
            type="number"
            step="0.5"
            value={days}
            onChange={e => setDays(e.target.value)}
            placeholder="예: 2, -1, 0.5"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">사유</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="조정 사유를 입력하세요"
            className="w-full border rounded-lg px-3 py-2 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            조정
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── All Requests Section (managers) ──────────────────────────

function AllRequestsSection({ requests, currentUserId }: { requests: any[]; currentUserId?: string }) {
  const thisYear = dayjs().startOf('year')
  const [dateFrom, setDateFrom] = useState(thisYear.format('YYYY-MM-DD'))
  const [dateTo, setDateTo] = useState(thisYear.endOf('year').format('YYYY-MM-DD'))
  const [filterPerson, setFilterPerson] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')

  const presets = [
    { label: '작년', from: thisYear.subtract(1, 'year').format('YYYY-MM-DD'), to: thisYear.subtract(1, 'day').format('YYYY-MM-DD') },
    { label: '올해', from: thisYear.format('YYYY-MM-DD'), to: thisYear.endOf('year').format('YYYY-MM-DD') },
    { label: '지난달', from: dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'), to: dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD') },
    { label: '이번달', from: dayjs().startOf('month').format('YYYY-MM-DD'), to: dayjs().endOf('month').format('YYYY-MM-DD') },
    { label: '다음달', from: dayjs().add(1, 'month').startOf('month').format('YYYY-MM-DD'), to: dayjs().add(1, 'month').endOf('month').format('YYYY-MM-DD') },
  ]

  // Get unique people
  const people = Array.from(new Map(requests.map(r => [r.user_id, { id: r.user_id, name: r.user_name }])).values())

  // Filter
  const filtered = requests.filter(r => {
    if (r.user_id === currentUserId) return false
    if (filterPerson && r.user_id !== filterPerson) return false
    if (filterStatus && r.status !== filterStatus) return false
    if (filterType && r.type !== filterType) return false
    if (dateFrom && r.end_date < dateFrom) return false
    if (dateTo && r.start_date > dateTo) return false
    return true
  })

  // Stats
  const totalDays = filtered.reduce((sum, r) => {
    const start = dayjs(r.start_date)
    const end = dayjs(r.end_date)
    return sum + end.diff(start, 'day') + 1
  }, 0)
  const byStatus: Record<string, number> = {}
  filtered.forEach(r => { byStatus[r.status] = (byStatus[r.status] || 0) + 1 })

  if (requests.filter(r => r.user_id !== currentUserId).length === 0) return null

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b">
        <h3 className="font-semibold text-gray-900">전체 결재 내역</h3>
      </div>

      {/* Filters */}
      <div className="px-4 py-3 border-b bg-gray-50 space-y-2">
        {/* Date range + presets */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border rounded-lg px-2 py-1 text-sm" />
            <span className="text-xs text-gray-400">~</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border rounded-lg px-2 py-1 text-sm" />
          </div>
          <div className="flex gap-1">
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => { setDateFrom(p.from); setDateTo(p.to) }}
                className={`px-2 py-1 text-xs rounded-lg border transition-colors ${
                  dateFrom === p.from && dateTo === p.to
                    ? 'bg-primary-100 border-primary-300 text-primary-700 font-medium'
                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {/* Other filters */}
        <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">신청자</span>
          <select
            value={filterPerson}
            onChange={e => setFilterPerson(e.target.value)}
            className="border rounded-lg px-2 py-1 text-sm"
          >
            <option value="">전체</option>
            {people.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">상태</span>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="border rounded-lg px-2 py-1 text-sm"
          >
            <option value="">전체</option>
            <option value="pending">대기</option>
            <option value="approved">승인</option>
            <option value="rejected">반려</option>
            <option value="cancelled">취소</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">유형</span>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="border rounded-lg px-2 py-1 text-sm"
          >
            <option value="">전체</option>
            <option value="vacation">휴가</option>
            <option value="half_day_am">오전반차</option>
            <option value="half_day_pm">오후반차</option>
            <option value="sick">병가</option>
            <option value="special">특별휴가</option>
            <option value="remote">재택근무</option>
          </select>
        </div>

        {/* Summary */}
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          <span>{filtered.length}건</span>
          <span>{totalDays}일</span>
          {Object.entries(byStatus).map(([s, cnt]) => (
            <span key={s} className={`px-1.5 py-0.5 rounded ${statusColors[s] || 'bg-gray-100'}`}>
              {statusLabels[s] || s} {cnt}
            </span>
          ))}
        </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">신청자</th>
              <th className="text-left px-4 py-2 font-medium">유형</th>
              <th className="text-left px-4 py-2 font-medium">기간</th>
              <th className="text-left px-4 py-2 font-medium">일수</th>
              <th className="text-left px-4 py-2 font-medium">사유</th>
              <th className="text-left px-4 py-2 font-medium">상태</th>
              <th className="text-left px-4 py-2 font-medium">신청일</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">해당 조건의 결재 내역이 없습니다</td></tr>
            ) : filtered.map((req: any) => {
              const days = dayjs(req.end_date).diff(dayjs(req.start_date), 'day') + 1
              return (
                <tr key={req.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{req.user_name}</td>
                  <td className="px-4 py-2">{typeLabels[req.type] || req.type}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {dayjs(req.start_date).format('MM/DD')}
                    {req.start_date !== req.end_date && ` - ${dayjs(req.end_date).format('MM/DD')}`}
                  </td>
                  <td className="px-4 py-2 text-gray-500">{days}일</td>
                  <td className="px-4 py-2 text-gray-500 text-xs max-w-[200px] truncate">{req.reason || '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[req.status] || 'bg-gray-100 text-gray-600'}`}>
                      {statusLabels[req.status] || req.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">{dayjs(req.created_at).format('MM/DD')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
