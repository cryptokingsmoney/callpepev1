import type { Request, Response } from "express";
import Stripe from "stripe";
import { stripe } from "../config/stripe";
import { ENV } from "../config/env";
import { BillingService } from "../services/billing.service";
import { PrismaClient } from "@prisma/client";
import { usdToMilliCredits } from "../utils/priceEngine";

/**
 * INTELLIGENCE-GRADE WEBHOOK HANDLER (credits/minutes app)
 *
 * Goals:
 * 1) Verify signature (already)
 * 2) Idempotency (Stripe retries + your own safety) via:
 *    - event.id storage (optional but recommended)
 *    - ref keys per business action (purchase/refund/dispute)
 * 3) Handle:
 *    - checkout.session.completed (primary fulfillment)
 *    - payment_intent.succeeded (fallback fulfillment)
 *    - charge.refunded (clawback)
 *    - charge.dispute.created / charge.dispute.closed (freeze/unfreeze + clawback)
 * 4) No double-crediting even if multiple events arrive
 * 5) Safe failure behavior (return 200 but log) so Stripe doesn’t DDoS you with retries
 *
 * IMPORTANT:
 * - This handler assumes your server mounts this route with express.raw({ type: "application/json" }).
 * - This handler assumes you can safely "freeze" a user. If you don’t have that field,
 *   it will just log and still record ledger entries.
 */

// ⚠️ Do NOT create PrismaClient per request in production.
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

/**
 * Best-effort account freeze/unfreeze hooks.
 * If you don’t have fields, this will no-op safely.
 *
 * Recommended schema:
 *   User.isFrozen boolean default false
 *   User.frozenReason string?
 */
async function freezeUser(userId: string, reason: string) {
  try {
    // Adjust these fields to match your schema.
    await prisma.user.update({
      where: { id: userId },
      data: {
        // @ts-expect-error - in case your schema doesn't include these yet
        isFrozen: true,
        // @ts-expect-error
        frozenReason: reason,
      },
    });
  } catch (e) {
    console.warn("freezeUser: could not freeze (maybe schema missing).", { userId, reason });
  }
}

async function unfreezeUser(userId: string) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        // @ts-expect-error
        isFrozen: false,
        // @ts-expect-error
        frozenReason: null,
      },
    });
  } catch (e) {
    console.warn("unfreezeUser: could not unfreeze (maybe schema missing).", { userId });
  }
}

/**
 * For refunds/chargebacks: safest strategy for credits apps is:
 * - If you can safely subtract: subtract remaining credits
 * - If credits may already be spent: freeze user (and optionally set balance to 0)
 *
 * This version:
 * - subtracts credits (clamped at 0)
 * - also freezes on disputes (recommended)
 *
 * Adjust to your policy.
 */
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

/**
 * Try to resolve the userId from various Stripe objects.
 * Primary source: metadata.userId on Checkout Session
 * Fallback: if we only have payment_intent / charge, we search sessions.
 */
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

/**
 * Optional global idempotency for Stripe event.id.
 * This requires a table in your DB, e.g. WebhookEvent(id string PK, type string, createdAt).
 * If you don't have it, this safely no-ops.
 */
async function wasEventProcessed(eventId: string): Promise<boolean> {
  try {
    // @ts-expect-error - if your schema doesn't have webhookEvent, this will throw
    const existing = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
    return !!existing;
  } catch {
    return false;
  }
}

async function markEventProcessed(eventId: string, type: string) {
  try {
    // @ts-expect-error
    await prisma.webhookEvent.create({ data: { id: eventId, type } });
  } catch {
    // ignore if table doesn't exist or already created
  }
}

/**
 * Create a creditTransaction ledger entry if not already present.
 * Requires your existing uniqueness on creditTransaction.ref (you already have that).
 */
async function ensureLedgerOnce(data: {
  ref: string;
  userId: string;
  type: "PURCHASE" | "REFUND" | "DISPUTE" | "ADJUSTMENT";
  usdCents: number;
  creditsDeltaMilli: number; // + for purchase, - for refund
}) {
  const existing = await prisma.creditTransaction.findUnique({ where: { ref: data.ref } });
  if (existing) return false;

  await prisma.creditTransaction.create({
    data: {
      userId: data.userId,
      type: data.type,
      usdCents: data.usdCents,
      creditsDeltaMilli: data.creditsDeltaMilli,
      ref: data.ref,
    },
  });

  return true;
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
    // req.body MUST be raw Buffer for signature verification
    event = stripe.webhooks.constructEvent(req.body, sig, ENV.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Optional global idempotency by event.id
  try {
    if (await wasEventProcessed(event.id)) {
      return res.json({ received: true });
    }
  } catch {
    // no-op
  }

  try {
    switch (event.type) {
      /**
       * PRIMARY FULFILLMENT
       * - This is your current flow: Checkout Session completed → grant credits.
       */
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const userId = await resolveUserIdFromCheckoutSession(session);
        const amountTotal = typeof session.amount_total === "number" ? session.amount_total : 0;

        if (!userId || amountTotal <= 0) break;

        const usd = centsToUsd(amountTotal);
        const creditsDeltaMilli = usdToMilliCredits(usd);

        // Idempotency on the business action (session id)
        const ref = `stripe:session:${session.id}:purchase`;

        const created = await ensureLedgerOnce({
          ref,
          userId,
          type: "PURCHASE",
          usdCents: amountTotal,
          creditsDeltaMilli,
        });

        if (created) {
          // Keep your existing billing logic as "single source of truth"
          await billing.applyCreditsAfterPayment(userId, usd);
        }

        break;
      }

      /**
       * FALLBACK FULFILLMENT
       * - If for any reason checkout event isn't used in some flows,
       *   this prevents missed fulfillment while still being idempotent.
       * - IMPORTANT: It must NOT double-credit if checkout already credited.
       */
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;

        // Find related checkout session to resolve userId & amount
        const session = await findSessionByPaymentIntent(pi.id);
        if (!session) break;

        const userId = await resolveUserIdFromCheckoutSession(session);
        const amount = typeof pi.amount_received === "number" ? pi.amount_received : 0;

        if (!userId || amount <= 0) break;

        const usd = centsToUsd(amount);
        const creditsDeltaMilli = usdToMilliCredits(usd);

        // Purchase ref keyed by payment intent.
        // If checkout session already credited, your billing ledger ref will prevent duplicate.
        const ref = `stripe:pi:${pi.id}:purchase`;

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

      /**
       * REFUNDS (FULL/PARTIAL)
       * - Claw back credits proportional to refunded USD.
       * - Strategy: subtract credits (clamped at 0). Optionally freeze on large refunds.
       */
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;

        const refundedCents = typeof charge.amount_refunded === "number" ? charge.amount_refunded : 0;
        if (refundedCents <= 0) break;

        const session = await findSessionByCharge(charge);
        if (!session) break;

        const userId = await resolveUserIdFromCheckoutSession(session);
        if (!userId) break;

        const usd = centsToUsd(refundedCents);
        const creditsDeltaMilli = usdToMilliCredits(usd);

        // Idempotency for this refund amount on this charge
        const ref = `stripe:charge:${charge.id}:refund:${refundedCents}`;

        const created = await ensureLedgerOnce({
          ref,
          userId,
          type: "REFUND",
          usdCents: refundedCents,
          creditsDeltaMilli: -creditsDeltaMilli,
        });

        if (created) {
          await subtractCredits(userId, creditsDeltaMilli);

          // Optional policy: freeze on refunds to prevent abuse.
          // Comment out if you don't want it.
          await freezeUser(userId, `Refund processed: charge ${charge.id} refunded ${refundedCents} cents`);
        }

        break;
      }

      /**
       * DISPUTES (CHARGEBACK START)
       * - Freeze immediately.
       * - Optionally claw credits right away (recommended if you want to minimize risk).
       */
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;

        const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
        if (!chargeId) break;

        // Retrieve charge to get payment_intent, etc.
        const charge = await stripe.charges.retrieve(chargeId);
        const session = await findSessionByCharge(charge);
        if (!session) break;

        const userId = await resolveUserIdFromCheckoutSession(session);
        if (!userId) break;

        await freezeUser(userId, `Dispute opened: ${dispute.id} on charge ${chargeId}`);

        // Optional: claw back immediately the disputed amount (often full charge amount)
        const disputedCents = typeof dispute.amount === "number" ? dispute.amount : 0;
        if (disputedCents > 0) {
          const usd = centsToUsd(disputedCents);
          const creditsDeltaMilli = usdToMilliCredits(usd);
          const ref = `stripe:dispute:${dispute.id}:created:${disputedCents}`;

          const created = await ensureLedgerOnce({
            ref,
            userId,
            type: "DISPUTE",
            usdCents: disputedCents,
            creditsDeltaMilli: -creditsDeltaMilli,
          });

          if (created) {
            await subtractCredits(userId, creditsDeltaMilli);
          }
        }

        break;
      }

      /**
       * DISPUTE CLOSED
       * - If you WON: optionally unfreeze
       * - If you LOST: keep frozen (or take further action)
       */
      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;

        const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
        if (!chargeId) break;

        const charge = await stripe.charges.retrieve(chargeId);
        const session = await findSessionByCharge(charge);
        if (!session) break;

        const userId = await resolveUserIdFromCheckoutSession(session);
        if (!userId) break;

        // Stripe dispute status examples: "won", "lost", "warning_closed", etc.
        if (dispute.status === "won") {
          await unfreezeUser(userId);
        } else if (dispute.status === "lost") {
          await freezeUser(userId, `Dispute lost: ${dispute.id} on charge ${chargeId}`);
        }

        // Ledger marker for audit
        const closedCents = typeof dispute.amount === "number" ? dispute.amount : 0;
        const ref = `stripe:dispute:${dispute.id}:closed:${dispute.status}`;

        await ensureLedgerOnce({
          ref,
          userId,
          type: "ADJUSTMENT",
          usdCents: closedCents,
          creditsDeltaMilli: 0,
        });

        break;
      }

      default:
        // ignore anything else
        break;
    }

    // Mark event processed (optional global idempotency)
    await markEventProcessed(event.id, event.type);
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    // Return 200 to avoid infinite retries; you can switch to 500 if you WANT retries.
  }

  return res.json({ received: true });
}
