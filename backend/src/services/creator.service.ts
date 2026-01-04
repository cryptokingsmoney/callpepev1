import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class CreatorService {
  listCreators() {
    return prisma.user.findMany({ where: { role: "CREATOR" } });
  }

  /**
   * Accept USD/min on the API for human clarity.
   * Pricing base: $1 = 60 credits.
   * We store milli-credits and bill in milli-credits/sec.
   * So: milliCreditsPerSecond = usdPerMinute * 1000.
   */
  async setRatePerMinute(creatorId: string, ratePerMinuteUsd: number) {
    const r = Number(ratePerMinuteUsd);
    if (!Number.isFinite(r) || r <= 0) throw new Error("Invalid rate");

    // Allow fractional rates like 0.25/min. We keep milli precision.
    const mCps = Math.max(1, Math.round(r * 1000));
    return prisma.creatorProfile.upsert({
      where: { userId: creatorId },
      update: { rateMilliCreditsPerSecond: mCps },
      create: { userId: creatorId, rateMilliCreditsPerSecond: mCps }
    });
  }
}
