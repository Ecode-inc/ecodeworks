import { Hono } from 'hono'
import type { Env, AuthUser } from '../types'
import { authMiddleware } from '../middleware/auth'
import { encrypt, decrypt } from '../lib/crypto'
import { generateId } from '../lib/id'

type Variables = { user: AuthUser }

const OPENBANKING_BASE = 'https://testapi.openbanking.or.kr'

export const bankingRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

// Helper: generate bank_tran_id (M + 9-char org prefix + U + 9-digit random)
function generateBankTranId(): string {
  const rand = String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')
  return `M202500001U${rand}`
}

// Helper: format current datetime as YYYYMMDDHHmmss
function getTranDtime(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  return `${y}${m}${d}${h}${min}${s}`
}

// Helper: refresh token if expired
async function ensureValidToken(
  env: Env,
  connection: {
    id: string
    access_token_enc: string
    refresh_token_enc: string
    token_expires_at: string
  }
): Promise<string> {
  const now = new Date()
  const expiresAt = new Date(connection.token_expires_at)

  // If token is still valid, decrypt and return
  if (expiresAt > now) {
    return await decrypt(connection.access_token_enc, env.VAULT_KEY)
  }

  // Token expired, refresh it
  const refreshToken = await decrypt(connection.refresh_token_enc, env.VAULT_KEY)

  const tokenRes = await fetch(`${OPENBANKING_BASE}/oauth/2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.OPENBANKING_CLIENT_ID,
      client_secret: env.OPENBANKING_CLIENT_SECRET,
      scope: 'login inquiry',
    }),
  })

  if (!tokenRes.ok) {
    throw new Error('Failed to refresh banking token')
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  const newAccessEnc = await encrypt(tokens.access_token, env.VAULT_KEY)
  const newRefreshEnc = tokens.refresh_token
    ? await encrypt(tokens.refresh_token, env.VAULT_KEY)
    : connection.refresh_token_enc
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await env.DB.prepare(
    `UPDATE banking_connections SET access_token_enc = ?, refresh_token_enc = ?, token_expires_at = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(newAccessEnc, newRefreshEnc, newExpiresAt, connection.id)
    .run()

  return tokens.access_token
}

// CEO/admin check helper
function requireAdmin(user: AuthUser): boolean {
  return user.is_ceo || user.is_admin
}

// --- OAuth Flow ---

// POST /banking/connect - returns authUrl (requires auth)
bankingRoutes.post('/connect', authMiddleware, async (c) => {
  const user = c.get('user')
  if (!requireAdmin(user)) {
    return c.json({ error: 'CEO/관리자만 접근 가능합니다' }, 403)
  }

  if (!c.env.OPENBANKING_CLIENT_ID) {
    return c.json({ error: '오픈뱅킹이 설정되지 않았습니다' }, 503)
  }

  // 금융결제원 requires state to be exactly 32 characters
  const stateBytes = crypto.getRandomValues(new Uint8Array(16))
  const state = Array.from(stateBytes).map(b => b.toString(16).padStart(2, '0')).join('')

  // Store state → user mapping in DB (cleanup old states)
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM banking_oauth_states WHERE created_at < datetime("now", "-1 hour")'),
    c.env.DB.prepare('INSERT INTO banking_oauth_states (state, user_id, org_id) VALUES (?, ?, ?)').bind(state, user.id, user.org_id),
  ])

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: c.env.OPENBANKING_CLIENT_ID,
    redirect_uri: c.env.OPENBANKING_CALLBACK_URL,
    scope: 'login inquiry',
    state,
    auth_type: '0',
  })
  const authUrl = `${OPENBANKING_BASE}/oauth/2.0/authorize?${params.toString()}`

  return c.json({ authUrl })
})

// GET /banking/callback - public (no auth middleware)
bankingRoutes.get('/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')

  if (!code || !state) {
    return c.redirect('https://work.e-code.kr/banking?error=missing_params')
  }

  // Look up state → user mapping from DB
  const stateRow = await c.env.DB.prepare(
    'SELECT user_id, org_id FROM banking_oauth_states WHERE state = ?'
  ).bind(state).first<{ user_id: string; org_id: string }>()

  if (!stateRow) {
    return c.redirect('https://work.e-code.kr/banking?error=invalid_state')
  }

  const { user_id: userId, org_id: orgId } = stateRow

  // Clean up used state
  await c.env.DB.prepare('DELETE FROM banking_oauth_states WHERE state = ?').bind(state).run()

  // Exchange code for token
  const tokenRes = await fetch(`${OPENBANKING_BASE}/oauth/2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: c.env.OPENBANKING_CLIENT_ID,
      client_secret: c.env.OPENBANKING_CLIENT_SECRET,
      redirect_uri: c.env.OPENBANKING_CALLBACK_URL,
    }),
  })

  if (!tokenRes.ok) {
    console.error('Token exchange failed:', await tokenRes.text())
    return c.redirect('https://work.e-code.kr/banking?error=token_exchange')
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    user_seq_no: string
  }

  // Get user accounts info
  const userInfoRes = await fetch(
    `${OPENBANKING_BASE}/v2.0/user/me?user_seq_no=${tokenData.user_seq_no}`,
    {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    }
  )

  if (!userInfoRes.ok) {
    console.error('User info fetch failed:', await userInfoRes.text())
    return c.redirect('https://work.e-code.kr/banking?error=user_info')
  }

  const userInfo = (await userInfoRes.json()) as {
    res_list: Array<{
      fintech_use_num: string
      bank_code_std: string
      account_num_masked: string
      account_holder_name: string
    }>
  }

  // Encrypt tokens
  const accessTokenEnc = await encrypt(tokenData.access_token, c.env.VAULT_KEY)
  const refreshTokenEnc = await encrypt(tokenData.refresh_token, c.env.VAULT_KEY)
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  // Save each account
  const accounts = userInfo.res_list || []
  const statements = accounts.map((account) => {
    const id = generateId()
    return c.env.DB.prepare(
      `INSERT INTO banking_connections (id, org_id, user_id, bank_code, account_num_masked, fin_use_num, account_holder_name, access_token_enc, refresh_token_enc, token_expires_at, user_seq_no, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(
      id,
      orgId,
      userId,
      account.bank_code_std,
      account.account_num_masked,
      account.fintech_use_num,
      account.account_holder_name,
      accessTokenEnc,
      refreshTokenEnc,
      expiresAt,
      tokenData.user_seq_no
    )
  })

  if (statements.length > 0) {
    await c.env.DB.batch(statements)
  }

  return c.redirect('https://work.e-code.kr/banking?connected=1')
})

// --- Account APIs (all require auth + CEO/admin) ---

// GET /banking/accounts
bankingRoutes.get('/accounts', authMiddleware, async (c) => {
  const user = c.get('user')
  if (!requireAdmin(user)) {
    return c.json({ error: 'CEO/관리자만 접근 가능합니다' }, 403)
  }

  const result = await c.env.DB.prepare(
    `SELECT id, org_id, user_id, bank_code, account_num_masked, fin_use_num, account_holder_name, is_active, created_at, updated_at
     FROM banking_connections
     WHERE org_id = ? AND is_active = 1
     ORDER BY created_at DESC`
  )
    .bind(user.org_id)
    .all()

  return c.json({ accounts: result.results })
})

// GET /banking/balance?connection_id=X
bankingRoutes.get('/balance', authMiddleware, async (c) => {
  const user = c.get('user')
  if (!requireAdmin(user)) {
    return c.json({ error: 'CEO/관리자만 접근 가능합니다' }, 403)
  }

  const connectionId = c.req.query('connection_id')
  if (!connectionId) {
    return c.json({ error: 'connection_id is required' }, 400)
  }

  const conn = await c.env.DB.prepare(
    `SELECT * FROM banking_connections WHERE id = ? AND org_id = ? AND is_active = 1`
  )
    .bind(connectionId, user.org_id)
    .first<{
      id: string
      fin_use_num: string
      access_token_enc: string
      refresh_token_enc: string
      token_expires_at: string
    }>()

  if (!conn) {
    return c.json({ error: '연결된 계좌를 찾을 수 없습니다' }, 404)
  }

  const accessToken = await ensureValidToken(c.env, conn)
  const bankTranId = generateBankTranId()
  const tranDtime = getTranDtime()

  const balanceRes = await fetch(
    `${OPENBANKING_BASE}/v2.0/account/balance/fin_num?` +
      `bank_tran_id=${bankTranId}` +
      `&fintech_use_num=${conn.fin_use_num}` +
      `&tran_dtime=${tranDtime}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!balanceRes.ok) {
    return c.json({ error: '잔액 조회에 실패했습니다' }, 502)
  }

  const balanceData = await balanceRes.json()
  return c.json({ balance: balanceData })
})

// GET /banking/transactions?connection_id=X&from_date=YYYYMMDD&to_date=YYYYMMDD
bankingRoutes.get('/transactions', authMiddleware, async (c) => {
  const user = c.get('user')
  if (!requireAdmin(user)) {
    return c.json({ error: 'CEO/관리자만 접근 가능합니다' }, 403)
  }

  const connectionId = c.req.query('connection_id')
  const fromDate = c.req.query('from_date')
  const toDate = c.req.query('to_date')

  if (!connectionId || !fromDate || !toDate) {
    return c.json({ error: 'connection_id, from_date, to_date are required' }, 400)
  }

  const conn = await c.env.DB.prepare(
    `SELECT * FROM banking_connections WHERE id = ? AND org_id = ? AND is_active = 1`
  )
    .bind(connectionId, user.org_id)
    .first<{
      id: string
      fin_use_num: string
      access_token_enc: string
      refresh_token_enc: string
      token_expires_at: string
    }>()

  if (!conn) {
    return c.json({ error: '연결된 계좌를 찾을 수 없습니다' }, 404)
  }

  const accessToken = await ensureValidToken(c.env, conn)
  const bankTranId = generateBankTranId()
  const tranDtime = getTranDtime()

  const txRes = await fetch(
    `${OPENBANKING_BASE}/v2.0/account/transaction_list/fin_num?` +
      `bank_tran_id=${bankTranId}` +
      `&fintech_use_num=${conn.fin_use_num}` +
      `&inquiry_type=A` +
      `&inquiry_base=D` +
      `&from_date=${fromDate}` +
      `&to_date=${toDate}` +
      `&sort_order=D` +
      `&tran_dtime=${tranDtime}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!txRes.ok) {
    return c.json({ error: '거래내역 조회에 실패했습니다' }, 502)
  }

  const txData = await txRes.json()
  return c.json({ transactions: txData })
})

// DELETE /banking/accounts/:id
bankingRoutes.delete('/accounts/:id', authMiddleware, async (c) => {
  const user = c.get('user')
  if (!requireAdmin(user)) {
    return c.json({ error: 'CEO/관리자만 접근 가능합니다' }, 403)
  }

  const id = c.req.param('id')

  const result = await c.env.DB.prepare(
    `UPDATE banking_connections SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND org_id = ?`
  )
    .bind(id, user.org_id)
    .run()

  if (!result.meta.changes) {
    return c.json({ error: '계좌를 찾을 수 없습니다' }, 404)
  }

  return c.json({ success: true })
})
