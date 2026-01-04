import { Router } from "express";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

function usdPerMinuteToMilliCps(ratePerMinute: any): number {
  const n = Number(ratePerMinute);
  if (!Number.isFinite(n) || n <= 0) return 1000;
  // $1/min => 1000 milli-credits/sec, $0.25/min => 250 milli-credits/sec
  return Math.max(1, Math.round(n * 1000));
}

/**
 * Upsert creator profile for a wallet.
 * POST /api/creators/settings
 * body: { walletAddress, ratePerMinute, bio? }
 */
router.post("/settings", async (req, res, next) => {
  try {
    const { walletAddress, ratePerMinute, bio } = req.body || {};

    if (!walletAddress || ratePerMinute === undefined || ratePerMinute === null) {
      return res
        .status(400)
        .json({ error: "walletAddress and ratePerMinute are required" });
    }

    const wallet = String(walletAddress).toLowerCase();

    let user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) {
      user = await prisma.user.create({
        data: { wallet, role: UserRole.CREATOR }
      });
    } else if (user.role !== UserRole.CREATOR) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: UserRole.CREATOR }
      });
    }

    const mCps = usdPerMinuteToMilliCps(ratePerMinute);

    const profile = await prisma.creatorProfile.upsert({
      where: { userId: user.id },
      update: { rateMilliCreditsPerSecond: mCps, bio: bio ?? undefined },
      create: { userId: user.id, rateMilliCreditsPerSecond: mCps, bio: bio ?? undefined },
      include: { user: true }
    });

    return res.json({ ...profile, ratePerMinute: profile.rateMilliCreditsPerSecond / 1000 });
  } catch (err) {
    next(err);
  }
});

/**
 * Simple toggle for online status
 * POST /api/creators/online
 * body: { walletAddress, isOnline }
 */
router.post("/online", async (req, res, next) => {
  try {
    const { walletAddress, isOnline } = req.body || {};
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress is required" });
    }

    const wallet = String(walletAddress).toLowerCase();
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) {
      return res.status(404).json({ error: "User not found for wallet" });
    }

    const profile = await prisma.creatorProfile.upsert({
      where: { userId: user.id },
      update: { isOnline: !!isOnline },
      create: { userId: user.id, isOnline: !!isOnline, rateMilliCreditsPerSecond: 1000 },
      include: { user: true }
    });

    return res.json({ ...profile, ratePerMinute: profile.rateMilliCreditsPerSecond / 1000 });
  } catch (err) {
    next(err);
  }
});

/**
 * List all online creators with their profiles + wallet
 * GET /api/creators/online
 */
router.get("/online", async (_req, res, next) => {
  try {
    const creators = await prisma.creatorProfile.findMany({
      where: { isOnline: true },
      include: { user: true }
    });

    res.json(creators.map(c => ({ ...c, ratePerMinute: c.rateMilliCreditsPerSecond / 1000 })));
  } catch (err) {
    next(err);
  }
});

export default router;
