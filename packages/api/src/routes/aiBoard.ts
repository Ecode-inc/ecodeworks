import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/id'
import { createNotification, notifyOrg } from '../lib/notify'

type Variables = { user: AuthUser }

export const aiBoardRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

aiBoardRoutes.use('/*', authMiddleware)

// ──────────────────────────────────────────────────────────────
// GET / - List posts (paginated, newest first)
// ──────────────────────────────────────────────────────────────
aiBoardRoutes.get('/', async (c) => {
  const user = c.get('user')
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100)
  const offset = parseInt(c.req.query('offset') || '0')

  const { results: posts } = await c.env.DB.prepare(
    `SELECT p.*,
       (SELECT COUNT(*) FROM ai_board_comments c WHERE c.post_id = p.id) as comment_count,
       (SELECT COUNT(*) FROM ai_board_likes l WHERE l.post_id = p.id AND l.user_id = ?) as liked
     FROM ai_board_posts p
     WHERE p.org_id = ? AND (p.is_private = 0 OR p.user_id = ? OR p.is_ai = 1)
     ORDER BY p.pinned DESC, p.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(user.id, user.org_id, user.id, limit, offset).all()

  const total = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM ai_board_posts WHERE org_id = ?'
  ).bind(user.org_id).first<{ cnt: number }>()

  return c.json({ posts, total: total?.cnt || 0 })
})

// ──────────────────────────────────────────────────────────────
// GET /:id - Get single post with all comments
// ──────────────────────────────────────────────────────────────
aiBoardRoutes.get('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const post = await c.env.DB.prepare(
    `SELECT p.*,
       (SELECT COUNT(*) FROM ai_board_comments c WHERE c.post_id = p.id) as comment_count,
       (SELECT COUNT(*) FROM ai_board_likes l WHERE l.post_id = p.id AND l.user_id = ?) as liked
     FROM ai_board_posts p
     WHERE p.id = ? AND p.org_id = ?`
  ).bind(user.id, id, user.org_id).first()

  if (!post) return c.json({ error: '게시글을 찾을 수 없습니다' }, 404)

  // Increment view count
  await c.env.DB.prepare('UPDATE ai_board_posts SET views = views + 1 WHERE id = ?').bind(id).run()

  const { results: comments } = await c.env.DB.prepare(
    'SELECT * FROM ai_board_comments WHERE post_id = ? AND org_id = ? ORDER BY created_at ASC'
  ).bind(id, user.org_id).all()

  return c.json({ post, comments })
})

// ──────────────────────────────────────────────────────────────
// POST / - Create post
// ──────────────────────────────────────────────────────────────
aiBoardRoutes.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ title: string; content: string; tags?: string[]; is_private?: boolean }>()

  if (!body.title || !body.content) {
    return c.json({ error: 'title과 content는 필수입니다' }, 400)
  }

  const tags = JSON.stringify(body.tags || [])
  const isPrivate = body.is_private ? 1 : 0

  // Get user's position for display
  const userInfo = await c.env.DB.prepare(
    'SELECT u.name, p.name as position_name FROM users u LEFT JOIN positions p ON p.id = u.position_id WHERE u.id = ?'
  ).bind(user.id).first<{ name: string; position_name: string | null }>()
  const authorName = userInfo?.position_name ? `${userInfo.name} ${userInfo.position_name}` : user.name

  const id = generateId()
  await c.env.DB.prepare(
    `INSERT INTO ai_board_posts (id, org_id, user_id, author_name, is_ai, title, content, tags, is_private)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`
  ).bind(id, user.org_id, user.id, authorName, body.title, body.content, tags, isPrivate).run()

  const post = await c.env.DB.prepare('SELECT * FROM ai_board_posts WHERE id = ?').bind(id).first()

  // Notify all org users about new post
  try {
    await notifyOrg(c.env.DB, user.org_id, user.id, 'board_post', `새 게시글: ${body.title}`, `${user.name}님이 게시글을 작성했습니다`, '/ai#board')
  } catch { /* ignore notification errors */ }

  return c.json({ post }, 201)
})

// ──────────────────────────────────────────────────────────────
// POST /:id/comments - Add comment
// ──────────────────────────────────────────────────────────────
aiBoardRoutes.post('/:id/comments', async (c) => {
  const user = c.get('user')
  const postId = c.req.param('id')
  const body = await c.req.json<{ content: string }>()

  if (!body.content) {
    return c.json({ error: 'content는 필수입니다' }, 400)
  }

  // Verify post exists
  const post = await c.env.DB.prepare(
    'SELECT id, user_id, title FROM ai_board_posts WHERE id = ? AND org_id = ?'
  ).bind(postId, user.org_id).first<{ id: string; user_id: string | null; title: string }>()

  if (!post) return c.json({ error: '게시글을 찾을 수 없습니다' }, 404)

  // Get user's position for display
  const commentUserInfo = await c.env.DB.prepare(
    'SELECT u.name, p.name as position_name FROM users u LEFT JOIN positions p ON p.id = u.position_id WHERE u.id = ?'
  ).bind(user.id).first<{ name: string; position_name: string | null }>()
  const commentAuthorName = commentUserInfo?.position_name ? `${commentUserInfo.name} ${commentUserInfo.position_name}` : user.name

  const id = generateId()
  await c.env.DB.prepare(
    `INSERT INTO ai_board_comments (id, post_id, org_id, user_id, author_name, is_ai, content)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).bind(id, postId, user.org_id, user.id, commentAuthorName, body.content).run()

  // Update post's updated_at
  await c.env.DB.prepare(
    "UPDATE ai_board_posts SET updated_at = datetime('now') WHERE id = ?"
  ).bind(postId).run()

  // Notify post author about new comment (if different from commenter)
  try {
    if (post.user_id && post.user_id !== user.id) {
      await createNotification(c.env.DB, user.org_id, post.user_id, 'board_comment', '새 댓글', `${user.name}님이 "${post.title}" 글에 댓글을 달았습니다`, '/ai#board')
    }
  } catch { /* ignore notification errors */ }

  const comment = await c.env.DB.prepare('SELECT * FROM ai_board_comments WHERE id = ?').bind(id).first()
  return c.json({ comment }, 201)
})

// ──────────────────────────────────────────────────────────────
// PATCH /:id - Update post (CEO/admin only)
// ──────────────────────────────────────────────────────────────
aiBoardRoutes.patch('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  if (!user.is_ceo && !user.is_admin) return c.json({ error: '권한 없음' }, 403)

  const body = await c.req.json<{ title?: string; content?: string; tags?: string[] }>()
  const updates: string[] = []
  const values: unknown[] = []
  if (body.title !== undefined) { updates.push('title = ?'); values.push(body.title) }
  if (body.content !== undefined) { updates.push('content = ?'); values.push(body.content) }
  if (body.tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(body.tags)) }
  if (updates.length === 0) return c.json({ error: '수정할 내용이 없습니다' }, 400)
  updates.push("updated_at = datetime('now')")
  values.push(id, user.org_id)

  await c.env.DB.prepare(`UPDATE ai_board_posts SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`).bind(...values).run()
  const post = await c.env.DB.prepare('SELECT * FROM ai_board_posts WHERE id = ?').bind(id).first()
  return c.json({ post })
})

// PATCH /comments/:commentId - Update comment (CEO/admin only)
aiBoardRoutes.patch('/comments/:commentId', async (c) => {
  const user = c.get('user')
  if (!user.is_ceo && !user.is_admin) return c.json({ error: '권한 없음' }, 403)
  const commentId = c.req.param('commentId')
  const body = await c.req.json<{ content: string }>()
  await c.env.DB.prepare('UPDATE ai_board_comments SET content = ? WHERE id = ? AND org_id = ?').bind(body.content, commentId, user.org_id).run()
  return c.json({ success: true })
})

// ──────────────────────────────────────────────────────────────
// DELETE /:id - Delete post (only creator, CEO, or admin)
// ──────────────────────────────────────────────────────────────
aiBoardRoutes.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const post = await c.env.DB.prepare(
    'SELECT * FROM ai_board_posts WHERE id = ? AND org_id = ?'
  ).bind(id, user.org_id).first<{ user_id: string }>()

  if (!post) return c.json({ error: '게시글을 찾을 수 없습니다' }, 404)

  if (post.user_id !== user.id && !user.is_ceo && !user.is_admin) {
    return c.json({ error: '삭제 권한이 없습니다' }, 403)
  }

  // Delete comments first, then the post
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM ai_board_comments WHERE post_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM ai_board_posts WHERE id = ?').bind(id),
  ])

  return c.json({ success: true })
})

// ──────────────────────────────────────────────────────────────
// DELETE /comments/:commentId - Delete comment (only creator, CEO, or admin)
// ──────────────────────────────────────────────────────────────
aiBoardRoutes.delete('/comments/:commentId', async (c) => {
  const user = c.get('user')
  const commentId = c.req.param('commentId')

  const comment = await c.env.DB.prepare(
    'SELECT * FROM ai_board_comments WHERE id = ? AND org_id = ?'
  ).bind(commentId, user.org_id).first<{ user_id: string }>()

  if (!comment) return c.json({ error: '댓글을 찾을 수 없습니다' }, 404)

  if (comment.user_id !== user.id && !user.is_ceo && !user.is_admin) {
    return c.json({ error: '삭제 권한이 없습니다' }, 403)
  }

  await c.env.DB.prepare('DELETE FROM ai_board_comments WHERE id = ?').bind(commentId).run()

  return c.json({ success: true })
})

// ──────────────────────────────────────────────────────────────
// POST /:id/like - Increment likes count
// ──────────────────────────────────────────────────────────────
aiBoardRoutes.post('/:id/like', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const post = await c.env.DB.prepare(
    'SELECT id FROM ai_board_posts WHERE id = ? AND org_id = ?'
  ).bind(id, user.org_id).first()

  if (!post) return c.json({ error: '게시글을 찾을 수 없습니다' }, 404)

  // Check if already liked
  const existing = await c.env.DB.prepare(
    'SELECT post_id FROM ai_board_likes WHERE post_id = ? AND user_id = ?'
  ).bind(id, user.id).first()

  if (existing) {
    // Unlike
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM ai_board_likes WHERE post_id = ? AND user_id = ?').bind(id, user.id),
      c.env.DB.prepare('UPDATE ai_board_posts SET likes = MAX(0, likes - 1) WHERE id = ?').bind(id),
    ])
  } else {
    // Like
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO ai_board_likes (post_id, user_id) VALUES (?, ?)').bind(id, user.id),
      c.env.DB.prepare('UPDATE ai_board_posts SET likes = likes + 1 WHERE id = ?').bind(id),
    ])
  }

  const updated = await c.env.DB.prepare('SELECT likes FROM ai_board_posts WHERE id = ?').bind(id).first<{ likes: number }>()

  return c.json({ likes: updated?.likes || 0, liked: !existing })
})
