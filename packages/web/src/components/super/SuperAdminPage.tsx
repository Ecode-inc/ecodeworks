import { useState, useEffect, FormEvent } from 'react'
import { superApi } from '../../lib/api'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

// ─── Types ──────────────────────────────────────────────────────────

interface SuperAdmin {
  id: string
  email: string
  name: string
}

interface DashboardStats {
  totalOrgs: number
  totalUsers: number
  planDistribution: { plan: string; cnt: number }[]
  activeOrgs: number
}

interface OrgListItem {
  id: string
  name: string
  slug: string
  created_at: string
  plan: string | null
  max_users: number | null
  max_departments: number | null
  max_storage_mb: number | null
  is_active: number | null
  expires_at: string | null
  user_count: number
  dept_count: number
}

interface OrgDetail {
  organization: OrgListItem & { features: string | null; started_at: string | null }
  users: { id: string; email: string; name: string; is_ceo: number; is_admin: number; created_at: string }[]
  departments: { id: string; name: string; slug: string; color: string; order_index: number }[]
}

interface Subscription {
  org_id: string
  plan: string
  max_users: number
  max_departments: number
  max_storage_mb: number
  features: string
  started_at: string
  expires_at: string | null
  is_active: number
}

interface AuditLogEntry {
  id: string
  admin_id: string
  admin_name: string
  admin_email: string
  action: string
  target_type: string
  target_id: string
  details: string
  created_at: string
}

type Tab = 'dashboard' | 'orgs' | 'audit'

// ─── Main Component ──────────────────────────────────────────────────

export function SuperAdminPage() {
  const [admin, setAdmin] = useState<SuperAdmin | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = sessionStorage.getItem('superToken')
    const stored = sessionStorage.getItem('superAdmin')
    if (token && stored) {
      setAdmin(JSON.parse(stored))
    }
    setLoading(false)
  }, [])

  const handleLogin = (data: { admin: SuperAdmin; token: string }) => {
    sessionStorage.setItem('superToken', data.token)
    sessionStorage.setItem('superAdmin', JSON.stringify(data.admin))
    setAdmin(data.admin)
  }

  const handleLogout = () => {
    sessionStorage.removeItem('superToken')
    sessionStorage.removeItem('superAdmin')
    setAdmin(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!admin) {
    return <SuperLoginForm onLogin={handleLogin} />
  }

  return <SuperDashboard admin={admin} onLogout={handleLogout} />
}

// ─── Login Form ──────────────────────────────────────────────────────

function SuperLoginForm({ onLogin }: { onLogin: (data: { admin: SuperAdmin; token: string }) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const data = await superApi.login(email, password)
      onLogin(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Super Admin</h1>
          <p className="text-gray-400 mt-2">Platform Management</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-700 space-y-4">
          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 rounded-lg px-3 py-2 text-sm">
              {error}
            </div>
          )}
          <Input
            label="Email"
            type="email"
            placeholder="super@e-code.kr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
          />
          <Input
            label="Password"
            type="password"
            placeholder="********"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
          />
          <Button type="submit" loading={submitting} className="w-full bg-indigo-600 hover:bg-indigo-700">
            Login
          </Button>
        </form>
      </div>
    </div>
  )
}

// ─── Dashboard ───────────────────────────────────────────────────────

function SuperDashboard({ admin, onLogout }: { admin: SuperAdmin; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('dashboard')

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-indigo-400">ecode Super Admin</h1>
          <nav className="flex gap-1">
            {(['dashboard', 'orgs', 'audit'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {t === 'dashboard' ? 'Dashboard' : t === 'orgs' ? 'Organizations' : 'Audit Log'}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{admin.email}</span>
          <button onClick={onLogout} className="text-sm text-red-400 hover:text-red-300">
            Logout
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="p-6 max-w-7xl mx-auto">
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'orgs' && <OrganizationsTab />}
        {tab === 'audit' && <AuditTab />}
      </main>
    </div>
  )
}

// ─── Dashboard Tab ───────────────────────────────────────────────────

function DashboardTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    superApi.dashboard()
      .then((data) => setStats(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading || !stats) {
    return <div className="text-gray-400">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Platform Overview</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Organizations" value={stats.totalOrgs} />
        <StatCard label="Total Users" value={stats.totalUsers} />
        <StatCard label="Active Organizations" value={stats.activeOrgs} />
        <StatCard label="Plans" value={stats.planDistribution.map(p => `${p.plan}: ${p.cnt}`).join(', ')} />
      </div>

      <h3 className="text-lg font-semibold mt-8">Plan Distribution</h3>
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
        {stats.planDistribution.length === 0 ? (
          <p className="text-gray-400 text-sm">No data</p>
        ) : (
          <div className="space-y-2">
            {stats.planDistribution.map((p) => (
              <div key={p.plan} className="flex items-center gap-3">
                <span className="text-sm w-24 text-gray-300 capitalize">{p.plan}</span>
                <div className="flex-1 bg-gray-700 rounded-full h-4">
                  <div
                    className="bg-indigo-500 h-4 rounded-full transition-all"
                    style={{ width: `${Math.max(5, (p.cnt / stats.totalOrgs) * 100)}%` }}
                  />
                </div>
                <span className="text-sm text-gray-400 w-8 text-right">{p.cnt}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  )
}

// ─── Organizations Tab ───────────────────────────────────────────────

function OrganizationsTab() {
  const [orgs, setOrgs] = useState<OrgListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)

  useEffect(() => {
    loadOrgs()
  }, [])

  const loadOrgs = () => {
    setLoading(true)
    superApi.listOrgs()
      .then((data) => setOrgs(data.organizations))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const handleSuspend = async (orgId: string) => {
    if (!confirm('Suspend this organization?')) return
    await superApi.suspendOrg(orgId)
    loadOrgs()
  }

  const handleActivate = async (orgId: string) => {
    await superApi.activateOrg(orgId)
    loadOrgs()
  }

  if (loading) {
    return <div className="text-gray-400">Loading...</div>
  }

  if (selectedOrgId) {
    return <OrgDetailPanel orgId={selectedOrgId} onBack={() => { setSelectedOrgId(null); loadOrgs() }} />
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Organizations ({orgs.length})</h2>
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-left text-gray-400">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3">Depts</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                <td className="px-4 py-3">
                  <button
                    onClick={() => setSelectedOrgId(org.id)}
                    className="text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    {org.name}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-400">{org.slug}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${planColor(org.plan || 'free')}`}>
                    {org.plan || 'free'}
                  </span>
                </td>
                <td className="px-4 py-3">{org.user_count}</td>
                <td className="px-4 py-3">{org.dept_count}</td>
                <td className="px-4 py-3">
                  {org.is_active === 0 ? (
                    <span className="text-red-400 text-xs font-medium">Suspended</span>
                  ) : (
                    <span className="text-green-400 text-xs font-medium">Active</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {org.is_active === 0 ? (
                    <button
                      onClick={() => handleActivate(org.id)}
                      className="text-xs text-green-400 hover:text-green-300"
                    >
                      Activate
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSuspend(org.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function planColor(plan: string): string {
  switch (plan) {
    case 'enterprise': return 'bg-purple-900/50 text-purple-300'
    case 'business': return 'bg-blue-900/50 text-blue-300'
    case 'starter': return 'bg-green-900/50 text-green-300'
    default: return 'bg-gray-700 text-gray-300'
  }
}

// ─── Org Detail Panel ────────────────────────────────────────────────

function OrgDetailPanel({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<OrgDetail | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab] = useState<'info' | 'subscription'>('info')

  useEffect(() => {
    Promise.all([
      superApi.getOrg(orgId),
      superApi.getSubscription(orgId),
    ])
      .then(([orgData, subData]) => {
        setDetail(orgData)
        setSubscription(subData.subscription)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [orgId])

  if (loading || !detail) {
    return <div className="text-gray-400">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-indigo-400 hover:text-indigo-300">
        &larr; Back to list
      </button>
      <h2 className="text-xl font-semibold">{detail.organization.name}</h2>
      <p className="text-gray-400 text-sm">Slug: {detail.organization.slug} | Created: {detail.organization.created_at}</p>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setSubTab('info')}
          className={`px-3 py-1.5 rounded text-sm ${subTab === 'info' ? 'bg-indigo-600' : 'bg-gray-700 text-gray-300'}`}
        >
          Users & Departments
        </button>
        <button
          onClick={() => setSubTab('subscription')}
          className={`px-3 py-1.5 rounded text-sm ${subTab === 'subscription' ? 'bg-indigo-600' : 'bg-gray-700 text-gray-300'}`}
        >
          Subscription
        </button>
      </div>

      {subTab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Users */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <h3 className="font-medium mb-3">Users ({detail.users.length})</h3>
            <div className="space-y-2">
              {detail.users.map((u) => (
                <div key={u.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-white">{u.name}</span>
                    <span className="text-gray-400 ml-2">{u.email}</span>
                  </div>
                  <div className="flex gap-1">
                    {u.is_ceo ? <span className="px-1.5 py-0.5 bg-yellow-900/50 text-yellow-300 rounded text-xs">CEO</span> : null}
                    {u.is_admin ? <span className="px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded text-xs">Admin</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Departments */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <h3 className="font-medium mb-3">Departments ({detail.departments.length})</h3>
            <div className="space-y-2">
              {detail.departments.map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                  <span>{d.name}</span>
                  <span className="text-gray-500">({d.slug})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {subTab === 'subscription' && subscription && (
        <SubscriptionEditor orgId={orgId} subscription={subscription} onChange={setSubscription} />
      )}
    </div>
  )
}

// ─── Subscription Editor ─────────────────────────────────────────────

function SubscriptionEditor({
  orgId,
  subscription,
  onChange,
}: {
  orgId: string
  subscription: Subscription
  onChange: (s: Subscription) => void
}) {
  const [plan, setPlan] = useState(subscription.plan)
  const [maxUsers, setMaxUsers] = useState(subscription.max_users)
  const [maxDepts, setMaxDepts] = useState(subscription.max_departments)
  const [maxStorage, setMaxStorage] = useState(subscription.max_storage_mb)
  const [features, setFeatures] = useState<string[]>(() => {
    try { return JSON.parse(subscription.features || '[]') } catch { return [] }
  })
  const [expiresAt, setExpiresAt] = useState(subscription.expires_at || '')
  const [saving, setSaving] = useState(false)

  const allFeatures = ['calendar', 'kanban', 'docs', 'vault', 'qa', 'ai', 'telegram']

  const toggleFeature = (f: string) => {
    setFeatures((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f])
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = await superApi.updateSubscription(orgId, {
        plan,
        max_users: maxUsers,
        max_departments: maxDepts,
        max_storage_mb: maxStorage,
        features,
        expires_at: expiresAt || null,
      })
      onChange(data.subscription)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4 max-w-lg">
      <h3 className="font-medium text-lg">Subscription Settings</h3>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Plan</label>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="business">Business</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Max Users</label>
          <input
            type="number"
            value={maxUsers}
            onChange={(e) => setMaxUsers(parseInt(e.target.value) || 0)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Max Departments</label>
          <input
            type="number"
            value={maxDepts}
            onChange={(e) => setMaxDepts(parseInt(e.target.value) || 0)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Max Storage (MB)</label>
          <input
            type="number"
            value={maxStorage}
            onChange={(e) => setMaxStorage(parseInt(e.target.value) || 0)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">Features</label>
        <div className="flex flex-wrap gap-2">
          {allFeatures.map((f) => (
            <label key={f} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={features.includes(f)}
                onChange={() => toggleFeature(f)}
                className="rounded border-gray-600 bg-gray-700"
              />
              <span className="text-gray-300 capitalize">{f}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Expires At</label>
        <input
          type="datetime-local"
          value={expiresAt ? expiresAt.slice(0, 16) : ''}
          onChange={(e) => setExpiresAt(e.target.value ? new Date(e.target.value).toISOString() : '')}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
        />
      </div>

      <Button onClick={handleSave} loading={saving} className="bg-indigo-600 hover:bg-indigo-700">
        Save Subscription
      </Button>
    </div>
  )
}

// ─── Audit Log Tab ───────────────────────────────────────────────────

function AuditTab() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('')
  const [targetFilter, setTargetFilter] = useState('')

  useEffect(() => {
    loadLogs()
  }, [actionFilter, targetFilter])

  const loadLogs = () => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (actionFilter) params.action = actionFilter
    if (targetFilter) params.target_type = targetFilter
    superApi.auditLog(params)
      .then((data) => setLogs(data.logs))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Platform Audit Log</h2>

      <div className="flex gap-3">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">All Actions</option>
          <option value="update_org">Update Org</option>
          <option value="suspend_org">Suspend Org</option>
          <option value="activate_org">Activate Org</option>
          <option value="update_subscription">Update Subscription</option>
        </select>
        <select
          value={targetFilter}
          onChange={(e) => setTargetFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">All Targets</option>
          <option value="organization">Organization</option>
          <option value="subscription">Subscription</option>
          <option value="super_admin">Super Admin</option>
        </select>
      </div>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left text-gray-400">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Admin</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-700/50">
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">{log.admin_name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gray-700 rounded text-xs">{log.action}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{log.target_type} / {log.target_id?.slice(0, 8)}...</td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{log.details}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">No audit logs found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
