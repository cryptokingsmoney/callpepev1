import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes";
import creatorRoutes from "./routes/creator.routes";
import callRoutes from "./routes/call.routes";
import billingRoutes from "./routes/billing.routes";
import adminRoutes from "./routes/admin.routes";
import creditsRoutes from "./routes/credits.routes";
import payoutRoutes from "./routes/payout.routes";
import webrtcRoutes from "./routes/webrtc.routes";
import stripeRoutes from "./routes/stripe.routes";
import { handleStripeWebhook } from "./webhooks/stripeWebhook";
import { rateLimit } from "./middleware/rateLimit";
import { errorHandler } from "./middleware/error.middleware";

const app = express();

app.use(cors());
app.use(helmet());

// Stripe webhooks require the raw body for signature verification.
app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), handleStripeWebhook);

app.use(express.json());
app.use(rateLimit);

app.get("/health", (req, res) => {
  res.json({ ok: true, message: "CallPepe backend alive" });
});

app.use("/api/auth", authRoutes);
app.use("/api/creators", creatorRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/credits", creditsRoutes);
app.use("/api/payout", payoutRoutes);
app.use("/api/webrtc", webrtcRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/admin", adminRoutes);

app.use(errorHandler);

export default app;
