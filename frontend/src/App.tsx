import { Routes, Route, Navigate } from 'react-router-dom'
import { TopNav } from './components/TopNav'
import { ToastHost } from './components/Toast'
import { LobbyPage } from './pages/LobbyPage'
import { CreateRoomPage } from './pages/CreateRoomPage'
import { RoomPage } from './pages/RoomPage'
import { CreatorDashboardPage } from './pages/CreatorDashboardPage'
import { UserDashboardPage } from './pages/UserDashboardPage'
import { BuyCreditsPage } from './pages/BuyCreditsPage'
import { BuyStripeCreditsPage } from './pages/BuyStripeCreditsPage'
import { CreatorsOnlinePage } from './pages/CreatorsOnlinePage'
import { CreditsSuccessPage } from './pages/CreditsSuccessPage'
import { CreditsCancelPage } from './pages/CreditsCancelPage'
import { CreatorPublicPage } from './pages/CreatorPublicPage'
import { NotFoundPage } from './pages/NotFoundPage'

export default function App() {
  return (
    <div className="appShell">
      <TopNav />
      <main className="main">
        <Routes>
          <Route path="/" element={<LobbyPage />} />
          <Route path="/dashboard" element={<UserDashboardPage />} />
          <Route path="/buy" element={<BuyCreditsPage />} />
          <Route path="/buy/stripe" element={<BuyStripeCreditsPage />} />
          <Route path="/creators" element={<CreatorsOnlinePage />} />
          <Route path="/create" element={<CreateRoomPage />} />
          <Route path="/creator" element={<CreatorDashboardPage />} />
          <Route path="/c/:handle" element={<CreatorPublicPage />} />
          <Route path="/credits/success" element={<CreditsSuccessPage />} />
          <Route path="/credits/cancel" element={<CreditsCancelPage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </main>
      <ToastHost />
      <footer className="footer">
        <div className="footerInner">
          <span className="muted">© {new Date().getFullYear()} CallPepe</span>
          <span className="muted">White UI • Neon Green + Gold • Mobile-first</span>
        </div>
      </footer>
    </div>
  )
}
