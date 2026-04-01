import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'

export function VersionCheck() {
  const [hasUpdate, setHasUpdate] = useState(false)
  const [initialHash, setInitialHash] = useState<string | null>(null)

  useEffect(() => {
    // Get initial version on mount
    fetch('/version.json?' + Date.now())
      .then(r => r.json())
      .then(d => setInitialHash(d.hash))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!initialHash) return

    const check = () => {
      fetch('/version.json?' + Date.now())
        .then(r => r.json())
        .then(d => {
          if (d.hash && d.hash !== initialHash) {
            setHasUpdate(true)
          }
        })
        .catch(() => {})
    }

    const interval = setInterval(check, 60000) // Check every 60s
    return () => clearInterval(interval)
  }, [initialHash])

  if (!hasUpdate) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600 text-white text-center py-2 px-4 text-sm flex items-center justify-center gap-2 shadow-md">
      <RefreshCw size={14} className="animate-spin" />
      <span>새 버전이 있습니다</span>
      <button
        onClick={() => window.location.reload()}
        className="underline font-semibold hover:text-blue-100"
      >
        새로고침
      </button>
    </div>
  )
}
