import { apiGet, apiPost } from './api'

export type StripeConnectStatus = {
  connected: boolean
  stripeAccountId?: string
  payoutsEnabled?: boolean
  chargesEnabled?: boolean
}

export async function startStripeOnboarding(): Promise<{ url: string }> {
  return apiPost('/api/stripe/connect/onboard', {})
}

export async function getStripeConnectStatus(): Promise<StripeConnectStatus> {
  return apiGet('/api/stripe/connect/status')
}
