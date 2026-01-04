import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PillButton } from '../components/buttons/PillButton'
import { useToast } from '../components/Toast'
import { useAuth } from '../auth/AuthContext'
import { apiGet, apiPost } from '../lib/api'
import { DEFAULT_TREASURY, STABLECOINS_BSC, Stablecoin } from '../lib/stablecoins'
import { getChainId, parseUnits, sendErc20Transfer, watchAsset } from '../lib/evm'
import { formatCredits } from '../lib/credits'

type BalanceResponse = { creditsMilli?: number; credits?: string | number }

export function BuyCreditsPage() {
  const nav = useNavigate()
  const toast = useToast()
  const auth = useAuth()

  const treasury = (import.meta.env.VITE_TREASURY_ADDRESS as string | undefined) ?? DEFAULT_TREASURY
  const [tokenSymbol, setTokenSymbol] = useState<Stablecoin['symbol']>('USDC')
  const token = useMemo(() => STABLECOINS_BSC.find(t => t.symbol === tokenSymbol)!, [tokenSymbol])
  const [amount, setAmount] = useState('10')
  const [txHash, setTxHash] = useState('')
  const [busy, setBusy] = useState(false)
  const [creditsMilli, setCreditsMilli] = useState<number>(0)

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
    return () => { alive = false }
  }, [auth.isAuthed])

  async function onPay() {
    if (!auth.isAuthed || !auth.wallet) {
      toast.push('Connect your wallet first (top right).')
      return
    }
    setBusy(true)
    setTxHash('')
    try {
      const chainId = await getChainId()
      if (chainId !== 56) {
        toast.push('Please switch to BNB Chain (chainId 56), then try again.')
        return
      }

      const units = parseUnits(amount, token.decimals)
      if (units <= 0n) throw new Error('Amount must be greater than 0')

      // 1) Send stablecoin transfer directly to treasury
      const hash = await sendErc20Transfer(token.address, auth.wallet, treasury, units)
      setTxHash(hash)
      toast.push('Payment sent. Verifying on-chain…')

      // 2) Ask backend to verify + credit
      const credited = await apiPost<{ ok: boolean; creditsMilli?: number; credits?: string | number }>(
        '/api/credits/claim',
        { txHash: hash, tokenAddress: token.address, amount }
      )
 
      setCreditsMilli(Number(credited?.creditsMilli ?? 0))
      toast.push('Credits added!')
    } catch (e: any) {
      toast.push(e?.message ?? 'Payment failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="callShell">
      <div className="card">
        <div className="sectionTitle">Buy Credits (Stablecoin)</div>
        {!auth.isAuthed ? (
          <p className="muted" style={{ marginTop: 8 }}>
            Connect your wallet first (top right).
          </p>
        ) : (
          <>
            <div className="kpiRow" style={{ marginTop: 10 }}>
              <div className="kpi">
                <div className="kpiLabel">Current credits</div>
                <div className="kpiValue">{formatCredits(creditsMilli)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Treasury</div>
                <div className="kpiValue">{treasury.slice(0, 6)}…{treasury.slice(-4)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Network</div>
                <div className="kpiValue">BNB Chain</div>
              </div>
            </div>

            <div style={{ height: 12 }} />

            <label className="muted" style={{ display: 'block', fontWeight: 800 }}>Stablecoin</label>
            <select
              className="input"
              value={tokenSymbol}
              onChange={(e) => setTokenSymbol(e.target.value as any)}
              style={{ width: '100%', marginTop: 6 }}
            >
              {STABLECOINS_BSC.filter(t=>t.symbol==='USDC').map((t) => (
                <option key={t.symbol} value={t.symbol}>{t.symbol} — {t.name}</option>
              ))}
            </select>

            <div style={{ height: 12 }} />
            <label className="muted" style={{ display: 'block', fontWeight: 800 }}>Amount (USD)</label>
            <input
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10"
              inputMode="decimal"
              style={{ width: '100%', marginTop: 6 }}
            />

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              <PillButton onClick={onPay} disabled={busy}>
                {busy ? 'Processing…' : `Pay with ${token.symbol}`}
              </PillButton>
              <PillButton
                variant="ghost"
                onClick={async () => {
                  const ok = await watchAsset(token.address, token.symbol, token.decimals)
                  toast.push(ok ? `${token.symbol} added to wallet.` : 'Could not add token (wallet may not support it).')
                }}
              >
                Add token to wallet
              </PillButton>
              <PillButton variant="ghost" onClick={() => nav('/dashboard')}>Back</PillButton>
            </div>

            {txHash ? (
              <div className="card" style={{ marginTop: 12, padding: 12 }}>
                <div style={{ fontWeight: 900 }}>Transaction submitted</div>
                <div className="muted" style={{ marginTop: 6, wordBreak: 'break-all' }}>{txHash}</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  If credits don’t update, refresh and try again after the transaction has confirmations.
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="card">
        <div className="sectionTitle">Notes</div>
        <ul className="muted" style={{ marginTop: 6 }}>
          <li>Credits are added after on-chain verification of the USDC transfer. Pricing: $1 = 60 credits (1 credit = 1 second).</li>
          <li>You must be on <strong>BNB Chain (chainId 56)</strong>.</li>
        </ul>
      </div>
    </div>
  )
}
