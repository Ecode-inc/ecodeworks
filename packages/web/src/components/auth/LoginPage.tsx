import { useState, FormEvent } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

interface LoginPageProps {
  onSwitchToRegister: () => void
}

/**
 * Org slug is resolved in order:
 *  1. Subdomain: ecode.pages.dev → skip, but org-slug.ecode.pages.dev → "org-slug"
 *  2. Custom domain mapping: e.g. app.ecode.co.kr → mapped slug
 *  3. localStorage (last successful login)
 *  4. Manual input
 */
function detectOrgSlug(): string | null {
  const host = window.location.hostname

  // Custom domain → slug mapping (add entries as needed)
  const domainMap: Record<string, string> = {
    'work.e-code.kr': '이코드',
    'ecode-internal.pages.dev': '이코드',
  }
  if (domainMap[host]) return domainMap[host]

  // Subdomain detection: xxx.example.com etc.
  // Skip *.pages.dev (project name, not org slug)
  // Skip *.e-code.kr (handled by domainMap above)
  const parts = host.split('.')
  const isPagesDev = host.endsWith('.pages.dev')
  const isEcodeKr = host.endsWith('.e-code.kr')
  if (parts.length >= 3 && !isPagesDev && !isEcodeKr) {
    const sub = parts[0]
    if (sub !== 'www') {
      return sub
    }
  }

  // Fallback to localStorage
  return localStorage.getItem('lastOrgSlug')
}

export function LoginPage({ onSwitchToRegister }: LoginPageProps) {
  const { login, loading } = useAuthStore()
  const detected = detectOrgSlug()
  const [orgSlug, setOrgSlug] = useState(detected || '')
  const [email, setEmail] = useState(localStorage.getItem('lastEmail') || '')
  const [password, setPassword] = useState('')
  const [rememberLogin, setRememberLogin] = useState(localStorage.getItem('rememberLogin') === 'true')
  const orgAutoDetected = !!detected

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await login(email, password, orgSlug)
      // Save for next time
      localStorage.setItem('lastOrgSlug', orgSlug)
      if (rememberLogin) {
        localStorage.setItem('lastEmail', email)
        localStorage.setItem('rememberLogin', 'true')
      } else {
        localStorage.removeItem('lastEmail')
        localStorage.removeItem('rememberLogin')
      }
    } catch (err: any) {
      useToastStore.getState().addToast('error', '로그인 실패', err.message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">ecode</h1>
          <p className="text-gray-500 mt-2">통합 사내 솔루션</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl shadow-sm border space-y-4">
          {orgAutoDetected ? (
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-500">조직</span>
              <p className="text-sm font-medium text-gray-800">{orgSlug}</p>
            </div>
          ) : (
            <Input
              label="조직 슬러그"
              placeholder="my-company"
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value)}
              required
            />
          )}
          <Input
            label="이메일"
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus={!!orgSlug}
          />
          <Input
            label="비밀번호"
            type="password"
            placeholder="********"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberLogin}
              onChange={(e) => setRememberLogin(e.target.checked)}
              className="rounded border-gray-300"
            />
            로그인 정보 저장
          </label>
          <Button type="submit" loading={loading} className="w-full">
            로그인
          </Button>
        </form>

        <div className="text-center mt-4 space-y-1">
          {orgAutoDetected && (
            <button
              onClick={() => {
                localStorage.removeItem('lastOrgSlug')
                window.location.reload()
              }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              다른 조직으로 로그인
            </button>
          )}
          <p className="text-sm text-gray-500">
            조직이 없으신가요?{' '}
            <button
              onClick={onSwitchToRegister}
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              새 조직 만들기
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
