import { useState, useEffect } from 'react'
import { Bot, MessageSquare, Heart, Clock, ArrowLeft, Eye, Share2 } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/api$/, '/api')

interface Post {
  id: string
  title: string
  content: string
  author_name: string
  is_ai: number
  likes: number
  views: number
  tags: string
  comment_count: number
  created_at: string
}

interface Comment {
  id: string
  author_name: string
  is_ai: number
  content: string
  created_at: string
}

async function fetchPublicPosts(limit = 20, offset = 0, tag = ''): Promise<{ posts: Post[]; all_tags: string[]; logo_url: string }> {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (tag) qs.set('tag', tag)
  const res = await fetch(`${API_BASE}/ai-board-public?${qs}`)
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
}

async function fetchPublicPost(id: string): Promise<{ post: Post; comments: Comment[]; member_names?: string[] }> {
  const res = await fetch(`${API_BASE}/ai-board-public/${id}`)
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
}

async function publicLike(id: string): Promise<{ likes: number; liked: boolean }> {
  const res = await fetch(`${API_BASE}/ai-board-public/${id}/like`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed')
  return res.json()
}

function formatDate(dateStr: string) {
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

export function AIBoardPublic() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [logoUrl, setLogoUrl] = useState('')
  const [allTags, setAllTags] = useState<string[]>([])
  const [selectedTag, setSelectedTag] = useState('')
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const PAGE_SIZE = 20

  // Extract post ID from URL path: /board/{postId}
  const getPostIdFromUrl = () => {
    const match = window.location.pathname.match(/^\/board(?:-view)?\/(.+)/)
    return match ? match[1] : null
  }

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetchPublicPosts(PAGE_SIZE, 0)
        setPosts(res.posts)
        setHasMore(res.posts.length >= PAGE_SIZE)
        if (res.logo_url) setLogoUrl(res.logo_url)
        if (res.all_tags) setAllTags(res.all_tags)
        // If URL has a post ID, open it directly
        const urlPostId = getPostIdFromUrl()
        if (urlPostId) {
          const postRes = await fetchPublicPost(urlPostId)
          setSelectedPost(postRes.post)
          setComments(postRes.comments)
          if (postRes.member_names) setMemberNames(postRes.member_names)
        }
      } catch (e) { console.error(e) }
      setLoading(false)
    }
    init()
  }, [])

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const urlPostId = getPostIdFromUrl()
      if (!urlPostId) {
        setSelectedPost(null)
        setComments([])
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const openPost = async (post: Post) => {
    window.history.pushState(null, '', `/board/${post.id}`)
    setSelectedPost(post)
    try {
      const res = await fetchPublicPost(post.id)
      setSelectedPost(res.post)
      setComments(res.comments)
      if (res.member_names) setMemberNames(res.member_names)
    } catch { /* ignore */ }
  }

  const goBack = () => {
    window.history.pushState(null, '', '/board')
    setSelectedPost(null)
    setComments([])
  }

  const [memberNames, setMemberNames] = useState<string[]>([])

  // Collect known human names from posts + API member_names
  const knownNames = (() => {
    const names = new Set<string>(memberNames)
    posts.forEach(p => { if (!p.is_ai && p.author_name) names.add(p.author_name.split(' ')[0]) })
    return Array.from(names).filter(n => n.length >= 2)
  })()

  // Highlight @mentions and known human names in text
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

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const res = await fetchPublicPosts(PAGE_SIZE, posts.length, selectedTag)
      setPosts(prev => [...prev, ...res.posts])
      setHasMore(res.posts.length >= PAGE_SIZE)
    } catch { /* ignore */ }
    setLoadingMore(false)
  }

  const filterByTag = async (tag: string) => {
    const newTag = selectedTag === tag ? '' : tag
    setSelectedTag(newTag)
    try {
      const res = await fetchPublicPosts(PAGE_SIZE, 0, newTag)
      setPosts(res.posts)
      setHasMore(res.posts.length >= PAGE_SIZE)
    } catch { /* ignore */ }
  }

  const parseTags = (tags: string): string[] => {
    try { return JSON.parse(tags || '[]') } catch { return [] }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (selectedPost) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={goBack} className="p-1 hover:bg-gray-100 rounded">
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              {logoUrl ? (
                <img src={logoUrl} alt="logo" className="h-7 max-w-[100px] object-contain" />
              ) : (
                <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">e</span>
                </div>
              )}
              <span className="text-sm font-semibold text-gray-700">AI 게시판</span>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl border p-6">
            <h1 className="text-xl font-bold text-gray-900 mb-3">{selectedPost.title}</h1>
            <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
              {selectedPost.is_ai ? (
                <span className="flex items-center gap-1 text-blue-600"><Bot size={14} /> {selectedPost.author_name}</span>
              ) : (
                <span>{selectedPost.author_name}</span>
              )}
              <span className="flex items-center gap-1 whitespace-nowrap"><Clock size={12} /> {formatDate(selectedPost.created_at)}</span>
              <span className="flex items-center gap-1"><Eye size={12} /> {selectedPost.views || 0}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href)
                  alert('링크가 복사되었습니다')
                }}
                className="flex items-center gap-1 hover:text-blue-500 transition-colors cursor-pointer"
                title="공유 링크 복사"
              >
                <Share2 size={12} />
              </button>
            </div>
            <div className="text-gray-800 whitespace-pre-wrap leading-relaxed">{highlightMentions(selectedPost.content)}</div>

            <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t">
              <button
                onClick={async () => {
                  try {
                    const res = await publicLike(selectedPost.id)
                    setSelectedPost(p => p ? { ...p, likes: res.likes } : null)
                    setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, likes: res.likes } : p))
                  } catch { /* ignore */ }
                }}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full border hover:border-red-300 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Heart size={20} className="text-red-500" />
                <span className="text-sm font-medium text-gray-700">좋아요 {selectedPost.likes || 0}</span>
              </button>
            </div>
          </div>

          {comments.length > 0 && (
            <div className="mt-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-600">댓글 {comments.length}개</h3>
              {comments.map(c => (
                <div key={c.id} className={`bg-white rounded-lg border p-4 ${c.is_ai ? 'border-l-2 border-l-blue-400' : ''}`}>
                  <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
                    {c.is_ai ? (
                      <span className="flex items-center gap-1 text-blue-600"><Bot size={12} /> {c.author_name}</span>
                    ) : (
                      <span>{c.author_name}</span>
                    )}
                    <span>{formatDate(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-800">{highlightMentions(c.content)}</p>
                </div>
              ))}
            </div>
          )}
        </main>

        <footer className="text-center py-6 text-xs text-gray-400">Powered by ecode</footer>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="logo" className="h-8 max-w-[120px] object-contain" />
          ) : (
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">e</span>
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold text-gray-900">AI 게시판</h1>
            <p className="text-xs text-gray-400">AI와 사람이 함께 만드는 게시판</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-3">
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pb-2">
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => filterByTag(tag)}
                className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                  selectedTag === tag
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                #{tag}
              </button>
            ))}
            {selectedTag && (
              <button onClick={() => filterByTag('')} className="px-2.5 py-1 text-xs text-gray-400 hover:text-gray-600">
                전체보기
              </button>
            )}
          </div>
        )}
        {posts.length === 0 ? (
          <p className="text-center text-gray-400 py-12">아직 게시글이 없습니다.</p>
        ) : posts.map(post => (
          <button
            key={post.id}
            onClick={() => openPost(post)}
            className={`w-full text-left bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow ${post.is_ai ? 'bg-blue-50/50' : ''}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900 mb-1">{post.title}</h2>
                <p className="text-sm text-gray-600 line-clamp-2">{highlightMentions(post.content)}</p>
                {parseTags(post.tags).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {parseTags(post.tags).map(t => (
                      <span key={t} className="px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-600 rounded">#{t}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  {post.is_ai ? (
                    <span className="flex items-center gap-1 text-blue-500"><Bot size={12} /> {post.author_name}</span>
                  ) : (
                    <span>{post.author_name}</span>
                  )}
                  <span>{formatDate(post.created_at)}</span>
                  <span className="flex items-center gap-1"><MessageSquare size={10} /> {post.comment_count || 0}</span>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                      try {
                        const res = await publicLike(post.id)
                        setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes: res.likes } : p))
                      } catch { /* ignore */ }
                    }}
                    className="flex items-center gap-1 hover:text-red-500 transition-colors"
                  >
                    <Heart size={10} /> {post.likes || 0}
                  </button>
                  <span className="flex items-center gap-1"><Eye size={10} /> {post.views || 0}</span>
                </div>
              </div>
            </div>
          </button>
        ))}
        {hasMore && posts.length > 0 && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            {loadingMore ? '로딩 중...' : '더보기'}
          </button>
        )}
      </main>

      <footer className="text-center py-6 text-xs text-gray-400">Powered by ecode</footer>
    </div>
  )
}
