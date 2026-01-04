import { stripe } from "../config/stripe";
import { ENV } from "../config/env";
import { usdToMilliCredits } from "../utils/priceEngine";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class BillingService {
  async createStripeCheckout(userId: string, amountUsd: number) {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      metadata: { userId },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amountUsd * 100),
            product_data: {
              name: "CallPepe Credits"
            }
          }
        }
      ],
      success_url: `${ENV.FRONTEND_URL}/credits/success`,
      cancel_url: `${ENV.FRONTEND_URL}/credits/cancel`
    });

    return { url: session.url };
  }

  async applyCreditsAfterPayment(userId: string, amountUsd: number) {
    const creditsMilli = usdToMilliCredits(amountUsd);
    return prisma.user.update({
      where: { id: userId },
      data: {
        creditsMilli: { increment: creditsMilli }
      }
    });
  }
}
