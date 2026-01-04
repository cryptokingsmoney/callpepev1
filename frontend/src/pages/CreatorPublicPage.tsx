import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PillButton } from '../components/buttons/PillButton'
import { apiGet } from '../lib/api'

type CreatorProfile = {
  id: string
  userId: string
  handle?: string | null
  ratePerMinute: any
  bio?: string | null
  isOnline: boolean
  user: { id: string; wallet: string }
}

export function CreatorPublicPage() {
  const nav = useNavigate()
  const { handle = '' } = useParams()
  const [profile, setProfile] = useState<CreatorProfile | null>(null)
  const [err, setErr] = useState<string>('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const p = await apiGet<CreatorProfile>(`/api/creators/public/${encodeURIComponent(handle)}`)
        if (!mounted) return
        setProfile(p)
      } catch (e: any) {
        if (!mounted) return
        setErr(e?.message || 'Creator not found')
      }
    })()
    return () => { mounted = false }
  }, [handle])

  const rate = useMemo(() => {
    if (!profile) return ''
    try { return String(profile.ratePerMinute) } catch { return '' }
  }, [profile])

  if (err) {
    return (
      <div className="callShell">
        <div className="card">
          <div className="sectionTitle">Creator</div>
          <p className="muted" style={{ marginTop: 0 }}>{err}</p>
          <PillButton variant="ghost" onClick={() => nav('/')}>Back</PillButton>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="callShell">
        <div className="card">
          <div className="sectionTitle">Loading…</div>
          <p className="muted" style={{ marginTop: 0 }}>Fetching creator profile</p>
        </div>
      </div>
    )
  }

  const roomId = useMemo(() => makeRoomId(), [])
  const guestLink = `${window.location.origin}/room/${roomId}?role=guest&name=${encodeURIComponent('Guest')}&creatorId=${encodeURIComponent(profile.user.id)}`
  const creatorLink = `${window.location.origin}/room/${roomId}?role=creator&name=${encodeURIComponent(profile.handle || 'Creator')}&creatorId=${encodeURIComponent(profile.user.id)}`

  return (
    <div className="callShell">
      <div className="card">
        <div className="sectionTitle">@{profile.handle || handle}</div>
        <p className="muted" style={{ marginTop: 0 }}>
          Rate: <strong>${rate}</strong>/min • Status: <strong>{profile.isOnline ? 'Online' : 'Offline'}</strong>
        </p>
        {profile.bio ? <p style={{ marginTop: 8 }}>{profile.bio}</p> : null}

        <div style={{ height: 12 }} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <PillButton
            variant="primary"
            onClick={() => {
              // Navigate guest into a new room.
              nav(guestLink.replace(window.location.origin, ''))
            }}
          >
            Start call now
          </PillButton>

          <PillButton
            variant="ghost"
            onClick={() => {
              navigator.clipboard?.writeText(creatorLink)
              alert('Creator join link copied. Send this to the creator if needed.')
            }}
          >
            Copy creator join link
          </PillButton>

          <PillButton variant="ghost" onClick={() => nav('/buy')}>Buy credits</PillButton>
        </div>

        <div style={{ height: 12 }} />
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
          If the creator isn’t already in the room, you can message them the “creator join link” so they can hop in.
          The call starts billing once you connect wallet and press Start Audio/Video inside the room.
        </p>
      </div>
    </div>
  )
}

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8)
}
