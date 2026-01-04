import { PrismaClient } from "@prisma/client";
import { getCallBillingEngine } from "./engineSingleton";

const prisma = new PrismaClient();

export class CallService {
  async startCall(userId: string, creatorId: string, roomId?: string) {
    // Basic safety: ensure user has at least some milli-credits to start a billed call
    const payer = await prisma.user.findUnique({ where: { id: userId }, select: { creditsMilli: true } });
    if (!payer) throw new Error("User not found");
    if (payer.creditsMilli <= 0) {
      throw new Error("Insufficient credits. Please buy credits to start the call.");
    }

    // Fetch creator rate (defaults to $1/min => 1000 milli-credits/sec)
    const creator = await prisma.creatorProfile.findUnique({ where: { userId: creatorId } });
    const rateMilli = creator?.rateMilliCreditsPerSecond ?? 1000;

    const call = await prisma.call.create({
      data: {
        userId,
        creatorId,
        roomId: roomId || null,
        status: "ACTIVE",
        rateMilliCreditsPerSecond: rateMilli,
        startTime: new Date()
      }
    });

    // Start the server-authoritative per-second billing loop
    if (roomId) {
      const engine = getCallBillingEngine();
      await engine.start(call.id, roomId);
    }

    return call;
  }

  async endCall(callId: string) {
    const call = await prisma.call.findUnique({ where: { id: callId } });
    if (!call) throw new Error("Call not found");

    const engine = getCallBillingEngine();
    if (engine.isActive(callId)) {
      await engine.stop(callId, "ENDED");
    } else {
      // If not running (e.g. server restart), just mark ended
      await prisma.call.update({
        where: { id: callId },
        data: { endTime: new Date(), status: "ENDED" }
      });
    }

    return prisma.call.findUnique({ where: { id: callId } });
  }
}
