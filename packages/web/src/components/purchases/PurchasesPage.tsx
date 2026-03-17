import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { purchaseApi, deptApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import {
  ShoppingCart,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import dayjs from 'dayjs'

function formatKRW(amount: number): string {
  return '\u20A9' + amount.toLocaleString('ko-KR')
}

const statusLabels: Record<string, string> = {
  requested: '\uC694\uCCAD',
  approved: '\uC2B9\uC778',
  ordered: '\uC8FC\uBB38\uC644\uB8CC',
  delivered: '\uBC30\uC1A1\uC644\uB8CC',
  returned: '\uBC18\uD488',
  cancelled: '\uCDE8\uC18C',
}

const statusColors: Record<string, string> = {
  requested: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  ordered: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  returned: 'bg-orange-100 text-orange-800',
  cancelled: 'bg-gray-100 text-gray-600',
}

const statusFilters = [
  { value: '', label: '\uC804\uCCB4' },
  { value: 'requested', label: '\uC694\uCCAD' },
  { value: 'approved', label: '\uC2B9\uC778' },
  { value: 'ordered', label: '\uC8FC\uBB38' },
  { value: 'delivered', label: '\uBC30\uC1A1' },
  { value: 'returned', label: '\uBC18\uD488' },
  { value: 'cancelled', label: '\uCDE8\uC18C' },
]

export function PurchasesPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.is_ceo || user?.is_admin

  const [purchases, setPurchases] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [showStats, setShowStats] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [loading, setLoading] = useState(false)

  // Filters
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(dayjs().format('YYYY-MM'))
  const [deptFilter, setDeptFilter] = useState('')

  const loadPurchases = useCallback(async () => {
    try {
      const res = await purchaseApi.list({
        status: statusFilter || undefined,
        month: selectedMonth || undefined,
        dept_id: deptFilter || undefined,
      })
      setPurchases(res.purchases || [])
    } catch {
      // ignore
    }
  }, [statusFilter, selectedMonth, deptFilter])

  const loadStats = useCallback(async () => {
    try {
      const res = await purchaseApi.stats({
        month: selectedMonth || undefined,
        dept_id: deptFilter || undefined,
      })
      setStats(res.stats)
    } catch {
      // ignore
    }
  }, [selectedMonth, deptFilter])

  const loadCategories = useCallback(async () => {
    try {
      const res = await purchaseApi.categories()
      setCategories(res.categories || [])
    } catch {
      // ignore
    }
  }, [])

  const loadDepartments = useCallback(async () => {
    try {
      const res = await deptApi.list()
      setDepartments(res.departments || [])
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadPurchases()
    loadStats()
  }, [loadPurchases, loadStats])

  useEffect(() => {
    loadCategories()
    loadDepartments()
  }, [loadCategories, loadDepartments])

  // Actions
  const handleAction = async (action: string, id: string) => {
    try {
      switch (action) {
        case 'approve':
          await purchaseApi.approve(id)
          useToastStore.getState().addToast('success', '\uC2B9\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4')
          break
        case 'reject':
          await purchaseApi.reject(id)
          useToastStore.getState().addToast('success', '\uBC18\uB824\uB418\uC5C8\uC2B5\uB2C8\uB2E4')
          break
        case 'order':
          await purchaseApi.order(id)
          useToastStore.getState().addToast('success', '\uC8FC\uBB38\uC644\uB8CC \uCC98\uB9AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4')
          break
        case 'deliver':
          await purchaseApi.deliver(id)
          useToastStore.getState().addToast('success', '\uBC30\uC1A1\uC644\uB8CC \uCC98\uB9AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4')
          break
        case 'return':
          await purchaseApi.returnItem(id)
          useToastStore.getState().addToast('success', '\uBC18\uD488 \uCC98\uB9AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4')
          break
        case 'cancel':
          await purchaseApi.cancel(id)
          useToastStore.getState().addToast('success', '\uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4')
          break
        case 'delete':
          await purchaseApi.softDelete(id)
          useToastStore.getState().addToast('success', '\uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4')
          break
      }
      loadPurchases()
      loadStats()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '\uCC98\uB9AC \uC2E4\uD328'
      useToastStore.getState().addToast('error', '\uCC98\uB9AC \uC2E4\uD328', msg)
    }
  }

  // Stats summary
  const totalAmount = purchases.reduce((sum, p) => sum + (p.quantity * p.unit_price), 0)
  const totalCount = purchases.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShoppingCart size={24} /> \uBE44\uD488\uAD6C\uB9E4
        </h1>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus size={16} className="mr-1" /> \uBE44\uD488 \uC694\uCCAD
        </Button>
      </div>

      {/* Stats Summary Bar */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">\uC6D4\uBCC4:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">\uBD80\uC11C:</span>
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">\uC804\uCCB4 \uBD80\uC11C</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto text-right">
            <span className="text-lg font-bold text-gray-900">{formatKRW(totalAmount)}</span>
            <span className="text-sm text-gray-500 ml-2">({totalCount}\uAC74)</span>
          </div>
        </div>

        {/* Category breakdown bars */}
        {stats?.categories && stats.categories.length > 0 && (
          <div className="mt-3 flex gap-1 h-2 rounded-full overflow-hidden bg-gray-100">
            {stats.categories.map((cat: any) => (
              <div
                key={cat.name}
                style={{
                  width: `${cat.percentage || 0}%`,
                  backgroundColor: cat.color || '#6B7280',
                }}
                title={`${cat.name}: ${formatKRW(cat.amount)} (${cat.count}\uAC74)`}
                className="h-full transition-all"
              />
            ))}
          </div>
        )}
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-1 flex-wrap">
        {statusFilters.map(sf => (
          <button
            key={sf.value}
            onClick={() => setStatusFilter(sf.value)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              statusFilter === sf.value
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {sf.label}
          </button>
        ))}
      </div>

      {/* Purchase List Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">\uC0C1\uD0DC</th>
                <th className="text-left px-4 py-2 font-medium">\uD488\uBA85</th>
                <th className="text-right px-4 py-2 font-medium">\uC218\uB7C9</th>
                <th className="text-right px-4 py-2 font-medium">\uB2E8\uAC00</th>
                <th className="text-right px-4 py-2 font-medium">\uD569\uACC4</th>
                <th className="text-left px-4 py-2 font-medium">\uC694\uCCAD\uC790</th>
                <th className="text-left px-4 py-2 font-medium">\uCE74\uD14C\uACE0\uB9AC</th>
                <th className="text-left px-4 py-2 font-medium">\uB0A0\uC9DC</th>
                <th className="text-left px-4 py-2 font-medium">\uC791\uC5C5</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    \uBE44\uD488 \uC694\uCCAD \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4
                  </td>
                </tr>
              ) : purchases.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[p.status] || 'bg-gray-100 text-gray-600'}`}>
                      {statusLabels[p.status] || p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {p.item_url ? (
                      <a
                        href={p.item_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline inline-flex items-center gap-1"
                      >
                        {p.item_name}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      p.item_name
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600">{(p.quantity || 0).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatKRW(p.unit_price || 0)}</td>
                  <td className="px-4 py-2 text-right font-medium text-gray-900">{formatKRW((p.quantity || 0) * (p.unit_price || 0))}</td>
                  <td className="px-4 py-2 text-gray-600">{p.requester_name || '-'}</td>
                  <td className="px-4 py-2">
                    {p.category_name ? (
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: (p.category_color || '#E5E7EB') + '30',
                          color: p.category_color || '#6B7280',
                        }}
                      >
                        {p.category_name}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {dayjs(p.created_at).format('MM/DD HH:mm')}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      {p.status === 'requested' && isAdmin && (
                        <Button size="sm" onClick={() => handleAction('approve', p.id)}>
                          \uC2B9\uC778
                        </Button>
                      )}
                      {p.status === 'requested' && p.requester_id === user?.id && (
                        <Button size="sm" variant="secondary" onClick={() => handleAction('cancel', p.id)}>
                          \uCDE8\uC18C
                        </Button>
                      )}
                      {p.status === 'approved' && isAdmin && (
                        <Button size="sm" onClick={() => handleAction('order', p.id)}>
                          \uC8FC\uBB38\uC644\uB8CC
                        </Button>
                      )}
                      {p.status === 'ordered' && isAdmin && (
                        <Button size="sm" onClick={() => handleAction('deliver', p.id)}>
                          \uBC30\uC1A1\uC644\uB8CC
                        </Button>
                      )}
                      {p.status === 'delivered' && isAdmin && (
                        <Button size="sm" variant="secondary" onClick={() => handleAction('return', p.id)}>
                          \uBC18\uD488
                        </Button>
                      )}
                      {isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => handleAction('delete', p.id)}>
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stats Section (Expandable) */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <button
          onClick={() => { setShowStats(!showStats); if (!showStats) loadStats() }}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
        >
          <h3 className="font-semibold text-gray-900">\uD1B5\uACC4</h3>
          {showStats ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {showStats && stats && (
          <div className="border-t p-4 space-y-6">
            {/* Total */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">{selectedMonth} \uCD1D \uC9C0\uCD9C</h4>
              <p className="text-2xl font-bold text-gray-900">{formatKRW(stats.total_amount || 0)}</p>
            </div>

            {/* Category Breakdown */}
            {stats.categories && stats.categories.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">\uCE74\uD14C\uACE0\uB9AC\uBCC4</h4>
                <div className="space-y-2">
                  {stats.categories.map((cat: any) => (
                    <div key={cat.name} className="flex items-center gap-3">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color || '#6B7280' }}
                      />
                      <span className="text-sm text-gray-700 w-24 truncate">{cat.name}</span>
                      <span className="text-sm font-medium text-gray-900 w-28 text-right">{formatKRW(cat.amount || 0)}</span>
                      <span className="text-xs text-gray-500 w-12 text-right">{cat.count}\uAC74</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${cat.percentage || 0}%`,
                            backgroundColor: cat.color || '#6B7280',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Department Breakdown */}
            {stats.departments && stats.departments.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">\uBD80\uC11C\uBCC4</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium">\uBD80\uC11C</th>
                        <th className="text-right px-3 py-1.5 font-medium">\uAE08\uC561</th>
                        <th className="text-right px-3 py-1.5 font-medium">\uAC74\uC218</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {stats.departments.map((dept: any) => (
                        <tr key={dept.name}>
                          <td className="px-3 py-1.5 text-gray-700">{dept.name}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatKRW(dept.amount || 0)}</td>
                          <td className="px-3 py-1.5 text-right text-gray-500">{dept.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Requester Breakdown */}
            {stats.requesters && stats.requesters.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">\uC694\uCCAD\uC790\uBCC4</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium">\uC694\uCCAD\uC790</th>
                        <th className="text-right px-3 py-1.5 font-medium">\uAE08\uC561</th>
                        <th className="text-right px-3 py-1.5 font-medium">\uAC74\uC218</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {stats.requesters.map((req: any) => (
                        <tr key={req.name}>
                          <td className="px-3 py-1.5 text-gray-700">{req.name}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatKRW(req.amount || 0)}</td>
                          <td className="px-3 py-1.5 text-right text-gray-500">{req.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Purchase Modal */}
      <CreatePurchaseModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          setShowCreateModal(false)
          loadPurchases()
          loadStats()
        }}
        categories={categories}
        onCategoriesChange={loadCategories}
        loading={loading}
        setLoading={setLoading}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Create Purchase Modal
// ──────────────────────────────────────────────────────────────
function CreatePurchaseModal({
  open,
  onClose,
  onCreated,
  categories,
  onCategoriesChange,
  loading,
  setLoading,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
  categories: any[]
  onCategoriesChange: () => void
  loading: boolean
  setLoading: (v: boolean) => void
}) {
  const [itemName, setItemName] = useState('')
  const [itemUrl, setItemUrl] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const [categoryId, setCategoryId] = useState('')
  const [memo, setMemo] = useState('')
  const [seeding, setSeeding] = useState(false)

  const total = quantity * unitPrice

  const handleSeedCategories = async () => {
    setSeeding(true)
    try {
      await purchaseApi.seedCategories()
      useToastStore.getState().addToast('success', '\uAE30\uBCF8 \uCE74\uD14C\uACE0\uB9AC\uAC00 \uC0DD\uC131\uB418\uC5C8\uC2B5\uB2C8\uB2E4')
      onCategoriesChange()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '\uC0DD\uC131 \uC2E4\uD328'
      useToastStore.getState().addToast('error', '\uCE74\uD14C\uACE0\uB9AC \uC0DD\uC131 \uC2E4\uD328', msg)
    } finally {
      setSeeding(false)
    }
  }

  const handleSubmit = async () => {
    if (!itemName.trim()) {
      useToastStore.getState().addToast('error', '\uD488\uBA85\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694')
      return
    }
    if (quantity <= 0 || unitPrice <= 0) {
      useToastStore.getState().addToast('error', '\uC218\uB7C9\uACFC \uB2E8\uAC00\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694')
      return
    }
    setLoading(true)
    try {
      await purchaseApi.create({
        item_name: itemName.trim(),
        item_url: itemUrl.trim() || undefined,
        quantity,
        unit_price: unitPrice,
        category_id: categoryId || undefined,
        memo: memo.trim() || undefined,
      })
      useToastStore.getState().addToast('success', '\uBE44\uD488 \uC694\uCCAD\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4')
      // Reset form
      setItemName('')
      setItemUrl('')
      setQuantity(1)
      setUnitPrice(0)
      setCategoryId('')
      setMemo('')
      onCreated()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '\uC694\uCCAD \uC2E4\uD328'
      useToastStore.getState().addToast('error', '\uBE44\uD488 \uC694\uCCAD \uC2E4\uD328', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="\uBE44\uD488 \uC694\uCCAD" width="max-w-lg">
      <div className="space-y-4">
        {/* Item Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">\uD488\uBA85</label>
          <input
            type="text"
            value={itemName}
            onChange={e => setItemName(e.target.value)}
            placeholder="\uD488\uBA85\uC744 \uC785\uB825\uD558\uC138\uC694"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Item URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">URL (\uC120\uD0DD)</label>
          <input
            type="url"
            value={itemUrl}
            onChange={e => setItemUrl(e.target.value)}
            placeholder="https://..."
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Quantity & Unit Price */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">\uC218\uB7C9</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={e => setQuantity(parseInt(e.target.value) || 0)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">\uB2E8\uAC00 (\uC6D0)</label>
            <input
              type="number"
              min={0}
              value={unitPrice}
              onChange={e => setUnitPrice(parseInt(e.target.value) || 0)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Auto-calculated total */}
        <div className="bg-gray-50 rounded-lg px-4 py-2 flex items-center justify-between">
          <span className="text-sm text-gray-600">\uD569\uACC4</span>
          <span className="text-lg font-bold text-gray-900">{formatKRW(total)}</span>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">\uCE74\uD14C\uACE0\uB9AC</label>
          {categories.length === 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">\uCE74\uD14C\uACE0\uB9AC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4</span>
              <Button size="sm" variant="secondary" onClick={handleSeedCategories} loading={seeding}>
                \uAE30\uBCF8 \uC0DD\uC131
              </Button>
            </div>
          ) : (
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">\uCE74\uD14C\uACE0\uB9AC \uC120\uD0DD</option>
              {categories.map((cat: any) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Memo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">\uBA54\uBAA8</label>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="\uBA54\uBAA8\uB97C \uC785\uB825\uD558\uC138\uC694 (\uC120\uD0DD)"
            className="w-full border rounded-lg px-3 py-2 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            \uCDE8\uC18C
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            \uC694\uCCAD
          </Button>
        </div>
      </div>
    </Modal>
  )
}
