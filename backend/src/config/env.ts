import dotenv from "dotenv";
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || "4000",
  NODE_ENV: process.env.NODE_ENV || "development",
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret",
  STRIPE_KEY: process.env.STRIPE_KEY || "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",

  // Stripe Connect (creator cashout)
  STRIPE_CONNECT_REFRESH_URL: process.env.STRIPE_CONNECT_REFRESH_URL || "",
  STRIPE_CONNECT_RETURN_URL: process.env.STRIPE_CONNECT_RETURN_URL || "",

  // Twilio Network Traversal Service (TURN/STUN for reliable WebRTC)
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || "",
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || "",
  TWILIO_TURN_TTL: Number(process.env.TWILIO_TURN_TTL ?? "3600"),

  DATABASE_URL: process.env.DATABASE_URL || "",

  // Web3 (BNB Chain) for stablecoin purchase verification
  BSC_RPC_URL: process.env.BSC_RPC_URL || "",
  TREASURY_ADDRESS: process.env.TREASURY_ADDRESS || "",
  BSC_USDC_ADDRESS: process.env.BSC_USDC_ADDRESS || "",

  // How many confirmations a purchase tx must have before it can be credited.
  // 0 disables the check (not recommended).
  MIN_CONFIRMATIONS: Number(process.env.MIN_CONFIRMATIONS ?? "2"),

  // Frontend base url (for Stripe redirect links)
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173"
};
