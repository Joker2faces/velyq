import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import {
  resolveCustomerEntitlements,
  type CustomerPlan,
  type SubscriptionStatus,
} from "@velyq/auth";
import { subscriptions } from "@velyq/database/schema/private";
import { getCookie, requireCustomerSession, requestId } from "../../../auth";
import { openRuntimeDatabaseSession } from "../../../../runtime-database/runtime-database";

export async function GET(request: Request) {
  const denied = await requireCustomerSession(request);
  if (denied) return denied;
  const token = getCookie(request, "velyq_access_token");
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!token || !url || !key)
    return NextResponse.json(
      { code: "BILLING_UNAVAILABLE", requestId: requestId(request) },
      { status: 503 },
    );
  const identity = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!identity.ok)
    return NextResponse.json(
      { code: "UNAUTHORIZED", requestId: requestId(request) },
      { status: 401 },
    );
  const user = (await identity.json()) as { id?: string };
  if (!user.id)
    return NextResponse.json(
      { code: "UNAUTHORIZED", requestId: requestId(request) },
      { status: 401 },
    );
  const session = await openRuntimeDatabaseSession();
  if (!session)
    return NextResponse.json(
      { code: "BILLING_UNAVAILABLE", requestId: requestId(request) },
      { status: 503 },
    );
  try {
    const row = await session.database
      .select({
        plan: subscriptions.planCode,
        status: subscriptions.status,
        periodStart: subscriptions.currentPeriodStart,
        periodEnd: subscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id))
      .orderBy(desc(subscriptions.stripeEventCreatedAt), desc(subscriptions.id))
      .limit(1);
    const current = row[0];
    const plan: CustomerPlan =
      current?.plan === "PRO" || current?.plan === "ELITE"
        ? current.plan
        : "FREE";
    const status: SubscriptionStatus | null =
      current?.status &&
      [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
        "incomplete_expired",
        "paused",
      ].includes(current.status)
        ? (current.status as SubscriptionStatus)
        : null;
    const resolved = resolveCustomerEntitlements({ plan, status });
    return NextResponse.json({
      plan: resolved.plan,
      subscriptionStatus: resolved.subscriptionStatus,
      currentPeriodStart: current?.periodStart ?? null,
      currentPeriodEnd: current?.periodEnd ?? null,
      cancelAtPeriodEnd: current?.cancelAtPeriodEnd ?? false,
      entitlements: resolved.entitlements,
    });
  } finally {
    await session.close();
  }
}
