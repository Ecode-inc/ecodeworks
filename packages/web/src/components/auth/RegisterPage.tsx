import { useState, FormEvent } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { joinRequestApi } from '../../lib/api'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

interface RegisterPageProps {
  onSwitchToLogin: () => void
  orgSlug?: string | null
}

export function RegisterPage({ onSwitchToLogin, orgSlug }: RegisterPageProps) {
  const { register, loading } = useAuthStore()
  const [orgName, setOrgName] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const isJoinMode = !!orgSlug

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      useToastStore.getState().addToast('error', '비밀번호 불일치', '비밀번호가 일치하지 않습니다')
      return
    }

    if (isJoinMode) {
      // Join request mode
      setSubmitting(true)
      try {
        await joinRequestApi.submit({ orgSlug: orgSlug!, email, password, name, message: message || undefined })
        setSubmitted(true)
      } catch (err: any) {
        useToastStore.getState().addToast('error', '가입 신청 실패', err.message)
      } finally {
        setSubmitting(false)
      }
    } else {
      // Create new org mode
      try {
        await register(email, password, name, orgName)
      } catch (err: any) {
        useToastStore.getState().addToast('error', '등록 실패', err.message)
      }
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">이코드웍스</h1>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-sm border text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">가입 신청이 완료되었습니다</h2>
            <p className="text-sm text-gray-500">관리자 승인을 기다려주세요.</p>
            <Button onClick={onSwitchToLogin} className="w-full">
              로그인 페이지로
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">이코드웍스</h1>
          <p className="text-gray-500 mt-2">{isJoinMode ? '가입 신청' : '새 조직 등록'}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl shadow-sm border space-y-4">
          {isJoinMode ? (
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-500">조직</span>
              <p className="text-sm font-medium text-gray-800">{orgSlug}</p>
            </div>
          ) : (
            <Input
              label="조직 이름"
              placeholder="우리 회사"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
            />
          )}
          <Input
            label="이름"
            placeholder="홍길동"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="이메일"
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="비밀번호"
            type="password"
            placeholder="8자 이상"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <Input
            label="비밀번호 확인"
            type="password"
            placeholder="비밀번호 재입력"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          {isJoinMode && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">가입 사유 (선택)</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                rows={3}
                placeholder="가입 사유를 입력해주세요"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          )}
          <Button type="submit" loading={isJoinMode ? submitting : loading} className="w-full">
            {isJoinMode ? '가입 신청' : '조직 등록'}
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          이미 계정이 있으신가요?{' '}
          <button
            onClick={onSwitchToLogin}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            로그인
          </button>
        </p>
      </div>
    </div>
  )
}
