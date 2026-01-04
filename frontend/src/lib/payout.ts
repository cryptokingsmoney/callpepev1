import { apiGet, apiPost } from './api'

export type PayoutBalance = {
  earnedMilli: number
  paidOutMilli: number
  pendingMilli: number
  availableMilli: number
  earnedUsd: number
  paidOutUsd: number
  pendingUsd: number
  availableUsd: number
}

export async function getPayoutBalance(): Promise<PayoutBalance> {
  return apiGet<PayoutBalance>('/api/payout/balance')
}

export async function requestPayout(args: {
  amountUsd?: number
  amountMilli?: number
  destination?: string
  note?: string
}): Promise<{ ok: boolean; requestId: string; amountMilli: number; amountUsd: number }> {
  return apiPost('/api/payout/request', args)
}

export async function requestStripePayout(args: {
  amountUsd?: number
  amountMilli?: number
  note?: string
}): Promise<{ ok: boolean; requestId: string; amountMilli: number; amountUsd: number }> {
  return apiPost('/api/payout/request-stripe', args)
}
