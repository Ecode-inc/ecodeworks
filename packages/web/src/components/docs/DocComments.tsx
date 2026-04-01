import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageSquare, Check, Trash2, X, Send } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'

// ── Types ──────────────────────────────────────────────────────

interface DocComment {
  id: string
  content: string
  selection_text: string
  selection_start: number
  selection_end: number
  author_name: string
  resolved?: boolean | number
  created_at: string
}

interface CommentApi {
  list: () => Promise<{ comments: DocComment[] }>
  create: (data: { content: string; selection_text: string; selection_start: number; selection_end: number; author_name?: string }) => Promise<any>
  delete?: (commentId: string) => Promise<any>
  resolve?: (commentId: string) => Promise<any>
}

// ── Floating Comment Button (appears on text selection) ────────

export function FloatingCommentButton({
  containerRef,
  onComment,
}: {
  containerRef: React.RefObject<HTMLElement | null>
  onComment: (selectionText: string, start: number, end: number) => void
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [selection, setSelection] = useState<{ text: string; start: number; end: number } | null>(null)

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !containerRef.current) {
      setPos(null)
      setSelection(null)
      return
    }

    const text = sel.toString().trim()
    if (!text) {
      setPos(null)
      setSelection(null)
      return
    }

    // Check selection is within the container
    const range = sel.getRangeAt(0)
    if (!containerRef.current.contains(range.commonAncestorContainer)) {
      setPos(null)
      setSelection(null)
      return
    }

    // Calculate character offsets in plain text
    const fullText = containerRef.current.textContent || ''
    const startOffset = getTextOffset(containerRef.current, range.startContainer, range.startOffset)
    const endOffset = startOffset + text.length

    // Position the button near the selection
    const rect = range.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    setPos({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 8,
    })
    setSelection({ text, start: startOffset, end: Math.min(endOffset, fullText.length) })
  }, [containerRef])

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  if (!pos || !selection) return null

  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onComment(selection.text, selection.start, selection.end)
        setPos(null)
        setSelection(null)
        window.getSelection()?.removeAllRanges()
      }}
      className="absolute z-30 bg-blue-600 text-white rounded-full px-3 py-1 text-xs font-medium shadow-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <span className="flex items-center gap-1">
        <MessageSquare size={12} />
        코멘트
      </span>
    </button>
  )
}

// ── Comment Input Form ─────────────────────────────────────────

function CommentForm({
  selectionText,
  onSubmit,
  onCancel,
  requireAuthorName,
}: {
  selectionText: string
  onSubmit: (content: string, authorName?: string) => void
  onCancel: () => void
  requireAuthorName?: boolean
}) {
  const [content, setContent] = useState('')
  const [authorName, setAuthorName] = useState(() => localStorage.getItem('docCommentAuthor') || '')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    if (!content.trim()) return
    if (requireAuthorName && !authorName.trim()) return
    if (authorName.trim()) localStorage.setItem('docCommentAuthor', authorName.trim())
    onSubmit(content.trim(), authorName.trim() || undefined)
    setContent('')
  }

  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 space-y-2">
      <div className="bg-gray-50 text-sm italic p-2 rounded text-gray-600 line-clamp-2">
        &ldquo;{selectionText}&rdquo;
      </div>
      {requireAuthorName && (
        <input
          placeholder="이름을 입력하세요"
          value={authorName}
          onChange={e => setAuthorName(e.target.value)}
          className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      )}
      <textarea
        ref={inputRef}
        placeholder="코멘트를 입력하세요..."
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
          if (e.key === 'Escape') onCancel()
        }}
        rows={2}
        className="w-full text-sm border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">Ctrl+Enter로 전송</span>
        <div className="flex items-center gap-1">
          <button onClick={onCancel} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">
            <X size={14} />
          </button>
          <button
            onClick={handleSubmit}
            disabled={!content.trim() || (requireAuthorName ? !authorName.trim() : false)}
            className="p-1.5 text-blue-600 hover:text-blue-700 rounded hover:bg-blue-50 disabled:opacity-40"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Comment Panel (sidebar) ────────────────────────────────────

export function CommentPanel({
  comments,
  onClose,
  onDelete,
  onResolve,
  onScrollTo,
}: {
  comments: DocComment[]
  onClose: () => void
  onDelete?: (id: string) => void
  onResolve?: (id: string) => void
  onScrollTo?: (comment: DocComment) => void
}) {
  const sorted = [...comments].sort((a, b) => a.selection_start - b.selection_start)

  return (
    <div className="bg-white border-l w-80 flex-shrink-0 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <MessageSquare size={14} />
          코멘트 ({comments.length})
        </span>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400">
            텍스트를 선택하여 코멘트를 추가하세요
          </div>
        ) : (
          sorted.map(c => (
            <div
              key={c.id}
              className={`p-3 border-b hover:bg-gray-50 cursor-pointer ${c.resolved ? 'opacity-50' : ''}`}
              onClick={() => onScrollTo?.(c)}
            >
              <div
                className="bg-gray-50 text-sm italic p-2 rounded text-gray-600 mb-2 line-clamp-2 hover:bg-yellow-50 transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  if (onScrollTo) {
                    onScrollTo(c)
                  } else {
                    navigator.clipboard.writeText(c.selection_text)
                  }
                }}
                title="클릭하여 해당 위치로 이동 (편집 모드에서는 텍스트 복사)"
              >
                &ldquo;{c.selection_text}&rdquo;
              </div>
              <p className={`text-sm text-gray-800 mb-1 ${c.resolved ? 'line-through' : ''}`}>{c.content}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-medium">{c.author_name}</span>
                  <span className="text-[10px] text-gray-400">{formatTime(c.created_at)}</span>
                </div>
                <div className="flex items-center gap-0.5">
                  {onResolve && !c.resolved && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onResolve(c.id) }}
                      className="p-1 text-gray-300 hover:text-green-600 rounded hover:bg-green-50"
                      title="해결 처리"
                    >
                      <Check size={13} />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(c.id) }}
                      className="p-1 text-gray-300 hover:text-red-500 rounded hover:bg-red-50"
                      title="삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Comment Toggle Button (for header) ─────────────────────────

export function CommentToggleButton({
  count,
  open,
  onClick,
}: {
  count: number
  open: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-sm transition-colors ${
        open ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
      }`}
      title="코멘트 패널"
    >
      <MessageSquare size={14} />
      <span className="text-xs">코멘트{count > 0 ? ` ${count}` : ''}</span>
    </button>
  )
}

// ── Inline Comment Form Overlay ────────────────────────────────

export function InlineCommentForm({
  selectionText,
  onSubmit,
  onCancel,
  requireAuthorName,
}: {
  selectionText: string
  onSubmit: (content: string, authorName?: string) => void
  onCancel: () => void
  requireAuthorName?: boolean
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20" onClick={onCancel}>
      <div className="w-80" onClick={e => e.stopPropagation()}>
        <CommentForm
          selectionText={selectionText}
          onSubmit={onSubmit}
          onCancel={onCancel}
          requireAuthorName={requireAuthorName}
        />
      </div>
    </div>
  )
}

// ── Highlighted Content Renderer ───────────────────────────────

export function highlightComments(
  content: string,
  comments: DocComment[],
  activeCommentId?: string
): { text: string; highlighted: boolean; commentIds: string[]; active: boolean }[] {
  if (!comments.length) return [{ text: content, highlighted: false, commentIds: [], active: false }]

  // Build a list of events (start/end of each comment range)
  const events: { pos: number; type: 'start' | 'end'; id: string }[] = []
  for (const c of comments) {
    if (c.resolved) continue
    events.push({ pos: c.selection_start, type: 'start', id: c.id })
    events.push({ pos: c.selection_end, type: 'end', id: c.id })
  }
  events.sort((a, b) => a.pos - b.pos || (a.type === 'end' ? -1 : 1))

  const segments: { text: string; highlighted: boolean; commentIds: string[]; active: boolean }[] = []
  const activeIds = new Set<string>()
  let lastPos = 0

  for (const ev of events) {
    if (ev.pos > lastPos) {
      segments.push({
        text: content.slice(lastPos, ev.pos),
        highlighted: activeIds.size > 0,
        commentIds: [...activeIds],
        active: activeCommentId ? activeIds.has(activeCommentId) : false,
      })
    }
    if (ev.type === 'start') activeIds.add(ev.id)
    else activeIds.delete(ev.id)
    lastPos = ev.pos
  }

  if (lastPos < content.length) {
    segments.push({
      text: content.slice(lastPos),
      highlighted: false,
      commentIds: [],
      active: false,
    })
  }

  return segments.filter(s => s.text.length > 0)
}

// ── Hook for managing comments ─────────────────────────────────

export function useDocComments(api: CommentApi) {
  const [comments, setComments] = useState<DocComment[]>([])
  const [showPanel, setShowPanel] = useState(false)
  const [commentForm, setCommentForm] = useState<{
    text: string
    start: number
    end: number
  } | null>(null)
  const commentCountRef = useRef(0)
  const isFirstLoad = useRef(true)

  const loadComments = useCallback(async () => {
    try {
      const res = await api.list()
      const newComments = res.comments || []
      const prevCount = commentCountRef.current
      commentCountRef.current = newComments.length

      if (!isFirstLoad.current && newComments.length !== prevCount) {
        if (newComments.length > prevCount) {
          const latest = newComments[newComments.length - 1]
          const msg = latest?.author_name ? `${latest.author_name}님이 코멘트를 남겼습니다` : '새 코멘트가 추가되었습니다'
          try { useToastStore.getState().addToast('info', '💬 코멘트 업데이트', msg) } catch {}
        } else {
          try { useToastStore.getState().addToast('info', '💬 코멘트 삭제됨', '코멘트가 삭제되었습니다') } catch {}
        }
      }
      isFirstLoad.current = false
      setComments(newComments)
    } catch {
      // ignore
    }
  }, [api])

  useEffect(() => {
    isFirstLoad.current = true
    commentCountRef.current = 0
    loadComments()
    // Poll every 10 seconds
    const interval = setInterval(loadComments, 10000)
    return () => clearInterval(interval)
  }, [loadComments])

  const handleStartComment = useCallback((text: string, start: number, end: number) => {
    setCommentForm({ text, start, end })
  }, [])

  const handleSubmitComment = useCallback(async (content: string, authorName?: string) => {
    if (!commentForm) return
    try {
      await api.create({
        content,
        selection_text: commentForm.text,
        selection_start: commentForm.start,
        selection_end: commentForm.end,
        author_name: authorName,
      })
      setCommentForm(null)
      setShowPanel(true)
      await loadComments()
    } catch {
      // ignore
    }
  }, [commentForm, api, loadComments])

  const handleDelete = useCallback(async (id: string) => {
    if (!api.delete) return
    if (!confirm('이 코멘트를 삭제하시겠습니까?')) return
    try {
      await api.delete(id)
      await loadComments()
    } catch (e: any) {
      alert('삭제 실패: ' + (e.message || ''))
    }
  }, [api, loadComments])

  const handleResolve = useCallback(async (id: string) => {
    if (!api.resolve) return
    try {
      await api.resolve(id)
      await loadComments()
    } catch {
      // ignore
    }
  }, [api, loadComments])

  return {
    comments,
    showPanel,
    setShowPanel,
    commentForm,
    setCommentForm,
    handleStartComment,
    handleSubmitComment,
    handleDelete: api.delete ? handleDelete : undefined,
    handleResolve: api.resolve ? handleResolve : undefined,
    loadComments,
  }
}

// ── Helpers ────────────────────────────────────────────────────

function getTextOffset(root: Node, targetNode: Node, targetOffset: number): number {
  let offset = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (node === targetNode) {
      return offset + targetOffset
    }
    offset += (node.textContent?.length || 0)
    node = walker.nextNode()
  }
  return offset
}

// Scroll to comment's selection text and highlight it
export function scrollToComment(containerRef: React.RefObject<HTMLDivElement | null>, comment: DocComment) {
  if (!containerRef.current || !comment.selection_text) return

  // Remove any existing highlights
  containerRef.current.querySelectorAll('.comment-highlight-active').forEach(el => {
    const parent = el.parentNode
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent || ''), el)
      parent.normalize()
    }
  })

  // Find the text in the DOM
  const walker = document.createTreeWalker(containerRef.current, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const idx = (node.textContent || '').indexOf(comment.selection_text)
    if (idx >= 0) {
      const range = document.createRange()
      range.setStart(node, idx)
      range.setEnd(node, idx + comment.selection_text.length)

      const highlight = document.createElement('mark')
      highlight.className = 'comment-highlight-active bg-yellow-200 transition-colors duration-300 rounded px-0.5'
      range.surroundContents(highlight)

      highlight.scrollIntoView({ behavior: 'smooth', block: 'center' })

      // Remove highlight after 3 seconds
      setTimeout(() => {
        const parent = highlight.parentNode
        if (parent) {
          parent.replaceChild(document.createTextNode(highlight.textContent || ''), highlight)
          parent.normalize()
        }
      }, 3000)
      return
    }
    node = walker.nextNode()
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return '방금 전'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}시간 전`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}일 전`
  return d.toLocaleDateString('ko')
}
