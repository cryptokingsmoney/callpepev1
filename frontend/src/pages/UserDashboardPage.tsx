import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PillButton } from '../components/buttons/PillButton'
import { useAuth } from '../auth/AuthContext'
import { apiGet } from '../lib/api'
import { formatCredits } from '../lib/credits'

type BalanceResponse = { creditsMilli?: number; credits?: string | number }

export function UserDashboardPage() {
  const nav = useNavigate()
  const auth = useAuth()
  const [creditsMilli, setCreditsMilli] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!auth.isAuthed) return
      setErr('')
      setLoading(true)
      try {
        const res = await apiGet<BalanceResponse>('/api/credits/balance')
        if (!alive) return
        setCreditsMilli(Number(res?.creditsMilli ?? 0))
      } catch (e: any) {
        if (!alive) return
        setErr(e?.message ?? 'Failed to load balance')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [auth.isAuthed])

  return (
    <div className="callShell">
      <div className="card">
        <div className="sectionTitle">User Dashboard</div>
        {!auth.isAuthed ? (
          <p className="muted" style={{ marginTop: 8 }}>
            Connect your wallet (top right) to access your balance and buy credits.
          </p>
        ) : (
          <>
            <div className="kpiRow" style={{ marginTop: 10 }}>
              <div className="kpi">
                <div className="kpiLabel">Wallet</div>
                <div className="kpiValue">{auth.wallet ? `${auth.wallet.slice(0, 6)}…${auth.wallet.slice(-4)}` : '—'}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Credits</div>
                <div className="kpiValue">{loading ? '…' : formatCredits(creditsMilli)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Network</div>
                <div className="kpiValue">BNB Chain</div>
              </div>
            </div>

            {err ? <div className="muted" style={{ marginTop: 10 }}>Error: {err}</div> : null}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <PillButton onClick={() => nav('/buy/stripe')}>Buy credits (Card)</PillButton>
              <PillButton variant="ghost" onClick={() => nav('/buy')}>Buy credits (USDC on-chain)</PillButton>
              <PillButton variant="ghost" onClick={() => nav('/creators')}>Find creators online</PillButton>
              <PillButton variant="ghost" onClick={() => nav('/')}>Lobby</PillButton>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="sectionTitle">How credits work</div>
        <p className="muted" style={{ marginTop: 6 }}>
          Credits are used for pay-per-minute calls. You can buy credits with a card (Stripe) or on-chain USDC.
          Payments are verified (Stripe webhook / on-chain confirmations) before credits are added.
        </p>
      </div>
    </div>
  )
}
