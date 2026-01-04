import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { apiBaseUrl } from '../lib/runtime'

export type SocketStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected'

export function useSocket(roomId?: string, userId?: string) {
  // Prefer explicit VITE_SOCKET_URL; otherwise fall back to VITE_API_BASE_URL (same backend host).
  const url = (import.meta.env.VITE_SOCKET_URL as string | undefined) ?? apiBaseUrl()
  const socketRef = useRef<Socket | null>(null)
  const [status, setStatus] = useState<SocketStatus>('idle')

  useEffect(() => {
    if (!url || !roomId) return

    setStatus('connecting')
    const socket = io(url, {
      transports: ['websocket'],
      autoConnect: true,
      // We authenticate via Bearer token (localStorage) on HTTP routes.
      // Socket signaling here is public room-based; keep CORS simple.
      withCredentials: false
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setStatus('connected')
      // backend signaling.ts expects join-call {roomId, userId}
      socket.emit('join-call', { roomId, userId: userId ?? 'anon' })
    })
    socket.on('disconnect', () => setStatus('disconnected'))
    socket.on('connect_error', () => setStatus('error'))

    return () => {
      socket.off()
      socket.disconnect()
      socketRef.current = null
    }
  }, [roomId, url, userId])

  return {
    socket: socketRef.current,
    status
  }
}
