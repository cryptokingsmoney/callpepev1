import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PillButton } from '../components/buttons/PillButton'
import { useToast } from '../components/Toast'
import { useAuth } from '../auth/AuthContext'
import { apiGet, apiPost } from '../lib/api'
import { formatCredits } from '../lib/credits'

type BalanceResponse = { creditsMilli?: number; credits?: string | number }

// Stripe Checkout on-ramp.
// Backend: POST /api/billing/checkout { amountUsd }
// Webhook: /api/webhooks/stripe credits the user after payment completes.

export function BuyStripeCreditsPage() {
  const nav = useNavigate()
  const toast = useToast()
  const auth = useAuth()

  const [creditsMilli, setCreditsMilli] = useState<number>(0)
  const [busy, setBusy] = useState(false)
  const [dollars, setDollars] = useState('10')

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!auth.isAuthed) return
      try {
        const res = await apiGet<BalanceResponse>('/api/credits/balance')
        if (!alive) return
        setCreditsMilli(Number(res?.creditsMilli ?? 0))
      } catch {
        // ignore
      }
    })()
    return () => {
      alive = false
    }
  }, [auth.isAuthed])

  const estimatedCredits = useMemo(() => {
    const n = Number(dollars)
    if (!Number.isFinite(n) || n <= 0) return 0
    // $1 = 60 credits, 1 credit = 1000 milli
    return Math.floor(n * 60 * 1000)
  }, [dollars])

  async function startCheckout(amountUsd: number) {
    if (!auth.isAuthed) {
      toast.push('Please connect your wallet/login first (top right).')
      return
    }
    setBusy(true)
    try {
      const res = await apiPost<{ url: string }>('/api/billing/checkout', { amountUsd })
      if (res?.url) {
        window.location.href = res.url
      } else {
        toast.push('Checkout did not return a URL.')
      }
    } catch (e: any) {
      toast.push(e?.message ?? 'Checkout failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="callShell">
      <div className="card">
        <div className="sectionTitle">Buy Credits (Stripe)</div>
        <div className="muted" style={{ marginTop: 8, lineHeight: 1.55 }}>
          Stripe Checkout is the simplest on-ramp. When payment completes, credits are added automatically.
        </div>

        <div className="kpiRow" style={{ marginTop: 12 }}>
          <div className="kpi">
            <div className="kpiLabel">Current credits</div>
            <div className="kpiValue">{formatCredits(creditsMilli)}</div>
          </div>
          <div className="kpi">
            <div className="kpiLabel">Pricing</div>
            <div className="kpiValue">$1 = 60 credits</div>
          </div>
        </div>

        <div style={{ height: 12 }} />

        <label className="muted" style={{ display: 'block', fontWeight: 900 }}>
          Custom amount (USD)
        </label>
        <input
          className="input"
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          inputMode="decimal"
          placeholder="10"
          style={{ width: '100%', marginTop: 6 }}
        />
        <div className="muted" style={{ marginTop: 6 }}>
          Est. credits: <strong>{formatCredits(estimatedCredits)}</strong>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <PillButton
            disabled={busy}
            onClick={() => {
              const n = Number(dollars)
              if (!Number.isFinite(n) || n <= 0) return toast.push('Enter a valid USD amount.')
              startCheckout(n)
            }}
          >
            {busy ? 'Opening…' : 'Pay with Card'}
          </PillButton>

          <PillButton disabled={busy} variant="ghost" onClick={() => startCheckout(10)}>
            $10
          </PillButton>
          <PillButton disabled={busy} variant="ghost" onClick={() => startCheckout(25)}>
            $25
          </PillButton>
          <PillButton disabled={busy} variant="ghost" onClick={() => startCheckout(50)}>
            $50
          </PillButton>
          <PillButton disabled={busy} variant="ghost" onClick={() => startCheckout(100)}>
            $100
          </PillButton>

          <PillButton variant="ghost" onClick={() => nav('/dashboard')}>Back</PillButton>
        </div>
      </div>

      <div className="card">
        <div className="sectionTitle">Notes</div>
        <ul className="muted" style={{ marginTop: 6 }}>
          <li>Credits are added only after Stripe confirms payment (webhook). If it looks stuck, refresh your dashboard.</li>
          <li>For creator payouts, use Stripe Connect onboarding in the Creator Dashboard.</li>
        </ul>
      </div>
    </div>
  )
}
