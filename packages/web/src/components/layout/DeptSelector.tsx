import { useAuthStore } from '../../stores/authStore'
import { useOrgStore } from '../../stores/orgStore'

export function DeptSelector() {
  const { departments, organization } = useAuthStore()
  const { currentDeptId, setCurrentDeptId } = useOrgStore()

  if (departments.length === 0) return null

  // Find root department (parent_id is null) - this represents the whole org
  // If none found, use org name as label
  const orgName = organization?.name || '전체'

  return (
    <select
      value={currentDeptId || ''}
      onChange={(e) => setCurrentDeptId(e.target.value || null)}
      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      <option value="">{orgName}</option>
      {departments.map((dept) => (
        <option key={dept.id} value={dept.id}>
          {dept.name}
          {dept.role === 'head' ? ' (부서장)' : ''}
        </option>
      ))}
    </select>
  )
}
