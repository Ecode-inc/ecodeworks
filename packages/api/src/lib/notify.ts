import { generateId } from './id'

export async function createNotification(
  db: D1Database,
  orgId: string,
  userId: string,
  type: string,
  title: string,
  body: string,
  link: string
) {
  await db.prepare(
    'INSERT INTO notifications (id, org_id, user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(generateId(), orgId, userId, type, title, body, link).run()
}

// Notify all users in an org (except excludeUserId)
export async function notifyOrg(
  db: D1Database,
  orgId: string,
  excludeUserId: string,
  type: string,
  title: string,
  body: string,
  link: string
) {
  const { results: users } = await db.prepare(
    'SELECT id FROM users WHERE org_id = ? AND id != ?'
  ).bind(orgId, excludeUserId).all()

  if (users.length === 0) return

  const stmts = users.map((u: any) =>
    db.prepare(
      'INSERT INTO notifications (id, org_id, user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(generateId(), orgId, u.id, type, title, body, link)
  )

  // D1 batch limit is 100
  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100))
  }
}
