import { apiGet } from './api'

type IceResponse = {
  provider: string
  iceServers: RTCIceServer[]
  warning?: string
}

let cached: RTCIceServer[] | null = null

/**
 * Fetch ICE servers from backend (Twilio TURN/STUN). Cached per session.
 * If the backend is not configured, it returns STUN-only.
 */
export async function getIceServers(): Promise<RTCIceServer[]> {
  if (cached) return cached
  try {
    const res = await apiGet<IceResponse>('/api/webrtc/ice')
    const servers = res?.iceServers && Array.isArray(res.iceServers) ? res.iceServers : [{ urls: ['stun:stun.l.google.com:19302'] }]
    cached = servers
    return servers
  } catch {
    cached = [{ urls: ['stun:stun.l.google.com:19302'] }]
    return cached
  }
}
