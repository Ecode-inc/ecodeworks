import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { orgApi, deptApi, membersApi } from '../../lib/api'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Pencil, Trash2, Plus, UserPlus, Upload } from 'lucide-react'

type Tab = 'org' | 'departments' | 'members'

// ──────────────────────────── Org Info Tab ────────────────────────────

function OrgInfoTab() {
  const { organization } = useAuthStore()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [sidebarTheme, setSidebarTheme] = useState<'dark' | 'light' | 'custom'>('dark')
  const [sidebarColor, setSidebarColor] = useState('#111827')
  const [savingTheme, setSavingTheme] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addToast = useToastStore((s) => s.addToast)
  const apiBase = import.meta.env.VITE_API_URL || '/api'

  useEffect(() => {
    orgApi.get().then((r) => {
      setName(r.organization.name)
      setSlug(r.organization.slug)
      setLogoUrl(r.organization.logo_url || '')
      setSidebarTheme(r.organization.sidebar_theme || 'dark')
      setSidebarColor(r.organization.sidebar_color || '#111827')
    })
  }, [])

  const handleSaveName = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await orgApi.update({ name })
      addToast('success', '조직 이름이 변경되었습니다.')
    } catch (err: any) {
      addToast('error', '변경 실패', err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSlug = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await orgApi.updateSlug(slug)
      addToast('success', '조직 슬러그가 변경되었습니다.')
    } catch (err: any) {
      addToast('error', '변경 실패', err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingLogo(true)
    try {
      const result = await orgApi.uploadLogo(file)
      setLogoUrl(result.logo_url)
      addToast('success', '로고가 업로드되었습니다.')
      // Refresh org data in auth store
      const orgRes = await orgApi.get()
      useAuthStore.getState().organization && useAuthStore.setState({ organization: orgRes.organization })
    } catch (err: any) {
      addToast('error', '업로드 실패', err.message)
    } finally {
      setUploadingLogo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      {/* Logo upload section */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">조직 로고</label>
        {logoUrl ? (
          <div className="flex items-center gap-4">
            <img
              src={`${apiBase}${logoUrl.replace(/^\/api/, '')}`}
              alt="조직 로고"
              className="h-16 max-w-[200px] object-contain border rounded p-1"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={uploadingLogo}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} className="mr-1" /> 변경
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="h-16 w-32 flex items-center justify-center border-2 border-dashed rounded text-gray-400 text-sm">
              로고 없음
            </div>
            <Button
              type="button"
              size="sm"
              loading={uploadingLogo}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} className="mr-1" /> 업로드
            </Button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleLogoUpload}
        />
        <p className="text-xs text-gray-500">PNG, JPG, SVG 등 이미지 파일을 업로드하세요.</p>
      </div>

      <form onSubmit={handleSaveName} className="space-y-3">
        <Input label="조직 이름" value={name} onChange={(e) => setName(e.target.value)} required />
        <Button type="submit" loading={saving} size="sm">
          이름 저장
        </Button>
      </form>

      <form onSubmit={handleSaveSlug} className="space-y-3">
        <Input label="조직 슬러그" value={slug} onChange={(e) => setSlug(e.target.value)} required />
        <p className="text-xs text-gray-500">로그인 시 사용하는 고유 식별자입니다. (현재: {organization?.slug})</p>
        <Button type="submit" loading={saving} size="sm">
          슬러그 저장
        </Button>
      </form>

      {/* Sidebar Theme */}
      <div className="space-y-3 border-t pt-6">
        <label className="block text-sm font-medium text-gray-700">사이드바 테마</label>
        <div className="flex gap-2">
          {([['dark', '다크'], ['light', '라이트'], ['custom', '커스텀']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSidebarTheme(value)}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                sidebarTheme === value
                  ? 'border-primary-600 bg-primary-50 text-primary-700 font-medium'
                  : 'border-gray-300 text-gray-600 hover:border-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {sidebarTheme === 'custom' && (
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">사이드바 색상</label>
              <input
                type="color"
                value={sidebarColor}
                onChange={(e) => setSidebarColor(e.target.value)}
                className="w-10 h-10 rounded border cursor-pointer"
              />
            </div>
            <div
              className="w-12 h-20 rounded-lg border shadow-inner"
              style={{ backgroundColor: sidebarColor }}
              title="미리보기"
            />
            <span className="text-xs text-gray-500">{sidebarColor}</span>
          </div>
        )}

        {/* Theme preview */}
        <div className="flex items-stretch h-16 rounded-lg overflow-hidden border">
          <div
            className={`w-14 flex items-center justify-center text-xs font-bold ${
              sidebarTheme === 'dark' ? 'bg-gray-900 text-white' :
              sidebarTheme === 'light' ? 'bg-white text-gray-800 border-r' :
              ''
            }`}
            style={sidebarTheme === 'custom' ? { backgroundColor: sidebarColor, color: isLightHex(sidebarColor) ? '#1f2937' : '#f3f4f6' } : undefined}
          >
            e
          </div>
          <div className="flex-1 bg-gray-50 flex items-center justify-center text-xs text-gray-400">
            미리보기
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          loading={savingTheme}
          onClick={async () => {
            setSavingTheme(true)
            try {
              const res = await orgApi.update({ sidebar_theme: sidebarTheme, sidebar_color: sidebarColor })
              useAuthStore.setState({ organization: res.organization })
              addToast('success', '사이드바 테마가 변경되었습니다.')
            } catch (err: any) {
              addToast('error', '테마 변경 실패', err.message)
            } finally {
              setSavingTheme(false)
            }
          }}
        >
          테마 저장
        </Button>
      </div>
    </div>
  )
}

function isLightHex(hex: string): boolean {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5
}

// ──────────────────────────── Departments Tab ────────────────────────────

interface DeptRow {
  id: string
  name: string
  slug: string
  color: string
}

function DepartmentsTab() {
  const [depts, setDepts] = useState<DeptRow[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', color: '#6366f1' })
  const [saving, setSaving] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const load = () => {
    deptApi.list().then((r) => setDepts(r.departments))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditId(null)
    setForm({ name: '', color: '#6366f1' })
    setModalOpen(true)
  }

  const openEdit = (d: DeptRow) => {
    setEditId(d.id)
    setForm({ name: d.name, color: d.color || '#6366f1' })
    setModalOpen(true)
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editId) {
        await deptApi.update(editId, { name: form.name, color: form.color })
        addToast('success', '부서가 수정되었습니다.')
      } else {
        await deptApi.create({ name: form.name, color: form.color })
        addToast('success', '부서가 생성되었습니다.')
      }
      setModalOpen(false)
      load()
    } catch (err: any) {
      addToast('error', '저장 실패', err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 부서를 삭제하시겠습니까?')) return
    try {
      await deptApi.delete(id)
      addToast('success', '부서가 삭제되었습니다.')
      load()
    } catch (err: any) {
      addToast('error', '삭제 실패', err.message)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">부서 목록</h3>
        <Button size="sm" onClick={openCreate}>
          <Plus size={16} className="mr-1" /> 부서 추가
        </Button>
      </div>

      <div className="border rounded-lg divide-y">
        {depts.length === 0 && (
          <p className="text-sm text-gray-400 p-4">등록된 부서가 없습니다.</p>
        )}
        {depts.map((d) => (
          <div key={d.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: d.color || '#6366f1' }} />
              <span className="text-sm font-medium text-gray-800">{d.name}</span>
              <span className="text-xs text-gray-400">{d.slug}</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => openEdit(d)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
                <Pencil size={15} />
              </button>
              <button onClick={() => handleDelete(d.id)} className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? '부서 수정' : '부서 추가'}>
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="부서 이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">색상</label>
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="w-10 h-10 rounded border cursor-pointer"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button type="submit" loading={saving}>
              {editId ? '수정' : '생성'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ──────────────────────────── Members Tab ────────────────────────────

interface MemberRow {
  id: string
  name: string
  email: string
  is_ceo: boolean
  is_admin: boolean
  departments: { id: string; name: string; color: string; role: string }[]
}

function MembersTab() {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [allDepts, setAllDepts] = useState<DeptRow[]>([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', password: '', departmentId: '', role: 'member' })
  const [saving, setSaving] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const load = async () => {
    const [mRes, dRes] = await Promise.all([membersApi.list(), deptApi.list()])
    setMembers(mRes.members)
    setAllDepts(dRes.departments)
  }

  useEffect(() => { load() }, [])

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await membersApi.invite({
        email: inviteForm.email,
        name: inviteForm.name,
        password: inviteForm.password,
        departmentId: inviteForm.departmentId,
        role: inviteForm.role,
      })
      addToast('success', '멤버가 초대되었습니다.')
      setInviteOpen(false)
      setInviteForm({ email: '', name: '', password: '', departmentId: '', role: 'member' })
      load()
    } catch (err: any) {
      addToast('error', '초대 실패', err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleAdmin = async (m: MemberRow) => {
    try {
      await membersApi.update(m.id, { is_admin: !m.is_admin })
      addToast('success', `${m.name}의 관리자 권한이 ${m.is_admin ? '해제' : '부여'}되었습니다.`)
      load()
    } catch (err: any) {
      addToast('error', '변경 실패', err.message)
    }
  }

  const handleAddDept = async (memberId: string, deptId: string) => {
    try {
      await membersApi.addDepartment(memberId, deptId)
      addToast('success', '부서가 배정되었습니다.')
      load()
    } catch (err: any) {
      addToast('error', '배정 실패', err.message)
    }
  }

  const handleRemoveDept = async (memberId: string, deptId: string) => {
    try {
      await membersApi.removeDepartment(memberId, deptId)
      addToast('success', '부서에서 제외되었습니다.')
      load()
    } catch (err: any) {
      addToast('error', '제외 실패', err.message)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">멤버 목록</h3>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus size={16} className="mr-1" /> 멤버 초대
        </Button>
      </div>

      <div className="border rounded-lg divide-y">
        {members.length === 0 && (
          <p className="text-sm text-gray-400 p-4">등록된 멤버가 없습니다.</p>
        )}
        {members.map((m) => {
          const memberDeptIds = new Set(m.departments?.map((d) => d.id) ?? [])
          const assignableDepts = allDepts.filter((d) => !memberDeptIds.has(d.id))

          return (
            <div key={m.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-800">{m.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{m.email}</span>
                  {m.is_ceo && <span className="ml-2 text-xs font-semibold text-amber-600">CEO</span>}
                  {m.is_admin && !m.is_ceo && <span className="ml-2 text-xs font-semibold text-blue-600">Admin</span>}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={m.is_admin}
                    onChange={() => toggleAdmin(m)}
                    disabled={m.is_ceo}
                    className="rounded border-gray-300"
                  />
                  관리자
                </label>
              </div>

              {/* Department badges */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {m.departments?.map((d) => (
                  <span
                    key={d.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                    style={{ backgroundColor: (d.color || '#6366f1') + '22', color: d.color || '#6366f1' }}
                  >
                    {d.name}
                    <button
                      onClick={() => handleRemoveDept(m.id, d.id)}
                      className="hover:text-red-600 font-bold leading-none"
                      title="부서 제외"
                    >
                      &times;
                    </button>
                  </span>
                ))}

                {assignableDepts.length > 0 && (
                  <select
                    className="text-xs border rounded px-1.5 py-0.5 text-gray-500"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) handleAddDept(m.id, e.target.value)
                    }}
                  >
                    <option value="">+ 부서 추가</option>
                    {assignableDepts.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Invite Modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="멤버 초대">
        <form onSubmit={handleInvite} className="space-y-4">
          <Input label="이메일" type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} required />
          <Input label="이름" value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} required />
          <Input label="비밀번호" type="password" value={inviteForm.password} onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })} required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">부서</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              value={inviteForm.departmentId}
              onChange={(e) => setInviteForm({ ...inviteForm, departmentId: e.target.value })}
              required
            >
              <option value="">부서 선택</option>
              {allDepts.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">역할</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              value={inviteForm.role}
              onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
            >
              <option value="member">멤버</option>
              <option value="head">부서장</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
              취소
            </Button>
            <Button type="submit" loading={saving}>
              초대
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ──────────────────────────── Settings Page ────────────────────────────

const tabs: { key: Tab; label: string }[] = [
  { key: 'org', label: '조직 정보' },
  { key: 'departments', label: '부서 관리' },
  { key: 'members', label: '멤버 관리' },
]

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('org')

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">설정</h1>

      {/* Tab bar */}
      <div className="flex border-b mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'org' && <OrgInfoTab />}
      {activeTab === 'departments' && <DepartmentsTab />}
      {activeTab === 'members' && <MembersTab />}
    </div>
  )
}
