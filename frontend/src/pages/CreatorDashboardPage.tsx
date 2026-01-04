import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PillButton } from '../components/buttons/PillButton'
import { useAuth } from '../auth/AuthContext'
import { formatCredits } from '../lib/credits'
import { saveCreatorSettings, setCreatorOnline } from '../lib/creators'
import { apiPost } from '../lib/api'
import { getPayoutBalance, requestPayout, requestStripePayout, PayoutBalance } from '../lib/payout'
import { getStripeConnectStatus, startStripeOnboarding, StripeConnectStatus } from '../lib/stripeConnect'

export function CreatorDashboardPage() {
  const nav = useNavigate()
  const auth = useAuth()
  const walletShort = useMemo(() => auth.wallet ? `${auth.wallet.slice(0, 6)}…${auth.wallet.slice(-4)}` : '', [auth.wallet])

  const RATE_OPTIONS = [0.25, 0.5, 1, 2, 3, 4, 5, 10]
  const [rate, setRate] = useState<number>(1)
  const [bio, setBio] = useState<string>('')
  const [handle, setHandle] = useState<string>('')
  const [online, setOnline] = useState<boolean>(false)
  const [busy, setBusy] = useState<boolean>(false)
  const [status, setStatus] = useState<string>('')
  const [balance, setBalance] = useState<PayoutBalance | null>(null)
  const [payoutUsd, setPayoutUsd] = useState<string>('')
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!auth.isAuthed) return
      try {
        const b = await getPayoutBalance()
        if (alive) setBalance(b)
      } catch {
        // ignore
      }

      try {
        const s = await getStripeConnectStatus()
        if (alive) setStripeStatus(s)
      } catch {
        // ignore
      }
    })()
    return () => {
      alive = false
    }
  }, [auth.isAuthed])

  return (
    <div className="callShell">
      <div className="hero">
        <div className="brandRow">
          <img className="logo" src="/callpepe-logo.svg" alt="CallPepe" />
          <div>
            <h1 className="h1">Creator Dashboard</h1>
            <p className="sub">
              Go online, set your rate, then share a host link. (Backend wired to {new URL(import.meta.env.VITE_API_BASE_URL).host})
            </p>
          </div>
        </div>

        <div className="kpiRow" style={{ marginTop: 14 }}>
          <div className="kpi">
            <div className="kpiLabel">Wallet</div>
            <div className="kpiValue">{auth.isAuthed ? walletShort : 'Not logged in'}</div>
          </div>
          <div className="kpi">
            <div className="kpiLabel">Credits</div>
            <div className="kpiValue">{auth.user ? formatCredits(auth.user.creditsMilli) : '—'}</div>
          </div>
          <div className="kpi">
            <div className="kpiLabel">Presence</div>
            <div className="kpiValue">{online ? 'Online' : 'Offline'}</div>
          </div>
          <div className="kpi">
            <div className="kpiLabel">Earnings (available)</div>
            <div className="kpiValue">{balance ? `$${balance.availableUsd.toFixed(2)}` : '—'}</div>
          </div>
          <div className="kpi">
            <div className="kpiLabel">Call state</div>
            <div className="kpiValue">{busy ? 'Busy' : 'Available'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <PillButton
            onClick={async () => {
              if (!auth.wallet) return alert('Connect wallet first (top right).')
              setStatus('Saving…')
              try {
                await saveCreatorSettings(auth.wallet, rate, bio, handle)
                setStatus('Saved.')
              } catch (e: any) {
                setStatus(`Error: ${e?.message ?? 'failed'}`)
              }
            }}
          >
            Save settings
          </PillButton>

          <PillButton
            variant="ghost"
            onClick={async () => {
              if (!auth.wallet) return alert('Connect wallet first (top right).')
              const next = !online
              setStatus(next ? 'Going online…' : 'Going offline…')
              try {
                await setCreatorOnline(auth.wallet, next)
                setOnline(next)
                setStatus(next ? 'Online.' : 'Offline.')
              } catch (e: any) {
                setStatus(`Error: ${e?.message ?? 'failed'}`)
              }
            }}
          >
            {online ? 'Go offline' : 'Go online'}
          </PillButton>

          <PillButton
            variant="ghost"
            onClick={() => {
              const roomId = makeRoomId()
              // roomId is client-generated; backend sockets just need the same roomId
              const cid = auth.user?.id || ''
              const host = `${window.location.origin}/room/${roomId}?role=creator&creatorId=${encodeURIComponent(cid)}`
              navigator.clipboard?.writeText(host)
              alert('Host link copied!')
            }}
          >
            Copy host link
          </PillButton>

          <PillButton variant="ghost" onClick={() => nav('/create')}>
            Create room (local)
          </PillButton>
        </div>

        {status ? <div className="muted" style={{ marginTop: 10 }}>{status}</div> : null}
      </div>

      <div className="grid2">
        <div className="card">
          <div className="sectionTitle">Rate</div>
          <div className="muted" style={{ marginBottom: 8 }}>
            This is stored in your existing backend creator profile. No schema changes.
          </div>
          <label className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Public handle (for share link)</label>
          <input
            className="input"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="e.g., crypto_windy"
          />
          {handle ? (
            <div className="muted" style={{ marginTop: 6, lineHeight: 1.4 }}>
              Share link: <code>{window.location.origin}/c/{handle}</code>
            </div>
          ) : null}
          <div style={{ height: 10 }} />
          <label className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Rate per minute (USD)</label>
          <select
            className="input"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          >
            {RATE_OPTIONS.map((r) => (
              <option key={r} value={r}>${r}/min</option>
            ))}
          </select>
          <div style={{ height: 10 }} />
          <textarea
            className="input"
            style={{ minHeight: 90, resize: 'vertical' }}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Short bio (optional)"
          />
        </div>

        <div className="card">
          <div className="sectionTitle">Credits / Billing</div>
          <div className="muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
            Backend supports Stripe checkout to add credits. (You must be logged in for this.)
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <PillButton onClick={() => (window.location.href = '/buy/stripe')}>
              Buy credits (Stripe)
            </PillButton>

            <PillButton
              variant="ghost"
              onClick={async () => {
                if (!auth.isAuthed) return alert('Connect wallet first (top right).')
                setStatus('Refreshing…')
                await auth.refreshMe()
                setStatus('Refreshed.')
              }}
            >
              Refresh credits
            </PillButton>

            <PillButton variant="ghost" onClick={() => (window.location.href = '/buy')}>
              Buy credits (USDC)
            </PillButton>

            <PillButton variant="danger" onClick={() => auth.logout()}>
              Log out
            </PillButton>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="sectionTitle">Creator Payouts (ledger + request)</div>
        <div className="muted" style={{ marginTop: 6, lineHeight: 1.55 }}>
          Calls generate earnings automatically when the call ends (80% creator / 20% platform). This section lets you
          request a payout; the platform owner/admin sends the actual payment off-chain (USDC, bank, etc.).
        </div>

        <div className="kpiRow" style={{ marginTop: 12 }}>
          <div className="kpi">
            <div className="kpiLabel">Earned</div>
            <div className="kpiValue">{balance ? `$${balance.earnedUsd.toFixed(2)}` : '—'}</div>
          </div>
          <div className="kpi">
            <div className="kpiLabel">Pending</div>
            <div className="kpiValue">{balance ? `$${balance.pendingUsd.toFixed(2)}` : '—'}</div>
          </div>
          <div className="kpi">
            <div className="kpiLabel">Paid out</div>
            <div className="kpiValue">{balance ? `$${balance.paidOutUsd.toFixed(2)}` : '—'}</div>
          </div>
          <div className="kpi">
            <div className="kpiLabel">Available</div>
            <div className="kpiValue">{balance ? `$${balance.availableUsd.toFixed(2)}` : '—'}</div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 12, background: 'rgba(255,255,255,0.6)' }}>
          <div className="sectionTitle" style={{ marginBottom: 6 }}>Stripe Cashout (Onboard once)</div>
          <div className="muted" style={{ lineHeight: 1.55 }}>
            Connect Stripe so the platform can send your cashouts as Stripe transfers. Status: <strong>{stripeStatus?.connected ? (stripeStatus.payoutsEnabled ? 'Connected ✓' : 'Connected (finish onboarding)') : 'Not connected'}</strong>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <PillButton
              onClick={async () => {
                if (!auth.isAuthed) return alert('Connect wallet first (top right).')
                setStatus('Opening Stripe onboarding…')
                try {
                  const r = await startStripeOnboarding()
                  if (r?.url) window.location.href = r.url
                  else setStatus('Onboarding did not return a URL.')
                } catch (e: any) {
                  setStatus(`Error: ${e?.message ?? 'failed'}`)
                }
              }}
            >
              Connect Stripe
            </PillButton>
            <PillButton
              variant="ghost"
              onClick={async () => {
                if (!auth.isAuthed) return
                setStatus('Refreshing Stripe status…')
                try {
                  const s = await getStripeConnectStatus()
                  setStripeStatus(s)
                  setStatus('Stripe status refreshed.')
                } catch (e: any) {
                  setStatus(`Error: ${e?.message ?? 'failed'}`)
                }
              }}
            >
              Refresh Stripe status
            </PillButton>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12, alignItems: 'end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
              Request payout amount (USD)
            </label>
            <input
              className="input"
              value={payoutUsd}
              onChange={(e) => setPayoutUsd(e.target.value)}
              placeholder="e.g. 25"
              inputMode="decimal"
            />
          </div>

          <PillButton
            onClick={async () => {
              if (!auth.isAuthed) return alert('Connect wallet first (top right).')
              const usd = Number(payoutUsd)
              if (!Number.isFinite(usd) || usd <= 0) return alert('Enter a valid USD amount.')
              setStatus('Submitting crypto payout request…')
              try {
                await requestPayout({ amountUsd: usd, destination: auth.wallet ?? undefined })
                const b = await getPayoutBalance()
                setBalance(b)
                setPayoutUsd('')
                setStatus('Payout request submitted.')
              } catch (e: any) {
                setStatus(`Error: ${e?.message ?? 'failed'}`)
              }
            }}
          >
            Request crypto payout
          </PillButton>

          <PillButton
            onClick={async () => {
              if (!auth.isAuthed) return alert('Connect wallet first (top right).')
              const usd = Number(payoutUsd)
              if (!Number.isFinite(usd) || usd <= 0) return alert('Enter a valid USD amount.')
              setStatus('Submitting Stripe cashout request…')
              try {
                await requestStripePayout({ amountUsd: usd })
                const b = await getPayoutBalance()
                setBalance(b)
                setPayoutUsd('')
                const s = await getStripeConnectStatus()
                setStripeStatus(s)
                setStatus('Stripe cashout request submitted.')
              } catch (e: any) {
                setStatus(`Error: ${e?.message ?? 'failed'}`)
              }
            }}
          >
            Request Stripe cashout
          </PillButton>

          <PillButton
            variant="ghost"
            onClick={async () => {
              if (!auth.isAuthed) return
              setStatus('Refreshing payout balance…')
              try {
                const b = await getPayoutBalance()
                setBalance(b)
                setStatus('Payout balance refreshed.')
              } catch (e: any) {
                setStatus(`Error: ${e?.message ?? 'failed'}`)
              }
            }}
          >
            Refresh payout balance
          </PillButton>
        </div>
      </div>

      <div className="card">
        <div className="sectionTitle">Presence + Busy state (what’s wired vs next)</div>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
          <li><strong>Online toggle</strong> is wired to <code>/api/creators/online</code>.</li>
          <li><strong>Busy</strong> is currently local-only (set when you enter a room). Next: broadcast busy/available via socket event + store on creator profile.</li>
        </ul>
        <div style={{ height: 10 }} />
        <PillButton variant="ghost" onClick={() => setBusy(!busy)}>
          Toggle Busy (local demo)
        </PillButton>
      </div>
    </div>
  )
}

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8)
}
