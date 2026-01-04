import { Link, NavLink } from 'react-router-dom'
import { PillButton } from './buttons/PillButton'
import { useToast } from './Toast'
import { useAuth } from '../auth/AuthContext'

export function TopNav() {
  const toast = useToast()
  const auth = useAuth()

  return (
    <header className="topNav">
      <div className="topNavInner">
        <Link to="/" className="brandRow" style={{ gap: 10 }}>
          <img className="logo" src="/callpepe-logo.svg" alt="CallPepe" />
          <div>
            <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>CallPepe</div>
            <div className="muted" style={{ fontSize: 11 }}>Creator call rooms</div>
          </div>
        </Link>

        <nav className="navLinks">
          <NavLink className="navLink" to="/dashboard">Dashboard</NavLink>
          <NavLink className="navLink" to="/create">Create</NavLink>
          <NavLink className="navLink" to="/creator">Creator</NavLink>

          <PillButton
            variant="ghost"
            onClick={async () => {
              const ok = await auth.connectWallet()
              toast.push(ok ? `Logged in: ${auth.wallet?.slice(0,6)}…${auth.wallet?.slice(-4)}` : 'Wallet connect/login failed.')
            }}
          >
            {auth.isAuthed ? (auth.wallet ? `${auth.wallet.slice(0,6)}…${auth.wallet.slice(-4)}` : 'Logged in') : 'Connect wallet'}
          </PillButton>
        </nav>
      </div>
    </header>
  )
}
