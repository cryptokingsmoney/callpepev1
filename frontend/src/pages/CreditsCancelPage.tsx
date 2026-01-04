import { useNavigate } from 'react-router-dom'
import { PillButton } from '../components/buttons/PillButton'

export function CreditsCancelPage() {
  const nav = useNavigate()
  return (
    <div className="callShell">
      <div className="hero">
        <div className="brandRow">
          <img className="logo" src="/callpepe-logo.svg" alt="CallPepe" />
          <div>
            <h1 className="h1">Checkout Cancelled</h1>
            <p className="sub">No worries — you were not charged. You can try again anytime.</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <PillButton onClick={() => nav('/creator')}>Back to dashboard</PillButton>
          <PillButton variant="ghost" onClick={() => nav('/')}>Home</PillButton>
        </div>
      </div>
    </div>
  )
}
