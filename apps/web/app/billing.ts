import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { createPrivilegedDatabaseClient } from "@velyq/database/server";
import { billingCustomers } from "@velyq/database/schema/private";

export type PaidPlan = "PRO" | "ELITE";

function stripe() {
  const secret = process.env["STRIPE_SECRET_KEY"];
  if (!secret) return null;
  return new Stripe(secret);
}

export function priceIdFor(plan: PaidPlan) {
  return plan === "PRO"
    ? process.env["STRIPE_PRO_PRICE_ID"]
    : process.env["STRIPE_ELITE_PRICE_ID"];
}

export async function getOrCreateStripeCustomer(userId: string, email: string) {
  const api = stripe();
  const databaseUrl = process.env["VELYQ_DATABASE_URL"];
  if (!api || !databaseUrl) throw new Error("BILLING_NOT_CONFIGURED");
  const client = createPrivilegedDatabaseClient({
    connectionString: databaseUrl,
  });
  try {
    const existing = await client.database
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1);
    if (existing[0]) return existing[0].stripeCustomerId;
    const customer = await api.customers.create({
      email,
      metadata: { velyqUserId: userId },
    });
    await client.database
      .insert(billingCustomers)
      .values({ userId, stripeCustomerId: customer.id })
      .onConflictDoNothing({ target: billingCustomers.userId });
    return customer.id;
  } finally {
    await client.close();
  }
}

export function stripeClient() {
  const api = stripe();
  if (!api) throw new Error("BILLING_NOT_CONFIGURED");
  return api;
}
