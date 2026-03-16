import { useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'

interface AIGuidePageProps {
  apiKey: string
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100 transition-colors"
      title="복사"
    >
      {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
      {copied ? '복사됨' : '복사'}
    </button>
  )
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <div className="relative group">
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={code} />
      </div>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed">
        <code>{code}</code>
      </pre>
      {language && (
        <span className="absolute left-3 top-2 text-xs text-gray-500">{language}</span>
      )}
    </div>
  )
}

const API_BASE = 'https://ecode-internal-api.justin21lee.workers.dev/api/v1'

const endpoints = [
  {
    category: '\ud83d\udcc5 Calendar',
    items: [
      { method: 'GET', path: '/calendar/events', desc: '일정 목록 조회 (?dept_id=&start=&end=)' },
      { method: 'POST', path: '/calendar/events', desc: '일정 생성' },
      { method: 'PATCH', path: '/calendar/events/:id', desc: '일정 수정' },
    ],
  },
  {
    category: '\u2705 Tasks',
    items: [
      { method: 'GET', path: '/tasks', desc: '태스크 목록 조회' },
      { method: 'POST', path: '/tasks', desc: '태스크 생성' },
      { method: 'PATCH', path: '/tasks/:id', desc: '태스크 수정' },
    ],
  },
  {
    category: '\ud83d\udccb Boards',
    items: [
      { method: 'GET', path: '/boards', desc: '칸반 보드 목록 조회' },
    ],
  },
  {
    category: '\ud83d\udcdd Documents',
    items: [
      { method: 'GET', path: '/docs', desc: '문서 목록 조회' },
      { method: 'POST', path: '/docs', desc: '문서 생성' },
      { method: 'PATCH', path: '/docs/:id', desc: '문서 수정' },
      { method: 'GET', path: '/docs/search', desc: '문서 검색 (?q=검색어)' },
    ],
  },
  {
    category: '\ud83d\udd10 Vault',
    items: [
      { method: 'GET', path: '/vault/credentials', desc: '자격증명 메타데이터 조회 (비밀번호 미포함)' },
    ],
  },
  {
    category: '\ud83d\udc65 Members',
    items: [
      { method: 'GET', path: '/members', desc: '멤버 목록 조회' },
    ],
  },
  {
    category: '\ud83c\udfe2 Departments',
    items: [
      { method: 'GET', path: '/departments', desc: '부서 목록 조회' },
    ],
  },
  {
    category: '\ud83d\udcac Telegram',
    items: [
      { method: 'GET', path: '/telegram/chats', desc: '텔레그램 채팅 목록' },
      { method: 'GET', path: '/telegram/mappings', desc: '사용자 매핑 목록' },
      { method: 'GET', path: '/telegram/resolve-user', desc: '텔레그램 사용자 조회' },
      { method: 'POST', path: '/telegram/logs', desc: '텔레그램 로그 기록' },
    ],
  },
]

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-800',
  POST: 'bg-blue-100 text-blue-800',
  PATCH: 'bg-amber-100 text-amber-800',
  DELETE: 'bg-red-100 text-red-800',
}

export function AIGuidePage({ apiKey }: AIGuidePageProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">ecode AI API 가이드</h1>
          <p className="text-sm text-gray-500 mt-1">AI 에이전트를 위한 API 레퍼런스</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* API Base URL */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">API Base URL</h2>
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3 border">
            <code className="text-sm font-mono text-gray-800 flex-1 select-all">{API_BASE}</code>
            <CopyButton text={API_BASE} />
          </div>
        </section>

        {/* Your API Key */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Your API Key</h2>
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3 border">
            <code className="text-sm font-mono text-gray-800 flex-1 select-all">{apiKey}</code>
            <CopyButton text={apiKey} />
          </div>
        </section>

        {/* Authentication */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Authentication</h2>
          <p className="text-sm text-gray-600 mb-3">
            모든 요청에 다음 헤더를 포함해야 합니다:
          </p>
          <div className="bg-gray-50 rounded-lg px-4 py-3 border">
            <code className="text-sm font-mono text-gray-800">
              Authorization: Bearer {apiKey}
            </code>
          </div>
        </section>

        {/* Endpoints */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Available Endpoints</h2>
          <div className="space-y-6">
            {endpoints.map((group) => (
              <div key={group.category}>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{group.category}</h3>
                <div className="space-y-1.5">
                  {group.items.map((ep) => (
                    <div key={`${ep.method}-${ep.path}`} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${methodColors[ep.method] || 'bg-gray-100 text-gray-700'}`}>
                        {ep.method}
                      </span>
                      <code className="text-sm font-mono text-gray-800">{ep.path}</code>
                      <span className="text-xs text-gray-500 ml-auto">{ep.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Safety Restrictions */}
        <section className="bg-red-50 rounded-xl border border-red-200 p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-3">Safety Restrictions</h2>
          <ul className="space-y-2 text-sm text-red-700">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-red-500">&#x2022;</span>
              <span><strong>DELETE operations are blocked</strong> - AI API 키로는 리소스를 삭제할 수 없습니다.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-red-500">&#x2022;</span>
              <span><strong>Vault passwords are never exposed</strong> - 비밀번호 금고의 실제 비밀번호는 API를 통해 노출되지 않습니다.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-red-500">&#x2022;</span>
              <span><strong>User/org modifications are blocked</strong> - 사용자 정보나 조직 설정은 변경할 수 없습니다.</span>
            </li>
          </ul>
        </section>

        {/* Quick Start */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Quick Start Examples</h2>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">일정 목록 조회</p>
              <CodeBlock code={`curl -X GET "${API_BASE}/calendar/events" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json"`} />
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">태스크 생성</p>
              <CodeBlock code={`curl -X POST "${API_BASE}/tasks" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "새 태스크",
    "column_id": "COLUMN_ID"
  }'`} />
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">문서 검색</p>
              <CodeBlock code={`curl -X GET "${API_BASE}/docs/search?q=회의록" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json"`} />
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">멤버 목록 조회</p>
              <CodeBlock code={`curl -X GET "${API_BASE}/members" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json"`} />
            </div>
          </div>
        </section>

        {/* OpenAPI Spec Link */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Full API Specification</h2>
          <a
            href={`${API_BASE}/openapi.json`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            <ExternalLink size={16} />
            OpenAPI 3.0 Spec (JSON)
          </a>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-gray-400 py-4">
          ecode-internal AI API
        </footer>
      </main>
    </div>
  )
}
