import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

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
    <button onClick={handleCopy} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100 transition-colors" title="복사">
      {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
      {copied ? '복사됨' : '복사'}
    </button>
  )
}

const API_BASE = 'https://ecode-internal-api.justin21lee.workers.dev/api/v1'
const MCP_ENDPOINT = 'https://ecode-internal-api.justin21lee.workers.dev/api/mcp'

// ── GET Action 엔드포인트 (web_fetch 호환) ──
const getActions = [
  {
    category: '👤 텔레그램 사용자 매핑',
    items: [
      { path: '/action/map-telegram-user', desc: '텔레그램↔이코드 사용자 매핑', params: 'telegram_user_id, telegram_username, telegram_display_name, email (or user_id)' },
      { path: '/action/unmap-telegram-user', desc: '매핑 해제', params: 'telegram_user_id' },
      { path: '/action/resolve-telegram-user', desc: '매핑 조회', params: 'telegram_user_id or telegram_username' },
      { path: '/action/list-telegram-mappings', desc: '전체 매핑 목록', params: '(없음)' },
    ],
  },
  {
    category: '👥 사용자 관리',
    items: [
      { path: '/action/update-user-name', desc: '사용자 이름 변경', params: 'user_id or telegram_user_id, name' },
    ],
  },
  {
    category: '⏰ 근태관리',
    items: [
      { path: '/action/clock-in', desc: '출근 기록 (시간 지정 가능)', params: 'telegram_user_id or user_id, time (예: 10:00), date (예: 2026-03-16), note' },
      { path: '/action/clock-out', desc: '퇴근 기록 (시간 지정 가능)', params: 'telegram_user_id or user_id, time (예: 19:00), date, note' },
      { path: '/action/update-attendance', desc: '근태 시간/상태 수정', params: 'telegram_user_id or user_id, date, clock_in (예: 10:00), clock_out (예: 19:00), status (present/late/remote/vacation), note' },
    ],
  },
  {
    category: '📅 캘린더',
    items: [
      { path: '/action/create-event', desc: '일정 생성 (개인/반복 지원)', params: 'telegram_user_id or user_id, title, start_at (+09:00), end_at, all_day, color, visibility (personal/department/company), importance (normal/important), department_id (선택), freq (daily/weekly/monthly), byDay (MO,TU,FR), interval, until (2026-08-31)' },
    ],
  },
  {
    category: '📝 문서',
    items: [
      { path: '/action/search-docs', desc: '문서 검색 (전문 검색)', params: 'q (검색어)' },
      { path: '/action/list-docs', desc: '문서/폴더 목록', params: 'dept_id (선택), parent_id (폴더 ID, 선택)' },
      { path: '/action/get-doc', desc: '문서 상세 (내용 포함)', params: 'id' },
      { path: '/action/create-doc', desc: '문서 생성', params: 'title, content, department_id (선택), parent_id (상위폴더, 선택), is_folder (true/false), visibility' },
      { path: '/action/update-doc', desc: '문서 수정', params: 'id, title (선택), content (전체 덮어쓰기), append (기존 내용에 추가)' },
      { path: '/action/get-folder-guide', desc: '폴더 AI 가이드 조회', params: 'parent_id (폴더ID)' },
      { path: '/action/update-folder-guide', desc: '폴더 AI 가이드 생성/갱신', params: 'parent_id (폴더ID), content' },
    ],
  },
  {
    category: '✅ 칸반',
    items: [
      { path: '/action/list-boards', desc: '보드 목록', params: 'dept_id (선택)' },
      { path: '/action/get-board', desc: '보드 상세 (컬럼+태스크)', params: 'id' },
      { path: '/action/create-board', desc: '보드 생성', params: 'name, department_id (선택)' },
      { path: '/action/update-board', desc: '보드 이름 변경', params: 'id, name' },
      { path: '/action/list-tasks', desc: '태스크 목록', params: 'board_id (선택), assignee_id (선택)' },
      { path: '/action/create-task', desc: '태스크 생성', params: 'board_id, column_id, title, description, priority, due_date' },
      { path: '/action/update-task', desc: '태스크 수정', params: 'id, title, description, column_id, priority, assignee_id, due_date' },
      { path: '/action/update-column', desc: '컬럼 이름/색상 변경', params: 'id, name, color' },
    ],
  },
]

// ── GET 조회 엔드포인트 ──
const getReadEndpoints = [
  { category: '📅 Calendar', items: [
    { path: '/calendar/events', desc: '일정 목록', params: 'dept_id, start, end, context (group/private), user_id' },
    { path: '/calendar/events/:id', desc: '일정 상세', params: '' },
  ]},
  { category: '✅ Tasks', items: [
    { path: '/tasks', desc: '태스크 목록', params: 'board_id, assignee_id' },
    { path: '/tasks/:id', desc: '태스크 상세', params: '' },
  ]},
  { category: '📋 Boards', items: [
    { path: '/boards', desc: '보드 목록', params: 'dept_id' },
    { path: '/boards/:id', desc: '보드 상세 (컬럼 포함)', params: '' },
  ]},
  { category: '📝 Documents', items: [
    { path: '/docs/search', desc: '문서 검색', params: 'q (검색어)' },
    { path: '/docs/:id', desc: '문서 상세', params: '' },
  ]},
  { category: '🔐 Vault', items: [
    { path: '/vault/credentials', desc: '자격증명 메타데이터 (비밀번호 미포함)', params: 'dept_id' },
  ]},
  { category: '👥 Members & Departments', items: [
    { path: '/members', desc: '멤버 목록', params: '' },
    { path: '/departments', desc: '부서 목록', params: '' },
  ]},
  { category: '⏰ Attendance', items: [
    { path: '/attendance/team', desc: '팀 근태 조회', params: 'dept_id, date, month' },
  ]},
]

// ── POST 엔드포인트 (POST 가능한 클라이언트용) ──
const postEndpoints = [
  { method: 'POST', path: '/calendar/events', desc: '일정 생성' },
  { method: 'PATCH', path: '/calendar/events/:id', desc: '일정 수정' },
  { method: 'POST', path: '/tasks', desc: '태스크 생성' },
  { method: 'PATCH', path: '/tasks/:id', desc: '태스크 수정' },
  { method: 'POST', path: '/docs', desc: '문서 생성' },
  { method: 'PATCH', path: '/docs/:id', desc: '문서 수정' },
  { method: 'POST', path: '/attendance/clock-in', desc: '출근' },
  { method: 'POST', path: '/attendance/clock-out', desc: '퇴근' },
]

// ── MCP Tools ──
const mcpTools = [
  'list_calendar_events', 'create_calendar_event',
  'list_tasks', 'create_task', 'update_task',
  'list_boards', 'get_board',
  'search_documents', 'get_document', 'create_document', 'update_document',
  'list_members', 'list_departments',
  'list_vault_credentials',
  'log_telegram_command', 'resolve_telegram_user',
  'map_telegram_user', 'unmap_telegram_user', 'list_telegram_mappings',
  'get_folder_guide', 'update_folder_guide',
]

export function AIGuidePage({ apiKey }: AIGuidePageProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">이코드웍스 AI API 가이드</h1>
          <p className="text-sm text-gray-500 mt-1">web_fetch(GET) 호환 + REST API + MCP</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* 문서 활용 가이드 (중요) */}
        <section className="bg-green-50 rounded-xl border border-green-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-green-800 mb-2">문서 활용 가이드</h2>
          <p className="text-sm text-green-700 mb-3">
            이코드웍스에 등록된 문서(맛집, 회의록 등)를 검색/조회하여 답변에 활용할 수 있습니다.
            <strong> 한글 검색 시 반드시 URL 인코딩</strong>하세요.
          </p>
          <div className="text-xs font-mono bg-white rounded-lg p-3 border border-green-100 space-y-2">
            <p className="text-gray-500">1단계: 문서 검색 (한글은 URL 인코딩 필수)</p>
            <p className="text-gray-800">/action/search-docs?key=KEY&q=맛집</p>
            <p className="text-gray-500">2단계: 폴더 내 문서 탐색</p>
            <p className="text-gray-800">/action/list-docs?key=KEY&parent_id=폴더ID</p>
            <p className="text-gray-500">3단계: 문서 내용 읽기</p>
            <p className="text-gray-800">/action/get-doc?key=KEY&id=문서ID</p>
            <p className="text-gray-500">4단계: 문서 추가/수정</p>
            <p className="text-gray-800">/action/create-doc?key=KEY&title=제목&content=내용&parent_id=폴더ID</p>
            <p className="text-gray-800">/action/update-doc?key=KEY&id=문서ID&content=새내용</p>
          </div>
        </section>

        {/* 인증 */}
        <section className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">인증</h2>
          <p className="text-sm text-gray-600 mb-3">모든 요청에 API 키를 포함해야 합니다. <strong>두 가지 방법</strong> 모두 지원:</p>
          <div className="space-y-2">
            <div className="bg-gray-50 rounded-lg px-4 py-3 border">
              <p className="text-xs text-gray-500 mb-1">방법 1: 쿼리 파라미터 (web_fetch/GET 호환)</p>
              <code className="text-sm font-mono text-gray-800">?key={apiKey}</code>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3 border">
              <p className="text-xs text-gray-500 mb-1">방법 2: Authorization 헤더</p>
              <code className="text-sm font-mono text-gray-800">Authorization: Bearer {apiKey}</code>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">API Base:</span>
            <code className="text-sm font-mono text-blue-600">{API_BASE}</code>
            <CopyButton text={API_BASE} />
          </div>
        </section>

        {/* ★ GET Action 엔드포인트 (핵심) */}
        <section className="bg-blue-50 rounded-xl border border-blue-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-blue-800 mb-2">GET Action 엔드포인트 (web_fetch 호환)</h2>
          <p className="text-sm text-blue-700 mb-4">
            POST가 불가능한 환경(텔레그램 봇 등)에서 <strong>GET 요청만으로 모든 작업</strong>이 가능합니다.<br/>
            <code className="bg-blue-100 px-1 rounded">{API_BASE}/action/[이름]?key={'{API_KEY}'}&param1=val1</code>
          </p>

          <div className="space-y-6">
            {getActions.map(group => (
              <div key={group.category}>
                <h3 className="text-sm font-bold text-blue-900 mb-2">{group.category}</h3>
                <div className="space-y-2">
                  {group.items.map(item => (
                    <div key={item.path} className="bg-white rounded-lg border border-blue-100 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800">GET</span>
                        <code className="text-sm font-mono text-gray-800">{item.path}</code>
                      </div>
                      <p className="text-xs text-gray-600 mb-1">{item.desc}</p>
                      <p className="text-xs text-gray-400">파라미터: {item.params}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 사용 예시 */}
          <div className="mt-6 bg-white rounded-lg border border-blue-100 p-4">
            <h3 className="text-sm font-bold text-blue-900 mb-2">사용 예시</h3>
            <div className="space-y-3 text-xs font-mono">
              <div>
                <p className="text-gray-500 mb-1"># @holyholy12341 → ecode@e-code.kr 매핑</p>
                <code className="text-gray-800 break-all">{API_BASE}/action/map-telegram-user?key={apiKey}&telegram_user_id=123456&telegram_username=holyholy12341&email=ecode@e-code.kr</code>
                <div className="mt-1"><CopyButton text={`${API_BASE}/action/map-telegram-user?key=${apiKey}&telegram_user_id=123456&telegram_username=holyholy12341&email=ecode@e-code.kr`} /></div>
              </div>
              <div>
                <p className="text-gray-500 mb-1"># 10시 출근 기록</p>
                <code className="text-gray-800 break-all">{API_BASE}/action/clock-in?key={apiKey}&telegram_user_id=123456&time=10:00</code>
              </div>
              <div>
                <p className="text-gray-500 mb-1"># 출근 시간 10:00으로 수정</p>
                <code className="text-gray-800 break-all">{API_BASE}/action/update-attendance?key={apiKey}&telegram_user_id=123456&clock_in=10:00</code>
              </div>
              <div>
                <p className="text-gray-500 mb-1"># 매핑 목록 조회</p>
                <code className="text-gray-800 break-all">{API_BASE}/action/list-telegram-mappings?key={apiKey}</code>
              </div>
              <div>
                <p className="text-gray-500 mb-1"># 문서 검색 (맛집 등)</p>
                <code className="text-gray-800 break-all">{API_BASE}/action/search-docs?key={apiKey}&q=%EB%A7%9B%EC%A7%91</code>
              </div>
              <div>
                <p className="text-gray-500 mb-1"># 폴더 내 문서 목록 (parent_id=폴더ID)</p>
                <code className="text-gray-800 break-all">{API_BASE}/action/list-docs?key={apiKey}&parent_id=FOLDER_ID</code>
              </div>
              <div>
                <p className="text-gray-500 mb-1"># 문서 내용 읽기</p>
                <code className="text-gray-800 break-all">{API_BASE}/action/get-doc?key={apiKey}&id=DOC_ID</code>
              </div>
              <div>
                <p className="text-gray-500 mb-1"># 반복 일정 등록 (매주 금요일 14시 주간회의)</p>
                <code className="text-gray-800 break-all">{API_BASE}/action/create-event?key={apiKey}&title=주간회의&start_at=2026-03-20T14:00:00%2B09:00&end_at=2026-03-20T15:00:00%2B09:00&visibility=company&freq=weekly&byDay=FR&until=2026-12-31</code>
              </div>
            </div>
          </div>
        </section>

        {/* GET 조회 엔드포인트 */}
        <section className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">GET 조회 엔드포인트</h2>
          <div className="space-y-4">
            {getReadEndpoints.map(group => (
              <div key={group.category}>
                <h3 className="text-sm font-semibold text-gray-700 mb-1.5">{group.category}</h3>
                {group.items.map(item => (
                  <div key={item.path} className="flex items-center gap-3 px-3 py-1.5 rounded hover:bg-gray-50">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800">GET</span>
                    <code className="text-sm font-mono text-gray-800">{item.path}</code>
                    <span className="text-xs text-gray-500 ml-auto">{item.desc}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* POST 엔드포인트 */}
        <section className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">POST/PATCH 엔드포인트 (REST 클라이언트용)</h2>
          <p className="text-xs text-gray-500 mb-3">POST 가능한 환경에서만 사용. GET Action으로도 동일 작업 가능.</p>
          <div className="space-y-1">
            {postEndpoints.map(ep => (
              <div key={`${ep.method}-${ep.path}`} className="flex items-center gap-3 px-3 py-1.5 rounded hover:bg-gray-50">
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${ep.method === 'POST' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{ep.method}</span>
                <code className="text-sm font-mono text-gray-800">{ep.path}</code>
                <span className="text-xs text-gray-500 ml-auto">{ep.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 개인정보 보호 */}
        <section className="bg-amber-50 rounded-xl border border-amber-200 p-6">
          <h2 className="text-lg font-semibold text-amber-800 mb-3">개인정보 보호 (context 파라미터)</h2>
          <p className="text-sm text-amber-700 mb-2">캘린더 조회 시 <code className="bg-amber-100 px-1 rounded">context</code> 파라미터로 개인일정 노출을 제어:</p>
          <ul className="text-sm text-amber-700 space-y-1 ml-4 list-disc">
            <li><code>context=group</code> — 그룹방: 개인일정 숨김</li>
            <li><code>context=private&user_id=X</code> — 1:1 채팅: 해당 유저 개인일정만 표시</li>
            <li>파라미터 없음 — 전체 표시 (하위호환)</li>
          </ul>
        </section>

        {/* 안전 제한 */}
        <section className="bg-red-50 rounded-xl border border-red-200 p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-3">안전 제한</h2>
          <ul className="space-y-1.5 text-sm text-red-700">
            <li>• <strong>DELETE 차단</strong> — 리소스 삭제 불가</li>
            <li>• <strong>비밀번호 미노출</strong> — 금고 메타데이터만 접근 가능</li>
            <li>• <strong>사용자/조직 수정 차단</strong> — 구조 변경 불가</li>
          </ul>
        </section>

        {/* MCP */}
        <section className="bg-white rounded-xl border border-purple-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-purple-800 mb-3">MCP (Model Context Protocol)</h2>
          <p className="text-sm text-gray-600 mb-3">POST 가능한 AI 도구 (Claude Desktop, Cursor 등)에서 사용.</p>
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3 border mb-3">
            <code className="text-sm font-mono text-gray-800 flex-1">{MCP_ENDPOINT}</code>
            <CopyButton text={MCP_ENDPOINT} />
          </div>
          <p className="text-xs text-gray-500 mb-2">사용 가능한 MCP Tools ({mcpTools.length}개):</p>
          <div className="flex flex-wrap gap-1.5">
            {mcpTools.map(t => (
              <span key={t} className="px-2 py-1 rounded text-xs font-mono bg-purple-50 text-purple-700 border border-purple-100">{t}</span>
            ))}
          </div>
        </section>

        <footer className="text-center text-xs text-gray-400 py-4">
          이코드웍스 AI API — 최종 업데이트: 2026-03-16
        </footer>
      </main>
    </div>
  )
}
