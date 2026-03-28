import { useState, useEffect, useCallback } from 'react'
import { Bot, MessageSquare, Heart, Trash2, Send, Plus, ArrowLeft, Clock, Eye, Lock, Share2 } from 'lucide-react'
import { aiBoardApi, membersApi } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'

interface Post {
  id: string
  title: string
  content: string
  author_id: string
  author_name: string
  is_ai: number
  likes: number
  liked: number
  comment_count: number
  created_at: string
  updated_at: string
}

interface Comment {
  id: string
  post_id: string
  content: string
  author_id: string
  author_name: string
  is_ai: number
  created_at: string
}

export function AIBoardPage() {
  const user = useAuthStore((s) => s.user)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentLoading, setCommentLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newTags, setNewTags] = useState('')
  const [newPrivate, setNewPrivate] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [creating, setCreating] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)
  const [memberNames, setMemberNames] = useState<string[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const PAGE_SIZE = 20

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true)
      const res = await aiBoardApi.list({ limit: PAGE_SIZE })
      setPosts(res.posts || [])
      setHasMore((res.posts || []).length >= PAGE_SIZE)
    } catch (err) {
      console.error('게시글 로딩 실패:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const res = await aiBoardApi.list({ limit: PAGE_SIZE, offset: posts.length })
      setPosts(prev => [...prev, ...(res.posts || [])])
      setHasMore((res.posts || []).length >= PAGE_SIZE)
    } catch { /* ignore */ }
    setLoadingMore(false)
  }

  useEffect(() => {
    fetchPosts()
    // Load member names for mention highlighting
    membersApi.list().then(res => {
      setMemberNames((res.members || []).map((m: any) => m.name))
    }).catch(() => {})
    // Restore selected post from URL hash
    const hash = window.location.hash
    const postMatch = hash.match(/#board\/(.+)/)
    if (postMatch) {
      aiBoardApi.get(postMatch[1]).then(res => {
        setSelectedPost(res.post)
        setComments(res.comments || [])
      }).catch(() => {})
    }
  }, [fetchPosts])

  const openPost = async (post: Post) => {
    setSelectedPost(post)
    window.location.hash = `board/${post.id}`
    setCommentLoading(true)
    try {
      const res = await aiBoardApi.get(post.id)
      setSelectedPost(res.post)
      setComments(res.comments || [])
    } catch (err) {
      console.error('게시글 조회 실패:', err)
    } finally {
      setCommentLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newTitle.trim() || !newContent.trim()) return
    setCreating(true)
    try {
      const tags = newTags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)
      await aiBoardApi.create({ title: newTitle.trim(), content: newContent.trim(), tags, is_private: newPrivate })
      setNewTitle('')
      setNewContent('')
      setNewTags('')
      setNewPrivate(false)
      setShowCreateModal(false)
      fetchPosts()
    } catch (err) {
      console.error('글 작성 실패:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleComment = async () => {
    if (!selectedPost || !commentText.trim()) return
    setSubmittingComment(true)
    try {
      const res = await aiBoardApi.comment(selectedPost.id, commentText.trim())
      setComments((prev) => [...prev, res.comment])
      setCommentText('')
      // Update comment count in the selected post
      setSelectedPost((prev) => prev ? { ...prev, comment_count: (prev.comment_count || 0) + 1 } : null)
      // Also update in list
      setPosts((prev) => prev.map((p) => p.id === selectedPost.id ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p))
    } catch (err) {
      console.error('댓글 작성 실패:', err)
    } finally {
      setSubmittingComment(false)
    }
  }

  const handleLike = async (post: Post, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      const res = await aiBoardApi.like(post.id) as { likes: number; liked: boolean }
      const newLikes = res.likes
      const newLiked = res.liked ? 1 : 0
      setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, likes: newLikes, liked: newLiked } : p))
      if (selectedPost?.id === post.id) {
        setSelectedPost((prev) => prev ? { ...prev, likes: newLikes, liked: newLiked } : null)
      }
    } catch (err) {
      console.error('좋아요 실패:', err)
    }
  }

  const handleDelete = async (postId: string) => {
    if (!confirm('게시글을 삭제하시겠습니까?')) return
    try {
      await aiBoardApi.delete(postId)
      if (selectedPost?.id === postId) {
        setSelectedPost(null)
        setComments([])
      }
      setPosts((prev) => prev.filter((p) => p.id !== postId))
    } catch (err) {
      console.error('삭제 실패:', err)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return
    try {
      await aiBoardApi.deleteComment(commentId)
      setComments((prev) => prev.filter((c) => c.id !== commentId))
      if (selectedPost) {
        setSelectedPost((prev) => prev ? { ...prev, comment_count: Math.max(0, (prev.comment_count || 0) - 1) } : null)
        setPosts((prev) => prev.map((p) => p.id === selectedPost.id ? { ...p, comment_count: Math.max(0, (p.comment_count || 0) - 1) } : p))
      }
    } catch (err) {
      console.error('댓글 삭제 실패:', err)
    }
  }

  const canDelete = (authorId: string) => {
    return user?.id === authorId || user?.is_ceo || user?.is_admin
  }

  const knownNames = (() => {
    const names = new Set<string>(memberNames)
    posts.forEach(p => { if (!p.is_ai && p.author_name) names.add(p.author_name.split(' ')[0]) })
    return Array.from(names).filter(n => n.length >= 2)
  })()

  const highlightMentions = (text: string) => {
    if (!text || knownNames.length === 0) return text
    const escaped = knownNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const regex = new RegExp(`(@?(?:${escaped.join('|')}))`, 'g')
    const parts = text.split(regex)
    return parts.map((part, i) => {
      if (regex.test(part)) {
        regex.lastIndex = 0
        return <span key={i} className="text-blue-600 font-semibold bg-blue-50 px-0.5 rounded">{part}</span>
      }
      regex.lastIndex = 0
      return part
    })
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return '방금 전'
    if (minutes < 60) return `${minutes}분 전`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}일 전`
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  // Post detail view
  if (selectedPost) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <button
          onClick={() => { setSelectedPost(null); setComments([]); window.location.hash = 'board' }}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4 text-sm"
        >
          <ArrowLeft size={16} />
          목록으로
        </button>

        <div className={`rounded-xl border p-6 mb-6 ${selectedPost.is_ai ? 'bg-blue-50 border-blue-200' : 'bg-white'}`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{selectedPost.title}</h1>
              <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                {selectedPost.is_ai ? (
                  <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                    <Bot size={14} />
                    {selectedPost.author_name}
                  </span>
                ) : (
                  <span className="font-medium text-gray-700">{selectedPost.author_name}</span>
                )}
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {formatDate(selectedPost.created_at)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleLike(selectedPost)}
                className={`flex items-center gap-1 transition-colors ${selectedPost.liked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
              >
                <Heart size={18} fill={selectedPost.liked ? 'currentColor' : 'none'} />
                <span className="text-sm">{selectedPost.likes || 0}</span>
              </button>
              <button
                onClick={() => {
                  const url = `https://work.e-code.kr/board/${selectedPost.id}`
                  navigator.clipboard.writeText(url)
                  useToastStore.getState().addToast('success', '링크 복사됨', url)
                }}
                className="text-gray-400 hover:text-blue-500 transition-colors"
                title="공유 링크 복사"
              >
                <Share2 size={18} />
              </button>
              {canDelete(selectedPost.author_id) && (
                <button
                  onClick={() => handleDelete(selectedPost.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </div>
          <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
            {highlightMentions(selectedPost.content)}
          </div>
        </div>

        {/* Comments */}
        <div className="space-y-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-600 flex items-center gap-1">
            <MessageSquare size={14} />
            댓글 {comments.length}개
          </h3>
          {commentLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">아직 댓글이 없습니다.</p>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className={`rounded-lg p-3 text-sm ${
                  c.is_ai
                    ? 'bg-blue-50 border-l-2 border-blue-400'
                    : 'bg-gray-50 border-l-2 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {c.is_ai ? (
                      <span className="inline-flex items-center gap-1 text-blue-600 font-medium text-xs">
                        <Bot size={12} />
                        {c.author_name}
                      </span>
                    ) : (
                      <span className="font-medium text-gray-700 text-xs">{c.author_name}</span>
                    )}
                    <span className="text-gray-400 text-xs">{formatDate(c.created_at)}</span>
                  </div>
                  {canDelete(c.author_id) && (
                    <button
                      onClick={() => handleDeleteComment(c.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <p className="text-gray-700 whitespace-pre-wrap">{highlightMentions(c.content)}</p>
              </div>
            ))
          )}
        </div>

        {/* Comment form */}
        <div className="flex gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment() } }}
            placeholder="댓글을 입력하세요..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <button
            onClick={handleComment}
            disabled={submittingComment || !commentText.trim()}
            className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    )
  }

  // Post list view
  return (
    <div className="max-w-3xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">AI 게시판</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm"
        >
          <Plus size={16} />
          글쓰기
        </button>
      </div>

      {/* Post list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <MessageSquare size={48} className="mx-auto mb-4 opacity-40" />
          <p className="text-lg">아직 게시글이 없습니다.</p>
          <p className="text-sm mt-1">첫 글을 작성해보세요!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              onClick={() => openPost(post)}
              className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition-shadow ${
                post.is_ai ? 'bg-blue-50 border-blue-200' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate flex items-center gap-1">{(post as any).is_private ? <Lock size={12} className="text-gray-400 flex-shrink-0" /> : null}{post.title}</h2>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{highlightMentions(post.content)}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    {post.is_ai ? (
                      <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                        <Bot size={12} />
                        {post.author_name}
                      </span>
                    ) : (
                      <span className="text-gray-600">{post.author_name}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatDate(post.created_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare size={10} />
                      {post.comment_count || 0}
                    </span>
                    <span className={`flex items-center gap-1 ${post.liked ? 'text-red-500' : ''}`}>
                      <Heart size={10} fill={post.liked ? 'currentColor' : 'none'} />
                      {post.likes || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye size={10} />
                      {(post as any).views || 0}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={(e) => handleLike(post, e)}
                    className={`p-1 transition-colors ${post.liked ? 'text-red-500' : 'text-gray-300 hover:text-red-500'}`}
                  >
                    <Heart size={16} fill={post.liked ? 'currentColor' : 'none'} />
                  </button>
                  {canDelete(post.author_id) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(post.id) }}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {hasMore && posts.length > 0 && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors mt-2"
            >
              {loadingMore ? '로딩 중...' : '더보기'}
            </button>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">새 글 작성</h2>
            <div className="space-y-3">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="제목"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                autoFocus
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="내용을 입력하세요..."
                rows={8}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              />
              <input
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="태그 (쉼표 구분: AI, 개발팁, 트렌드)"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={newPrivate} onChange={e => setNewPrivate(e.target.checked)} className="rounded" />
                비밀글 (AI만 읽고 답글 가능, 다른 사람에게 안 보임)
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowCreateModal(false); setNewTitle(''); setNewContent(''); setNewTags('') }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newTitle.trim() || !newContent.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {creating ? '등록 중...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
