import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PillButton } from '../components/buttons/PillButton'
import { fetchOnlineCreators, CreatorProfile } from '../lib/creators'

export function LobbyPage() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [creators, setCreators] = useState<CreatorProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setErr('')
      setLoading(true)
      try {
        const data = await fetchOnlineCreators()
        if (!alive) return
        setCreators(data ?? [])
      } catch (e: any) {
        if (!alive) return
        setErr(e?.message ?? 'Failed to load creators')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return creators
    return creators.filter((c) => {
      const wallet = (c.user?.wallet ?? '').toLowerCase()
      const id = (c.user?.id ?? c.userId ?? '').toLowerCase()
      const bio = (c.bio ?? '').toLowerCase()
      return wallet.includes(needle) || id.includes(needle) || bio.includes(needle)
    })
  }, [q, creators])

  return (
    <div className="callShell">
      <section className="hero">
        <div className="heroGrid">
          <div>
            <div className="brandRow">
              <img className="logo" src="/callpepe-logo.svg" alt="CallPepe" />
              <div>
                <h1 className="h1">CallPepe live rooms — audio first.</h1>
                <p className="sub">
                  Find a creator, start an audio call, upgrade to video when needed.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <PillButton onClick={() => nav('/create')}>Create a room</PillButton>
              <PillButton variant="ghost" onClick={() => nav('/creator')}>Creator dashboard</PillButton>
            </div>

            <div className="kpiRow" style={{ marginTop: 14 }}>
              <div className="kpi">
                <div className="kpiLabel">Priority flow</div>
                <div className="kpiValue">Audio → Video</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Backend</div>
                <div className="kpiValue">Render wired</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Creator discovery</div>
                <div className="kpiValue">Online list</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="sectionTitle">Quick join by room ID</div>
            <p className="muted" style={{ marginTop: 0 }}>
              If you already have a room link/ID, jump in.
            </p>
            <QuickJoin />
          </div>
        </div>
      </section>

      <div className="card">
        <div className="sectionTitle">Find creators (online)</div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by wallet, id, or bio…"
            style={{ flex: 1, minWidth: 220 }}
          />
          <PillButton variant="ghost" onClick={() => window.location.reload()}>
            Refresh
          </PillButton>
        </div>

        <div style={{ height: 12 }} />

        {loading ? <div className="muted">Loading creators…</div> : null}
        {err ? <div className="muted">Error: {err}</div> : null}

        {!loading && !err && filtered.length === 0 ? (
          <div className="muted">No online creators found right now.</div>
        ) : null}

        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {filtered.map((c, idx) => {
            const creatorId = c.user?.id ?? c.userId ?? ''
            const wallet = c.user?.wallet ?? ''
            const rate = Number.parseFloat(String(c.ratePerMinute ?? 0)) || 0
            return (
              <div key={creatorId || idx} className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>
                      {wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : 'Creator'}
                      <span className="muted" style={{ marginLeft: 8, fontWeight: 700 }}>
                        {c.isOnline ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      Rate: <strong>${rate}</strong>/min • ID: {creatorId || 'n/a'}
                    </div>
                    {c.bio ? <div className="muted" style={{ marginTop: 6 }}>{c.bio}</div> : null}
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <PillButton
                      onClick={() => {
                        const roomId = makeRoomId()
                        nav(`/room/${roomId}?role=guest&creatorId=${encodeURIComponent(creatorId)}`)
                      }}
                    >
                      Call (audio)
                    </PillButton>
                    <PillButton
                      variant="ghost"
                      onClick={() => {
                        const roomId = makeRoomId()
                        // creator link: they open this to host the room
                        const link = `${window.location.origin}/room/${roomId}?role=creator&creatorId=${encodeURIComponent(creatorId)}`
                        navigator.clipboard?.writeText(link)
                        alert('Creator room link copied!')
                      }}
                    >
                      Copy host link
                    </PillButton>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function QuickJoin() {
  const nav = useNavigate()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        const roomId = String(fd.get('roomId') || '').trim()
        if (!roomId) return
        nav(`/room/${encodeURIComponent(roomId)}`)
      }}
    >
      <input className="input" name="roomId" placeholder="Paste room ID (e.g., abc123)" />
      <div style={{ height: 10 }} />
      <PillButton type="submit" className="pillPrimary" style={{ width: '100%' }}>
        Join room
      </PillButton>
    </form>
  )
}

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8)
}
