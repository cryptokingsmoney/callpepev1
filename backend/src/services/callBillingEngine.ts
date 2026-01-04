import { PrismaClient, CallStatus } from "@prisma/client";
import { Server } from "socket.io";
import { logger } from "../utils/logger";

type Active = {
  callId: string;
  roomId: string;
  payerId: string;
  rateMilliCreditsPerSecond: number;
  lastBilledAtMs: number;
  timer: NodeJS.Timeout;
};

export class CallBillingEngine {
  private active = new Map<string, Active>();

  constructor(private prisma: PrismaClient, private io: Server) {}

  isActive(callId: string) {
    return this.active.has(callId);
  }

  async start(callId: string, roomId: string) {
    if (this.active.has(callId)) return;

    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call) throw new Error("Call not found");
    if (call.status !== "ACTIVE") throw new Error("Call is not active");

    const payerId = call.userId;
    const rateMilli = call.rateMilliCreditsPerSecond ?? 1000;

    const state: Active = {
      callId,
      roomId,
      payerId,
      rateMilliCreditsPerSecond: rateMilli,
      lastBilledAtMs: Date.now(),
      timer: setInterval(() => void this.tick(callId), 1000)
    };

    this.active.set(callId, state);

    // initial ping
    this.io.to(roomId).emit("billing:started", {
      callId,
      ratePerMinuteUsd: rateMilli / 1000,
      rateMilliCreditsPerSecond: rateMilli
    });
  }

  async stop(callId: string, status: CallStatus = "ENDED") {
    const s = this.active.get(callId);
    if (s) {
      clearInterval(s.timer);
      this.active.delete(callId);
    }

    // finalize call + write spend audit record (without changing credits again)
    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call) return;

    const endTime = call.endTime ?? new Date();

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.call.update({
        where: { id: callId },
        data: { endTime, status }
      });

      if (updated.creditsSpentMilli > 0) {
        // Audit spend (credits were already decremented during billing ticks)
        // Unique ref = callId to prevent duplicates on stop() retries.
        await tx.creditTransaction.upsert({
          where: { ref: callId },
          update: {},
          create: {
            userId: updated.userId,
            type: "SPEND",
            usdCents: null,
            creditsDeltaMilli: -updated.creditsSpentMilli,
            ref: callId
          }
        });

        // Creator payout accounting (ledger only; actual payout is handled manually/off-chain)
        // Split rule: 80% creator, 20% platform
        const creatorEarned = Math.floor(updated.creditsSpentMilli * 0.8);
        const ref = `earn_${callId}`;

        // Idempotent upsert: if stop() is retried we don't double-credit earnings.
        await tx.creatorEarningTransaction.upsert({
          where: { ref },
          update: {},
          create: {
            creatorUserId: updated.creatorId,
            callId: updated.id,
            creditsEarnedMilli: creatorEarned,
            ref
          }
        });

        // Increment creator's earned balance
        await tx.creatorProfile.upsert({
          where: { userId: updated.creatorId },
          update: { earnedMilli: { increment: creatorEarned } },
          create: { userId: updated.creatorId, earnedMilli: creatorEarned }
        });
      }
    });

    if (s) {
      this.io.to(s.roomId).emit("billing:ended", { callId, status });
    }
  }

  private async tick(callId: string) {
    const s = this.active.get(callId);
    if (!s) return;

    const now = Date.now();
    const elapsedSec = Math.floor((now - s.lastBilledAtMs) / 1000);
    if (elapsedSec <= 0) return;

    const toBill = elapsedSec; // seconds to bill
    s.lastBilledAtMs += toBill * 1000;

    try {
      const { done, creditsLeft, secondsBilled, creditsSpent } = await this.billSeconds(
        callId,
        s.payerId,
        toBill,
        s.rateMilliCreditsPerSecond
      );

      this.io.to(s.roomId).emit("billing:tick", {
        callId,
        creditsLeftMilli: creditsLeft,
        creditsLeft: creditsLeft / 1000,
        secondsBilled,
        creditsSpentMilli: creditsSpent,
        creditsSpent: creditsSpent / 1000
      });

      if (done) {
        logger.info("Billing ended due to insufficient credits", callId);
        await this.stop(callId, "KILLED_INSUFFICIENT_CREDITS");
      }
    } catch (e: any) {
      logger.error("Billing tick error", e?.message ?? e);
      // On persistent errors, stop to avoid runaway.
      await this.stop(callId, "ENDED");
    }
  }

  private async billSeconds(callId: string, payerId: string, seconds: number, rateMilli: number) {
    // total milli-credits required
    const neededMilli = seconds * rateMilli;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: payerId }, select: { creditsMilli: true } });
      if (!user) throw new Error("Payer not found");

      const leftMilli = user.creditsMilli;
      if (leftMilli <= 0) {
        return { done: true, creditsLeft: 0, secondsBilled: 0, creditsSpent: 0 };
      }

      const chargeMilli = Math.min(leftMilli, neededMilli);
      const secondsBilled = Math.floor(chargeMilli / rateMilli);

      // decrement payer credits
      const updatedUser = await tx.user.update({
        where: { id: payerId },
        data: { creditsMilli: { decrement: chargeMilli } },
        select: { creditsMilli: true }
      });

      const updatedCall = await tx.call.update({
        where: { id: callId },
        data: {
          secondsBilled: { increment: secondsBilled },
          creditsSpentMilli: { increment: chargeMilli }
        },
        select: { secondsBilled: true, creditsSpentMilli: true }
      });

      const done = chargeMilli < neededMilli;

      return {
        done,
        creditsLeft: updatedUser.creditsMilli,
        secondsBilled: updatedCall.secondsBilled,
        creditsSpent: updatedCall.creditsSpentMilli
      };
    });
  }
}
