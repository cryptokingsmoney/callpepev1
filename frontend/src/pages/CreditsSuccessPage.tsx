import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PillButton } from '../components/buttons/PillButton'
import { useAuth } from '../auth/AuthContext'
import { formatCredits } from '../lib/credits'

export function CreditsSuccessPage() {
  const auth = useAuth()
  const nav = useNavigate()
  const [status, setStatus] = useState('Finalizing your credits…')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        await auth.refreshMe()
        if (!alive) return
        setStatus('Payment received ✅ If credits don\'t show immediately, hit refresh again in a few seconds.')
      } catch {
        if (!alive) return
        setStatus('Payment received ✅ Log in again if needed.')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const credits = auth.user ? formatCredits(auth.user.creditsMilli) : undefined

  return (
    <div className="callShell">
      <div className="hero">
        <div className="brandRow">
          <img className="logo" src="/callpepe-logo.svg" alt="CallPepe" />
          <div>
            <h1 className="h1">Credits Added</h1>
            <p className="sub">{status}</p>
          </div>
        </div>

        <div className="kpiRow" style={{ marginTop: 14 }}>
          <div className="kpi">
            <div className="kpiLabel">Current credits</div>
            <div className="kpiValue">{credits ?? '—'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <PillButton onClick={() => auth.refreshMe()}>Refresh credits</PillButton>
          <PillButton variant="ghost" onClick={() => nav('/creator')}>Back to dashboard</PillButton>
          <PillButton variant="ghost" onClick={() => nav('/')}>Find creators</PillButton>
        </div>
      </div>
    </div>
  )
}
