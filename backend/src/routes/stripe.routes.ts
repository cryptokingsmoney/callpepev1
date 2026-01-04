import { Router } from "express";
import { PrismaClient, UserRole } from "@prisma/client";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";
import { stripe } from "../config/stripe";
import { ENV } from "../config/env";

const router = Router();
const prisma = new PrismaClient();

/**
 * Stripe Connect onboarding for creators.
 * POST /api/stripe/connect/onboard
 * Returns { url }
 */
router.post("/connect/onboard", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  // Ensure user is a creator
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { creatorProfile: true } });
  if (!user) return res.status(404).json({ message: "User not found" });
  if (user.role !== UserRole.CREATOR) {
    await prisma.user.update({ where: { id: user.id }, data: { role: UserRole.CREATOR } });
  }

  let stripeAccountId = user.creatorProfile?.stripeAccountId || null;
  if (!stripeAccountId) {
    const acct = await stripe.accounts.create({
      type: "express",
      capabilities: {
        transfers: { requested: true }
      },
      metadata: { userId: user.id }
    });
    stripeAccountId = acct.id;
    await prisma.creatorProfile.upsert({
      where: { userId: user.id },
      update: { stripeAccountId },
      create: { userId: user.id, stripeAccountId, rateMilliCreditsPerSecond: 1000 }
    });
  }

  const refreshUrl = ENV.STRIPE_CONNECT_REFRESH_URL || `${ENV.FRONTEND_URL}/creator?stripe=refresh`;
  const returnUrl = ENV.STRIPE_CONNECT_RETURN_URL || `${ENV.FRONTEND_URL}/creator?stripe=return`;

  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding"
  });

  return res.json({ url: link.url });
});

/**
 * GET /api/stripe/connect/status
 * Returns connected status for the current creator.
 */
router.get("/connect/status", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const profile = await prisma.creatorProfile.findUnique({ where: { userId: req.user.id } });
  if (!profile?.stripeAccountId) {
    return res.json({ connected: false });
  }

  const acct = await stripe.accounts.retrieve(profile.stripeAccountId);
  // @ts-ignore
  const payoutsEnabled = !!acct.payouts_enabled;
  // @ts-ignore
  const chargesEnabled = !!acct.charges_enabled;

  return res.json({
    connected: true,
    stripeAccountId: profile.stripeAccountId,
    payoutsEnabled,
    chargesEnabled
  });
});

export default router;
