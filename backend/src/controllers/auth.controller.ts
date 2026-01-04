import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";

const authService = new AuthService();

export class AuthController {
  async walletAuth(req: Request, res: Response) {
    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ message: "wallet is required" });

    const result = await authService.loginOrRegister(wallet);
    res.json(result);
  }
}
