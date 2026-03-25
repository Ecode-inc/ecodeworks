import { useState, useEffect, FormEvent } from 'react'
import { useToastStore } from '../../stores/toastStore'
import { aiApi, telegramApi, membersApi } from '../../lib/api'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import {
  Plus,
  Trash2,
  Copy,
  Check,
  ToggleLeft,
  ToggleRight,
  Link2,
  Unlink,
  ChevronDown,
} from 'lucide-react'

import { AIBoardPage } from './AIBoardPage'

type Tab = 'keys' | 'telegram' | 'history' | 'board'

const ALL_SCOPES = [
  'calendar:read',
  'calendar:write',
  'kanban:read',
  'kanban:write',
  'docs:read',
  'docs:write',
  'vault:read',
  'members:read',
  'departments:read',
  'telegram:read',
  'telegram:write',
  '*',
]

// ──────────────────────────── API Keys Tab ────────────────────────────

function APIKeysTab() {
  const [keys, setKeys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [selectedScopes, setSelectedScopes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [createdKeyModalOpen, setCreatedKeyModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const load = async () => {
    setLoading(true)
    try {
      const res = await aiApi.listKeys()
      setKeys(res.keys)
    } catch (err: any) {
      addToast('error', 'API Key 목록 로드 실패', err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await aiApi.createKey({ name: keyName, scopes: selectedScopes.length > 0 ? selectedScopes : ['*'] })
      setCreatedKey(res.key)
      setCreatedKeyModalOpen(true)
      setCreateOpen(false)
      setKeyName('')
      setSelectedScopes([])
      load()
    } catch (err: any) {
      addToast('error', 'API Key 생성 실패', err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 API Key를 삭제하시겠습니까?')) return
    try {
      await aiApi.deleteKey(id)
      addToast('success', 'API Key가 삭제되었습니다.')
      load()
    } catch (err: any) {
      addToast('error', '삭제 실패', err.message)
    }
  }

  const toggleScope = (scope: string) => {
    if (scope === '*') {
      setSelectedScopes((prev) => prev.includes('*') ? [] : ['*'])
      return
    }
    setSelectedScopes((prev) => {
      const filtered = prev.filter((s) => s !== '*')
      return filtered.includes(scope)
        ? filtered.filter((s) => s !== scope)
        : [...filtered, scope]
    })
  }

  const handleCopyKey = async () => {
    if (!createdKey) return
    try {
      await navigator.clipboard.writeText(createdKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      addToast('error', '클립보드 복사 실패')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">API Key 목록</h3>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={16} className="mr-1" /> Key 생성
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {keys.length === 0 && (
            <p className="text-sm text-gray-400 p-4">등록된 API Key가 없습니다.</p>
          )}
          {keys.map((k) => (
            <div key={k.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-800">{k.name}</span>
                  <span className="ml-2 text-xs text-gray-400 font-mono">{k.key_prefix}...</span>
                </div>
                <button
                  onClick={() => handleDelete(k.id)}
                  className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
                  title="Key 삭제"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {(Array.isArray(k.scopes) ? k.scopes : []).map((scope: string) => (
                  <span key={scope} className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
                    {scope}
                  </span>
                ))}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                생성일: {k.created_at ? new Date(k.created_at).toLocaleString('ko-KR') : '-'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Key Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="API Key 생성">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Key 이름"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            placeholder="예: Claude Desktop"
            required
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">권한 (Scopes)</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope) || (scope !== '*' && selectedScopes.includes('*'))}
                    onChange={() => toggleScope(scope)}
                    disabled={scope !== '*' && selectedScopes.includes('*')}
                    className="rounded border-gray-300"
                  />
                  <span className="font-mono text-xs">{scope}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              취소
            </Button>
            <Button type="submit" loading={saving}>
              생성
            </Button>
          </div>
        </form>
      </Modal>

      {/* Created Key Display Modal */}
      <Modal open={createdKeyModalOpen} onClose={() => { setCreatedKeyModalOpen(false); setCreatedKey(null); setCopied(false) }} title="API Key 생성 완료" width="max-w-lg">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800 font-medium">이 Key는 한 번만 표시됩니다. 안전한 곳에 복사하세요.</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-2">
            <code className="flex-1 text-xs break-all text-gray-800 font-mono select-all">{createdKey}</code>
            <button
              onClick={handleCopyKey}
              className="shrink-0 p-2 rounded-lg hover:bg-gray-200 text-gray-600"
              title="복사"
            >
              {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Integration URL</label>
            <code className="block text-xs break-all text-gray-600 font-mono bg-gray-50 rounded p-2">
              {`https://ecode-internal.pages.dev/?key=${createdKey || ''}`}
            </code>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => { setCreatedKeyModalOpen(false); setCreatedKey(null); setCopied(false) }}>
              확인
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ──────────────────────────── Telegram Tab ────────────────────────────

function TelegramTab() {
  const [chats, setChats] = useState<any[]>([])
  const [mappings, setMappings] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [chatFormOpen, setChatFormOpen] = useState(false)
  const [chatForm, setChatForm] = useState({ chat_id: '', chat_type: 'group', chat_title: '' })
  const [saving, setSaving] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const load = async () => {
    setLoading(true)
    try {
      const [chatRes, mapRes, memRes] = await Promise.all([
        telegramApi.listChats(),
        telegramApi.listMappings(),
        membersApi.list(),
      ])
      setChats(chatRes.chats)
      setMappings(mapRes.mappings)
      setMembers(memRes.members)
    } catch (err: any) {
      addToast('error', '데이터 로드 실패', err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreateChat = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await telegramApi.createChat(chatForm)
      addToast('success', '텔레그램 채팅이 등록되었습니다.')
      setChatFormOpen(false)
      setChatForm({ chat_id: '', chat_type: 'group', chat_title: '' })
      load()
    } catch (err: any) {
      addToast('error', '등록 실패', err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleChat = async (chat: any) => {
    try {
      await telegramApi.updateChat(chat.id, { is_active: chat.is_active ? 0 : 1 })
      addToast('success', `채팅이 ${chat.is_active ? '비활성화' : '활성화'}되었습니다.`)
      load()
    } catch (err: any) {
      addToast('error', '변경 실패', err.message)
    }
  }

  const handleDeleteChat = async (id: string) => {
    if (!confirm('이 텔레그램 채팅 연결을 삭제하시겠습니까?')) return
    try {
      await telegramApi.deleteChat(id)
      addToast('success', '채팅 연결이 삭제되었습니다.')
      load()
    } catch (err: any) {
      addToast('error', '삭제 실패', err.message)
    }
  }

  const handleMapUser = async (mappingId: string, userId: string) => {
    try {
      await telegramApi.updateMapping(mappingId, { user_id: userId || null })
      addToast('success', '유저 매핑이 변경되었습니다.')
      load()
    } catch (err: any) {
      addToast('error', '매핑 실패', err.message)
    }
  }

  const handleUnlinkMapping = async (mappingId: string) => {
    try {
      await telegramApi.updateMapping(mappingId, { user_id: null })
      addToast('success', '유저 연결이 해제되었습니다.')
      load()
    } catch (err: any) {
      addToast('error', '해제 실패', err.message)
    }
  }

  const handleDeleteMapping = async (id: string) => {
    if (!confirm('이 매핑을 삭제하시겠습니까?')) return
    try {
      await telegramApi.deleteMapping(id)
      addToast('success', '매핑이 삭제되었습니다.')
      load()
    } catch (err: any) {
      addToast('error', '삭제 실패', err.message)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Chats Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">연결된 텔레그램 채팅</h3>
          <Button size="sm" onClick={() => setChatFormOpen(true)}>
            <Plus size={16} className="mr-1" /> 채팅 등록
          </Button>
        </div>

        <div className="border rounded-lg divide-y">
          {chats.length === 0 && (
            <p className="text-sm text-gray-400 p-4">등록된 텔레그램 채팅이 없습니다.</p>
          )}
          {chats.map((chat) => (
            <div key={chat.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">
                    {chat.chat_title || chat.chat_id}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {chat.chat_type}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${chat.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {chat.is_active ? '활성' : '비활성'}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Chat ID: {chat.chat_id}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleToggleChat(chat)}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                  title={chat.is_active ? '비활성화' : '활성화'}
                >
                  {chat.is_active ? <ToggleRight size={18} className="text-green-600" /> : <ToggleLeft size={18} />}
                </button>
                <button
                  onClick={() => handleDeleteChat(chat.id)}
                  className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
                  title="삭제"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* User Mappings Section */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4">텔레그램 유저 매핑</h3>
        <div className="border rounded-lg divide-y">
          {mappings.length === 0 && (
            <p className="text-sm text-gray-400 p-4">등록된 유저 매핑이 없습니다.</p>
          )}
          {mappings.map((m) => {
            const mappedMember = members.find((mem: any) => mem.id === m.user_id)
            return (
              <div key={m.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-sm font-medium text-gray-800">
                        {m.telegram_display_name || m.telegram_username || m.telegram_user_id}
                      </span>
                      {m.telegram_username && (
                        <span className="ml-1 text-xs text-gray-400">@{m.telegram_username}</span>
                      )}
                    </div>
                    <span className="text-gray-300">-&gt;</span>
                    <div className="flex items-center gap-2">
                      <select
                        className="text-xs border rounded px-2 py-1 text-gray-600"
                        value={m.user_id || ''}
                        onChange={(e) => handleMapUser(m.id, e.target.value)}
                      >
                        <option value="">-- 매핑 안됨 --</option>
                        {members.map((mem: any) => (
                          <option key={mem.id} value={mem.id}>{mem.name} ({mem.email})</option>
                        ))}
                      </select>
                      {mappedMember && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <Link2 size={12} /> {mappedMember.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {m.user_id && (
                      <button
                        onClick={() => handleUnlinkMapping(m.id)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                        title="연결 해제"
                      >
                        <Unlink size={15} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteMapping(m.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
                      title="삭제"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Create Chat Modal */}
      <Modal open={chatFormOpen} onClose={() => setChatFormOpen(false)} title="텔레그램 채팅 등록">
        <form onSubmit={handleCreateChat} className="space-y-4">
          <Input
            label="Chat ID"
            value={chatForm.chat_id}
            onChange={(e) => setChatForm({ ...chatForm, chat_id: e.target.value })}
            placeholder="예: -1001234567890"
            required
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">유형</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              value={chatForm.chat_type}
              onChange={(e) => setChatForm({ ...chatForm, chat_type: e.target.value })}
            >
              <option value="private">Private</option>
              <option value="group">Group</option>
              <option value="supergroup">Supergroup</option>
            </select>
          </div>
          <Input
            label="채팅 이름"
            value={chatForm.chat_title}
            onChange={(e) => setChatForm({ ...chatForm, chat_title: e.target.value })}
            placeholder="예: ecode 개발팀"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setChatFormOpen(false)}>
              취소
            </Button>
            <Button type="submit" loading={saving}>
              등록
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ──────────────────────────── History Tab ────────────────────────────

function HistoryTab() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [chats, setChats] = useState<any[]>([])
  const [mappings, setMappings] = useState<any[]>([])
  const [filterChatId, setFilterChatId] = useState('')
  const [filterUserId, setFilterUserId] = useState('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const addToast = useToastStore((s) => s.addToast)
  const limit = 50

  const loadMeta = async () => {
    try {
      const [chatRes, mapRes] = await Promise.all([
        telegramApi.listChats(),
        telegramApi.listMappings(),
      ])
      setChats(chatRes.chats)
      setMappings(mapRes.mappings)
    } catch {
      // ignore meta load failures
    }
  }

  const loadLogs = async (resetOffset = false) => {
    setLoading(true)
    const currentOffset = resetOffset ? 0 : offset
    try {
      const params: Record<string, any> = { limit, offset: currentOffset }
      if (filterChatId) params.chat_id = filterChatId
      if (filterUserId) params.telegram_user_id = filterUserId

      const res = await telegramApi.listLogs(params)
      if (resetOffset) {
        setLogs(res.logs)
        setOffset(limit)
      } else {
        setLogs((prev) => [...prev, ...res.logs])
        setOffset(currentOffset + limit)
      }
      setHasMore(res.logs.length >= limit)
    } catch (err: any) {
      addToast('error', '히스토리 로드 실패', err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMeta()
  }, [])

  useEffect(() => {
    loadLogs(true)
  }, [filterChatId, filterUserId])

  const getChatTitle = (chatId: string) => {
    const chat = chats.find((c) => c.chat_id === chatId)
    return chat?.chat_title || chatId
  }

  const getTelegramUserName = (tgUserId: string) => {
    const m = mappings.find((mp) => mp.telegram_user_id === tgUserId)
    return m?.telegram_display_name || m?.telegram_username || tgUserId
  }

  const getMappedUserName = (tgUserId: string) => {
    const m = mappings.find((mp) => mp.telegram_user_id === tgUserId)
    return m?.user_id ? `(ecode: ${m.user_id.slice(0, 8)}...)` : ''
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">채팅 필터</label>
          <select
            className="text-sm border rounded px-2 py-1.5 text-gray-600"
            value={filterChatId}
            onChange={(e) => setFilterChatId(e.target.value)}
          >
            <option value="">전체</option>
            {chats.map((c) => (
              <option key={c.id} value={c.chat_id}>{c.chat_title || c.chat_id}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">유저 필터</label>
          <select
            className="text-sm border rounded px-2 py-1.5 text-gray-600"
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
          >
            <option value="">전체</option>
            {mappings.map((m) => (
              <option key={m.id} value={m.telegram_user_id}>
                {m.telegram_display_name || m.telegram_username || m.telegram_user_id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Log table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">시간</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">채팅</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">TG 유저</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">ecode 유저</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">명령</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">응답 요약</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-gray-400">
                  기록이 없습니다.
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                  {log.created_at ? new Date(log.created_at).toLocaleString('ko-KR') : '-'}
                </td>
                <td className="px-3 py-2 text-xs text-gray-700">
                  {getChatTitle(log.chat_id)}
                </td>
                <td className="px-3 py-2 text-xs text-gray-700">
                  {getTelegramUserName(log.telegram_user_id)}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {log.user_id ? log.user_id.slice(0, 8) + '...' : getMappedUserName(log.telegram_user_id) || '-'}
                </td>
                <td className="px-3 py-2 text-xs font-mono text-gray-800">
                  {log.command}
                  {log.args ? <span className="ml-1 text-gray-400">{log.args}</span> : null}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600 max-w-xs truncate">
                  {log.response_summary || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center mt-4">
          <Button
            variant="secondary"
            size="sm"
            loading={loading}
            onClick={() => loadLogs(false)}
          >
            <ChevronDown size={16} className="mr-1" /> 더 보기
          </Button>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────── AI Page ────────────────────────────

const tabs: { key: Tab; label: string }[] = [
  { key: 'keys', label: 'API 키 관리' },
  { key: 'telegram', label: '텔레그램 연동' },
  { key: 'history', label: '명령 히스토리' },
  { key: 'board', label: 'AI 게시판' },
]

export function AIPage() {
  const hash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : ''
  const validTabs = tabs.map(t => t.key)
  const [activeTab, setActiveTab] = useState<Tab>(validTabs.includes(hash as Tab) ? hash as Tab : 'keys')

  const changeTab = (tab: Tab) => {
    setActiveTab(tab)
    window.location.hash = tab
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">AI 관리</h1>

      {/* Tab bar */}
      <div className="flex border-b mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => changeTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'keys' && <APIKeysTab />}
      {activeTab === 'telegram' && <TelegramTab />}
      {activeTab === 'history' && <HistoryTab />}
      {activeTab === 'board' && <AIBoardPage />}
    </div>
  )
}
