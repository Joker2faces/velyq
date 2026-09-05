import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  billingEvents,
  billingCustomers,
  subscriptions,
} from "@velyq/database/schema/private";
import { createPrivilegedDatabaseClient } from "@velyq/database/server";
import { stripeClient } from "../../../../billing";

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
    const inserted = await client.database
      .insert(billingEvents)
      .values({ stripeEventId: event.id, eventType: event.type })
      .onConflictDoNothing()
      .returning({ stripeEventId: billingEvents.stripeEventId });
    if (!inserted[0])
      return NextResponse.json({ received: true, duplicate: true });
    if (event.type.startsWith("customer.subscription.")) {
      const subscription = event.data
        .object as import("stripe").default.Subscription;
      const period = subscription as import("stripe").default.Subscription & {
        current_period_start?: number;
        current_period_end?: number;
      };
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
      const customer = await client.database
        .select({ userId: billingCustomers.userId })
        .from(billingCustomers)
        .where(eq(billingCustomers.stripeCustomerId, customerId))
        .limit(1);
      const userId = customer[0]?.userId;
      if (userId) {
        const priceId = subscription.items.data[0]?.price.id;
        const plan =
          priceId && priceId === process.env["STRIPE_ELITE_PRICE_ID"]
            ? "ELITE"
            : "PRO";
        await client.database
          .insert(subscriptions)
          .values({
            userId,
            planCode: plan,
            stripeSubscriptionId: subscription.id,
            status: subscription.status,
            currentPeriodStart: period.current_period_start
              ? new Date(period.current_period_start * 1000)
              : null,
            currentPeriodEnd: period.current_period_end
              ? new Date(period.current_period_end * 1000)
              : null,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          })
          .onConflictDoUpdate({
            target: subscriptions.stripeSubscriptionId,
            set: {
              planCode: plan,
              status: subscription.status,
              currentPeriodStart: period.current_period_start
                ? new Date(period.current_period_start * 1000)
                : null,
              currentPeriodEnd: period.current_period_end
                ? new Date(period.current_period_end * 1000)
                : null,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              updatedAt: new Date(),
            },
          });
      }
    }
    return NextResponse.json({ received: true });
  } finally {
    await client.close();
  }
}
