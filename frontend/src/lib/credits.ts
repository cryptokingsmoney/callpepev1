export function creditsFromMilli(milli?: number | null): number {
  const n = Number(milli ?? 0)
  if (!Number.isFinite(n)) return 0
  return n / 1000
}

export function formatCredits(milli?: number | null): string {
  const c = creditsFromMilli(milli)
  // show up to 3 decimals (needed for low rates like $0.25/min)
  return c.toLocaleString(undefined, { maximumFractionDigits: 3 })
}
