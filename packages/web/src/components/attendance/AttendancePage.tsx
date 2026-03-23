import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useOrgStore } from '../../stores/orgStore'
import { attendanceApi, deptApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { Button } from '../ui/Button'
import { Clock, LogIn, LogOut, ChevronLeft, ChevronRight, Users, Calendar, User } from 'lucide-react'
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
  parent_id?: string | null
}

interface TeamMember {
  id: string
  name: string
  email: string
  avatar_url: string | null
  position_id: string | null
  position_name: string | null
  position_level: number | null
  departments: { id: string; name: string; color: string }[]
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

const STATUS_DOT_TITLES: Record<string, string> = {
  present: '출근',
  late: '지각',
  half_day: '반차',
  absent: '결근',
  remote: '재택',
  vacation: '휴가',
}

type TeamTab = 'daily' | 'weekly' | 'monthly' | 'individual'

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
  const isManager = user?.is_ceo || user?.is_admin || user?.is_attendance_admin

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

        {/* Monthly records table */}
        <div className="border-t">
          <div className="px-4 py-2 bg-gray-50 border-b">
            <h4 className="text-sm font-medium text-gray-700">일자별 출퇴근 기록</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">날짜</th>
                  <th className="text-left px-4 py-2 font-medium">요일</th>
                  <th className="text-left px-4 py-2 font-medium">출근</th>
                  <th className="text-left px-4 py-2 font-medium">퇴근</th>
                  <th className="text-left px-4 py-2 font-medium">근무시간</th>
                  <th className="text-left px-4 py-2 font-medium">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(() => {
                  const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토']
                  const daysCount = currentMonth.daysInMonth()
                  const rows = []
                  for (let d = 1; d <= daysCount; d++) {
                    const date = currentMonth.date(d)
                    const dateStr = date.format('YYYY-MM-DD')
                    const dow = date.day()
                    const record = monthRecords.find(r => r.date === dateStr)
                    const isWeekend = dow === 0 || dow === 6
                    const isFuture = date.isAfter(dayjs(), 'day')

                    if (isFuture && !record) continue // skip future without records

                    rows.push(
                      <tr key={dateStr} className={`${isWeekend ? 'bg-gray-50/50' : ''} hover:bg-gray-50`}>
                        <td className="px-4 py-1.5 text-gray-700">{date.format('MM/DD')}</td>
                        <td className={`px-4 py-1.5 ${dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-gray-500'}`}>{daysOfWeek[dow]}</td>
                        <td className="px-4 py-1.5 font-mono text-gray-800">{record ? formatTime(record.clock_in) : <span className="text-gray-300">-</span>}</td>
                        <td className="px-4 py-1.5 font-mono text-gray-800">{record ? formatTime(record.clock_out) : <span className="text-gray-300">-</span>}</td>
                        <td className="px-4 py-1.5 text-gray-600">{record ? calcWorkHours(record.clock_in, record.clock_out) : '-'}</td>
                        <td className="px-4 py-1.5">
                          {record ? (
                            <span className={`inline-flex items-center gap-1 text-xs`}>
                              <span className={`w-2 h-2 rounded-full ${CALENDAR_DOT_COLORS[record.status] || 'bg-gray-400'}`} />
                              {STATUS_LABELS[record.status] || record.status}
                            </span>
                          ) : (
                            !isWeekend && !isFuture ? <span className="text-xs text-gray-300">미출근</span> : null
                          )}
                        </td>
                      </tr>
                    )
                  }
                  return rows.length > 0 ? rows : (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">기록이 없습니다</td></tr>
                  )
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Team Attendance Section (Enhanced Admin View)
// ──────────────────────────────────────────────────────────────
function TeamAttendanceSection({ currentDeptId }: { currentDeptId: string | null }) {
  const { organization } = useAuthStore()
  const [activeTab, setActiveTab] = useState<TeamTab>('daily')
  const [departments, setDepartments] = useState<DeptOption[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [selectedDeptId, setSelectedDeptId] = useState(currentDeptId || '')

  useEffect(() => {
    deptApi.list().then(res => setDepartments(res.departments as DeptOption[])).catch(() => {})
    attendanceApi.teamMembers().then(res => setMembers(res.members)).catch(() => {})
  }, [])

  useEffect(() => {
    setSelectedDeptId(currentDeptId || '')
  }, [currentDeptId])

  const filteredMembers = useMemo(() => {
    if (!selectedDeptId) return members
    return members.filter(m => m.departments.some(d => d.id === selectedDeptId))
  }, [members, selectedDeptId])

  const tabs: { key: TeamTab; label: string; icon: React.ReactNode }[] = [
    { key: 'daily', label: '일별 현황', icon: <Calendar size={14} /> },
    { key: 'weekly', label: '주간 현황', icon: <Calendar size={14} /> },
    { key: 'monthly', label: '월간 현황', icon: <Calendar size={14} /> },
    { key: 'individual', label: '개인별 현황', icon: <User size={14} /> },
  ]

  const deptSelector = (
    <select
      value={selectedDeptId}
      onChange={e => setSelectedDeptId(e.target.value)}
      className="border rounded-lg px-3 py-1.5 text-sm"
    >
      {(() => {
        const root = departments.find((d: DeptOption) => !(d as any).parent_id)
        const children = departments.filter((d: DeptOption) => (d as any).parent_id)
        return <>
          <option value="">{root?.name || organization?.name || '전체'}</option>
          {children.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </>
      })()}
    </select>
  )

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Users size={18} /> 팀 근태 현황
          </h3>
          {deptSelector}
        </div>
        <div className="flex gap-1 mt-3">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'daily' && (
        <DailyView members={filteredMembers} selectedDeptId={selectedDeptId} />
      )}
      {activeTab === 'weekly' && (
        <WeeklyView members={filteredMembers} />
      )}
      {activeTab === 'monthly' && (
        <MonthlyView members={filteredMembers} />
      )}
      {activeTab === 'individual' && (
        <IndividualView members={filteredMembers} />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Tab 1: Daily View
// ──────────────────────────────────────────────────────────────
function DailyView({ members, selectedDeptId }: { members: TeamMember[]; selectedDeptId: string }) {
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [records, setRecords] = useState<AttendanceRecord[]>([])

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

  useEffect(() => { loadTeam() }, [loadTeam])

  // Build rows: merge members with records, show un-clocked members as "미출근"
  const rows = useMemo(() => {
    const recordMap = new Map<string, AttendanceRecord>()
    records.forEach(r => recordMap.set(r.user_id, r))

    return members
      .map(m => ({
        member: m,
        record: recordMap.get(m.id) || null,
        deptName: m.departments.map(d => d.name).join(', ') || '-',
      }))
      .sort((a, b) => {
        // Sort by department name, then by member name
        const deptCmp = a.deptName.localeCompare(b.deptName)
        if (deptCmp !== 0) return deptCmp
        return a.member.name.localeCompare(b.member.name)
      })
  }, [members, records])

  return (
    <div>
      <div className="px-4 py-2 bg-gray-50 border-b flex items-center gap-3">
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm"
        />
        <span className="text-xs text-gray-500">
          {rows.filter(r => r.record).length}/{rows.length}명 출근
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">이름</th>
              <th className="text-left px-4 py-2 font-medium">직급</th>
              <th className="text-left px-4 py-2 font-medium">부서</th>
              <th className="text-left px-4 py-2 font-medium">출근</th>
              <th className="text-left px-4 py-2 font-medium">퇴근</th>
              <th className="text-left px-4 py-2 font-medium">근무시간</th>
              <th className="text-left px-4 py-2 font-medium">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">멤버가 없습니다</td>
              </tr>
            ) : rows.map(({ member, record, deptName }) => (
              <tr key={member.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">{member.name}</td>
                <td className="px-4 py-2 text-gray-600 text-xs">{member.position_name || '-'}</td>
                <td className="px-4 py-2 text-gray-600 text-xs">{deptName}</td>
                <td className="px-4 py-2 text-gray-600">{record ? formatTime(record.clock_in) : '-'}</td>
                <td className="px-4 py-2 text-gray-600">{record ? formatTime(record.clock_out) : '-'}</td>
                <td className="px-4 py-2 text-gray-600">{record ? calcWorkHours(record.clock_in, record.clock_out) : '-'}</td>
                <td className="px-4 py-2">
                  {record ? (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[record.status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[record.status] || record.status}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">미출근</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Tab 2: Weekly View
// ──────────────────────────────────────────────────────────────
function WeeklyView({ members }: { members: TeamMember[] }) {
  const [weekStart, setWeekStart] = useState(() => dayjs().startOf('week'))
  const [records, setRecords] = useState<AttendanceRecord[]>([])

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'))
  }, [weekStart])

  const loadWeekRecords = useCallback(async () => {
    const month1 = weekStart.format('YYYY-MM')
    const month2 = weekStart.add(6, 'day').format('YYYY-MM')
    try {
      const res1 = await attendanceApi.teamMonthly(month1)
      let allRecords = res1.records
      if (month2 !== month1) {
        const res2 = await attendanceApi.teamMonthly(month2)
        allRecords = [...allRecords, ...res2.records]
      }
      // Filter to this week only
      const startStr = weekStart.format('YYYY-MM-DD')
      const endStr = weekStart.add(6, 'day').format('YYYY-MM-DD')
      setRecords(allRecords.filter(r => r.date >= startStr && r.date <= endStr))
    } catch {
      // ignore
    }
  }, [weekStart])

  useEffect(() => { loadWeekRecords() }, [loadWeekRecords])

  // Build record lookup: userId -> date -> record
  const recordMap = useMemo(() => {
    const map = new Map<string, Map<string, AttendanceRecord>>()
    records.forEach(r => {
      if (!map.has(r.user_id)) map.set(r.user_id, new Map())
      map.get(r.user_id)!.set(r.date, r)
    })
    return map
  }, [records])

  const dayLabels = ['일', '월', '화', '수', '목', '금', '토']

  // Daily attendance count
  const dailyCounts = useMemo(() => {
    return weekDays.map(day => {
      const dateStr = day.format('YYYY-MM-DD')
      let count = 0
      records.forEach(r => { if (r.date === dateStr) count++ })
      return count
    })
  }, [weekDays, records])

  return (
    <div>
      <div className="px-4 py-2 bg-gray-50 border-b flex items-center gap-3">
        <button onClick={() => setWeekStart(w => w.subtract(7, 'day'))} className="p-1 hover:bg-gray-200 rounded">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium min-w-[180px] text-center">
          {weekStart.format('YYYY.MM.DD')} ~ {weekStart.add(6, 'day').format('MM.DD')}
        </span>
        <button onClick={() => setWeekStart(w => w.add(7, 'day'))} className="p-1 hover:bg-gray-200 rounded">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-gray-50 border-b text-xs">
        {Object.entries(CALENDAR_DOT_COLORS).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            {STATUS_LABELS[status]}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-300" />
          미출근
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium sticky left-0 bg-gray-50 min-w-[140px]">이름 (부서)</th>
              {weekDays.map((day, i) => (
                <th key={i} className="text-center px-2 py-2 font-medium min-w-[60px]">
                  <div>{dayLabels[day.day()]}</div>
                  <div className="text-[10px] text-gray-400 font-normal">{day.format('M/D')}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">멤버가 없습니다</td>
              </tr>
            ) : members.map(member => {
              const memberRecords = recordMap.get(member.id)
              const deptName = member.departments.map(d => d.name).join(', ')
              return (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 sticky left-0 bg-white">
                    <div className="font-medium text-gray-900 text-xs">{member.name}</div>
                    <div className="text-[10px] text-gray-400">{deptName || '-'}</div>
                  </td>
                  {weekDays.map((day, i) => {
                    const dateStr = day.format('YYYY-MM-DD')
                    const record = memberRecords?.get(dateStr)
                    return (
                      <td key={i} className="text-center px-2 py-2">
                        {record ? (
                          <span
                            className={`inline-block w-3 h-3 rounded-full ${CALENDAR_DOT_COLORS[record.status] || 'bg-gray-400'}`}
                            title={`${STATUS_DOT_TITLES[record.status] || record.status} ${formatTime(record.clock_in)}~${formatTime(record.clock_out)}`}
                          />
                        ) : (
                          <span className="inline-block w-3 h-3 rounded-full bg-gray-200" title="미출근" />
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {/* Summary row */}
            <tr className="bg-gray-50 font-medium">
              <td className="px-4 py-2 text-xs text-gray-600 sticky left-0 bg-gray-50">출근 인원</td>
              {dailyCounts.map((count, i) => (
                <td key={i} className="text-center px-2 py-2 text-xs text-gray-600">{count}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Tab 3: Monthly View
// ──────────────────────────────────────────────────────────────
function MonthlyView({ members }: { members: TeamMember[] }) {
  const [currentMonth, setCurrentMonth] = useState(dayjs())
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [stats, setStats] = useState<StatRow[]>([])

  const monthStr = currentMonth.format('YYYY-MM')
  const daysCount = currentMonth.daysInMonth()
  const dayNumbers = useMemo(() => Array.from({ length: daysCount }, (_, i) => i + 1), [daysCount])

  const loadData = useCallback(async () => {
    try {
      const [recordsRes, statsRes] = await Promise.all([
        attendanceApi.teamMonthly(monthStr),
        attendanceApi.stats({ month: monthStr }),
      ])
      setRecords(recordsRes.records)
      setStats(Array.isArray(statsRes.stats) ? statsRes.stats : [])
    } catch {
      // ignore
    }
  }, [monthStr])

  useEffect(() => { loadData() }, [loadData])

  // Build record lookup: userId -> date -> record
  const recordMap = useMemo(() => {
    const map = new Map<string, Map<string, AttendanceRecord>>()
    records.forEach(r => {
      if (!map.has(r.user_id)) map.set(r.user_id, new Map())
      map.get(r.user_id)!.set(r.date, r)
    })
    return map
  }, [records])

  const statsMap = useMemo(() => {
    const map = new Map<string, StatRow>()
    stats.forEach(s => map.set(s.user_id, s))
    return map
  }, [stats])

  return (
    <div>
      <div className="px-4 py-2 bg-gray-50 border-b flex items-center gap-3">
        <button onClick={() => setCurrentMonth(m => m.subtract(1, 'month'))} className="p-1 hover:bg-gray-200 rounded">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium min-w-[100px] text-center">{currentMonth.format('YYYY년 M월')}</span>
        <button onClick={() => setCurrentMonth(m => m.add(1, 'month'))} className="p-1 hover:bg-gray-200 rounded">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-gray-50 border-b text-xs">
        {Object.entries(CALENDAR_DOT_COLORS).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            {STATUS_LABELS[status]}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium sticky left-0 bg-gray-50 min-w-[120px] text-xs">이름</th>
              {dayNumbers.map(d => (
                <th key={d} className="text-center px-0.5 py-2 font-medium min-w-[22px]">{d}</th>
              ))}
              <th className="text-center px-2 py-2 font-medium bg-green-50 text-green-700 min-w-[28px]" title="출근">출</th>
              <th className="text-center px-2 py-2 font-medium bg-yellow-50 text-yellow-700 min-w-[28px]" title="지각">지</th>
              <th className="text-center px-2 py-2 font-medium bg-red-50 text-red-700 min-w-[28px]" title="결근">결</th>
              <th className="text-center px-2 py-2 font-medium bg-purple-50 text-purple-700 min-w-[28px]" title="휴가">휴</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.length === 0 ? (
              <tr>
                <td colSpan={daysCount + 5} className="px-4 py-8 text-center text-gray-400">멤버가 없습니다</td>
              </tr>
            ) : members.map(member => {
              const memberRecords = recordMap.get(member.id)
              const memberStats = statsMap.get(member.id)
              return (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 sticky left-0 bg-white text-xs">
                    <div className="font-medium text-gray-900 truncate max-w-[110px]">{member.name}</div>
                  </td>
                  {dayNumbers.map(d => {
                    const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`
                    const record = memberRecords?.get(dateStr)
                    return (
                      <td key={d} className="text-center px-0.5 py-1.5">
                        {record ? (
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${CALENDAR_DOT_COLORS[record.status] || 'bg-gray-400'}`}
                            title={`${d}일: ${STATUS_DOT_TITLES[record.status] || record.status}`}
                          />
                        ) : null}
                      </td>
                    )
                  })}
                  <td className="text-center px-2 py-1.5 text-green-700 font-medium">{memberStats?.present_count || 0}</td>
                  <td className="text-center px-2 py-1.5 text-yellow-700 font-medium">{memberStats?.late_count || 0}</td>
                  <td className="text-center px-2 py-1.5 text-red-700 font-medium">{memberStats?.absent_count || 0}</td>
                  <td className="text-center px-2 py-1.5 text-purple-700 font-medium">{(memberStats?.vacation_count || 0) + (memberStats?.half_day_count || 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Tab 4: Individual View
// ──────────────────────────────────────────────────────────────
function IndividualView({ members }: { members: TeamMember[] }) {
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [currentMonth, setCurrentMonth] = useState(dayjs())
  const [records, setRecords] = useState<AttendanceRecord[]>([])

  // Auto-select first member
  useEffect(() => {
    if (members.length > 0 && !selectedMemberId) {
      setSelectedMemberId(members[0].id)
    }
  }, [members, selectedMemberId])

  const monthStr = currentMonth.format('YYYY-MM')

  const loadRecords = useCallback(async () => {
    if (!selectedMemberId) return
    try {
      const res = await attendanceApi.teamMonthly(monthStr)
      setRecords(res.records.filter((r: AttendanceRecord) => r.user_id === selectedMemberId))
    } catch {
      // ignore
    }
  }, [selectedMemberId, monthStr])

  useEffect(() => { loadRecords() }, [loadRecords])

  const selectedMember = members.find(m => m.id === selectedMemberId)

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
    return records.find(r => r.date === dayStr)
  }

  // Summary stats
  const summary = useMemo(() => {
    const counts: Record<string, number> = {
      present: 0, late: 0, absent: 0, remote: 0, vacation: 0, half_day: 0,
    }
    records.forEach(r => {
      if (counts[r.status] !== undefined) counts[r.status]++
    })
    return counts
  }, [records])

  return (
    <div>
      <div className="px-4 py-2 bg-gray-50 border-b flex items-center gap-3 flex-wrap">
        <select
          value={selectedMemberId}
          onChange={e => setSelectedMemberId(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">멤버 선택</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {m.name} {m.departments.length > 0 ? `(${m.departments.map(d => d.name).join(', ')})` : ''}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentMonth(m => m.subtract(1, 'month'))} className="p-1 hover:bg-gray-200 rounded">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium min-w-[100px] text-center">{currentMonth.format('YYYY년 M월')}</span>
          <button onClick={() => setCurrentMonth(m => m.add(1, 'month'))} className="p-1 hover:bg-gray-200 rounded">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {selectedMember && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 p-4 border-b">
            {Object.entries(STATUS_LABELS).map(([status, label]) => (
              <div key={status} className={`rounded-lg p-2 text-center ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                <div className="text-lg font-bold">{summary[status] || 0}</div>
                <div className="text-[10px]">{label}</div>
              </div>
            ))}
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

          {/* Calendar */}
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
        </>
      )}

      {!selectedMember && (
        <div className="px-4 py-12 text-center text-gray-400 text-sm">
          멤버를 선택해주세요
        </div>
      )}
    </div>
  )
}
