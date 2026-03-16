import { useState, useEffect, useCallback } from 'react'
import { useOrgStore } from '../../stores/orgStore'
import { calendarApi, membersApi, attendanceApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react'
import dayjs from 'dayjs'

type Visibility = 'personal' | 'department' | 'company' | 'shared'

interface SharedTarget {
  id: string
  event_id: string
  target_type: 'user' | 'executives'
  target_id: string | null
}

interface CalendarEvent {
  id: string
  title: string
  start_at: string
  end_at: string
  all_day: number
  color: string
  description: string
  visibility?: Visibility
  shared_targets?: SharedTarget[]
}

interface OrgMember {
  id: string
  name: string
  email: string
  is_ceo: number
}

export function CalendarPage() {
  const { currentDeptId } = useOrgStore()
  const [currentDate, setCurrentDate] = useState(dayjs())
  const [view, setView] = useState<'month' | 'week'>('month')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleAvailable, setGoogleAvailable] = useState(false)
  const [showAttendance, setShowAttendance] = useState(false)
  const [attendanceRecords, setAttendanceRecords] = useState<{date: string; status: string}[]>([])

  const loadEvents = useCallback(async () => {
    const start = currentDate.startOf('month').subtract(7, 'day').toISOString()
    const end = currentDate.endOf('month').add(7, 'day').toISOString()
    try {
      const res = await calendarApi.listEvents({ dept_id: currentDeptId || undefined, start, end })
      setEvents(res.events as CalendarEvent[])
    } catch (e: any) {
      useToastStore.getState().addToast('error', '이벤트 로드 실패', e.message)
    }
  }, [currentDeptId, currentDate])

  useEffect(() => { loadEvents() }, [loadEvents])

  useEffect(() => {
    calendarApi.googleStatus().then(r => {
      setGoogleConnected(r.connected)
      setGoogleAvailable(r.available !== false)
    }).catch(() => {
      setGoogleAvailable(false)
    })
  }, [])

  useEffect(() => {
    if (!showAttendance) return
    const month = currentDate.format('YYYY-MM')
    attendanceApi.my({ month }).then(res => {
      setAttendanceRecords((res.records as {date: string; status: string}[]) || [])
    }).catch(() => {
      setAttendanceRecords([])
    })
  }, [showAttendance, currentDate])

  const handleGoogleSync = async () => {
    if (!currentDeptId) {
      useToastStore.getState().addToast('warning', '부서를 선택해주세요')
      return
    }
    try {
      const res = await calendarApi.googleSync(currentDeptId)
      useToastStore.getState().addToast('success', `${res.synced}개 이벤트 동기화 완료`)
      loadEvents()
    } catch (e: any) {
      useToastStore.getState().addToast('error', '동기화 실패', e.message)
    }
  }

  const handleGoogleConnect = async () => {
    try {
      const res = await calendarApi.googleConnect()
      window.location.href = res.authUrl
    } catch (e: any) {
      useToastStore.getState().addToast('error', '연결 실패', e.message)
    }
  }

  const daysInMonth = () => {
    const startOfMonth = currentDate.startOf('month')
    const startDay = startOfMonth.day()
    const days: dayjs.Dayjs[] = []
    for (let i = -startDay; i < 42 - startDay; i++) {
      days.push(startOfMonth.add(i, 'day'))
    }
    return days
  }

  const getEventsForDay = (day: dayjs.Dayjs) => {
    const dayStr = day.format('YYYY-MM-DD')
    return events.filter(e => {
      const start = dayjs(e.start_at).format('YYYY-MM-DD')
      const end = dayjs(e.end_at).format('YYYY-MM-DD')
      return dayStr >= start && dayStr <= end
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">캘린더</h1>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1 text-sm rounded-md ${view === 'month' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}
            >월</button>
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1 text-sm rounded-md ${view === 'week' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}
            >주</button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none mr-2">
            <input
              type="checkbox"
              checked={showAttendance}
              onChange={e => setShowAttendance(e.target.checked)}
              className="rounded"
            />
            근태 표시
          </label>
          {googleAvailable && (
            googleConnected ? (
              <Button variant="secondary" size="sm" onClick={handleGoogleSync}>
                <RefreshCw size={14} className="mr-1" /> Google 동기화
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={handleGoogleConnect}>
                Google Calendar 연결
              </Button>
            )
          )}
          <Button size="sm" onClick={() => { setEditingEvent(null); setShowModal(true) }}>
            <Plus size={14} className="mr-1" /> 일정 추가
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-4 mb-4">
        <button onClick={() => setCurrentDate(c => c.subtract(1, 'month'))} className="p-1 hover:bg-gray-100 rounded">
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold min-w-[140px] text-center">
          {currentDate.format('YYYY년 M월')}
        </h2>
        <button onClick={() => setCurrentDate(c => c.add(1, 'month'))} className="p-1 hover:bg-gray-100 rounded">
          <ChevronRight size={20} />
        </button>
        <button onClick={() => setCurrentDate(dayjs())} className="text-sm text-primary-600 hover:text-primary-700">
          오늘
        </button>
      </div>

      {/* Month View */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="grid grid-cols-7 border-b">
          {['일', '월', '화', '수', '목', '금', '토'].map(d => (
            <div key={d} className="px-2 py-2 text-center text-xs font-medium text-gray-500">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {daysInMonth().map((day, i) => {
            const isToday = day.isSame(dayjs(), 'day')
            const isCurrentMonth = day.month() === currentDate.month()
            const dayEvents = getEventsForDay(day)

            return (
              <div
                key={i}
                className={`min-h-[100px] border-b border-r p-1 ${!isCurrentMonth ? 'bg-gray-50' : ''}`}
              >
                <div className={`text-xs mb-1 ${isToday ? 'w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center' : isCurrentMonth ? 'text-gray-700' : 'text-gray-400'}`}>
                  {day.date()}
                </div>
                {dayEvents.slice(0, 3).map(evt => (
                  <button
                    key={evt.id}
                    onClick={() => { setEditingEvent(evt); setShowModal(true) }}
                    className="w-full text-left text-xs px-1 py-0.5 rounded truncate mb-0.5 text-white"
                    style={{ backgroundColor: evt.color || '#3B82F6' }}
                  >
                    {evt.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-xs text-gray-400">+{dayEvents.length - 3}</span>
                )}
                {showAttendance && (() => {
                  const dayStr = day.format('YYYY-MM-DD')
                  const aRec = attendanceRecords.find(r => r.date === dayStr)
                  if (!aRec) return null
                  const dotColorMap: Record<string, string> = {
                    present: 'bg-green-500',
                    late: 'bg-yellow-500',
                    half_day: 'bg-orange-500',
                    absent: 'bg-red-500',
                    remote: 'bg-blue-500',
                    vacation: 'bg-purple-500',
                  }
                  return (
                    <div className="flex justify-center mt-0.5">
                      <span className={`w-2 h-2 rounded-full ${dotColorMap[aRec.status] || 'bg-gray-400'}`} title={aRec.status} />
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </div>

      {/* Event Modal */}
      <EventModal
        open={showModal}
        onClose={() => setShowModal(false)}
        event={editingEvent}
        deptId={currentDeptId}
        onSave={loadEvents}
      />
    </div>
  )
}

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'personal', label: '개인일정' },
  { value: 'department', label: '부서공유' },
  { value: 'company', label: '회사공유' },
  { value: 'shared', label: '선택공유' },
]

function EventModal({ open, onClose, event, deptId, onSave }: {
  open: boolean
  onClose: () => void
  event: CalendarEvent | null
  deptId: string | null
  onSave: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [color, setColor] = useState('#3B82F6')
  const [loading, setLoading] = useState(false)
  const [visibility, setVisibility] = useState<Visibility>('department')
  const [sharedTargetIds, setSharedTargetIds] = useState<string[]>([])
  const [shareWithExecutives, setShareWithExecutives] = useState(false)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)

  useEffect(() => {
    if (event) {
      const isAllDay = !!event.all_day
      setTitle(event.title)
      setDescription(event.description || '')
      setStartAt(isAllDay
        ? dayjs(event.start_at).format('YYYY-MM-DD')
        : dayjs(event.start_at).format('YYYY-MM-DDTHH:mm'))
      setEndAt(isAllDay
        ? dayjs(event.end_at).format('YYYY-MM-DD')
        : dayjs(event.end_at).format('YYYY-MM-DDTHH:mm'))
      setAllDay(isAllDay)
      setColor(event.color || '#3B82F6')
      setVisibility(event.visibility || 'department')
      // Restore shared targets from event
      if (event.shared_targets?.length) {
        setSharedTargetIds(
          event.shared_targets
            .filter(t => t.target_type === 'user' && t.target_id)
            .map(t => t.target_id!)
        )
        setShareWithExecutives(
          event.shared_targets.some(t => t.target_type === 'executives')
        )
      } else {
        setSharedTargetIds([])
        setShareWithExecutives(false)
      }
    } else {
      setTitle('')
      setDescription('')
      setStartAt(dayjs().format('YYYY-MM-DDTHH:mm'))
      setEndAt(dayjs().add(1, 'hour').format('YYYY-MM-DDTHH:mm'))
      setAllDay(false)
      setColor('#3B82F6')  // department default
      setVisibility('department')
      setSharedTargetIds([])
      setShareWithExecutives(false)
    }
  }, [event, open])

  const handleAllDayToggle = (checked: boolean) => {
    if (checked) {
      // Convert datetime-local to date format
      setStartAt(startAt.slice(0, 10))
      setEndAt(endAt.slice(0, 10))
    } else {
      // Convert date to datetime-local format, add default times
      setStartAt(startAt.slice(0, 10) + 'T09:00')
      setEndAt(endAt.slice(0, 10) + 'T10:00')
    }
    setAllDay(checked)
  }

  // Load members when 'shared' visibility is selected
  useEffect(() => {
    if (visibility === 'shared' && !membersLoaded) {
      membersApi.list().then(res => {
        setMembers(res.members as OrgMember[])
        setMembersLoaded(true)
      }).catch(() => { /* ignore */ })
    }
  }, [visibility, membersLoaded])

  const toggleSharedTarget = (userId: string) => {
    setSharedTargetIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  const handleSubmit = async () => {
    if (!title || !deptId) return
    setLoading(true)
    try {
      let finalStartAt: string
      let finalEndAt: string
      if (allDay) {
        // Set start to beginning of day, end to end of day
        finalStartAt = new Date(startAt + 'T00:00:00').toISOString()
        finalEndAt = new Date(endAt + 'T23:59:59').toISOString()
      } else {
        finalStartAt = new Date(startAt).toISOString()
        finalEndAt = new Date(endAt).toISOString()
      }
      const data: Record<string, unknown> = {
        title,
        description,
        start_at: finalStartAt,
        end_at: finalEndAt,
        all_day: allDay,
        color,
        visibility,
      }
      if (visibility === 'shared') {
        data.shared_target_ids = sharedTargetIds
        data.share_with_executives = shareWithExecutives
      }
      if (event) {
        await calendarApi.updateEvent(event.id, data)
      } else {
        await calendarApi.createEvent(deptId, data)
      }
      onSave()
      onClose()
    } catch (e: any) {
      useToastStore.getState().addToast('error', '저장 실패', e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!event) return
    try {
      await calendarApi.deleteEvent(event.id)
      onSave()
      onClose()
    } catch (e: any) {
      useToastStore.getState().addToast('error', '삭제 실패', e.message)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={event ? '일정 수정' : '일정 추가'}>
      <div className="space-y-4">
        <Input label="제목" value={title} onChange={e => setTitle(e.target.value)} required />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allDay} onChange={e => handleAllDayToggle(e.target.checked)} className="rounded" />
          종일
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Input label="시작" type={allDay ? 'date' : 'datetime-local'} value={startAt} onChange={e => setStartAt(e.target.value)} />
          <Input label="종료" type={allDay ? 'date' : 'datetime-local'} value={endAt} onChange={e => setEndAt(e.target.value)} />
        </div>
        {/* Visibility selector - placed before color so default color updates */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">공개 범위</label>
          <div className="grid grid-cols-2 gap-2">
            {VISIBILITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setVisibility(opt.value)
                  // Set default color based on visibility
                  const defaultColors: Record<string, string> = {
                    personal: '#8B5CF6',   // purple
                    department: '#3B82F6', // blue
                    company: '#10B981',    // green
                    shared: '#F59E0B',     // amber
                  }
                  if (!event) setColor(defaultColors[opt.value] || '#3B82F6')
                }}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                  visibility === opt.value
                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Shared target picker */}
        {visibility === 'shared' && (
          <div className="border rounded-lg p-3 space-y-3 bg-gray-50">
            <label className="block text-sm font-medium text-gray-700">공유 대상 선택</label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shareWithExecutives}
                onChange={e => setShareWithExecutives(e.target.checked)}
                className="rounded"
              />
              <span className="font-medium">임원진 (CEO)</span>
            </label>
            <div className="border-t pt-2">
              <p className="text-xs text-gray-500 mb-2">개별 사용자 선택</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {members.map(m => (
                  <label key={m.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-gray-100 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sharedTargetIds.includes(m.id)}
                      onChange={() => toggleSharedTarget(m.id)}
                      className="rounded"
                    />
                    <span>{m.name}</span>
                    <span className="text-xs text-gray-400">{m.email}</span>
                  </label>
                ))}
                {members.length === 0 && (
                  <p className="text-xs text-gray-400 py-2">멤버를 불러오는 중...</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Color picker with shortcuts */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">색상</label>
          <div className="flex items-center gap-2">
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-8 rounded cursor-pointer border" />
            {['#3B82F6','#10B981','#8B5CF6','#F59E0B','#EF4444','#EC4899','#06B6D4','#6B7280'].map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${color === c ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-110'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <textarea
          placeholder="설명 (선택)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          rows={3}
        />
        <div className="flex justify-between pt-2">
          {event && (
            <Button variant="danger" size="sm" onClick={handleDelete}>삭제</Button>
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
