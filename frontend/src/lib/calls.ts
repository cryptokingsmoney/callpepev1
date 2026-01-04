import { apiPost } from './api'

export type CallRecord = {
  id: string
  userId: string
  creatorId: string
  roomId?: string | null
  status: 'ACTIVE' | 'ENDED' | 'KILLED_INSUFFICIENT_CREDITS'
  startTime: string
  endTime?: string | null
  secondsBilled: number
  creditsSpent: number
  rateCreditsPerSecond: number
}

// backend: POST /api/calls/start { creatorId, roomId } (auth required)
export async function startCall(creatorId: string, roomId: string): Promise<CallRecord> {
  return apiPost<CallRecord>('/api/calls/start', { creatorId, roomId })
}

// backend: POST /api/calls/end { callId } (auth required)
export async function endCall(callId: string): Promise<CallRecord> {
  return apiPost<CallRecord>('/api/calls/end', { callId })
}
