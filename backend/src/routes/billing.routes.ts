import { Router } from "express";
import { BillingController } from "../controllers/billing.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();
const controller = new BillingController();

router.post("/checkout", requireAuth, (req, res) => controller.createCheckout(req as any, res));

export default router;
