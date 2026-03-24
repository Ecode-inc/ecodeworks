import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { bankingApi } from '../../lib/api'
import { useToastStore } from '../../stores/toastStore'
import { Button } from '../ui/Button'
import {
  Landmark,
  RefreshCw,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  Link2Off,
} from 'lucide-react'
import dayjs from 'dayjs'

// Bank code to name mapping (common Korean banks)
const bankNames: Record<string, string> = {
  '002': 'KDB산업은행',
  '003': 'IBK기업은행',
  '004': 'KB국민은행',
  '007': '수협은행',
  '011': 'NH농협은행',
  '012': '농협중앙회',
  '020': '우리은행',
  '023': 'SC제일은행',
  '027': '한국씨티은행',
  '031': '대구은행',
  '032': '부산은행',
  '034': '광주은행',
  '035': '제주은행',
  '037': '전북은행',
  '039': '경남은행',
  '045': '새마을금고',
  '048': '신협',
  '050': '저축은행',
  '071': '우체국',
  '081': '하나은행',
  '088': '신한은행',
  '089': '케이뱅크',
  '090': '카카오뱅크',
  '092': '토스뱅크',
}

function getBankName(code: string): string {
  return bankNames[code] || `은행(${code})`
}

function formatKRW(amount: number | string): string {
  const num = typeof amount === 'string' ? parseInt(amount, 10) : amount
  if (isNaN(num)) return '\u20A90'
  return '\u20A9' + num.toLocaleString('ko-KR')
}

interface Account {
  id: string
  bank_code: string
  account_num_masked: string
  fin_use_num: string
  account_holder_name: string
  is_active: number
  created_at: string
}

interface TransactionItem {
  tran_date: string
  tran_time: string
  print_content: string
  tran_amt: string
  after_balance_amt: string
  inout_type: string // '입금' or '출금'
}

export function BankingPage() {
  const user = useAuthStore((s) => s.user)
  const addToast = useToastStore((s) => s.addToast)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)

  // Balance state per account
  const [balances, setBalances] = useState<Record<string, { available: string; book: string; loading: boolean }>>({})

  // Transaction state per account
  const [transactions, setTransactions] = useState<Record<string, { items: TransactionItem[]; loading: boolean }>>({})
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null)

  // Date filter
  const [fromDate, setFromDate] = useState(dayjs().startOf('month').format('YYYYMMDD'))
  const [toDate, setToDate] = useState(dayjs().format('YYYYMMDD'))

  // Check for connected=1 query param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === '1') {
      addToast('success', '계좌가 성공적으로 연결되었습니다')
      // Clean up URL
      window.history.replaceState({}, '', '/banking')
    }
    if (params.get('error')) {
      addToast('error', '계좌 연결 중 오류가 발생했습니다: ' + params.get('error'))
      window.history.replaceState({}, '', '/banking')
    }
  }, [])

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true)
      const res = await bankingApi.accounts()
      setAccounts(res.accounts || [])
    } catch (e: any) {
      addToast('error', e.message || '계좌 목록을 불러올 수 없습니다')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const handleConnect = async () => {
    try {
      setConnecting(true)
      const res = await bankingApi.connect()
      window.location.href = res.authUrl
    } catch (e: any) {
      addToast('error', e.message || '계좌 연결에 실패했습니다')
      setConnecting(false)
    }
  }

  const handleDisconnect = async (id: string) => {
    if (!confirm('이 계좌 연결을 해제하시겠습니까?')) return
    try {
      await bankingApi.disconnect(id)
      addToast('success', '계좌 연결이 해제되었습니다')
      setAccounts((prev) => prev.filter((a) => a.id !== id))
    } catch (e: any) {
      addToast('error', e.message || '계좌 연결 해제에 실패했습니다')
    }
  }

  const fetchBalance = async (accountId: string) => {
    setBalances((prev) => ({ ...prev, [accountId]: { available: '0', book: '0', loading: true } }))
    try {
      const res = await bankingApi.balance(accountId)
      const bal = res.balance || {}
      setBalances((prev) => ({
        ...prev,
        [accountId]: {
          available: bal.available_amt || '0',
          book: bal.balance_amt || '0',
          loading: false,
        },
      }))
    } catch {
      setBalances((prev) => ({
        ...prev,
        [accountId]: { available: '0', book: '0', loading: false },
      }))
      addToast('error', '잔액 조회에 실패했습니다')
    }
  }

  const fetchTransactions = async (accountId: string) => {
    setTransactions((prev) => ({ ...prev, [accountId]: { items: [], loading: true } }))
    try {
      const res = await bankingApi.transactions(accountId, fromDate, toDate)
      const txData = res.transactions || {}
      setTransactions((prev) => ({
        ...prev,
        [accountId]: {
          items: txData.res_list || [],
          loading: false,
        },
      }))
    } catch {
      setTransactions((prev) => ({ ...prev, [accountId]: { items: [], loading: false } }))
      addToast('error', '거래내역 조회에 실패했습니다')
    }
  }

  const toggleAccount = (id: string) => {
    if (expandedAccount === id) {
      setExpandedAccount(null)
    } else {
      setExpandedAccount(id)
      fetchBalance(id)
      fetchTransactions(id)
    }
  }

  const isAdmin = user?.is_ceo || user?.is_admin

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">CEO/관리자만 접근할 수 있습니다.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Landmark className="text-primary-600" size={28} />
          <h1 className="text-2xl font-bold text-gray-900">법인계좌</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={fetchAccounts} title="새로고침">
            <RefreshCw size={16} />
          </Button>
          <Button size="sm" onClick={handleConnect} disabled={connecting}>
            {connecting ? '연결 중...' : '계좌 연결'}
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" />
        </div>
      )}

      {/* Empty state */}
      {!loading && accounts.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Wallet className="mx-auto text-gray-300 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-600 mb-2">연결된 계좌가 없습니다</h3>
          <p className="text-gray-400 mb-4">오픈뱅킹을 통해 법인계좌를 연결하세요</p>
          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? '연결 중...' : '계좌 연결하기'}
          </Button>
        </div>
      )}

      {/* Account cards */}
      {!loading && accounts.length > 0 && (
        <div className="space-y-4">
          {accounts.map((account) => {
            const bal = balances[account.id]
            const txData = transactions[account.id]
            const isExpanded = expandedAccount === account.id

            return (
              <div key={account.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Account header card */}
                <div
                  className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleAccount(account.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                        <Landmark className="text-primary-600" size={24} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{getBankName(account.bank_code)}</span>
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                            {account.account_num_masked}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">{account.account_holder_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {bal && !bal.loading && (
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-900">{formatKRW(bal.available)}</p>
                          <p className="text-xs text-gray-400">출금가능잔액</p>
                        </div>
                      )}
                      {bal?.loading && (
                        <div className="animate-spin w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full" />
                      )}
                      <button
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDisconnect(account.id)
                        }}
                        title="연결 해제"
                      >
                        <Link2Off size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded: Transactions */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-5 bg-gray-50/50">
                    {/* Date filter */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">조회기간</label>
                        <input
                          type="date"
                          value={dayjs(fromDate, 'YYYYMMDD').format('YYYY-MM-DD')}
                          onChange={(e) => setFromDate(dayjs(e.target.value).format('YYYYMMDD'))}
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                        />
                        <span className="text-gray-400">~</span>
                        <input
                          type="date"
                          value={dayjs(toDate, 'YYYYMMDD').format('YYYY-MM-DD')}
                          onChange={(e) => setToDate(dayjs(e.target.value).format('YYYYMMDD'))}
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => fetchTransactions(account.id)}
                      >
                        조회
                      </Button>
                    </div>

                    {/* Transaction list */}
                    {txData?.loading && (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full" />
                      </div>
                    )}

                    {txData && !txData.loading && txData.items.length === 0 && (
                      <p className="text-center text-gray-400 py-8">해당 기간의 거래내역이 없습니다</p>
                    )}

                    {txData && !txData.loading && txData.items.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left py-2 px-3 text-gray-500 font-medium">날짜</th>
                              <th className="text-left py-2 px-3 text-gray-500 font-medium">적요</th>
                              <th className="text-right py-2 px-3 text-gray-500 font-medium">입금</th>
                              <th className="text-right py-2 px-3 text-gray-500 font-medium">출금</th>
                              <th className="text-right py-2 px-3 text-gray-500 font-medium">잔액</th>
                            </tr>
                          </thead>
                          <tbody>
                            {txData.items.map((tx: TransactionItem, idx: number) => {
                              const isDeposit = tx.inout_type === '입금'
                              return (
                                <tr key={idx} className="border-b border-gray-100 hover:bg-white/60">
                                  <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                                    {tx.tran_date?.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}
                                    {tx.tran_time && (
                                      <span className="text-gray-400 ml-1 text-xs">
                                        {tx.tran_time?.replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2')}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-gray-800">{tx.print_content}</td>
                                  <td className="py-2.5 px-3 text-right">
                                    {isDeposit ? (
                                      <span className="text-green-600 font-medium flex items-center justify-end gap-1">
                                        <ArrowDownCircle size={14} />
                                        {formatKRW(tx.tran_amt)}
                                      </span>
                                    ) : (
                                      <span className="text-gray-300">-</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    {!isDeposit ? (
                                      <span className="text-red-600 font-medium flex items-center justify-end gap-1">
                                        <ArrowUpCircle size={14} />
                                        {formatKRW(tx.tran_amt)}
                                      </span>
                                    ) : (
                                      <span className="text-gray-300">-</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-gray-700 font-medium">
                                    {formatKRW(tx.after_balance_amt)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
