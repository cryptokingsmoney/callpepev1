import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { PillButton } from '../components/buttons/PillButton'
import { useSocket } from '../hooks/useSocket'
import { useMediaDevices } from '../hooks/useMediaDevices'
import { useAuth } from '../auth/AuthContext'
import { endCall, startCall } from '../lib/calls'
import { getIceServers } from '../lib/webrtc'

type SignalMsg =
  | { kind: 'offer'; sdp: any }
  | { kind: 'answer'; sdp: any }
  | { kind: 'ice'; candidate: any }

export function RoomPage() {
  const { roomId = '' } = useParams()
  const [sp] = useSearchParams()
  const role = (sp.get('role') || 'guest') as 'guest' | 'creator'
  const name = sp.get('name') || (role === 'creator' ? 'Creator' : 'Guest')
  const creatorId = sp.get('creatorId') || ''

  const auth = useAuth()
  const userId = auth.user?.id || 'anon'
  const { socket, status } = useSocket(roomId, userId)
  const media = useMediaDevices()

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const [rtcConnected, setRtcConnected] = useState(false)

  const [callId, setCallId] = useState<string>('')
  const [secondsBilled, setSecondsBilled] = useState<number>(0)
  const [creditsLeft, setCreditsLeft] = useState<number | null>(null)

  const mins = Math.floor(secondsBilled / 60)
  const secs = secondsBilled % 60

  const socketBadge = useMemo(() => {
    if (status === 'connected') return 'SOCKET: LIVE'
    if (status === 'connecting') return 'SOCKET: ...'
    if (status === 'error') return 'SOCKET: ERROR'
    if (status === 'disconnected') return 'SOCKET: OFF'
    return 'SOCKET: IDLE'
  }, [status])

  // Attach local stream to video
  useEffect(() => {
    const localV = document.getElementById('localVideo') as HTMLVideoElement | null
    if (!localV) return
    const s = media.localStreamRef.current
    if (s) {
      localV.srcObject = s
      localV.muted = true
      localV.playsInline = true
      localV.autoplay = true
    } else {
      localV.srcObject = null
    }
  }, [media.mode, media.isCamOn, media.isMicOn])

  const setRemoteStream = (stream: MediaStream) => {
    const remoteV = document.getElementById('remoteVideo') as HTMLVideoElement | null
    if (!remoteV) return
    remoteV.srcObject = stream
    remoteV.playsInline = true
    remoteV.autoplay = true
  }

  async function ensurePeer(): Promise<RTCPeerConnection> {
    if (pcRef.current) return pcRef.current

    // Twilio TURN/STUN (fetched from backend). Falls back to STUN-only if not configured.
    const iceServers = await getIceServers()

    const pc = new RTCPeerConnection({ iceServers })
    pcRef.current = pc

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return
      socket?.emit('signal', { roomId, data: { kind: 'ice', candidate: ev.candidate } satisfies SignalMsg })
    }

    pc.onconnectionstatechange = () => {
      setRtcConnected(pc.connectionState === 'connected')
    }

    pc.ontrack = (ev) => {
      const [stream] = ev.streams
      if (stream) setRemoteStream(stream)
    }

    return pc
  }

  async function bindLocalTracksToPeer() {
    const pc = await ensurePeer()
    const stream = media.localStreamRef.current
    if (!stream) return
    const existing = pc.getSenders().map(s => s.track?.id).filter(Boolean)
    for (const track of stream.getTracks()) {
      if (existing.includes(track.id)) continue
      pc.addTrack(track, stream)
    }
  }

  async function createAndSendOffer() {
    if (!socket) return
    const pc = await ensurePeer()
    await bindLocalTracksToPeer()
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    socket.emit('signal', { roomId, data: { kind: 'offer', sdp: offer } satisfies SignalMsg })
  }

  async function handleSignal(msg: SignalMsg) {
    const pc = await ensurePeer()
    await bindLocalTracksToPeer()

    if (msg.kind === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket?.emit('signal', { roomId, data: { kind: 'answer', sdp: answer } satisfies SignalMsg })
    } else if (msg.kind === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
    } else if (msg.kind === 'ice') {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
      } catch {
        // ignore
      }
    }
  }

  function cleanupPeer() {
    try {
      pcRef.current?.close()
    } catch {}
    pcRef.current = null
    setRtcConnected(false)
    const remoteV = document.getElementById('remoteVideo') as HTMLVideoElement | null
    if (remoteV) remoteV.srcObject = null
  }

  async function ensureAuthed() {
    if (auth.isAuthed) return true
    alert('Connect wallet (top right) to start a billed call.')
    return false
  }

  // Start backend call when guest arrives (payer)
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!alive) return
      if (role !== 'guest') return
      if (!creatorId) return
      if (callId) return
      const ok = await ensureAuthed()
      if (!ok) return
      try {
        const rec = await startCall(creatorId, roomId)
        if (!alive) return
        setCallId(rec.id)
        setSecondsBilled(0)
        setCreditsLeft(null)
      } catch (e: any) {
        alert(e?.message ?? 'Failed to start billed call')
      }
    })()
    return () => { alive = false }
  }, [role, creatorId, auth.isAuthed, roomId])

  // Socket events
  useEffect(() => {
    if (!socket) return

    const onUserJoined = async () => {
      // The creator becomes the offerer by default
      if (role === 'creator') {
        try { await createAndSendOffer() } catch {}
      }
    }
    const onSignal = async (data: any) => {
      const msg = data as SignalMsg
      if (!msg?.kind) return
      try { await handleSignal(msg) } catch {}
    }
    const onEnded = () => {
      cleanupPeer()
      alert('Call ended')
    }

    const onBillingTick = (payload: any) => {
      if (payload?.callId && callId && payload.callId !== callId) return
      if (typeof payload?.secondsBilled === 'number') setSecondsBilled(payload.secondsBilled)
      if (typeof payload?.creditsLeft === 'number') setCreditsLeft(payload.creditsLeft)
    }

    const onBillingEnded = async (payload: any) => {
      if (payload?.callId && callId && payload.callId !== callId) return
      // Ensure backend call closed
      if (callId) {
        try { await endCall(callId) } catch {}
        setCallId('')
      }
      cleanupPeer()
      alert(payload?.status === 'KILLED_INSUFFICIENT_CREDITS' ? 'Call ended: insufficient credits.' : 'Call ended.')
    }

    socket.on('user-joined', onUserJoined)
    socket.on('signal', onSignal)
    socket.on('call-ended', onEnded)
    socket.on('billing:tick', onBillingTick)
    socket.on('billing:ended', onBillingEnded)

    return () => {
      socket.off('user-joined', onUserJoined)
      socket.off('signal', onSignal)
      socket.off('call-ended', onEnded)
      socket.off('billing:tick', onBillingTick)
      socket.off('billing:ended', onBillingEnded)
    }
  }, [socket, role, roomId, callId])

  return (
    <div className="callShell">
      <div className="card">
        <div className="sectionTitle">Room</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <strong>{roomId}</strong>
          <span className="muted">•</span>
          <span className="muted">{role.toUpperCase()} — {name}</span>
          <span className="muted">•</span>
          <span className="muted">{socketBadge}</span>
          <span className="muted">•</span>
          <span className="muted">RTC {rtcConnected ? 'CONNECTED' : 'WAITING'}</span>
          <span className="muted">•</span>
          <span className="muted">Billed {mins}:{String(secs).padStart(2, '0')}</span>
          {callId ? (
            <>
              <span className="muted">•</span>
              <span className="muted">CallID {callId.slice(0, 8)}…</span>
            </>
          ) : null}
          {creditsLeft !== null ? (
            <>
              <span className="muted">•</span>
              <span className="muted">Credits {creditsLeft}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="videoStage">
        <div className="videoGrid">
          <div className="tile">
            <div className="badge">You</div>
            <video id="localVideo" />
          </div>
          <div className="tile">
            <div className="badge">Remote</div>
            <video id="remoteVideo" />
          </div>
        </div>
      </div>

      <div className="controlsBar">
        <PillButton
          variant="primary"
          onClick={async () => { await media.start('audio') }}
        >
          Start Audio
        </PillButton>
        <PillButton
          variant="primary"
          onClick={async () => { await media.start('video') }}
        >
          Start Video
        </PillButton>

        <PillButton
          variant={media.isMicOn ? 'primary' : 'ghost'}
          onClick={() => media.toggleMic()}
        >
          {media.isMicOn ? 'Mic On' : 'Mic Off'}
        </PillButton>
        <PillButton
          variant={media.isCamOn ? 'primary' : 'ghost'}
          onClick={() => media.toggleCam()}
        >
          {media.isCamOn ? 'Cam On' : 'Cam Off'}
        </PillButton>

        {role === 'creator' ? (
          <PillButton
            variant="ghost"
            onClick={async () => { try { await createAndSendOffer() } catch {} }}
          >
            Create Offer
          </PillButton>
        ) : null}

        <PillButton
          variant="danger"
          onClick={async () => {
            try {
              socket?.emit('end-call', { roomId, callId })
              if (callId) await endCall(callId)
            } catch {}
            cleanupPeer()
          }}
        >
          End Call
        </PillButton>
      </div>
    </div>
  )
}
