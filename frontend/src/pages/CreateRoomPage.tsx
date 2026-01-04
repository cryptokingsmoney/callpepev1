import { useNavigate } from 'react-router-dom'
import { PillButton } from '../components/buttons/PillButton'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

export function CreateRoomPage() {
  const nav = useNavigate()
  const auth = useAuth()
  const [creatorName, setCreatorName] = useState('')

  return (
    <div className="callShell">
      <div className="card">
        <div className="sectionTitle">Create a room</div>
        <p className="muted" style={{ marginTop: 0 }}>
          Rooms are socket-based (roomId). Your backend doesn’t expose a “create room” endpoint yet,
          so we generate a roomId client-side and join sockets.
        </p>

        <label className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Display name</label>
        <input className="input" value={creatorName} onChange={(e) => setCreatorName(e.target.value)} placeholder="e.g., CallPepeHost" />

        <div style={{ height: 12 }} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <PillButton
            onClick={() => {
              const id = makeRoomId()
              const cid = auth.user?.id || ''
              nav(`/room/${id}?role=creator&name=${encodeURIComponent(creatorName || 'Creator')}&creatorId=${encodeURIComponent(cid)}`)
            }}
          >
            Create & host room
          </PillButton>

          <PillButton
            variant="ghost"
            onClick={() => {
              const id = makeRoomId()
              const cid = auth.user?.id || ''
              const host = `${window.location.origin}/room/${id}?role=creator&creatorId=${encodeURIComponent(cid)}`
              navigator.clipboard?.writeText(host)
              alert('Host link copied!')
            }}
          >
            Copy host link
          </PillButton>

          <PillButton variant="ghost" onClick={() => nav('/')}>Back</PillButton>
        </div>

        <div style={{ height: 14 }} />
        <div className="muted" style={{ lineHeight: 1.55 }}>
          <strong>Tip:</strong> Connect wallet first (top right) so your <code>creatorId</code> is included in links.
        </div>
      </div>
    </div>
  )
}

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8)
}
