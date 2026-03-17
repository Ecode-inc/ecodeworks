import { useState, useEffect } from 'react'
import { fetchSharedDoc } from '../../lib/api'
import { FileText, AlertCircle } from 'lucide-react'

function MarkdownPreview({ content }: { content: string }) {
  const html = content
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold mt-4 mb-2" style="font-size:1.1em">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-semibold mt-5 mb-2" style="font-size:1.25em">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-bold mt-6 mb-3" style="font-size:1.4em">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1 rounded" style="font-size:0.9em">$1</code>')
    .replace(/^\- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary-600 underline hover:text-primary-800" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(?<!="|'>)(https?:\/\/[^\s<,)]+)/g, '<a href="$1" class="text-primary-600 underline hover:text-primary-800" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')

  return <div style={{ fontSize: '15px', lineHeight: '1.7' }} dangerouslySetInnerHTML={{ __html: html }} />
}

export function SharedDocPage({ token }: { token: string }) {
  const [doc, setDoc] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSharedDoc(token)
      .then(res => setDoc(res.document))
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
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">e</span>
            </div>
            <span className="text-sm font-semibold text-gray-700">ecode</span>
          </div>
          <span className="text-xs text-gray-400">공유 문서 (읽기 전용)</span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
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
          <div className="prose prose-sm max-w-none">
            <MarkdownPreview content={doc.content || ''} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-gray-400">
        Powered by ecode
      </footer>
    </div>
  )
}
