import { Request, Response } from "express";
import { stripe } from "../config/stripe";
import { ENV } from "../config/env";
import { BillingService } from "../services/billing.service";
import { PrismaClient } from "@prisma/client";
import { usdToMilliCredits } from "../utils/priceEngine";

const prisma = new PrismaClient();
const billing = new BillingService();

export async function handleStripeWebhook(req: Request, res: Response) {
  if (!ENV.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ message: "STRIPE_WEBHOOK_SECRET not configured" });
  }

  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!sig) return res.status(400).send("Missing stripe-signature");

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, ENV.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session?.metadata?.userId as string | undefined;
      const amountTotal = session?.amount_total as number | null | undefined;

      if (userId && amountTotal && amountTotal > 0) {
        const usd = amountTotal / 100;

        // Single source of truth for credit math.
        const creditsDeltaMilli = usdToMilliCredits(usd);

        // Idempotency: record a credit tx keyed by Stripe session id.
        const ref = `stripe:${session.id}`;

        const existing = await prisma.creditTransaction.findUnique({ where: { ref } });
        if (!existing) {
          // Apply credits + create ledger entry
          await billing.applyCreditsAfterPayment(userId, usd);
          await prisma.creditTransaction.create({
            data: {
              userId,
              type: "PURCHASE",
              usdCents: amountTotal,
              creditsDeltaMilli,
              ref
            }
          });
        }
      }
    }
  } catch (err) {
    // Return 200 to avoid infinite retries; log to console for now.
    console.error("Stripe webhook handler error:", err);
  }

  return res.json({ received: true });
}
