import { useState, FormEvent } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

interface LoginPageProps {
  onSwitchToRegister: () => void
}

export function LoginPage({ onSwitchToRegister }: LoginPageProps) {
  const { login, loading } = useAuthStore()
  const [orgSlug, setOrgSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await login(email, password, orgSlug)
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
          <Input
            label="조직 슬러그"
            placeholder="my-company"
            value={orgSlug}
            onChange={(e) => setOrgSlug(e.target.value)}
            required
          />
          <Input
            label="이메일"
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="비밀번호"
            type="password"
            placeholder="********"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" loading={loading} className="w-full">
            로그인
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
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
  )
}
