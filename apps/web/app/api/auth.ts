import { NextResponse } from "next/server";
import {
  hasCustomerEntitlement,
  hasPermission,
  resolveCustomerEntitlements,
  type CustomerEntitlement,
  type CustomerPlan,
  type SubscriptionStatus,
} from "@velyq/auth";
import {
  createPrivilegedDatabaseClient,
  DatabasePermissionResolver,
} from "@velyq/database";
import { subscriptions } from "@velyq/database/schema/private";
import { desc, eq } from "drizzle-orm";

export function getCookie(request: Request, name: string) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function requestId(request: Request) {
  const value = request.headers.get("x-request-id");
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
    ? value
    : crypto.randomUUID();
}

export function customerFixtureMode() {
  return (
    process.env["NODE_ENV"] !== "production" ||
    process.env["VELYQ_SYNTHETIC_PREVIEW"] === "true"
  );
}

export function customerRedirectUrl(request: Request, pathname: string) {
  const configured = process.env["VELYQ_APPLICATION_ORIGIN"]?.trim();
  if (configured) {
    try {
      const origin = new URL(configured);
      if (
        (origin.protocol === "https:" || origin.protocol === "http:") &&
        !origin.username &&
        !origin.password
      ) {
        return new URL(pathname, origin.origin);
      }
    } catch {
      // A malformed configured origin is never replaced by request-controlled input.
    }
    return null;
  }

  if (!customerFixtureMode()) return null;
  try {
    const incoming = new URL(request.headers.get("origin") ?? request.url);
    return incoming.protocol === "https:" || incoming.protocol === "http:"
      ? new URL(pathname, incoming.origin)
      : null;
  } catch {
    return null;
  }
}

export async function requireCustomerSession(
  request: Request,
  entitlement: CustomerEntitlement = "today.view",
) {
  const token = getCookie(request, "velyq_access_token");
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const publishableKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (token && url && publishableKey) {
    try {
      const response = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (response.ok) {
        const user = (await response.json()) as { id?: string };
        if (!user.id) return unauthorized(request);
        const databaseUrl = process.env["VELYQ_DATABASE_URL"];
        if (!databaseUrl)
          return customerFixtureMode()
            ? entitlementDecision(request, "FREE", null, entitlement)
            : authorizationUnavailable(request);
        let client: ReturnType<typeof createPrivilegedDatabaseClient>;
        try {
          client = createPrivilegedDatabaseClient({
            connectionString: databaseUrl,
          });
          const principal = await new DatabasePermissionResolver(
            client.database,
          ).resolve(user.id);
          if (!hasPermission(principal, "customer.read"))
            return forbidden(request);
          const rows = await client.database
            .select({
              plan: subscriptions.planCode,
              status: subscriptions.status,
            })
            .from(subscriptions)
            .where(eq(subscriptions.userId, user.id))
            .orderBy(
              desc(subscriptions.stripeEventCreatedAt),
              desc(subscriptions.id),
            )
            .limit(1);
          const current = rows[0];
          const plan: CustomerPlan =
            current?.plan === "PRO" || current?.plan === "ELITE"
              ? current.plan
              : "FREE";
          const status = subscriptionStatus(current?.status);
          return entitlementDecision(request, plan, status, entitlement);
        } catch {
          return authorizationUnavailable(request);
        } finally {
          if (client!) await client.close().catch(() => undefined);
        }
      }
    } catch {
      // Treat provider/network failures as an unauthenticated request.
    }
  }
  return unauthorized(request);
}

function subscriptionStatus(
  value: string | undefined,
): SubscriptionStatus | null {
  return value &&
    [
      "active",
      "trialing",
      "past_due",
      "canceled",
      "unpaid",
      "incomplete",
      "incomplete_expired",
      "paused",
    ].includes(value)
    ? (value as SubscriptionStatus)
    : null;
}

function entitlementDecision(
  request: Request,
  plan: CustomerPlan,
  status: SubscriptionStatus | null,
  entitlement: CustomerEntitlement,
) {
  return hasCustomerEntitlement(
    resolveCustomerEntitlements({ plan, status }),
    entitlement,
  )
    ? null
    : entitlementRequired(request);
}

function unauthorized(request: Request) {
  return NextResponse.json(
    {
      type: "https://velyq.dev/problems/unauthorized",
      title: "Authentication required",
      status: 401,
      code: "UNAUTHORIZED",
      requestId: requestId(request),
    },
    { status: 401 },
  );
}

function forbidden(request: Request) {
  return NextResponse.json(
    {
      type: "https://velyq.dev/problems/forbidden",
      title: "Customer access required",
      status: 403,
      code: "FORBIDDEN",
      requestId: requestId(request),
    },
    { status: 403 },
  );
}

function entitlementRequired(request: Request) {
  return NextResponse.json(
    {
      type: "https://velyq.dev/problems/entitlement-required",
      title: "A paid plan is required for this feature",
      status: 403,
      code: "ENTITLEMENT_REQUIRED",
      requestId: requestId(request),
    },
    { status: 403 },
  );
}

function authorizationUnavailable(request: Request) {
  return NextResponse.json(
    {
      type: "https://velyq.dev/problems/authorization-unavailable",
      title: "Authorization is temporarily unavailable",
      status: 503,
      code: "AUTHORIZATION_UNAVAILABLE",
      requestId: requestId(request),
    },
    { status: 503 },
  );
}

export async function revokeCustomerSupabaseSession(request: Request) {
  const token = getCookie(request, "velyq_access_token");
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const publishableKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!token || !url || !publishableKey) return;
  try {
    await fetch(`${url}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    // Local cookies must still be cleared when provider revocation is unavailable.
  }
}
