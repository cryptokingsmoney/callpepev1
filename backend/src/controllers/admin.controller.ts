import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { stripe } from "../config/stripe";

const prisma = new PrismaClient();

function milliToUsdCents(milli: number): number {
  // $1.00 = 60 credits, 1 credit = 1000 milli => $1 = 60,000 milli
  return Math.max(0, Math.round((milli / 60000) * 100));
}

export class AdminController {
  async health(_req: Request, res: Response) {
    res.json({ status: "ok", service: "callpepe-backend" });
  }

  async listPayoutRequests(req: Request, res: Response) {
    const status = (req.query.status as string | undefined) || "REQUESTED";
    const items = await prisma.creatorPayoutRequest.findMany({
      where: { status: status as any },
      orderBy: { createdAt: "desc" }
    });
    res.json(items);
  }

  /**
   * Send a Stripe Connect transfer for a payout request.
   * POST /api/admin/payouts/:id/send-stripe
   */
  async sendStripePayout(req: Request, res: Response) {
    const id = String(req.params.id);
    const pr = await prisma.creatorPayoutRequest.findUnique({ where: { id } });
    if (!pr) return res.status(404).json({ message: "Not found" });
    if (pr.status !== "REQUESTED") return res.status(400).json({ message: "Payout is not in REQUESTED status" });
    if (pr.method !== "STRIPE") return res.status(400).json({ message: "Payout method is not STRIPE" });

    const destinationAccount = pr.destination;
    const amount = milliToUsdCents(pr.amountMilli);
    if (amount <= 0) return res.status(400).json({ message: "Invalid payout amount" });

    const transfer = await stripe.transfers.create({
      amount,
      currency: "usd",
      destination: destinationAccount,
      metadata: {
        payoutRequestId: pr.id,
        creatorUserId: pr.creatorUserId
      }
    });

    await prisma.$transaction([
      prisma.creatorPayoutRequest.update({
        where: { id: pr.id },
        data: {
          status: "SENT",
          stripeTransferId: transfer.id
        }
      }),
      prisma.creatorProfile.update({
        where: { userId: pr.creatorUserId },
        data: {
          paidOutMilli: { increment: pr.amountMilli }
        }
      })
    ]);

    res.json({ ok: true, transferId: transfer.id });
  }
}
