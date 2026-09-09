import { NextResponse } from "next/server";
import {
  hasCustomerEntitlement,
  hasPermission,
  resolveEffectiveEntitlements,
  type CustomerEntitlement,
  type CustomerPlan,
  type Principal,
  type SubscriptionStatus,
} from "@velyq/auth";
import { DatabasePermissionResolver } from "@velyq/database";
import { subscriptions } from "@velyq/database/schema/private";
import { desc, eq } from "drizzle-orm";
import { openRuntimeDatabaseSession } from "../runtime-database/runtime-database";
import { syntheticDataAllowed } from "../data-mode";

const PRIVATE_PROBLEM_HEADERS = { "cache-control": "private, no-store" };

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

/**
 * Whether the synthetic fixture system may be reached.
 *
 * Previously inferred from the platform (`VERCEL_ENV` absent + `NODE_ENV`
 * not exactly "production" => synthetic permitted), which made every
 * Cloudflare Worker deployment synthetic-capable by accident: `VERCEL_ENV`
 * is always absent there. Now it is exactly one thing -- the explicit
 * `SYNTHETIC_DEMO` opt-in resolved in ./data-mode -- so a LIVE deployment
 * has no path back into fabricated football, and neither a missing
 * platform variable nor a database fault can create one.
 */
export function customerFixtureMode() {
  return syntheticDataAllowed();
}

/**
 * Whether a redirect origin may be derived from the incoming request when
 * `VELYQ_APPLICATION_ORIGIN` is not configured.
 *
 * Deliberately NOT the data mode. This is a request-trust question -- may a
 * client-supplied Host/Origin decide where we send a browser after
 * sign-in -- and answering it with "are synthetic fixtures allowed?" is the
 * same category error that let a LIVE Worker serve fabricated football.
 * Local development and tests have no configured origin and legitimately
 * need this; every real deployment (canonical Worker, every release
 * candidate, Vercel) sets `VELYQ_APPLICATION_ORIGIN` explicitly and returns
 * above without ever reaching here.
 */
function requestDerivedOriginAllowed() {
  return process.env["NODE_ENV"] !== "production";
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

  if (!requestDerivedOriginAllowed()) return null;
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
        let session: Awaited<ReturnType<typeof openRuntimeDatabaseSession>>;
        try {
          session = await openRuntimeDatabaseSession();
          if (!session)
            return customerFixtureMode()
              ? entitlementDecision(request, "FREE", null, entitlement, null)
              : authorizationUnavailable(request);
          const principal = await new DatabasePermissionResolver(
            session.database,
          ).resolve(user.id);
          if (!hasPermission(principal, "customer.read"))
            return forbidden(request);
          const rows = await session.database
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
          return entitlementDecision(
            request,
            plan,
            status,
            entitlement,
            principal,
          );
        } catch {
          return authorizationUnavailable(request);
        } finally {
          if (session!) await session.close().catch(() => undefined);
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
  principal: Principal | null,
) {
  return hasCustomerEntitlement(
    resolveEffectiveEntitlements({ plan, status }, principal),
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
    { status: 401, headers: PRIVATE_PROBLEM_HEADERS },
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
    { status: 403, headers: PRIVATE_PROBLEM_HEADERS },
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
    { status: 403, headers: PRIVATE_PROBLEM_HEADERS },
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
    { status: 503, headers: PRIVATE_PROBLEM_HEADERS },
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
