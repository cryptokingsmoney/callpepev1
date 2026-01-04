import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";

const router = Router();
const prisma = new PrismaClient();

function milliToUsd(milli: number): number {
  // $1.00 = 60 credits, 1 credit = 1000 milli => $1 = 60,000 milli
  return milli / 60000;
}

function usdToMilli(usd: number): number {
  return Math.round(usd * 60000);
}

async function getBalances(creatorUserId: string) {
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: creatorUserId },
    select: { earnedMilli: true, paidOutMilli: true }
  });

  const earnedMilli = profile?.earnedMilli ?? 0;
  const paidOutMilli = profile?.paidOutMilli ?? 0;

  const pending = await prisma.creatorPayoutRequest.aggregate({
    where: { creatorUserId, status: "REQUESTED" },
    _sum: { amountMilli: true }
  });
  const pendingMilli = pending._sum.amountMilli ?? 0;

  const availableMilli = Math.max(0, earnedMilli - paidOutMilli - pendingMilli);

  return { earnedMilli, paidOutMilli, pendingMilli, availableMilli };
}

// GET /api/payout/balance
router.get("/balance", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const b = await getBalances(req.user.id);
  return res.json({
    ...b,
    earnedUsd: milliToUsd(b.earnedMilli),
    paidOutUsd: milliToUsd(b.paidOutMilli),
    pendingUsd: milliToUsd(b.pendingMilli),
    availableUsd: milliToUsd(b.availableMilli)
  });
});

// POST /api/payout/request
// Body: { amountUsd?: number|string, amountMilli?: number, destination?: string, note?: string }
router.post("/request", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { wallet: true } });
  const destination = String(req.body?.destination ?? user?.wallet ?? "").toLowerCase();
  const note = req.body?.note ? String(req.body.note) : null;

  let amountMilli: number | null = null;

  if (req.body?.amountMilli != null) {
    const n = Number(req.body.amountMilli);
    if (Number.isFinite(n)) amountMilli = Math.round(n);
  } else if (req.body?.amountUsd != null) {
    const usd = Number(req.body.amountUsd);
    if (Number.isFinite(usd)) amountMilli = usdToMilli(usd);
  }

  if (!amountMilli || amountMilli <= 0) return res.status(400).json({ message: "Invalid amount" });
  if (!destination || destination.length < 10) return res.status(400).json({ message: "Invalid destination" });

  const b = await getBalances(req.user.id);
  if (amountMilli > b.availableMilli) {
    return res.status(400).json({
      message: `Insufficient available balance. Available: $${milliToUsd(b.availableMilli).toFixed(2)}`
    });
  }

  const created = await prisma.creatorPayoutRequest.create({
    data: {
      creatorUserId: req.user.id,
      destination,
      method: "CRYPTO",
      amountMilli,
      status: "REQUESTED",
      note
    }
  });

  return res.json({
    ok: true,
    requestId: created.id,
    amountMilli,
    amountUsd: milliToUsd(amountMilli)
  });
});

// POST /api/payout/request-stripe
// Cashout request to Stripe Connect (platform admin will send transfer)
router.post("/request-stripe", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  let amountMilli: number | null = null;
  if (req.body?.amountMilli != null) {
    const n = Number(req.body.amountMilli);
    if (Number.isFinite(n)) amountMilli = Math.round(n);
  } else if (req.body?.amountUsd != null) {
    const usd = Number(req.body.amountUsd);
    if (Number.isFinite(usd)) amountMilli = usdToMilli(usd);
  }
  if (!amountMilli || amountMilli <= 0) return res.status(400).json({ message: "Invalid amount" });

  const profile = await prisma.creatorProfile.findUnique({ where: { userId: req.user.id }, select: { stripeAccountId: true } });
  if (!profile?.stripeAccountId) {
    return res.status(400).json({ message: "Stripe is not connected. Open Creator Dashboard → Connect Stripe." });
  }

  const b = await getBalances(req.user.id);
  if (amountMilli > b.availableMilli) {
    return res.status(400).json({ message: `Insufficient available balance. Available: $${milliToUsd(b.availableMilli).toFixed(2)}` });
  }

  const note = req.body?.note ? String(req.body.note) : null;
  const created = await prisma.creatorPayoutRequest.create({
    data: {
      creatorUserId: req.user.id,
      destination: profile.stripeAccountId,
      method: "STRIPE",
      amountMilli,
      status: "REQUESTED",
      note
    }
  });

  return res.json({
    ok: true,
    requestId: created.id,
    amountMilli,
    amountUsd: milliToUsd(amountMilli)
  });
});

export default router;
