import { useState, useEffect, useCallback, useRef } from 'react'
import { useOrgStore } from '../../stores/orgStore'
import { vaultApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Plus, Eye, EyeOff, Copy, ExternalLink, Shield, Clock, Lock, Unlock } from 'lucide-react'

export function VaultPage() {
  const { currentDeptId } = useOrgStore()
  const [credentials, setCredentials] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [viewingCred, setViewingCred] = useState<any>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [showAudit, setShowAudit] = useState(false)

  // PIN state
  const [hasPin, setHasPin] = useState<boolean | null>(null)
  const [vaultToken, setVaultToken] = useState<string | null>(null)
  const [showPinSetup, setShowPinSetup] = useState(false)
  const [showPinVerify, setShowPinVerify] = useState(false)
  const [pendingCredId, setPendingCredId] = useState<string | null>(null)
  const [remainingMinutes, setRemainingMinutes] = useState(0)
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tokenExpiryRef = useRef<number>(0)

  // Check PIN status on mount
  useEffect(() => {
    vaultApi.pinStatus().then(res => {
      setHasPin(res.has_pin)
    }).catch(() => {})
  }, [])

  // Auto-lock timer management
  const clearTimers = useCallback(() => {
    if (lockTimerRef.current) { clearTimeout(lockTimerRef.current); lockTimerRef.current = null }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
  }, [])

  const startLockTimer = useCallback((expiresInSec: number) => {
    clearTimers()
    tokenExpiryRef.current = Date.now() + expiresInSec * 1000

    lockTimerRef.current = setTimeout(() => {
      setVaultToken(null)
      setRemainingMinutes(0)
      useToastStore.getState().addToast('info', '금고 잠금됨', 'PIN 세션이 만료되었습니다.')
    }, expiresInSec * 1000)

    countdownRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((tokenExpiryRef.current - Date.now()) / 60000))
      setRemainingMinutes(remaining)
      if (remaining <= 0 && countdownRef.current) {
        clearInterval(countdownRef.current)
        countdownRef.current = null
      }
    }, 10000)

    setRemainingMinutes(Math.ceil(expiresInSec / 60))
  }, [clearTimers])

  useEffect(() => {
    return () => clearTimers()
  }, [clearTimers])

  // Only load credentials if PIN is not set, or if unlocked
  const canViewList = hasPin === false || (hasPin && !!vaultToken)
  useEffect(() => {
    if (!canViewList) { setCredentials([]); return }
    if (currentDeptId) {
      vaultApi.list(currentDeptId).then(r => setCredentials(r.credentials)).catch(() => {})
    } else {
      vaultApi.list('').then(r => setCredentials(r.credentials)).catch(() => setCredentials([]))
    }
  }, [currentDeptId, canViewList])

  const viewCredential = async (cred: any) => {
    // If user has PIN set and not unlocked, show PIN verify dialog
    if (hasPin && !vaultToken) {
      setPendingCredId(cred.id)
      setShowPinVerify(true)
      return
    }

    try {
      const deptId = currentDeptId || cred.department_id || ''
      const res = await vaultApi.get(cred.id, deptId, vaultToken || undefined)
      setViewingCred(res.credential)
      setShowPassword(false)
    } catch (e: any) {
      if (e.message?.includes('PIN')) {
        setPendingCredId(cred.id)
        setShowPinVerify(true)
      } else {
        useToastStore.getState().addToast('error', '조회 실패', e.message)
      }
    }
  }

  const onPinVerified = async (token: string, expiresIn: number) => {
    setVaultToken(token)
    setShowPinVerify(false)
    startLockTimer(expiresIn)

    // Reload credential list now that we're unlocked
    const dId = currentDeptId || ''
    vaultApi.list(dId).then(r => setCredentials(r.credentials)).catch(() => {})

    // If there was a pending credential view, fetch it now
    if (pendingCredId && currentDeptId) {
      try {
        const res = await vaultApi.get(pendingCredId, currentDeptId, token)
        setViewingCred(res.credential)
        setShowPassword(false)
      } catch (e: any) {
        useToastStore.getState().addToast('error', '조회 실패', e.message)
      }
      setPendingCredId(null)
    }
  }

  const viewAuditLog = async (credId: string) => {
    try {
      const res = await vaultApi.auditLog(credId, currentDeptId || '')
      setAuditLogs(res.logs)
      setShowAudit(true)
    } catch (e: any) {
      useToastStore.getState().addToast('error', '감사 로그 조회 실패', e.message)
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    useToastStore.getState().addToast('success', `${label} 복사됨`)
  }

  const deleteCred = async (id: string) => {
    if (!currentDeptId) return
    try {
      await vaultApi.delete(id, currentDeptId)
      setCredentials(prev => prev.filter(c => c.id !== id))
      setViewingCred(null)
      useToastStore.getState().addToast('success', '삭제 완료')
    } catch (e: any) {
      useToastStore.getState().addToast('error', '삭제 실패', e.message)
    }
  }

  const handleLockVault = () => {
    clearTimers()
    setVaultToken(null)
    setRemainingMinutes(0)
    useToastStore.getState().addToast('info', '금고가 잠겼습니다')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Shield size={24} className="text-amber-500" />
          <h1 className="text-2xl font-bold text-gray-900">비밀번호 금고</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* PIN status indicator */}
          {hasPin === false && (
            <Button size="sm" variant="secondary" onClick={() => setShowPinSetup(true)}>
              <Lock size={14} className="mr-1" /> PIN 설정
            </Button>
          )}
          {hasPin && vaultToken && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-600 flex items-center gap-1">
                <Unlock size={12} /> 잠금 해제됨 ({remainingMinutes}분 남음)
              </span>
              <Button size="sm" variant="ghost" onClick={handleLockVault}>
                <Lock size={14} className="mr-1" /> 잠금
              </Button>
            </div>
          )}
          {hasPin && !vaultToken && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Lock size={12} /> 잠김
            </span>
          )}
          <Button size="sm" onClick={() => { setShowForm(true) }}>
            <Plus size={14} className="mr-1" /> 추가
          </Button>
        </div>
      </div>

      {/* Credential List */}
      {hasPin && !vaultToken ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <Lock size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">금고가 잠겨 있습니다</h3>
          <p className="text-sm text-gray-500 mb-4">PIN을 입력하여 잠금을 해제하세요</p>
          <Button onClick={() => { setPendingCredId(null); setShowPinVerify(true) }}>
            <Unlock size={16} className="mr-1" /> 잠금 해제
          </Button>
        </div>
      ) : (
      <div className="bg-white rounded-xl border divide-y">
        {credentials.map(cred => (
          <div key={cred.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500">
                {cred.service_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{cred.service_name}</p>
                {cred.url && (
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <ExternalLink size={10} /> {cred.url}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => viewCredential(cred)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100" title="보기">
                <Eye size={16} />
              </button>
              <button onClick={() => viewAuditLog(cred.id)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100" title="감사 로그">
                <Clock size={16} />
              </button>
            </div>
          </div>
        ))}
        {credentials.length === 0 && (
          <div className="text-center text-gray-400 py-12">저장된 자격증명이 없습니다</div>
        )}
      </div>
      )}

      {/* View Credential Modal */}
      <Modal open={!!viewingCred} onClose={() => setViewingCred(null)} title={viewingCred?.service_name || ''}>
        {viewingCred && (
          <div className="space-y-4">
            {viewingCred.url && (
              <div>
                <label className="text-xs text-gray-500">URL</label>
                <p className="text-sm">{viewingCred.url}</p>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500">사용자명</label>
              <div className="flex items-center gap-2">
                <p className="text-sm font-mono flex-1">{viewingCred.username}</p>
                <button onClick={() => copyToClipboard(viewingCred.username, '사용자명')}
                  className="p-1 text-gray-400 hover:text-gray-600"><Copy size={14} /></button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">비밀번호</label>
              <div className="flex items-center gap-2">
                <p className="text-sm font-mono flex-1">
                  {showPassword ? viewingCred.password : '••••••••••'}
                </p>
                <button onClick={() => setShowPassword(!showPassword)}
                  className="p-1 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button onClick={() => copyToClipboard(viewingCred.password, '비밀번호')}
                  className="p-1 text-gray-400 hover:text-gray-600"><Copy size={14} /></button>
              </div>
            </div>
            {viewingCred.notes && (
              <div>
                <label className="text-xs text-gray-500">메모</label>
                <p className="text-sm whitespace-pre-wrap">{viewingCred.notes}</p>
              </div>
            )}
            <div className="flex justify-between pt-2">
              <Button variant="danger" size="sm" onClick={() => { deleteCred(viewingCred.id); }}>삭제</Button>
              <Button variant="secondary" onClick={() => setViewingCred(null)}>닫기</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create/Edit Form Modal */}
      <CredentialForm
        open={showForm}
        onClose={() => setShowForm(false)}
        deptId={currentDeptId || ''}
        onSave={() => {
          vaultApi.list(currentDeptId || '').then(r => setCredentials(r.credentials))
          setShowForm(false)
        }}
      />

      {/* Audit Log Modal */}
      <Modal open={showAudit} onClose={() => setShowAudit(false)} title="감사 로그" width="max-w-lg">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {auditLogs.map(log => (
            <div key={log.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
              <div>
                <span className="font-medium">{log.user_name}</span>
                <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                  log.action === 'view' ? 'bg-blue-100 text-blue-700' :
                  log.action === 'create' ? 'bg-green-100 text-green-700' :
                  log.action === 'update' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {log.action}
                </span>
              </div>
              <div className="text-xs text-gray-400">
                {new Date(log.created_at).toLocaleString('ko')}
              </div>
            </div>
          ))}
          {auditLogs.length === 0 && <p className="text-sm text-gray-400 text-center py-4">로그가 없습니다</p>}
        </div>
      </Modal>

      {/* PIN Setup Modal */}
      <PinSetupModal
        open={showPinSetup}
        onClose={() => setShowPinSetup(false)}
        onSuccess={() => {
          setHasPin(true)
          setShowPinSetup(false)
          useToastStore.getState().addToast('success', 'PIN 설정 완료')
        }}
      />

      {/* PIN Verify Modal */}
      <PinVerifyModal
        open={showPinVerify}
        onClose={() => { setShowPinVerify(false); setPendingCredId(null) }}
        onVerified={onPinVerified}
      />
    </div>
  )
}

function PinSetupModal({ open, onClose, onSuccess }: {
  open: boolean; onClose: () => void; onSuccess: () => void
}) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setError('')
    if (!/^\d{4,8}$/.test(pin)) {
      setError('PIN은 4~8자리 숫자여야 합니다')
      return
    }
    if (pin !== confirmPin) {
      setError('PIN이 일치하지 않습니다')
      return
    }
    setLoading(true)
    try {
      await vaultApi.setPin(pin)
      setPin(''); setConfirmPin('')
      onSuccess()
    } catch (e: any) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="비밀번호 금고 PIN 설정">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          금고 열람 시 사용할 PIN을 설정하세요. 4~8자리 숫자를 입력하세요.
        </p>
        <Input
          label="PIN"
          type="password"
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="4~8자리 숫자"
          maxLength={8}
        />
        <Input
          label="PIN 확인"
          type="password"
          value={confirmPin}
          onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="PIN을 다시 입력하세요"
          maxLength={8}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button onClick={handleSubmit} loading={loading}>설정</Button>
        </div>
      </div>
    </Modal>
  )
}

function PinVerifyModal({ open, onClose, onVerified }: {
  open: boolean; onClose: () => void; onVerified: (token: string, expiresIn: number) => void
}) {
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setPin(''); setError('') }
  }, [open])

  const handleSubmit = async () => {
    if (!pin) return
    setError('')
    setLoading(true)
    try {
      const res = await vaultApi.verifyPin(pin)
      setPin('')
      onVerified(res.vault_token, res.expires_in)
    } catch (e: any) {
      setError(e.message === 'Invalid PIN' ? 'PIN이 올바르지 않습니다' : e.message)
    } finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="금고 잠금 해제">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          자격증명을 열람하려면 PIN을 입력하세요.
        </p>
        <Input
          label="PIN"
          type="password"
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="PIN 입력"
          maxLength={8}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button onClick={handleSubmit} loading={loading}>확인</Button>
        </div>
      </div>
    </Modal>
  )
}

function CredentialForm({ open, onClose, deptId, onSave }: {
  open: boolean; onClose: () => void; deptId: string; onSave: () => void
}) {
  const [serviceName, setServiceName] = useState('')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!serviceName || !username || !password) return
    setLoading(true)
    try {
      await vaultApi.create(deptId, { service_name: serviceName, url, username, password, notes })
      setServiceName(''); setUrl(''); setUsername(''); setPassword(''); setNotes('')
      onSave()
    } catch (e: any) {
      useToastStore.getState().addToast('error', '저장 실패', e.message)
    } finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="자격증명 추가">
      <div className="space-y-4">
        <Input label="서비스 이름" value={serviceName} onChange={e => setServiceName(e.target.value)} required />
        <Input label="URL" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" />
        <Input label="사용자명" value={username} onChange={e => setUsername(e.target.value)} required />
        <Input label="비밀번호" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        <textarea
          placeholder="메모 (선택)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
          rows={2}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button onClick={handleSubmit} loading={loading}>저장</Button>
        </div>
      </div>
    </Modal>
  )
}
