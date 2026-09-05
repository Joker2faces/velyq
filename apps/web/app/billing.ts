import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { createPrivilegedDatabaseClient } from "@velyq/database/server";
import { billingCustomers } from "@velyq/database/schema/private";
import {
  billingPriceConfiguration,
  type BillingPriceConfiguration,
  type PaidPlan,
} from "./plan-config";

export { billingPriceConfiguration, type PaidPlan } from "./plan-config";

function stripe() {
  const secret = process.env["STRIPE_SECRET_KEY"];
  if (!secret) return null;
  return new Stripe(secret);
}

export function priceIdFor(plan: PaidPlan) {
  return billingPriceConfiguration()?.[plan] ?? null;
}

export function planForPriceId(
  priceId: string,
  configuration: BillingPriceConfiguration | null = billingPriceConfiguration(),
): PaidPlan | null {
  if (!configuration) return null;
  if (priceId === configuration.PRO) return "PRO";
  if (priceId === configuration.ELITE) return "ELITE";
  return null;
}

export function subscriptionPeriod(item: {
  current_period_start: number;
  current_period_end: number;
}) {
  return {
    start: new Date(item.current_period_start * 1000),
    end: new Date(item.current_period_end * 1000),
  };
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
    const customer = await api.customers.create(
      { email, metadata: { velyqUserId: userId } },
      { idempotencyKey: `velyq-customer-${userId}` },
    );
    const inserted = await client.database
      .insert(billingCustomers)
      .values({ userId, stripeCustomerId: customer.id })
      .onConflictDoNothing({ target: billingCustomers.userId })
      .returning({ stripeCustomerId: billingCustomers.stripeCustomerId });
    if (inserted[0]) return inserted[0].stripeCustomerId;
    const concurrent = await client.database
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1);
    return concurrent[0]?.stripeCustomerId ?? customer.id;
  } finally {
    await client.close();
  }
}

export async function getStripeCustomer(userId: string) {
  const databaseUrl = process.env["VELYQ_DATABASE_URL"];
  if (!databaseUrl) throw new Error("BILLING_NOT_CONFIGURED");
  const client = createPrivilegedDatabaseClient({
    connectionString: databaseUrl,
  });
  try {
    const existing = await client.database
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1);
    return existing[0]?.stripeCustomerId ?? null;
  } finally {
    await client.close();
  }
}

export function stripeClient() {
  const api = stripe();
  if (!api) throw new Error("BILLING_NOT_CONFIGURED");
  return api;
}
