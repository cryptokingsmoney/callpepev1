// Placeholder for converting fiat / credits -> CPEPE amount, based on price feed
export function usdToCpepe(usd: number, cpepePriceUsd: number): number {
  if (cpepePriceUsd <= 0) throw new Error("Invalid CPEPE price");
  return usd / cpepePriceUsd;
}
