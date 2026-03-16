import { useState, useEffect, useRef } from 'react'
import { useOrgStore } from '../../stores/orgStore'
import { boardsApi, tasksApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Plus, GripVertical, User } from 'lucide-react'

export function KanbanPage() {
  const { currentDeptId } = useOrgStore()
  const [boards, setBoards] = useState<any[]>([])
  const [selectedBoard, setSelectedBoard] = useState<any>(null)
  const [columns, setColumns] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [showNewBoard, setShowNewBoard] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [newBoardVisibility, setNewBoardVisibility] = useState<'company' | 'department' | 'personal'>('department')
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [editingTask, setEditingTask] = useState<any>(null)
  const [targetColumnId, setTargetColumnId] = useState<string | null>(null)

  // Drag state
  const dragItem = useRef<any>(null)
  const dragOverColumn = useRef<string | null>(null)

  useEffect(() => {
    boardsApi.list(currentDeptId || undefined).then(r => {
      setBoards(r.boards)
      if (r.boards.length > 0 && !selectedBoard) {
        loadBoard(r.boards[0].id)
      }
    }).catch(() => {})
  }, [currentDeptId])

  const loadBoard = async (boardId: string) => {
    try {
      const res = await boardsApi.get(boardId)
      setSelectedBoard(res.board)
      setColumns(res.columns)
      setTasks(res.tasks)
    } catch (e: any) {
      useToastStore.getState().addToast('error', '보드 로드 실패', e.message)
    }
  }

  const createBoard = async () => {
    if (!newBoardName) return
    try {
      const res = await boardsApi.create(currentDeptId || '', newBoardName, newBoardVisibility)
      setBoards(prev => [...prev, res.board])
      setNewBoardName('')
      setNewBoardVisibility('department' as any)
      setShowNewBoard(false)
      loadBoard(res.board.id)
    } catch (e: any) {
      useToastStore.getState().addToast('error', '보드 생성 실패', e.message)
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

      {/* Kanban Board */}
      {selectedBoard ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map(col => (
            <div
              key={col.id}
              className="flex-shrink-0 w-72 bg-gray-100 rounded-xl p-3"
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDrop={() => handleDrop(col.id)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                  <h3 className="text-sm font-semibold text-gray-700">{col.name}</h3>
                  <span className="text-xs text-gray-400 bg-gray-200 px-1.5 rounded-full">
                    {getColumnTasks(col.id).length}
                    {col.wip_limit > 0 && `/${col.wip_limit}`}
                  </span>
                </div>
                <button
                  onClick={() => { setTargetColumnId(col.id); setEditingTask(null); setShowTaskModal(true) }}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-200"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="space-y-2 min-h-[50px]">
                {getColumnTasks(col.id).map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => handleDragStart(task)}
                    onClick={() => { setEditingTask(task); setTargetColumnId(task.column_id); setShowTaskModal(true) }}
                    className={`bg-white rounded-lg p-3 border border-l-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${priorityColors[task.priority] || ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical size={14} className="text-gray-300 mt-0.5 flex-shrink-0 cursor-grab" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
                        {task.due_date && (
                          <p className="text-xs text-gray-400 mt-1">{task.due_date}</p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex gap-1">
                            {JSON.parse(task.labels || '[]').map((label: string) => (
                              <span key={label} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{label}</span>
                            ))}
                          </div>
                          {task.assignee_name && (
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <User size={12} />{task.assignee_name}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description || '')
      setPriority(task.priority)
      setDueDate(task.due_date || '')
    } else {
      setTitle(''); setDescription(''); setPriority('medium'); setDueDate('')
    }
  }, [task, open])

  const handleSubmit = async () => {
    if (!title) return
    setLoading(true)
    try {
      if (task) {
        await tasksApi.update(task.id, { title, description, priority, due_date: dueDate || null })
      } else {
        await tasksApi.create({ board_id: boardId, column_id: columnId, title, description, priority, due_date: dueDate || null })
      }
      onSave(); onClose()
    } catch (e: any) {
      useToastStore.getState().addToast('error', '저장 실패', e.message)
    } finally { setLoading(false) }
  }

  const handleDelete = async () => {
    if (!task) return
    await tasksApi.delete(task.id)
    onSave(); onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={task ? '태스크 수정' : '태스크 추가'}>
      <div className="space-y-4">
        <Input label="제목" value={title} onChange={e => setTitle(e.target.value)} required />
        <textarea
          placeholder="설명"
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
          rows={3}
        />
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
        <div className="flex justify-between pt-2">
          {task && <Button variant="danger" size="sm" onClick={handleDelete}>삭제</Button>}
          <div className="flex gap-2 ml-auto">
            <Button variant="secondary" onClick={onClose}>취소</Button>
            <Button onClick={handleSubmit} loading={loading}>저장</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
