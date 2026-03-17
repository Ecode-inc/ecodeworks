import { useState, useEffect, useRef } from 'react'
import { useOrgStore } from '../../stores/orgStore'
import { useAuthStore } from '../../stores/authStore'
import { boardsApi, tasksApi, membersApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Plus, GripVertical, User, Trash2, Pencil, X, Check } from 'lucide-react'

const COLUMN_COLORS = [
  '#6b7280', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b',
]

const visibilityLabels: Record<string, string> = {
  company: '회사',
  department: '부서',
  personal: '개인',
}

export function KanbanPage() {
  const { currentDeptId } = useOrgStore()
  const { departments } = useAuthStore()
  const [boards, setBoards] = useState<any[]>([])
  const [selectedBoard, setSelectedBoard] = useState<any>(null)
  const [columns, setColumns] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [showNewBoard, setShowNewBoard] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [newBoardVisibility, setNewBoardVisibility] = useState<'company' | 'department' | 'personal'>('department')
  const [newBoardDeptId, setNewBoardDeptId] = useState('')
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [editingTask, setEditingTask] = useState<any>(null)
  const [targetColumnId, setTargetColumnId] = useState<string | null>(null)

  // Board editing state
  const [editingBoardName, setEditingBoardName] = useState(false)
  const [boardNameDraft, setBoardNameDraft] = useState('')

  // Column editing state
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null)
  const [columnNameDraft, setColumnNameDraft] = useState('')
  const [colorPickerColumnId, setColorPickerColumnId] = useState<string | null>(null)

  // New column state
  const [showNewColumn, setShowNewColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [newColumnColor, setNewColumnColor] = useState('#3b82f6')

  // Drag state
  const dragItem = useRef<any>(null)
  const dragOverColumn = useRef<string | null>(null)

  // Touch drag state
  const touchStart = useRef<{ x: number; y: number; taskId: string; columnId: string } | null>(null)

  useEffect(() => {
    boardsApi.list(currentDeptId || undefined).then(r => {
      setBoards(r.boards || [])
      if ((r.boards || []).length > 0 && !selectedBoard) {
        loadBoard(r.boards[0].id)
      }
    }).catch(() => {})
  }, [currentDeptId])

  const loadBoard = async (boardId: string) => {
    try {
      const res = await boardsApi.get(boardId)
      setSelectedBoard(res.board)
      setColumns(res.columns || [])
      setTasks(res.tasks || [])
    } catch (e: any) {
      useToastStore.getState().addToast('error', '보드 로드 실패', e.message)
    }
  }

  const createBoard = async () => {
    if (!newBoardName) return
    if (newBoardVisibility === 'department' && !newBoardDeptId) {
      useToastStore.getState().addToast('error', '부서를 선택해주세요')
      return
    }
    const deptId = newBoardVisibility === 'department' ? newBoardDeptId : (currentDeptId || '')
    try {
      const res = await boardsApi.create(deptId, newBoardName, newBoardVisibility)
      setBoards(prev => [...prev, res.board])
      setNewBoardName('')
      setNewBoardVisibility('department')
      setNewBoardDeptId('')
      setShowNewBoard(false)
      loadBoard(res.board.id)
    } catch (e: any) {
      useToastStore.getState().addToast('error', '보드 생성 실패', e.message)
    }
  }

  const deleteBoard = async () => {
    if (!selectedBoard) return
    if (!confirm('이 보드를 삭제하시겠습니까? 모든 컬럼과 태스크가 삭제됩니다.')) return
    try {
      await boardsApi.delete(selectedBoard.id)
      const remaining = boards.filter(b => b.id !== selectedBoard.id)
      setBoards(remaining)
      if (remaining.length > 0) {
        loadBoard(remaining[0].id)
      } else {
        setSelectedBoard(null)
        setColumns([])
        setTasks([])
      }
      useToastStore.getState().addToast('success', '보드가 삭제되었습니다')
    } catch (e: any) {
      useToastStore.getState().addToast('error', '보드 삭제 실패', e.message)
    }
  }

  const saveBoardName = async () => {
    if (!selectedBoard || !boardNameDraft.trim()) {
      setEditingBoardName(false)
      return
    }
    try {
      const res = await boardsApi.update(selectedBoard.id, { name: boardNameDraft.trim() })
      setSelectedBoard(res.board)
      setBoards(prev => prev.map(b => b.id === selectedBoard.id ? { ...b, name: boardNameDraft.trim() } : b))
      setEditingBoardName(false)
    } catch (e: any) {
      useToastStore.getState().addToast('error', '보드 이름 변경 실패', e.message)
    }
  }

  // Column management
  const addColumn = async () => {
    if (!selectedBoard || !newColumnName.trim()) return
    try {
      const res = await boardsApi.addColumn(selectedBoard.id, { name: newColumnName.trim(), color: newColumnColor })
      setColumns(prev => [...prev, res.column])
      setNewColumnName('')
      setNewColumnColor('#3b82f6')
      setShowNewColumn(false)
      useToastStore.getState().addToast('success', '컬럼이 추가되었습니다')
    } catch (e: any) {
      useToastStore.getState().addToast('error', '컬럼 추가 실패', e.message)
    }
  }

  const saveColumnName = async (colId: string) => {
    if (!columnNameDraft.trim()) {
      setEditingColumnId(null)
      return
    }
    try {
      await boardsApi.updateColumn(colId, { name: columnNameDraft.trim() })
      setColumns(prev => prev.map(c => c.id === colId ? { ...c, name: columnNameDraft.trim() } : c))
    } catch (e: any) {
      useToastStore.getState().addToast('error', '컬럼 이름 변경 실패', e.message)
    }
    setEditingColumnId(null)
  }

  const updateColumnColor = async (colId: string, color: string) => {
    try {
      await boardsApi.updateColumn(colId, { color })
      setColumns(prev => prev.map(c => c.id === colId ? { ...c, color } : c))
    } catch (e: any) {
      useToastStore.getState().addToast('error', '컬럼 색상 변경 실패', e.message)
    }
    setColorPickerColumnId(null)
  }

  const deleteColumn = async (colId: string) => {
    const colTasks = tasks.filter(t => t.column_id === colId)
    const msg = colTasks.length > 0
      ? `이 컬럼에 ${colTasks.length}개의 태스크가 있습니다. 삭제하시겠습니까?`
      : '이 컬럼을 삭제하시겠습니까?'
    if (!confirm(msg)) return
    try {
      await boardsApi.deleteColumn(colId)
      setColumns(prev => prev.filter(c => c.id !== colId))
      setTasks(prev => prev.filter(t => t.column_id !== colId))
      useToastStore.getState().addToast('success', '컬럼이 삭제되었습니다')
    } catch (e: any) {
      useToastStore.getState().addToast('error', '컬럼 삭제 실패', e.message)
    }
  }

  const handleDragStart = (task: any) => {
    dragItem.current = task
  }

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    dragOverColumn.current = columnId
  }

  const handleDrop = async (columnId: string) => {
    const task = dragItem.current
    if (!task || task.column_id === columnId) {
      dragItem.current = null
      return
    }

    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === task.id ? { ...t, column_id: columnId } : t
    ))

    try {
      await tasksApi.update(task.id, { column_id: columnId })
    } catch {
      loadBoard(selectedBoard.id) // Revert on error
    }

    dragItem.current = null
    dragOverColumn.current = null
  }

  const getColumnTasks = (columnId: string) =>
    tasks.filter(t => t.column_id === columnId).sort((a, b) => a.order_index - b.order_index)

  const priorityColors: Record<string, string> = {
    urgent: 'border-l-red-500',
    high: 'border-l-orange-500',
    medium: 'border-l-blue-500',
    low: 'border-l-gray-300',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">칸반</h1>
          {boards.length > 0 && (
            <select
              value={selectedBoard?.id || ''}
              onChange={e => loadBoard(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5"
            >
              {boards.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
        </div>
        <Button size="sm" onClick={() => setShowNewBoard(true)}>
          <Plus size={14} className="mr-1" /> 새 보드
        </Button>
      </div>

      {/* Board header area */}
      {selectedBoard && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-white border rounded-lg">
          {editingBoardName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={boardNameDraft}
                onChange={e => setBoardNameDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveBoardName()
                  if (e.key === 'Escape') setEditingBoardName(false)
                }}
                className="text-lg font-semibold border rounded px-2 py-1 focus:ring-2 focus:ring-primary-500 outline-none"
              />
              <button onClick={saveBoardName} className="p-1 text-green-600 hover:bg-green-50 rounded">
                <Check size={16} />
              </button>
              <button onClick={() => setEditingBoardName(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setBoardNameDraft(selectedBoard.name); setEditingBoardName(true) }}
              className="flex items-center gap-1.5 text-lg font-semibold text-gray-900 hover:text-primary-600 group"
            >
              {selectedBoard.name}
              <Pencil size={14} className="text-gray-300 group-hover:text-primary-500" />
            </button>
          )}

          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
            {visibilityLabels[selectedBoard.visibility] || selectedBoard.visibility}
          </span>

          <div className="flex-1" />

          <button
            onClick={() => setShowNewColumn(true)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 px-2 py-1 rounded hover:bg-gray-50"
          >
            <Plus size={14} /> 컬럼 추가
          </button>

          <button
            onClick={deleteBoard}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
            title="보드 삭제"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {/* Kanban Board */}
      {selectedBoard ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map(col => (
            <div
              key={col.id}
              data-column-id={col.id}
              className="flex-shrink-0 w-72 bg-gray-100 rounded-xl p-3 group/col"
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDrop={() => handleDrop(col.id)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Color dot - click to change color */}
                  <div className="relative">
                    <button
                      onClick={() => setColorPickerColumnId(colorPickerColumnId === col.id ? null : col.id)}
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0 hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all"
                      style={{ backgroundColor: col.color }}
                      title="색상 변경"
                    />
                    {colorPickerColumnId === col.id && (
                      <div className="absolute top-6 left-0 z-20 bg-white border rounded-lg shadow-lg p-2 flex flex-wrap gap-1 w-[130px]">
                        {COLUMN_COLORS.map(c => (
                          <button
                            key={c}
                            onClick={() => updateColumnColor(col.id, c)}
                            className="w-5 h-5 rounded-full hover:scale-125 transition-transform"
                            style={{ backgroundColor: c, outline: c === col.color ? '2px solid #3b82f6' : 'none', outlineOffset: '2px' }}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Column name - click to edit */}
                  {editingColumnId === col.id ? (
                    <input
                      autoFocus
                      value={columnNameDraft}
                      onChange={e => setColumnNameDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveColumnName(col.id)
                        if (e.key === 'Escape') setEditingColumnId(null)
                      }}
                      onBlur={() => saveColumnName(col.id)}
                      className="text-sm font-semibold text-gray-700 border rounded px-1 py-0.5 w-full outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  ) : (
                    <h3
                      onClick={() => { setEditingColumnId(col.id); setColumnNameDraft(col.name) }}
                      className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-primary-600 truncate"
                      title="클릭하여 이름 변경"
                    >
                      {col.name}
                    </h3>
                  )}

                  <span className="text-xs text-gray-400 bg-gray-200 px-1.5 rounded-full flex-shrink-0">
                    {getColumnTasks(col.id).length}
                    {col.wip_limit > 0 && `/${col.wip_limit}`}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => deleteColumn(col.id)}
                    className="p-1 text-gray-300 hover:text-red-500 rounded hover:bg-red-50 opacity-0 group-hover/col:opacity-100 transition-opacity"
                    title="컬럼 삭제"
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    onClick={() => { setTargetColumnId(col.id); setEditingTask(null); setShowTaskModal(true) }}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-200"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-2 min-h-[50px]">
                {getColumnTasks(col.id).map(task => {
                  const labels: string[] = (() => {
                    try {
                      if (Array.isArray(task.labels)) return task.labels
                      let parsed = JSON.parse(task.labels || '[]')
                      // Handle double-encoded: "\"[]\"" → "[]" → []
                      if (typeof parsed === 'string') parsed = JSON.parse(parsed)
                      return Array.isArray(parsed) ? parsed : []
                    } catch { return [] }
                  })()
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => handleDragStart(task)}
                      onTouchStart={(e) => {
                        const touch = e.touches[0]
                        touchStart.current = { x: touch.clientX, y: touch.clientY, taskId: task.id, columnId: task.column_id }
                      }}
                      onTouchMove={(e) => {
                        if (touchStart.current) {
                          e.preventDefault()
                        }
                      }}
                      onTouchEnd={(e) => {
                        if (!touchStart.current) return
                        const touch = e.changedTouches[0]
                        const element = document.elementFromPoint(touch.clientX, touch.clientY)
                        const columnEl = element?.closest('[data-column-id]')
                        if (columnEl) {
                          const targetColId = columnEl.getAttribute('data-column-id')
                          if (targetColId && targetColId !== touchStart.current.columnId) {
                            dragItem.current = { id: touchStart.current.taskId, column_id: touchStart.current.columnId }
                            handleDrop(targetColId)
                          }
                        }
                        touchStart.current = null
                      }}
                      onClick={() => { setEditingTask(task); setTargetColumnId(task.column_id); setShowTaskModal(true) }}
                      style={{ touchAction: 'none' }}
                      className={`bg-white rounded-lg p-3 border border-l-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${priorityColors[task.priority] || ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical size={14} className="text-gray-300 mt-0.5 flex-shrink-0 cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
                          {task.description && (
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{task.description}</p>
                          )}
                          {task.due_date && (
                            <p className="text-xs text-gray-400 mt-1">{task.due_date}</p>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex gap-1 flex-wrap">
                              {labels.map((label: string) => (
                                <span key={label} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{label}</span>
                              ))}
                            </div>
                            {task.assignee_names && (
                              <div className="flex items-center gap-1 text-xs text-gray-400 flex-wrap">
                                <User size={12} />
                                {task.assignee_names.split(',').map((name: string, i: number) => (
                                  <span key={i} className="bg-gray-50 px-1 rounded">{name.trim()}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Add column button at end of columns */}
          <div className="flex-shrink-0 w-72">
            {showNewColumn ? (
              <div className="bg-gray-100 rounded-xl p-3 space-y-3">
                <input
                  autoFocus
                  placeholder="컬럼 이름"
                  value={newColumnName}
                  onChange={e => setNewColumnName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addColumn()
                    if (e.key === 'Escape') { setShowNewColumn(false); setNewColumnName('') }
                  }}
                  className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">색상:</span>
                  <div className="flex gap-1">
                    {COLUMN_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setNewColumnColor(c)}
                        className="w-4 h-4 rounded-full hover:scale-125 transition-transform"
                        style={{ backgroundColor: c, outline: c === newColumnColor ? '2px solid #3b82f6' : 'none', outlineOffset: '1px' }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addColumn}>추가</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setShowNewColumn(false); setNewColumnName('') }}>취소</Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNewColumn(true)}
                className="w-full h-20 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 hover:text-gray-500 hover:border-gray-400 flex items-center justify-center gap-2 transition-colors"
              >
                <Plus size={16} /> 컬럼 추가
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center text-gray-400 py-20">
          보드를 만들어주세요
        </div>
      )}

      {/* New Board Modal */}
      <Modal open={showNewBoard} onClose={() => setShowNewBoard(false)} title="새 보드">
        <div className="space-y-4">
          <Input label="보드 이름" value={newBoardName} onChange={e => setNewBoardName(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">공개 범위</label>
            <select
              value={newBoardVisibility}
              onChange={e => setNewBoardVisibility(e.target.value as any)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="company">회사 전체</option>
              <option value="department">부서</option>
              <option value="personal">개인</option>
            </select>
          </div>
          {newBoardVisibility === 'department' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">부서 선택</label>
              <select
                value={newBoardDeptId}
                onChange={e => setNewBoardDeptId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
              >
                <option value="">부서를 선택하세요</option>
                {departments.filter((d: any) => d.parent_id).map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNewBoard(false)}>취소</Button>
            <Button onClick={createBoard}>만들기</Button>
          </div>
        </div>
      </Modal>

      {/* Task Modal */}
      <TaskModal
        open={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        task={editingTask}
        boardId={selectedBoard?.id}
        columnId={targetColumnId}
        onSave={() => selectedBoard && loadBoard(selectedBoard.id)}
      />
    </div>
  )
}

function TaskModal({ open, onClose, task, boardId, columnId, onSave }: {
  open: boolean; onClose: () => void; task: any; boardId: string | null; columnId: string | null; onSave: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([])
  const [labelsText, setLabelsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [members, setMembers] = useState<any[]>([])

  useEffect(() => {
    if (open) {
      membersApi.list().then(r => setMembers(r.members || [])).catch(() => {})
    }
  }, [open])

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description || '')
      setPriority(task.priority)
      setDueDate(task.due_date || '')
      // Parse assignee_ids from comma-separated string or fall back to single assignee_id
      const ids = task.assignee_ids
        ? String(task.assignee_ids).split(',').filter(Boolean)
        : task.assignee_id ? [task.assignee_id] : []
      setSelectedAssigneeIds(ids)
      try {
        let raw = Array.isArray(task.labels) ? task.labels : JSON.parse(task.labels || '[]')
        if (typeof raw === 'string') raw = JSON.parse(raw)
        setLabelsText(Array.isArray(raw) ? raw.join(', ') : '')
      } catch {
        setLabelsText('')
      }
    } else {
      setTitle(''); setDescription(''); setPriority('medium'); setDueDate('')
      setSelectedAssigneeIds([]); setLabelsText('')
    }
  }, [task, open])

  const handleSubmit = async () => {
    if (!title) return
    setLoading(true)
    const labels = labelsText
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    try {
      if (task) {
        await tasksApi.update(task.id, {
          title,
          description,
          priority,
          due_date: dueDate || null,
          assignee_ids: selectedAssigneeIds,
          labels: JSON.stringify(labels),
        })
      } else {
        await tasksApi.create({
          board_id: boardId,
          column_id: columnId,
          title,
          description,
          priority,
          due_date: dueDate || null,
          assignee_ids: selectedAssigneeIds,
          labels: JSON.stringify(labels),
        })
      }
      onSave(); onClose()
    } catch (e: any) {
      useToastStore.getState().addToast('error', '저장 실패', e.message)
    } finally { setLoading(false) }
  }

  const handleDelete = async () => {
    if (!task) return
    if (!confirm('이 태스크를 삭제하시겠습니까?')) return
    try {
      await tasksApi.delete(task.id)
      onSave(); onClose()
    } catch (e: any) {
      useToastStore.getState().addToast('error', '삭제 실패', e.message)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={task ? '태스크 수정' : '태스크 추가'}>
      <div className="space-y-4">
        <Input label="제목" value={title} onChange={e => setTitle(e.target.value)} required />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
          <textarea
            placeholder="설명을 입력하세요"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">우선순위</label>
            <select value={priority} onChange={e => setPriority(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="low">낮음</option>
              <option value="medium">보통</option>
              <option value="high">높음</option>
              <option value="urgent">긴급</option>
            </select>
          </div>
          <Input label="마감일" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">담당자</label>
          <div className="border rounded-lg px-3 py-2 max-h-40 overflow-y-auto space-y-1">
            {members.length === 0 && (
              <p className="text-xs text-gray-400">멤버 로딩 중...</p>
            )}
            {members.map(m => (
              <label key={m.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-sm">
                <input
                  type="checkbox"
                  checked={selectedAssigneeIds.includes(m.id)}
                  onChange={e => {
                    if (e.target.checked) {
                      setSelectedAssigneeIds(prev => [...prev, m.id])
                    } else {
                      setSelectedAssigneeIds(prev => prev.filter(id => id !== m.id))
                    }
                  }}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span>{m.name}</span>
              </label>
            ))}
          </div>
          {selectedAssigneeIds.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-1.5">
              {selectedAssigneeIds.map(id => {
                const member = members.find(m => m.id === id)
                return member ? (
                  <span key={id} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                    {member.name}
                    <button
                      type="button"
                      onClick={() => setSelectedAssigneeIds(prev => prev.filter(aid => aid !== id))}
                      className="hover:text-blue-800"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ) : null
              })}
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">라벨 (쉼표로 구분)</label>
          <input
            type="text"
            placeholder="예: 버그, 긴급, 프론트엔드"
            value={labelsText}
            onChange={e => setLabelsText(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
          {labelsText && (
            <div className="flex gap-1 flex-wrap mt-1.5">
              {labelsText.split(',').map(s => s.trim()).filter(Boolean).map(label => (
                <span key={label} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{label}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-between pt-2">
          {task && (
            <Button variant="danger" size="sm" onClick={handleDelete}>
              <Trash2 size={14} className="mr-1" /> 삭제
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="secondary" onClick={onClose}>취소</Button>
            <Button onClick={handleSubmit} loading={loading}>저장</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
