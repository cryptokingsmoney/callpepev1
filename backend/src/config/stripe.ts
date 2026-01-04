import Stripe from "stripe";
import { ENV } from "./env";

if (!ENV.STRIPE_KEY) {
  console.warn("⚠ STRIPE_KEY is not set. Stripe will not work until you configure it.");
}

export const stripe = new Stripe(ENV.STRIPE_KEY || "sk_test_placeholder", {
  apiVersion: "2024-06-20" as any
});
