export class PayoutService {
  split(amountUsd: number) {
    const creator = amountUsd * 0.8;
    const platform = amountUsd * 0.2;
    return { creator, platform };
  }
}
