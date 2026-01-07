import type { Request, Response } from "express";
import Stripe from "stripe";
import { stripe } from "../config/stripe";
import { ENV } from "../config/env";
import { BillingService } from "../services/billing.service";
import { PrismaClient } from "@prisma/client";
import { usdToMilliCredits } from "../utils/priceEngine";

// ⚠️ In production you usually want ONE PrismaClient for the whole app (singleton), not per request.
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
        // @ts-expect-error - optional fields
        isFrozen: true,
        // @ts-expect-error - optional fields
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
        // @ts-expect-error - optional fields
        isFrozen: false,
        // @ts-expect-error - optional fields
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
  type: "PURCHASE" | "REFUND" | "DISPUTE" | "ADJUSTMENT";
  usdCents: number;
  creditsDeltaMilli: number;
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
    // req.body MUST be a raw Buffer (route must use express.raw({ type: "application/json" }))
    event = stripe.webhooks.constructEvent(req.body, sig, ENV.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err?.message ?? "Invalid signature"}`);
  }

  // Optional global idempotency on event.id
  if (await wasEventProcessed(event.id)) {
    return res.json({ received: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Optional safety: only fulfill paid sessions
        if (session.payment_status && session.payment_status !== "paid") break;

        const userId = await resolveUserIdFromCheckoutSession(session);
