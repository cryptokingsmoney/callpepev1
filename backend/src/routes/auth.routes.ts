import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";

const router = Router();
const controller = new AuthController();

router.post("/wallet", (req, res) => controller.walletAuth(req, res));

export default router;
