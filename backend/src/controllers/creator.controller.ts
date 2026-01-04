import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { CreatorService } from "../services/creator.service";

const creatorService = new CreatorService();

export class CreatorController {
  async listCreators(_req: AuthRequest, res: Response) {
    const creators = await creatorService.listCreators();
    res.json(creators);
  }

  async setRate(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const { ratePerMinuteUsd } = req.body;
    const updated = await creatorService.setRatePerMinute(req.user.id, ratePerMinuteUsd);
    res.json(updated);
  }
}
