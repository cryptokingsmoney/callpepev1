import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type MediaMode = 'audio' | 'video'

export function useMediaDevices() {
  const localStreamRef = useRef<MediaStream | null>(null)
  const [mode, setMode] = useState<MediaMode>('audio')
  const [isMicOn, setMicOn] = useState(true)
  const [isCamOn, setCamOn] = useState(false)
  const [error, setError] = useState<string>('')

  const start = useCallback(async (nextMode: MediaMode) => {
    setError('')
    try {
      // stop any existing tracks
      localStreamRef.current?.getTracks().forEach(t => t.stop())
      localStreamRef.current = null

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: nextMode === 'video'
      })
      localStreamRef.current = stream
      setMode(nextMode)
      setMicOn(true)
      setCamOn(nextMode === 'video')
      return stream
    } catch (e: any) {
      setError(e?.message ?? 'Failed to access media devices')
      return null
    }
  }, [])

  const stop = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    setMicOn(false)
    setCamOn(false)
  }, [])

  const toggleMic = useCallback(() => {
    const s = localStreamRef.current
    if (!s) return
    const track = s.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMicOn(track.enabled)
  }, [])

  const toggleCam = useCallback(() => {
    const s = localStreamRef.current
    if (!s) return
    const track = s.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setCamOn(track.enabled)
  }, [])

  // Attempt to keep flags synced if tracks change
  useEffect(() => {
    const s = localStreamRef.current
    if (!s) return
    const onEnded = () => {
      setMicOn(false)
      setCamOn(false)
    }
    s.getTracks().forEach(t => t.addEventListener('ended', onEnded))
    return () => s.getTracks().forEach(t => t.removeEventListener('ended', onEnded))
  }, [localStreamRef.current])

  return useMemo(() => ({
    localStreamRef,
    mode,
    isMicOn,
    isCamOn,
    error,
    start,
    stop,
    toggleMic,
    toggleCam,
    setMode
  }), [mode, isMicOn, isCamOn, error, start, stop, toggleMic, toggleCam])
}
