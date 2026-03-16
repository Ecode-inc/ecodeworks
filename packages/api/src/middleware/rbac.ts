import { createMiddleware } from 'hono/factory'
import type { Env, AuthUser, Module, Permission } from '../types'

type Variables = { user: AuthUser }

const PERMISSION_LEVELS: Record<Permission, number> = {
  none: 0,
  read: 1,
  write: 2,
  admin: 3,
}

export function requirePermission(module: Module, requiredPermission: Permission) {
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(
    async (c, next) => {
      const user = c.get('user')
      const departmentId = c.req.query('dept_id') || c.req.param('dept_id')

      if (!departmentId) {
        return c.json({ error: 'dept_id is required' }, 400)
      }

      // CEO has read access to everything
      if (user.is_ceo && PERMISSION_LEVELS[requiredPermission] <= PERMISSION_LEVELS.read) {
        await next()
        return
      }

      // Check user's role in the department
      const membership = await c.env.DB.prepare(
        'SELECT role FROM user_departments WHERE user_id = ? AND department_id = ?'
      ).bind(user.id, departmentId).first<{ role: string }>()

      if (!membership) {
        return c.json({ error: 'Not a member of this department' }, 403)
      }

      // Department head has admin on all modules
      if (membership.role === 'head') {
        await next()
        return
      }

      // Check module-specific permission
      const perm = await c.env.DB.prepare(
        'SELECT permission FROM department_permissions WHERE department_id = ? AND module = ?'
      ).bind(departmentId, module).first<{ permission: Permission }>()

      const userLevel = PERMISSION_LEVELS[perm?.permission || 'none']
      const requiredLevel = PERMISSION_LEVELS[requiredPermission]

      if (userLevel < requiredLevel) {
        return c.json({ error: 'Insufficient permissions' }, 403)
      }

      await next()
    }
  )
}
