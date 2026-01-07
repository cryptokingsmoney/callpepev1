import type { Request, Response } from "express";
import Stripe from "stripe";
import { stripe } from "../config/stripe";
import { ENV } from "../config/env";
import { BillingService } from "../services/billing.service";
import { PrismaClient } from "@prisma/client";
import { usdToMilliCredits } from "../utils/priceEngine";

const prisma = new PrismaClient();
const billing = new BillingService();

// --- Helpers ---------------------------------------------------------------

function getSig(req: Request) {
  const sig = req.headers["stripe-signature"];
  return typeof sig === "string" ? sig : undefined;
}

function centsToUsd(cents: number) {
  return cents / 100;
}

function clampNonNegative(n: number) {
  return n < 0 ? 0 : n;
}

async function freezeUser(userId: string, reason: string) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        // @ts-expect-error - optional fields (if you added them)
        isFrozen: true,
        // @ts-expect-error - optional fields (if you added them)
        frozenReason: reason,
      },
    });
  } catch {
    console.warn("freezeUser: no-op (schema may not support).", { userId, reason });
  }
}

async function unfreezeUser(userId: string) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        // @ts-expect-error - optional fields (if you added them)
        isFrozen: false,
        // @ts-expect-error - optional fields (if you added them)
        frozenReason: null,
      },
    });
  } catch {
    console.warn("unfreezeUser: no-op (schema may not support).", { userId });
  }
}

async function subtractCredits(userId: string, creditsDeltaMilliToSubtract: number) {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const current = (user as any).creditsMilli ?? 0;
    const next = clampNonNegative(current - creditsDeltaMilliToSubtract);

    await tx.user.update({
      where: { id: userId },
      data: { creditsMilli: next } as any,
    });
  });
}

async function resolveUserIdFromCheckoutSession(session: Stripe.Checkout.Session) {
  const userId = session?.metadata?.userId;
  return typeof userId === "string" && userId.length ? userId : undefined;
}

async function findSessionByPaymentIntent(paymentIntentId: string) {
  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  });
  return sessions.data?.[0];
}

async function findSessionByCharge(charge: Stripe.Charge) {
  const pi = charge.payment_intent;
  if (!pi) return undefined;
  const paymentIntentId = typeof pi === "string" ? pi : pi.id;
  return await findSessionByPaymentIntent(paymentIntentId);
}

async function wasEventProcessed(eventId: string): Promise<boolean> {
  try {
    // @ts-expect-error - optional table
    const existing = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
    return !!existing;
  } catch {
    return false;
  }
}

async function markEventProcessed(eventId: string, type: string) {
  try {
    // @ts-expect-error - optional table
    await prisma.webhookEvent.create({ data: { id: eventId, type } });
  } catch {
    // ignore
  }
}

async function ensureLedgerOnce(data: {
  ref: string;
  userId: string;
  type: "PURCHASE" | "REFUND" | "ADJUST"; // ✅ matches your Prisma enum
  usdCents: number;
  creditsDeltaMilli: number;
}) {
  // Fast path
  const existing = await prisma.creditTransaction.findUnique({ where: { ref: data.ref } });
  if (existing) return false;

  // Race-safe path
  try {
    await prisma.creditTransaction.create({
      data: {
        userId: data.userId,
        type: data.type as any, // Prisma enum matches these strings
        usdCents: data.usdCents,
        creditsDeltaMilli: data.creditsDeltaMilli,
        ref: data.ref,
      },
    });
    return true;
  } catch (e: any) {
    if (e?.code === "P2002") return false; // unique ref already exists
    throw e;
  }
}

// Fetch refunds robustly even when charge.refunds isn't expanded
async function listRefundsForCharge(charge: Stripe.Charge): Promise<Stripe.Refund[]> {
  const expanded = (charge as any)?.refunds?.data;
  if (Array.isArray(expanded) && expanded.length) return expanded as Stripe.Refund[];

  const all: Stripe.Refund[] = [];
  let starting_after: string | undefined;

  for (;;) {
    const page = await stripe.refunds.list({
      charge: charge.id,
      limit: 100,
      ...(starting_after ? { starting_after } : {}),
    });

    all.push(...page.data);

    if (!page.has_more || page.data.length === 0) break;
    starting_after = page.data[page.data.length - 1].id;
  }

  return all;
}

// --- Main handler ----------------------------------------------------------

export async function handleStripeWebhook(req: Request, res: Response) {
  if (!ENV.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ message: "STRIPE_WEBHOOK_SECRET not configured" });
  }

  const sig = getSig(req);
  if (!sig) return res.status(400).send("Missing stripe-signature");

  let event: Stripe.Event;

  try {
    const rawBody = req.body as Buffer;
    event = stripe.webhooks.constructEvent(rawBody, sig, ENV.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err?.message ?? "Invalid signature"}`);
  }

  if (await wasEventProcessed(event.id)) {
    return res.json({ received: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.payment_status && session.payment_status !== "paid") break;

        const userId = await resolveUserIdFromCheckoutSession(session);
        const amountTotal = typeof session.amount_total === "number" ? session.amount_total : 0;
        if (!userId || amountTotal <= 0) break;

        const usd = centsToUsd(amountTotal);
        const creditsDeltaMilli = usdToMilliCredits(usd);

        const ref = `stripe:session:${session.id}:purchase`;

        const created = await ensureLedgerOnce({
          ref,
          userId,
          type: "PURCHASE",
          usdCents: amountTotal,
          creditsDeltaMilli,
        });

        if (created) {
          await billing.applyCreditsAfterPayment(userId, usd);
        }

        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;

        const session = await findSessionByPaymentIntent(pi.id);
        if (!session) break;

        if (session.payment_status && session.payment_status !== "paid") break;

        const userId = await resolveUserIdFromCheckoutSession(session);
        const amount = typeof pi.amount_received === "number" ? pi.amount_received : 0;
        if (!userId || amount <= 0) break;

        const usd = centsToUsd(amount);
        const creditsDeltaMilli = usdToMilliCredits(usd);

        // SAME canonical ref as checkout session
        const ref = `stripe:session:${session.id}:purchase`;

        const created = await ensureLedgerOnce({
          ref,
          userId,
          type: "PURCHASE",
          usdCents: amount,
          creditsDeltaMilli,
        });

        if (created) {
          await billing.applyCreditsAfterPayment(userId, usd);
        }

        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;

        const session = await findSessionByCharge(charge);
        if (!session) break;

        const userId = await resolveUserIdFromCheckoutSession(session);
        if (!userId) break;

        const refunds = await listRefundsForCharge(charge);
        if (!refunds.length) break;

        for (const r of refunds) {
          if (!r || r.status !== "succeeded") continue;

          const refundedCents = typeof r.amount === "number" ? r.amount : 0;
          if (refundedCents <= 0) continue;

          const usd = centsToUsd(refundedCents);
          const creditsDeltaMilli = usdToMilliCredits(usd);

          const ref = `stripe:refund:${r.id}`;

          const created = await ensureLedgerOnce({
            ref,
            userId,
            type: "REFUND",
            usdCents: refundedCents,
            creditsDeltaMilli: -creditsDeltaMilli,
          });

          if (created) {
            await subtractCredits(userId, creditsDeltaMilli);
            await freezeUser(userId, `Refund: ${r.id} (charge ${charge.id})`);
          }
        }

        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;

        const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
        if (!chargeId) break;

        const charge = await stripe.charges.retrieve(chargeId);
        const session = await findSessionByCharge(charge as Stripe.Charge);
        if (!session) break;

        const userId = await resolveUserIdFromCheckoutSession(session);
        if (!userId) break;

        await freezeUser(userId, `Dispute opened: ${dispute.id} (charge ${chargeId})`);

        const disputedCents = typeof dispute.amount === "number" ? dispute.amount : 0;
        if (disputedCents > 0) {
          const usd = centsToUsd(disputedCents);
          const creditsDeltaMilli = usdToMilliCredits(usd);

          const ref = `stripe:dispute:${dispute.id}:created`;

          // ✅ Use ADJUST (your schema) instead of DISPUTE
          const created = await ensureLedgerOnce({
            ref,
            userId,
            type: "ADJUST",
            usdCents: disputedCents,
            creditsDeltaMilli: -creditsDeltaMilli,
          });

          if (created) {
            await subtractCredits(userId, creditsDeltaMilli);
          }
        }

        break;
      }

      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;

        const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
        if (!chargeId) break;

        const charge = await stripe.charges.retrieve(chargeId);
        const session = await findSessionByCharge(charge as Stripe.Charge);
        if (!session) break;

        const userId = await resolveUserIdFromCheckoutSession(session);
        if (!userId) break;

        if (dispute.status === "won") {
          await unfreezeUser(userId);
        } else if (dispute.status === "lost") {
          await freezeUser(userId, `Dispute lost: ${dispute.id} (charge ${chargeId})`);
        }

        const closedCents = typeof dispute.amount === "number" ? dispute.amount : 0;
        const ref = `stripe:dispute:${dispute.id}:closed:${dispute.status}`;

        // ✅ Use ADJUST (your schema) instead of ADJUSTMENT
        await ensureLedgerOnce({
          ref,
          userId,
          type: "ADJUST",
          usdCents: closedCents,
          creditsDeltaMilli: 0,
        });

        break;
      }

      default:
        break;
    }

    await markEventProcessed(event.id, event.type);
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
  }

  return res.json({ received: true });
}
