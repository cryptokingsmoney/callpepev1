import { Request, Response, NextFunction } from "express";

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 100;
const ipStore = new Map<string, { count: number; ts: number }>();

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const data = ipStore.get(ip) || { count: 0, ts: now };
  if (now - data.ts > WINDOW_MS) {
    data.count = 0;
    data.ts = now;
  }
  data.count += 1;
  ipStore.set(ip, data);

  if (data.count > MAX_REQUESTS) {
    return res.status(429).json({ message: "Too many requests" });
  }

  next();
}
