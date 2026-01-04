import { Router } from "express";
import { ENV } from "../config/env";

// Twilio TURN/STUN: server-side fetch so secrets never touch the browser.
// If Twilio is not configured, we fall back to public STUN only.

const router = Router();

router.get("/ice", async (_req, res) => {
  try {
    if (!ENV.TWILIO_ACCOUNT_SID || !ENV.TWILIO_AUTH_TOKEN) {
      return res.json({
        provider: "stun-only",
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]
      });
    }

    // Lazy import so the server can still boot without Twilio envs.
    const twilio = (await import("twilio")).default as any;
    const client = twilio(ENV.TWILIO_ACCOUNT_SID, ENV.TWILIO_AUTH_TOKEN);
    const token = await client.tokens.create({ ttl: ENV.TWILIO_TURN_TTL });

    return res.json({
      provider: "twilio",
      iceServers: token.iceServers
    });
  } catch (err: any) {
    // Do not hard-fail calls if Twilio is having trouble.
    return res.status(200).json({
      provider: "stun-only",
      warning: "Failed to fetch Twilio ICE servers; using STUN only.",
      iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]
    });
  }
});

export default router;
