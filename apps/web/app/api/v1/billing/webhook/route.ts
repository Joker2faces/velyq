import { NextResponse } from "next/server";
import { eq, lte } from "drizzle-orm";
import {
  billingEvents,
  billingCustomers,
  subscriptions,
} from "@velyq/database/schema/private";
import { createPrivilegedDatabaseClient } from "@velyq/database/server";
import {
  billingPriceConfiguration,
  planForPriceId,
  stripeClient,
  subscriptionPeriod,
} from "../../../../billing";

export async function POST(request: Request) {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  const databaseUrl = process.env["VELYQ_DATABASE_URL"];
  const signature = request.headers.get("stripe-signature");
  if (!secret || !databaseUrl || !signature)
    return NextResponse.json({ error: "Webhook unavailable" }, { status: 503 });
  let event: import("stripe").default.Event;
  try {
    event = stripeClient().webhooks.constructEvent(
      await request.text(),
      signature,
      secret,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  const client = createPrivilegedDatabaseClient({
    connectionString: databaseUrl,
  });
  try {
    const duplicate = await client.database.transaction(async (transaction) => {
      const inserted = await transaction
        .insert(billingEvents)
        .values({ stripeEventId: event.id, eventType: event.type })
        .onConflictDoNothing()
        .returning({ stripeEventId: billingEvents.stripeEventId });
      if (!inserted[0]) return true;
      if (!event.type.startsWith("customer.subscription.")) return false;

      const subscription = event.data
        .object as import("stripe").default.Subscription;
      const item = subscription.items.data[0];
      const configuration = billingPriceConfiguration();
      const plan = item ? planForPriceId(item.price.id, configuration) : null;
      if (!item || !plan) throw new Error("UNRECOGNIZED_SUBSCRIPTION_PRICE");
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
      const customer = await transaction
        .select({ userId: billingCustomers.userId })
        .from(billingCustomers)
        .where(eq(billingCustomers.stripeCustomerId, customerId))
        .limit(1);
      const userId = customer[0]?.userId;
      if (!userId) throw new Error("UNKNOWN_BILLING_CUSTOMER");
      const period = subscriptionPeriod(item);
      const stripeEventCreatedAt = new Date(event.created * 1000);
      await transaction
        .insert(subscriptions)
        .values({
          userId,
          planCode: plan,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          stripeEventCreatedAt,
        })
        .onConflictDoUpdate({
          target: subscriptions.stripeSubscriptionId,
          set: {
            planCode: plan,
            status: subscription.status,
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            stripeEventCreatedAt,
            updatedAt: new Date(),
          },
          setWhere: lte(
            subscriptions.stripeEventCreatedAt,
            stripeEventCreatedAt,
          ),
        });
      return false;
    });
    if (duplicate)
      return NextResponse.json({ received: true, duplicate: true });
    return NextResponse.json({ received: true });
  } finally {
    await client.close();
  }
}
