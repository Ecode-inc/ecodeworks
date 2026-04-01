import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { fetchSharedDoc, shareCommentApi } from '../../lib/api'
import { FileText, AlertCircle } from 'lucide-react'
import remarkGfm from 'remark-gfm'
import '@uiw/react-markdown-preview/markdown.css'
import {
  FloatingCommentButton,
  CommentPanel,
  CommentToggleButton,
  InlineCommentForm,
  useDocComments,
  scrollToComment,
} from './DocComments'

const MDPreview = lazy(() => import('@uiw/react-markdown-preview').then(m => ({ default: m.default })))

function MarkdownPreview({ content }: { content: string }) {
  return (
    <Suspense fallback={<div className="text-gray-400">로딩 중...</div>}>
      <div data-color-mode="light">
        <MDPreview
          source={content}
          remarkPlugins={[remarkGfm]}
          style={{ padding: 0, background: 'transparent', fontSize: '15px' }}
        />
      </div>
    </Suspense>
  )
}

export function SharedDocPage({ token }: { token: string }) {
  const [doc, setDoc] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const contentRef = useRef<HTMLDivElement>(null)

  const commentApiMemo = useMemo(() => ({
    list: () => shareCommentApi.list(token),
    create: (data: any) => shareCommentApi.create(token, data),
  }), [token])

  const {
    comments,
    showPanel,
    setShowPanel,
    commentForm,
    setCommentForm,
    handleStartComment,
    handleSubmitComment,
  } = useDocComments(commentApiMemo)

  useEffect(() => {
    fetchSharedDoc(token)
      .then(res => {
        setDoc(res.document)
        if (res.document?.title) {
          document.title = `${res.document.title} - 이코드웍스`
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-8">
          <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
          <h1 className="text-xl font-semibold text-gray-800 mb-2">
            {error.includes('만료') || error.includes('유효') ? error : '링크가 만료되었거나 유효하지 않습니다'}
          </h1>
          <p className="text-sm text-gray-500">이 공유 링크는 더 이상 사용할 수 없습니다.</p>
          <div className="mt-6">
            <a href="/" className="text-sm text-blue-600 hover:underline">ecode 홈으로 이동</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/og-logo.png" alt="이코드" className="h-8 object-contain" />
            <span className="text-sm font-semibold text-gray-700">이코드웍스 문서</span>
          </div>
          <div className="flex items-center gap-3">
            <CommentToggleButton
              count={comments.length}
              open={showPanel}
              onClick={() => setShowPanel(!showPanel)}
            />
            <span className="text-xs text-gray-400">공유 문서 (읽기 전용)</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex">
        <main className={`flex-1 ${showPanel ? 'max-w-3xl' : 'max-w-4xl'} mx-auto px-6 py-8 transition-all`}>
          <div className="bg-white rounded-xl border p-8">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b">
              <FileText size={22} className="text-gray-400" />
              <h1 className="text-2xl font-bold text-gray-900">{doc.title}</h1>
            </div>
            {doc.updated_at && (
              <p className="text-xs text-gray-400 mb-6">
                마지막 수정: {new Date(doc.updated_at).toLocaleString('ko')}
              </p>
            )}
            <div className="prose prose-sm max-w-none relative" ref={contentRef}>
              <FloatingCommentButton
                containerRef={contentRef}
                onComment={handleStartComment}
              />
              <MarkdownPreview content={doc.content || ''} />
            </div>
          </div>
        </main>

        {/* Comment Panel */}
        {showPanel && (
          <div className="hidden md:block sticky top-0 h-screen">
            <CommentPanel
              comments={comments}
              onClose={() => setShowPanel(false)}
              onScrollTo={(c) => scrollToComment(contentRef, c)}
            />
          </div>
        )}
      </div>

      {/* Mobile Comment Panel */}
      {showPanel && (
        <div className="md:hidden fixed inset-x-0 bottom-0 z-30 h-72 border-t bg-white shadow-lg">
          <CommentPanel
            comments={comments}
            onClose={() => setShowPanel(false)}
          />
        </div>
      )}

      {/* Comment Form Modal */}
      {commentForm && (
        <InlineCommentForm
          selectionText={commentForm.text}
          onSubmit={handleSubmitComment}
          onCancel={() => setCommentForm(null)}
          requireAuthorName
        />
      )}

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-gray-400">
        Powered by ecode
      </footer>
    </div>
  )
}
