import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { BillingService } from "../services/billing.service";

const billingService = new BillingService();

export class BillingController {
  async createCheckout(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    // Accept either { amountUsd } (number) OR { dollars } (integer).
    const body = (req.body ?? {}) as any;
    const amountUsdRaw = body.amountUsd ?? body.dollars;
    const amountUsd = Number(amountUsdRaw);

    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return res.status(400).json({ message: "amountUsd (or dollars) must be a positive number" });
    }
    // Keep Stripe amounts sane and prevent huge accidental charges.
    if (amountUsd > 1000) {
      return res.status(400).json({ message: "amountUsd is too large (max 1000)" });
    }

    const session = await billingService.createStripeCheckout(req.user.id, amountUsd);
    res.json(session);
  }
}
