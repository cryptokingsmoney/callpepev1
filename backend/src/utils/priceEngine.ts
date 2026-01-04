// CallPepe pricing engine
// Rule: $1.00 = 60 credits.
// Storage: milli-credits (1 credit = 1000 milli)

export const CREDITS_PER_USD = 60;
export const MILLI_PER_CREDIT = 1000;

export function usdToMilliCredits(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  // $1 = 60 credits = 60,000 milli-credits
  return Math.floor(usd * CREDITS_PER_USD * MILLI_PER_CREDIT);
}

export function milliCreditsToUsd(milliCredits: number): number {
  if (!Number.isFinite(milliCredits) || milliCredits <= 0) return 0;
  return milliCredits / (CREDITS_PER_USD * MILLI_PER_CREDIT);
}
