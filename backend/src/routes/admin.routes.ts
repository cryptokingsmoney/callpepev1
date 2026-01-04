import { Router } from "express";
import { AdminController } from "../controllers/admin.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const router = Router();
const controller = new AdminController();

router.get("/health", (req, res) => controller.health(req, res));

// Admin payout ops (Stripe cashouts)
router.get("/payouts", requireAuth, requireRole("ADMIN"), (req, res) => controller.listPayoutRequests(req, res));
router.post("/payouts/:id/send-stripe", requireAuth, requireRole("ADMIN"), (req, res) => controller.sendStripePayout(req, res));

export default router;
