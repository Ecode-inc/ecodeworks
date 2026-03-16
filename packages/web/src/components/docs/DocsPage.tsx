import { useState, useEffect } from 'react'
import { useOrgStore } from '../../stores/orgStore'
import { docsApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { FileText, Folder, FolderOpen, FolderPlus, FilePlus, Search, ChevronRight, ChevronDown, Clock, Share2, Building2, Users, UserIcon, Trash2 } from 'lucide-react'

export function DocsPage() {
  const { currentDeptId } = useOrgStore()
  const [treeRefreshKey, setTreeRefreshKey] = useState(0)
  const [selectedDoc, setSelectedDoc] = useState<any>(null)
  const [newParentId, setNewParentId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [newIsFolder, setNewIsFolder] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [versions, setVersions] = useState<any[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [newVisibility, setNewVisibility] = useState<'company' | 'department' | 'personal'>('department')
  const [newShared, setNewShared] = useState(false)

  const refreshTree = () => setTreeRefreshKey(k => k + 1)

  const openDocument = async (doc: any) => {
    try {
      const res = await docsApi.get(doc.id)
      setSelectedDoc(res.document)
      setEditing(false)
    } catch (e: any) {
      useToastStore.getState().addToast('error', '문서 열기 실패', e.message)
    }
  }

  const startEditing = () => {
    setEditContent(selectedDoc.content || '')
    setEditTitle(selectedDoc.title)
    setEditing(true)
  }

  const saveDocument = async () => {
    if (!selectedDoc) return
    try {
      const res = await docsApi.update(selectedDoc.id, {
        title: editTitle,
        content: editContent,
        expected_updated_at: selectedDoc.updated_at,  // optimistic lock
      })
      setSelectedDoc(res.document)
      setEditing(false)
      refreshTree()
      useToastStore.getState().addToast('success', '저장 완료')
    } catch (e: any) {
      if (e.message === 'conflict') {
        // Conflict: reload latest version and notify user
        useToastStore.getState().addToast('warning', '충돌 감지', '다른 사용자가 수정했습니다. 최신 버전을 불러옵니다.')
        const latest = await docsApi.get(selectedDoc.id)
        setSelectedDoc(latest.document)
        setEditContent(latest.document.content || '')
        setEditTitle(latest.document.title)
        // Stay in editing mode so user can merge changes
      } else {
        useToastStore.getState().addToast('error', '저장 실패', e.message)
      }
    }
  }

  const createDocument = async () => {
    if (!newTitle) return
    try {
      await docsApi.create(currentDeptId || '', {
        title: newTitle,
        parent_id: newParentId || undefined,
        is_folder: newIsFolder,
        content: newIsFolder ? undefined : '',
        visibility: newVisibility,
        shared: newShared,
      })
      setNewTitle('')
      setNewVisibility('department')
      setNewShared(false)
      setShowNewModal(false)
      refreshTree()
    } catch (e: any) {
      useToastStore.getState().addToast('error', '생성 실패', e.message)
    }
  }

  const deleteDocument = async () => {
    if (!selectedDoc) return
    try {
      await docsApi.delete(selectedDoc.id)
      setSelectedDoc(null)
      refreshTree()
    } catch (e: any) {
      useToastStore.getState().addToast('error', '삭제 실패', e.message)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return }
    try {
      const res = await docsApi.search(searchQuery, currentDeptId || undefined)
      setSearchResults(res.documents)
    } catch (e: any) {
      useToastStore.getState().addToast('error', '검색 실패', e.message)
    }
  }

  const loadVersions = async () => {
    if (!selectedDoc) return
    try {
      const res = await docsApi.versions(selectedDoc.id)
      setVersions(res.versions)
      setShowVersions(true)
    } catch (e: any) {
      useToastStore.getState().addToast('error', '버전 로드 실패', e.message)
    }
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Sidebar - Document Tree */}
      <div className="w-72 flex-shrink-0 bg-white rounded-xl border p-4 overflow-y-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-2 top-2.5 text-gray-400" />
            <input
              placeholder="검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full pl-7 pr-2 py-1.5 text-sm border rounded-lg"
            />
          </div>
        </div>

        <div className="flex gap-1 mb-3">
          <button onClick={() => { setNewIsFolder(true); setNewParentId(null); setShowNewModal(true) }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
            <FolderPlus size={14} /> 폴더
          </button>
          <button onClick={() => { setNewIsFolder(false); setNewParentId(null); setShowNewModal(true) }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
            <FilePlus size={14} /> 문서
          </button>
        </div>

        {/* Document Tree */}
        {searchResults ? (
          <div className="space-y-0.5">
            {searchResults.map(doc => (
              <TreeItem key={doc.id} doc={doc} selectedId={selectedDoc?.id} onSelect={openDocument} onDelete={async (d) => {
                if (!confirm(`"${d.title}" 을(를) 삭제하시겠습니까?`)) return
                await docsApi.delete(d.id)
                if (selectedDoc?.id === d.id) setSelectedDoc(null)
                refreshTree()
              }} />
            ))}
          </div>
        ) : (
          <DocTree
            key={treeRefreshKey}
            deptId={currentDeptId}
            parentId={null}
            depth={0}
            selectedId={selectedDoc?.id}
            onSelect={openDocument}
            onDelete={async (doc) => {
              if (!confirm(`"${doc.title}" ${doc.is_folder ? '폴더를 삭제하시겠습니까? 하위 문서도 모두 삭제됩니다.' : '을(를) 삭제하시겠습니까?'}`)) return
              try {
                await docsApi.delete(doc.id)
                if (selectedDoc?.id === doc.id) setSelectedDoc(null)
                refreshTree()
              } catch (err: any) {
                useToastStore.getState().addToast('error', '삭제 실패', err.message)
              }
            }}
            onAddInFolder={(folderId) => { setNewParentId(folderId); setNewIsFolder(false); setShowNewModal(true) }}
          />
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 bg-white rounded-xl border overflow-y-auto">
        {selectedDoc ? (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between px-6 py-3 border-b">
              {editing ? (
                <input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="text-lg font-semibold bg-transparent border-b border-primary-300 focus:outline-none"
                />
              ) : (
                <h2 className="text-lg font-semibold text-gray-900">{selectedDoc.title}</h2>
              )}
              <div className="flex items-center gap-2">
                <button onClick={loadVersions} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100" title="버전 히스토리">
                  <Clock size={16} />
                </button>
                {editing ? (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>취소</Button>
                    <Button size="sm" onClick={saveDocument}>저장</Button>
                  </>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" onClick={startEditing}>편집</Button>
                    <Button variant="danger" size="sm" onClick={deleteDocument}>삭제</Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto">
              {editing ? (
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full h-full font-mono text-sm resize-none focus:outline-none"
                  placeholder="마크다운으로 작성하세요..."
                />
              ) : (
                <div className="prose prose-sm max-w-none">
                  <MarkdownPreview content={selectedDoc.content || ''} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p>문서를 선택하거나 새로 만들어주세요</p>
          </div>
        )}
      </div>

      {/* New document modal */}
      <Modal open={showNewModal} onClose={() => setShowNewModal(false)} title={newIsFolder ? '새 폴더' : '새 문서'}>
        <div className="space-y-4">
          <Input label="이름" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">공개 범위</label>
            <select
              value={newVisibility}
              onChange={e => setNewVisibility(e.target.value as 'company' | 'department' | 'personal')}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="company">회사 문서</option>
              <option value="department">부서 문서</option>
              <option value="personal">개인 문서</option>
            </select>
          </div>
          {newVisibility !== 'company' && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={newShared}
                onChange={e => setNewShared(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              공유 허용 (조직 전체에 보이게)
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNewModal(false)}>취소</Button>
            <Button onClick={createDocument}>만들기</Button>
          </div>
        </div>
      </Modal>

      {/* Version history modal */}
      <Modal open={showVersions} onClose={() => setShowVersions(false)} title="버전 히스토리" width="max-w-lg">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {versions.map(v => (
            <button
              key={v.id}
              onClick={async () => {
                const res = await docsApi.getVersion(selectedDoc.id, v.id)
                setEditContent(res.version.content)
                setEditTitle(selectedDoc.title)
                setEditing(true)
                setShowVersions(false)
              }}
              className="w-full text-left p-3 rounded-lg border hover:border-primary-300 hover:bg-primary-50"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">v{v.version_number}</span>
                <span className="text-xs text-gray-400">{v.author_name}</span>
              </div>
              <span className="text-xs text-gray-500">{new Date(v.created_at).toLocaleString('ko')}</span>
            </button>
          ))}
          {versions.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">버전 기록이 없습니다</p>
          )}
        </div>
      </Modal>
    </div>
  )
}

function MarkdownPreview({ content }: { content: string }) {
  // Simple markdown rendering (headings, bold, italic, code, lists, links)
  const html = content
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-3">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1 rounded text-sm">$1</code>')
    .replace(/^\- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary-600 underline" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')

  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

// ── Recursive Tree Components ────────────────────────────────

function DocTree({ deptId, parentId, depth, selectedId, onSelect, onDelete, onAddInFolder }: {
  deptId: string | null
  parentId: string | null
  depth: number
  selectedId?: string
  onSelect: (doc: any) => void
  onDelete: (doc: any) => void
  onAddInFolder: (folderId: string) => void
}) {
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params: { dept_id?: string; parent_id?: string } = {}
    if (deptId) params.dept_id = deptId
    if (parentId) params.parent_id = parentId

    docsApi.list(params).then(res => {
      setDocs(res.documents || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [deptId, parentId])

  if (loading && depth === 0) return <p className="text-xs text-gray-400 text-center py-4">로딩 중...</p>
  if (docs.length === 0 && depth === 0) return <p className="text-xs text-gray-400 text-center py-4">문서가 없습니다</p>

  // Sort: AI-titled docs go to the bottom of each folder
  const sortedDocs = [...docs].sort((a, b) => {
    if (a.is_folder !== b.is_folder) return a.is_folder ? -1 : 1
    if (a.title === 'AI' && b.title !== 'AI') return 1
    if (a.title !== 'AI' && b.title === 'AI') return -1
    return 0
  })

  return (
    <div className={depth > 0 ? 'ml-3 border-l border-gray-200 pl-1' : ''}>
      {sortedDocs.map(doc => (
        doc.is_folder ? (
          <FolderNode
            key={doc.id}
            doc={doc}
            deptId={deptId}
            depth={depth}
            selectedId={selectedId}
            onSelect={onSelect}
            onDelete={onDelete}
            onAddInFolder={onAddInFolder}
          />
        ) : (
          <TreeItem
            key={doc.id}
            doc={doc}
            selectedId={selectedId}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        )
      ))}
    </div>
  )
}

function FolderNode({ doc, deptId, depth, selectedId, onSelect, onDelete, onAddInFolder }: {
  doc: any
  deptId: string | null
  depth: number
  selectedId?: string
  onSelect: (doc: any) => void
  onDelete: (doc: any) => void
  onAddInFolder: (folderId: string) => void
}) {
  const [expanded, setExpanded] = useState(depth < 1) // auto-expand first level

  return (
    <div>
      <div className="group flex items-center gap-1 w-full py-1 px-1 rounded-lg text-sm hover:bg-gray-100">
        <button onClick={() => setExpanded(!expanded)} className="p-0.5 text-gray-400 hover:text-gray-600">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
          {expanded ? <FolderOpen size={16} className="text-amber-500 flex-shrink-0" /> : <Folder size={16} className="text-amber-500 flex-shrink-0" />}
          <span className="truncate font-medium text-gray-700">{doc.title}</span>
          <span className="flex items-center gap-0.5 flex-shrink-0">
            {doc.visibility === 'company' && <Building2 size={10} className="text-blue-500" />}
            {doc.visibility === 'personal' && <UserIcon size={10} className="text-purple-500" />}
            {doc.visibility === 'department' && <Users size={10} className="text-green-500" />}
            {doc.shared === 1 && <Share2 size={9} className="text-orange-400" />}
          </span>
        </button>
        <button
          onClick={() => onAddInFolder(doc.id)}
          className="p-0.5 text-gray-300 hover:text-primary-500 opacity-0 group-hover:opacity-100"
          title="이 폴더에 문서 추가"
        >
          <FilePlus size={13} />
        </button>
        <button
          onClick={() => onDelete(doc)}
          className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
          title="삭제"
        >
          <Trash2 size={13} />
        </button>
      </div>
      {expanded && (
        <DocTree
          deptId={deptId}
          parentId={doc.id}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
          onAddInFolder={onAddInFolder}
        />
      )}
    </div>
  )
}

function TreeItem({ doc, selectedId, onSelect, onDelete }: {
  doc: any
  selectedId?: string
  onSelect: (doc: any) => void
  onDelete: (doc: any) => void
}) {
  const isAIGuide = doc.title === 'AI'

  return (
    <div className={`group flex items-center gap-1 w-full py-1 px-1 rounded-lg text-sm hover:bg-gray-100 ${selectedId === doc.id ? 'bg-primary-50 text-primary-700' : ''} ${isAIGuide ? 'opacity-40' : ''}`}>
      <span className="w-5" /> {/* indent spacer */}
      <button onClick={() => onSelect(doc)} className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
        <FileText size={15} className="text-gray-400 flex-shrink-0" />
        <span className={`truncate ${isAIGuide ? 'italic text-gray-300' : ''}`}>{doc.title}</span>
        {isAIGuide && <span className="text-[10px] text-gray-300 flex-shrink-0" title="AI 가이드">AI 가이드</span>}
        <span className="flex items-center gap-0.5 flex-shrink-0">
          {doc.visibility === 'company' && <Building2 size={10} className="text-blue-500" />}
          {doc.visibility === 'personal' && <UserIcon size={10} className="text-purple-500" />}
          {doc.visibility === 'department' && <Users size={10} className="text-green-500" />}
          {doc.shared === 1 && <Share2 size={9} className="text-orange-400" />}
        </span>
      </button>
      <button
        onClick={() => onDelete(doc)}
        className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
        title="삭제"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}
