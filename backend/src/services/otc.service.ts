// Placeholder for OTC engine: BNB / PEPU / other crypto -> credits/CPEPE
export class OtcService {
  async handleOnChainPurchase(txHash: string) {
    // 1. Look up tx on chain
    // 2. Verify amount + wallet
    // 3. Credit user in DB
    // This is intentionally left as a stub for you to wire into your chain of choice.
    return { ok: true, txHash };
  }
}
