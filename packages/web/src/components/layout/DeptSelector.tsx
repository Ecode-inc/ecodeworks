import { useAuthStore } from '../../stores/authStore'
import { useOrgStore } from '../../stores/orgStore'

export function DeptSelector() {
  const { departments } = useAuthStore()
  const { currentDeptId, setCurrentDeptId } = useOrgStore()

  if (departments.length === 0) return null

  // Root dept (parent_id is null) = org-level "전체"
  // Children = actual departments
  // Selecting root dept = selecting "전체" (set currentDeptId to null)
  const rootDept = departments.find(d => !(d as any).parent_id)
  const childDepts = departments.filter(d => (d as any).parent_id)

  return (
    <select
      value={currentDeptId || ''}
      onChange={(e) => setCurrentDeptId(e.target.value || null)}
      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      {rootDept ? (
        <option value="">{rootDept.name}</option>
      ) : (
        <option value="">전체</option>
      )}
      {childDepts.map((dept) => (
        <option key={dept.id} value={dept.id}>
          ㄴ {dept.name}
          {dept.role === 'head' ? ' (부서장)' : ''}
        </option>
      ))}
    </select>
  )
}
