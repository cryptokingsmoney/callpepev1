import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { CallService } from "../services/call.service";

const callService = new CallService();

export class CallController {
  async start(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const { creatorId, roomId } = req.body as { creatorId?: string; roomId?: string };
    if (!creatorId) return res.status(400).json({ message: "Missing creatorId" });
    const call = await callService.startCall(req.user.id, creatorId, roomId);
    res.json(call);
  }

  async end(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const { callId } = req.body as { callId?: string };
    if (!callId) return res.status(400).json({ message: "Missing callId" });
    const call = await callService.endCall(callId);
    res.json(call);
  }
}
