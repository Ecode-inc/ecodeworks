import { useState, useEffect, useRef } from 'react'
import { Bug, Send, ThumbsUp, ThumbsDown, MessageSquare, Clock, ChevronDown, Image as ImageIcon, X } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/api$/, '/api')

const STATUS_LABELS: Record<string, string> = {
  todo: '작업예정', in_progress: '진행중', completed: '완료', cancelled: '취소', test_failed: '테스트실패',
}
const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-700', in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-400 line-through',
  test_failed: 'bg-red-100 text-red-700',
}

function formatDate(d: string) {
  const date = new Date(d.endsWith('Z') ? d : d + 'Z')
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

export function QAExternalPage({ token }: { token: string }) {
  const [project, setProject] = useState<any>(null)
  const [issues, setIssues] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newContent, setNewContent] = useState('')
  const [testerName, setTesterName] = useState(() => localStorage.getItem('qa_tester_name') || '')
  const [showNameInput, setShowNameInput] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [commentModal, setCommentModal] = useState<{ issueId: string; type: 'fail' | 'comment' } | null>(null)
  const [commentText, setCommentText] = useState('')
  const [images, setImages] = useState<{ url: string; name: string }[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      const [pRes, iRes] = await Promise.all([
        fetch(`${API_BASE}/qa/external/${token}`).then(r => r.json()),
        fetch(`${API_BASE}/qa/external/${token}/issues`).then(r => r.json()),
      ])
      if (pRes.error) { setError(pRes.error); return }
      setProject(pRes.project)
      setIssues(iRes.issues || [])
    } catch { setError('데이터를 불러올 수 없습니다') }
    setLoading(false)
  }

  useEffect(() => { load() }, [token])
  useEffect(() => { const i = setInterval(load, 30000); return () => clearInterval(i) }, [token])

  const uploadImage = async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${API_BASE}/qa/external/${token}/images/upload`, { method: 'POST', body: fd })
    return res.json()
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const res = await uploadImage(file)
        if (res.url) setImages(prev => [...prev, { url: res.url, name: res.name || file.name }])
      }
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const res = await uploadImage(file)
    if (res.url) setImages(prev => [...prev, { url: res.url, name: res.name || file.name }])
    e.target.value = ''
  }

  const submitIssue = async () => {
    if (!newContent.trim()) return
    if (!testerName.trim()) { setShowNameInput(true); return }
    localStorage.setItem('qa_tester_name', testerName)
    setSubmitting(true)
    try {
      await fetch(`${API_BASE}/qa/external/${token}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent.trim(), created_by_external: testerName.trim(), images }),
      })
      setNewContent('')
      setImages([])
      load()
    } catch {}
    setSubmitting(false)
  }

  const submitTest = async (issueId: string, result: 'pass' | 'fail' | 'comment', comment?: string) => {
    if (!testerName.trim()) { setShowNameInput(true); return }
    localStorage.setItem('qa_tester_name', testerName)
    try {
      await fetch(`${API_BASE}/qa/external/${token}/issues/${issueId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result, comment, external_name: testerName.trim() }),
      })
      setCommentModal(null)
      setCommentText('')
      load()
    } catch {}
  }

  const filtered = statusFilter ? issues.filter(i => i.status === statusFilter) : issues
  const counts = issues.reduce((acc: any, i: any) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc }, {} as Record<string, number>)

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>
  if (error) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-center"><Bug size={48} className="text-gray-300 mx-auto mb-4" /><p className="text-gray-500">{error}</p></div></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project?.color || '#3B82F6' }} />
            <h1 className="font-bold text-gray-900">{project?.name || 'QA'}</h1>
            <span className="text-xs text-gray-400">외부 테스트</span>
          </div>
          <button
            onClick={() => setShowNameInput(true)}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
          >
            {testerName || '이름 설정'}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        {/* Status filter */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button onClick={() => setStatusFilter('')} className={`px-2.5 py-1 rounded-full text-xs font-medium ${!statusFilter ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            전체 {issues.length}
          </button>
          {(['todo', 'in_progress', 'test_failed', 'completed', 'cancelled'] as const).map(s => (
            counts[s] > 0 && (
              <button key={s} onClick={() => setStatusFilter(statusFilter === s ? '' : s)} className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusFilter === s ? 'bg-gray-800 text-white' : STATUS_COLORS[s]}`}>
                {STATUS_LABELS[s]} {counts[s]}
              </button>
            )
          ))}
        </div>

        {/* Issue list */}
        <div className="space-y-2">
          {filtered.map(issue => (
            <div key={issue.id} className="bg-white rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-400 font-mono mt-0.5">#{issue.issue_number}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[issue.status]}`}>
                      {STATUS_LABELS[issue.status]}
                    </span>
                    {issue.assignee_name && <span className="text-xs text-gray-500">{issue.assignee_name}</span>}
                  </div>
                  <p
                    className={`text-sm text-gray-800 ${expandedId === issue.id ? '' : 'line-clamp-2'} cursor-pointer`}
                    onClick={() => setExpandedId(expandedId === issue.id ? null : issue.id)}
                  >
                    {issue.content}
                  </p>

                  {/* Images */}
                  {issue.images && issue.images.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {issue.images.map((img: any, i: number) => (
                        <img key={i} src={img.url} className="h-16 rounded border cursor-pointer hover:opacity-80" onClick={() => setLightbox(img.url)} />
                      ))}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span>{issue.created_by_name || issue.created_by_external}</span>
                    <span className="flex items-center gap-0.5"><Clock size={10} /> {formatDate(issue.created_at)}</span>
                  </div>

                  {/* Test results */}
                  {issue.test_results && issue.test_results.length > 0 && (
                    <div className="mt-2 space-y-1 border-t pt-2">
                      {issue.test_results.slice(0, expandedId === issue.id ? undefined : 2).map((tr: any) => (
                        <div key={tr.id} className="flex items-center gap-2 text-xs">
                          {tr.result === 'pass' ? <ThumbsUp size={11} className="text-green-500" /> : tr.result === 'fail' ? <ThumbsDown size={11} className="text-red-500" /> : <MessageSquare size={11} className="text-blue-500" />}
                          <span className="text-gray-500">{tr.user_name || tr.external_name}</span>
                          {tr.comment && <span className="text-gray-600">: {tr.comment}</span>}
                          <span className="text-gray-300 ml-auto">{formatDate(tr.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Test buttons */}
                  {(issue.status === 'completed' || issue.status === 'test_failed') && (
                    <div className="flex gap-1 mt-2">
                      <button onClick={() => submitTest(issue.id, 'pass')} className="px-2 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100 flex items-center gap-1">
                        <ThumbsUp size={11} /> Pass
                      </button>
                      <button onClick={() => { setCommentModal({ issueId: issue.id, type: 'fail' }); setCommentText('') }} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 flex items-center gap-1">
                        <ThumbsDown size={11} /> Fail
                      </button>
                      <button onClick={() => { setCommentModal({ issueId: issue.id, type: 'comment' }); setCommentText('') }} className="px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100 flex items-center gap-1">
                        <MessageSquare size={11} /> 코멘트
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">이슈가 없습니다</p>}
        </div>

        {/* New issue input */}
        <div className="mt-4 bg-white rounded-lg border p-3">
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitIssue() }}
            placeholder="이슈를 입력하세요... (Ctrl+Enter로 등록)"
            rows={2}
            className="w-full text-sm border-0 focus:outline-none resize-none"
          />
          {images.length > 0 && (
            <div className="flex gap-1 mb-2 flex-wrap">
              {images.map((img, i) => (
                <div key={i} className="relative">
                  <img src={img.url} className="h-12 rounded" />
                  <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">×</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <button onClick={() => fileRef.current?.click()} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">
                <ImageIcon size={16} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </div>
            <button
              onClick={submitIssue}
              disabled={!newContent.trim() || submitting}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Send size={12} /> 등록
            </button>
          </div>
        </div>
      </main>

      {/* Name input modal */}
      {showNameInput && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowNameInput(false)}>
          <div className="bg-white rounded-xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-3">테스터 이름</h3>
            <input
              value={testerName}
              onChange={e => setTesterName(e.target.value)}
              placeholder="이름을 입력하세요"
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && testerName.trim()) { localStorage.setItem('qa_tester_name', testerName); setShowNameInput(false) } }}
            />
            <button onClick={() => { if (testerName.trim()) { localStorage.setItem('qa_tester_name', testerName); setShowNameInput(false) } }} className="w-full py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">확인</button>
          </div>
        </div>
      )}

      {/* Comment modal */}
      {commentModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setCommentModal(null)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-3">{commentModal.type === 'fail' ? '실패 사유' : '코멘트'}</h3>
            <textarea
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder={commentModal.type === 'fail' ? '어떤 문제가 있나요?' : '코멘트를 입력하세요'}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3 resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setCommentModal(null)} className="flex-1 py-2 text-sm text-gray-600 rounded-lg border hover:bg-gray-50">취소</button>
              <button
                onClick={() => submitTest(commentModal.issueId, commentModal.type === 'fail' ? 'fail' : 'comment', commentText)}
                className={`flex-1 py-2 text-sm text-white rounded-lg ${commentModal.type === 'fail' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {commentModal.type === 'fail' ? 'Fail 등록' : '코멘트 등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-w-[90vw] max-h-[90vh] rounded-lg" />
        </div>
      )}
    </div>
  )
}
