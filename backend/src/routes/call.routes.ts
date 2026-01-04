import { Router } from "express";
import { CallController } from "../controllers/call.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();
const controller = new CallController();

router.post("/start", requireAuth, (req, res) => controller.start(req as any, res));
router.post("/end", requireAuth, (req, res) => controller.end(req as any, res));

export default router;
