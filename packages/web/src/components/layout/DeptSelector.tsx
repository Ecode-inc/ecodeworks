import { useAuthStore } from '../../stores/authStore'
import { useOrgStore } from '../../stores/orgStore'

export function DeptSelector() {
  const { departments } = useAuthStore()
  const { currentDeptId, setCurrentDeptId } = useOrgStore()

  if (departments.length === 0) return null

  return (
    <select
      value={currentDeptId || ''}
      onChange={(e) => setCurrentDeptId(e.target.value || null)}
      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      <option value="">전체 부서</option>
      {departments.map((dept) => (
        <option key={dept.id} value={dept.id}>
          {dept.name}
          {dept.role === 'head' ? ' (부서장)' : ''}
        </option>
      ))}
    </select>
  )
}
