import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useOrgStore } from '../../stores/orgStore'
import { attendanceApi, deptApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { Button } from '../ui/Button'
import { Clock, LogIn, LogOut, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import dayjs from 'dayjs'

interface AttendanceRecord {
  id: string
  org_id: string
  user_id: string
  department_id: string | null
  date: string
  clock_in: string | null
  clock_out: string | null
  clock_in_source: string
  clock_out_source: string
  status: string
  note: string
  user_name?: string
  user_email?: string
}

interface DeptOption {
  id: string
  name: string
  color: string
}

interface StatRow {
  user_id: string
  user_name: string
  total_records: number
  present_count: number
  late_count: number
  absent_count: number
  remote_count: number
  vacation_count: number
  half_day_count: number
}

const STATUS_LABELS: Record<string, string> = {
  present: '출근',
  late: '지각',
  half_day: '반차',
  absent: '결근',
  remote: '재택',
  vacation: '휴가',
}

const STATUS_COLORS: Record<string, string> = {
  present: 'bg-green-100 text-green-800',
  late: 'bg-yellow-100 text-yellow-800',
  half_day: 'bg-orange-100 text-orange-800',
  absent: 'bg-red-100 text-red-800',
  remote: 'bg-blue-100 text-blue-800',
  vacation: 'bg-purple-100 text-purple-800',
}

const CALENDAR_DOT_COLORS: Record<string, string> = {
  present: 'bg-green-500',
  late: 'bg-yellow-500',
  half_day: 'bg-orange-500',
  absent: 'bg-red-500',
  remote: 'bg-blue-500',
  vacation: 'bg-purple-500',
}

function formatTime(iso: string | null): string {
  if (!iso) return '-'
  return dayjs(iso).format('HH:mm')
}

function calcWorkHours(clockIn: string | null, clockOut: string | null): string {
  if (!clockIn || !clockOut) return '-'
  const diff = dayjs(clockOut).diff(dayjs(clockIn), 'minute')
  const h = Math.floor(diff / 60)
  const m = diff % 60
  return `${h}h ${m}m`
}

export function AttendancePage() {
  const { user } = useAuthStore()
  const { currentDeptId } = useOrgStore()
  const isManager = user?.is_ceo || user?.is_admin

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">근태관리</h1>
      <MyAttendanceSection />
      {isManager && <TeamAttendanceSection currentDeptId={currentDeptId} />}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// My Attendance Section
// ──────────────────────────────────────────────────────────────
function MyAttendanceSection() {
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null)
  const [monthRecords, setMonthRecords] = useState<AttendanceRecord[]>([])
  const [currentMonth, setCurrentMonth] = useState(dayjs())
  const [clockInLoading, setClockInLoading] = useState(false)
  const [clockOutLoading, setClockOutLoading] = useState(false)

  const loadToday = useCallback(async () => {
    try {
      const res = await attendanceApi.today()
      setTodayRecord(res.record)
    } catch {
      // ignore
    }
  }, [])

  const loadMonth = useCallback(async () => {
    try {
      const res = await attendanceApi.my({ month: currentMonth.format('YYYY-MM') })
      setMonthRecords(res.records)
    } catch {
      // ignore
    }
  }, [currentMonth])

  useEffect(() => { loadToday() }, [loadToday])
  useEffect(() => { loadMonth() }, [loadMonth])

  const handleClockIn = async () => {
    setClockInLoading(true)
    try {
      const res = await attendanceApi.clockIn()
      setTodayRecord(res.record)
      useToastStore.getState().addToast('success', '출근 완료!')
      loadMonth()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '출근 실패'
      useToastStore.getState().addToast('error', '출근 실패', msg)
    } finally {
      setClockInLoading(false)
    }
  }

  const handleClockOut = async () => {
    setClockOutLoading(true)
    try {
      const res = await attendanceApi.clockOut()
      setTodayRecord(res.record)
      useToastStore.getState().addToast('success', '퇴근 완료!')
      loadMonth()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '퇴근 실패'
      useToastStore.getState().addToast('error', '퇴근 실패', msg)
    } finally {
      setClockOutLoading(false)
    }
  }

  // Calendar rendering
  const daysInMonth = () => {
    const startOfMonth = currentMonth.startOf('month')
    const startDay = startOfMonth.day()
    const days: dayjs.Dayjs[] = []
    for (let i = -startDay; i < 42 - startDay; i++) {
      days.push(startOfMonth.add(i, 'day'))
    }
    return days
  }

  const getRecordForDay = (day: dayjs.Dayjs): AttendanceRecord | undefined => {
    const dayStr = day.format('YYYY-MM-DD')
    return monthRecords.find(r => r.date === dayStr)
  }

  return (
    <div className="space-y-6">
      {/* Today Status Card */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Clock size={20} /> 오늘의 근태
            </h2>
            <p className="text-sm text-gray-500 mt-1">{dayjs().format('YYYY년 M월 D일 (ddd)')}</p>
          </div>
          <div className="flex items-center gap-3">
            {todayRecord ? (
              <div className="text-right">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">출근: <span className="font-medium text-gray-900">{formatTime(todayRecord.clock_in)}</span></span>
                  <span className="text-gray-500">퇴근: <span className="font-medium text-gray-900">{formatTime(todayRecord.clock_out)}</span></span>
                </div>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[todayRecord.status] || 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABELS[todayRecord.status] || todayRecord.status}
                </span>
              </div>
            ) : (
              <span className="text-sm text-gray-400">미출근</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <Button
            size="lg"
            onClick={handleClockIn}
            loading={clockInLoading}
            disabled={!!todayRecord?.clock_in}
            className="flex-1"
          >
            <LogIn size={18} className="mr-2" />
            출근
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={handleClockOut}
            loading={clockOutLoading}
            disabled={!todayRecord?.clock_in || !!todayRecord?.clock_out}
            className="flex-1"
          >
            <LogOut size={18} className="mr-2" />
            퇴근
          </Button>
        </div>
      </div>

      {/* Monthly Calendar */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-gray-900">월간 근태 현황</h3>
          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentMonth(m => m.subtract(1, 'month'))} className="p-1 hover:bg-gray-100 rounded">
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-medium min-w-[100px] text-center">{currentMonth.format('YYYY년 M월')}</span>
            <button onClick={() => setCurrentMonth(m => m.add(1, 'month'))} className="p-1 hover:bg-gray-100 rounded">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-gray-50 border-b text-xs">
          {Object.entries(CALENDAR_DOT_COLORS).map(([status, color]) => (
            <span key={status} className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
              {STATUS_LABELS[status]}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 border-b">
          {['일', '월', '화', '수', '목', '금', '토'].map(d => (
            <div key={d} className="px-2 py-2 text-center text-xs font-medium text-gray-500">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {daysInMonth().map((day, i) => {
            const isToday = day.isSame(dayjs(), 'day')
            const isCurrentMonth = day.month() === currentMonth.month()
            const record = getRecordForDay(day)

            return (
              <div
                key={i}
                className={`min-h-[60px] border-b border-r p-1 ${!isCurrentMonth ? 'bg-gray-50' : ''}`}
              >
                <div className={`text-xs mb-1 ${isToday ? 'w-5 h-5 bg-primary-600 text-white rounded-full flex items-center justify-center text-[10px]' : isCurrentMonth ? 'text-gray-700' : 'text-gray-400'}`}>
                  {day.date()}
                </div>
                {record && (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${CALENDAR_DOT_COLORS[record.status] || 'bg-gray-400'}`} />
                    <span className="text-[9px] text-gray-400">{formatTime(record.clock_in)}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Team Attendance Section
// ──────────────────────────────────────────────────────────────
function TeamAttendanceSection({ currentDeptId }: { currentDeptId: string | null }) {
  const { organization } = useAuthStore()
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [selectedDeptId, setSelectedDeptId] = useState(currentDeptId || '')
  const [departments, setDepartments] = useState<DeptOption[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [stats, setStats] = useState<StatRow[]>([])
  const [showStats, setShowStats] = useState(false)

  useEffect(() => {
    deptApi.list().then(res => setDepartments(res.departments as DeptOption[])).catch(() => {})
  }, [])

  // Sync with top-bar department selector
  useEffect(() => {
    setSelectedDeptId(currentDeptId || '')
  }, [currentDeptId])

  const loadTeam = useCallback(async () => {
    try {
      const res = await attendanceApi.team({
        dept_id: selectedDeptId || undefined,
        date: selectedDate,
      })
      setRecords(res.records)
    } catch {
      // ignore
    }
  }, [selectedDeptId, selectedDate])

  const loadStats = useCallback(async () => {
    const month = selectedDate.slice(0, 7)
    try {
      const res = await attendanceApi.stats({
        dept_id: selectedDeptId || undefined,
        month,
      })
      setStats(Array.isArray(res.stats) ? res.stats : [])
    } catch {
      // ignore
    }
  }, [selectedDeptId, selectedDate])

  useEffect(() => { loadTeam() }, [loadTeam])
  useEffect(() => { if (showStats) loadStats() }, [loadStats, showStats])

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Users size={18} /> 팀 근태 현황
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedDeptId}
            onChange={e => setSelectedDeptId(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          >
            {(() => {
              const root = departments.find((d: any) => !d.parent_id)
              const children = departments.filter((d: any) => d.parent_id)
              return <>
                <option value="">{root?.name || organization?.name || '전체'}</option>
                {children.map(d => (
                  <option key={d.id} value={d.id}>ㄴ {d.name}</option>
                ))}
              </>
            })()}
          </select>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          />
          <Button
            size="sm"
            variant={showStats ? 'primary' : 'secondary'}
            onClick={() => setShowStats(!showStats)}
          >
            월간 통계
          </Button>
        </div>
      </div>

      {!showStats ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">이름</th>
                <th className="text-left px-4 py-2 font-medium">출근</th>
                <th className="text-left px-4 py-2 font-medium">퇴근</th>
                <th className="text-left px-4 py-2 font-medium">상태</th>
                <th className="text-left px-4 py-2 font-medium">근무시간</th>
                <th className="text-left px-4 py-2 font-medium">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">기록이 없습니다</td>
                </tr>
              ) : records.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{r.user_name || '-'}</td>
                  <td className="px-4 py-2 text-gray-600">{formatTime(r.clock_in)}</td>
                  <td className="px-4 py-2 text-gray-600">{formatTime(r.clock_out)}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{calcWorkHours(r.clock_in, r.clock_out)}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{r.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 border-b">
            {selectedDate.slice(0, 7)} 월간 통계
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">이름</th>
                <th className="text-center px-4 py-2 font-medium">출근</th>
                <th className="text-center px-4 py-2 font-medium">지각</th>
                <th className="text-center px-4 py-2 font-medium">결근</th>
                <th className="text-center px-4 py-2 font-medium">재택</th>
                <th className="text-center px-4 py-2 font-medium">휴가</th>
                <th className="text-center px-4 py-2 font-medium">반차</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">통계가 없습니다</td>
                </tr>
              ) : stats.map((s) => (
                <tr key={s.user_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{s.user_name}</td>
                  <td className="px-4 py-2 text-center text-green-700">{s.present_count}</td>
                  <td className="px-4 py-2 text-center text-yellow-700">{s.late_count}</td>
                  <td className="px-4 py-2 text-center text-red-700">{s.absent_count}</td>
                  <td className="px-4 py-2 text-center text-blue-700">{s.remote_count}</td>
                  <td className="px-4 py-2 text-center text-purple-700">{s.vacation_count}</td>
                  <td className="px-4 py-2 text-center text-orange-700">{s.half_day_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
