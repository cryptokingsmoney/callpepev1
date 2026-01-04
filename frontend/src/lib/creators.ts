import { apiGet, apiPost } from './api'

export type CreatorProfile = {
  id?: string
  userId?: string
  // Prisma Decimal may serialize as string depending on client/runtime
  ratePerMinute?: number | string
  isOnline?: boolean
  bio?: string | null
  user?: {
    id: string
    wallet: string
    role?: string
  }
}

// backend: GET /api/creators/online
export async function fetchOnlineCreators(): Promise<CreatorProfile[]> {
  return apiGet<CreatorProfile[]>('/api/creators/online')
}

// backend: POST /api/creators/online  { walletAddress, isOnline }
export async function setCreatorOnline(walletAddress: string, isOnline: boolean) {
  return apiPost('/api/creators/online', { walletAddress, isOnline })
}

// backend: POST /api/creators/settings { walletAddress, ratePerMinute, bio? }
export async function saveCreatorSettings(walletAddress: string, ratePerMinute: number, bio?: string, handle?: string) {
  return apiPost('/api/creators/settings', { walletAddress, ratePerMinute, bio, handle })
}
