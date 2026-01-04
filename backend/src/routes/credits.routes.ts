import { Router } from "express";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";
import { PrismaClient } from "@prisma/client";
import { CreditService } from "../services/credit.service";

const router = Router();
const prisma = new PrismaClient();
const creditService = new CreditService(prisma);

// GET /api/credits/balance
router.get("/balance", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  const creditsMilli = await creditService.getBalance(req.user.id);
  // Return both milli + display credits for convenience
  return res.json({ creditsMilli, credits: creditsMilli / 1000 });
});

// POST /api/credits/claim
// Body: { txHash: string, tokenAddress?: string, amount: string }
// Verifies an on-chain ERC20 transfer to treasury, then credits the user.
router.post("/claim", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  const { txHash, tokenAddress, amount } = req.body as {
    txHash?: string;
    tokenAddress?: string;
    amount?: string;
  };

  if (!txHash || typeof txHash !== "string") {
    return res.status(400).json({ message: "Missing txHash" });
  }
  if (!amount || typeof amount !== "string") {
    return res.status(400).json({ message: "Missing amount" });
  }

  const result = await creditService.claimWithUsdcTransfer({
    userId: req.user.id,
    txHash,
    tokenAddress,
    amount
  });

  // Also include display credits for convenience
  return res.json({
    ...result,
    credits: result.creditsMilli / 1000,
    added: result.addedMilli / 1000
  });
});

export default router;
