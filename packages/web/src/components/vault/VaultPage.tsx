import { useState, useEffect } from 'react'
import { useOrgStore } from '../../stores/orgStore'
import { vaultApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Plus, Eye, EyeOff, Copy, ExternalLink, Shield, Clock } from 'lucide-react'

export function VaultPage() {
  const { currentDeptId } = useOrgStore()
  const [credentials, setCredentials] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [viewingCred, setViewingCred] = useState<any>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [showAudit, setShowAudit] = useState(false)

  useEffect(() => {
    if (currentDeptId) {
      vaultApi.list(currentDeptId).then(r => setCredentials(r.credentials)).catch(() => {})
    } else {
      // 전체 부서: load all visible credentials
      vaultApi.list('').then(r => setCredentials(r.credentials)).catch(() => setCredentials([]))
    }
  }, [currentDeptId])

  const viewCredential = async (cred: any) => {
    if (!currentDeptId) return
    try {
      const res = await vaultApi.get(cred.id, currentDeptId)
      setViewingCred(res.credential)
      setShowPassword(false)
    } catch (e: any) {
      useToastStore.getState().addToast('error', '조회 실패', e.message)
    }
  }

  const viewAuditLog = async (credId: string) => {
    if (!currentDeptId) return
    try {
      const res = await vaultApi.auditLog(credId, currentDeptId)
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Shield size={24} className="text-amber-500" />
          <h1 className="text-2xl font-bold text-gray-900">비밀번호 금고</h1>
        </div>
        <Button size="sm" onClick={() => { setShowForm(true) }}>
          <Plus size={14} className="mr-1" /> 추가
        </Button>
      </div>

      {/* Credential List */}
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
    </div>
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
