import {
  MappedCustomerQueryService,
  type CustomerReadResult,
} from "@velyq/application";
import type { CustomerMatchDto, CustomerTodayDto } from "@velyq/contracts";
import type { CustomerRawMatch, CustomerRawToday } from "@velyq/database";
import {
  customerDatabaseMapper,
  openDatabaseCustomerQueries,
  type RuntimeCustomerQueries,
} from "./customer-database";
import { customerTodaySnapshot } from "./customer-data";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireCustomerSession } from "./api/auth";
import {
  configuredDataMode,
  resolveCustomerDataSource,
  syntheticDataAllowed,
} from "./data-mode";
import { desc, eq } from "drizzle-orm";
import { subscriptions } from "@velyq/database/schema/private";
import { DatabasePermissionResolver } from "@velyq/database";
import {
  hasPermission,
  resolveEffectiveEntitlements,
  type CustomerEntitlement,
  type CustomerPlan,
  type SubscriptionStatus,
} from "@velyq/auth";
import { openRuntimeDatabaseSession } from "./runtime-database/runtime-database";

type CustomerService = {
  getToday: (asOf: Date) => Promise<
    | {
        ok: true;
        value: CustomerTodayDto;
      }
    | { ok: false; code: "NOT_FOUND" | "UNAVAILABLE"; messageKey: string }
  >;
  getMatch: (
    eventId: string,
    asOf: Date,
  ) => Promise<
    | {
        ok: true;
        value: CustomerMatchDto;
      }
    | { ok: false; code: "NOT_FOUND" | "UNAVAILABLE"; messageKey: string }
  >;
  close(): Promise<void>;
};

const fixtureService: CustomerService = {
  getToday(asOf: Date) {
    return new MappedCustomerQueryService<
      CustomerTodayDto,
      CustomerTodayDto,
      CustomerMatchDto,
      CustomerMatchDto
    >(
      {
        async getToday() {
          return customerTodaySnapshot();
        },
        async getMatch(eventId) {
          return (
            customerTodaySnapshot().matches.find(
              (match) => match.eventId === eventId,
            ) ?? null
          );
        },
      },
      { mapToday: (raw) => raw, mapMatch: (raw) => raw },
    ).getToday(asOf);
  },
  getMatch(eventId: string, asOf: Date) {
    return new MappedCustomerQueryService<
      CustomerTodayDto,
      CustomerTodayDto,
      CustomerMatchDto,
      CustomerMatchDto
    >(
      {
        async getToday() {
          return customerTodaySnapshot();
        },
        async getMatch() {
          return (
            customerTodaySnapshot().matches.find(
              (match) => match.eventId === eventId,
            ) ?? null
          );
        },
      },
      { mapToday: () => customerTodaySnapshot(), mapMatch: (raw) => raw },
    ).getMatch(eventId, asOf);
  },
  async close() {},
};
/* The two application services keep today and match DTO types distinct. */
function mappedDatabaseService(
  runtime: RuntimeCustomerQueries,
): CustomerService {
  const database = runtime.queries;
  const today = new MappedCustomerQueryService<
    CustomerRawToday,
    CustomerTodayDto,
    CustomerRawMatch,
    CustomerMatchDto
  >(database, customerDatabaseMapper);
  const match = new MappedCustomerQueryService<
    CustomerRawToday,
    CustomerTodayDto,
    CustomerRawMatch,
    CustomerMatchDto
  >(database, customerDatabaseMapper);
  return {
    getToday: (asOf: Date) => today.getToday(asOf),
    getMatch: (eventId: string, asOf: Date) => match.getMatch(eventId, asOf),
    close: () => runtime.close(),
  };
}

/**
 * Resolves the customer read service, failing closed in LIVE.
 *
 * The removed branch here is the P0: on a database failure this used to
 * fall through `customerFixtureMode()` into `fixtureService`, so a
 * connectivity fault in a LIVE deployment silently answered with
 * fabricated football (Premier Synthetic League, Northbridge United, a
 * made-up settled-decision history) instead of an outage. A LIVE runtime
 * now has exactly two possible answers -- the real database, or null,
 * which every caller renders as an honest 503. `fixtureService` is
 * unreachable unless the deployment explicitly opted into SYNTHETIC_DEMO.
 *
 * The source decision itself lives in ./data-mode so that the health and
 * readiness endpoints resolve it from the same function rather than
 * re-deriving (and previously contradicting) it.
 */
export async function customerService(): Promise<CustomerService | null> {
  const mode = configuredDataMode();
  if (mode === "SYNTHETIC_DEMO") return fixtureService;

  const runtime = await openDatabaseCustomerQueries();
  const source = resolveCustomerDataSource(mode, runtime !== null);
  if (source === "DATABASE" && runtime) return mappedDatabaseService(runtime);
  if (runtime) await runtime.close();
  return null;
}

export async function loadCustomerToday(
  entitlement: CustomerEntitlement = "today.view",
) {
  const access = await requireCustomerPageAccess(entitlement);
  if (!access) return entitlementRequiredResult();
  const service = await customerService();
  if (!service) return unavailable() as CustomerReadResult<CustomerTodayDto>;
  try {
    const result = await service.getToday(new Date());
    if (entitlement === "edge.preview" || entitlement === "radar.preview") {
      if (result.ok) {
        return {
          ...result,
          value: {
            ...result.value,
            matches: result.value.matches.slice(0, 3),
          },
        };
      }
    }
    return result;
  } finally {
    await service.close();
  }
}

export async function loadCustomerMatch(eventId: string) {
  const access = await requireCustomerPageAccess("match.detail");
  if (!access) return entitlementRequiredResult();
  const service = await customerService();
  if (!service) return unavailable() as CustomerReadResult<CustomerMatchDto>;
  try {
    return await service.getMatch(eventId, new Date());
  } finally {
    await service.close();
  }
}

/**
 * Resolves who the customer is and what they are entitled to, from a cookie
 * header alone.
 *
 * Split out from `loadCustomerContext` so a route handler can use it: the
 * page version gates through `requireCustomerPageAccess`, which redirects to
 * /sign-in on an unauthenticated request. A redirect is the right answer for
 * a page and the wrong one for an API, which must answer 401 and let the
 * caller decide.
 */
export async function resolveCustomerContext(cookieHeader: string) {
  const token = cookieHeader.match(/(?:^|; )velyq_access_token=([^;]+)/)?.[1];
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!token || !url || !key) return null;
  const identity = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!identity.ok) return null;
  const user = (await identity.json()) as { id?: string; email?: string };
  if (!user.id) return null;
  const session = await openRuntimeDatabaseSession();
  if (!session)
    /*
     * The same no-database affordance `requireCustomerSession` already has,
     * and gated on the same explicit opt-in.
     *
     * Without it the two halves disagreed: authorization admitted a demo
     * visitor as FREE, and then this returned null, so
     * /api/v1/customer/context answered 503 and Account was unusable in
     * SYNTHETIC_DEMO -- the one mode whose whole purpose is running without
     * a database. LIVE still returns null here, which the route turns into
     * an honest 503 rather than an invented identity.
     *
     * Nothing is fabricated beyond the tier: the email is the authenticated
     * identity the provider just confirmed, the plan is FREE, and isAdmin is
     * false because administrative access is a database fact and there is no
     * database to assert it.
     */
    return syntheticDataAllowed()
      ? {
          email: user.email ?? "",
          plan: "FREE" as const,
          status: null,
          entitlements: resolveEffectiveEntitlements(
            { plan: "FREE", status: null },
            null,
          ).entitlements,
          isAdmin: false,
        }
      : null;
  try {
    const principal = await new DatabasePermissionResolver(
      session.database,
    ).resolve(user.id);
    const rows = await session.database
      .select({ plan: subscriptions.planCode, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id))
      .orderBy(desc(subscriptions.stripeEventCreatedAt), desc(subscriptions.id))
      .limit(1);
    const current = rows[0];
    const plan: CustomerPlan =
      current?.plan === "PRO" || current?.plan === "ELITE"
        ? current.plan
        : "FREE";
    const status =
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
    const resolved = resolveEffectiveEntitlements({ plan, status }, principal);
    return {
      email: user.email ?? "",
      plan: resolved.plan,
      status: resolved.subscriptionStatus,
      entitlements: resolved.entitlements,
      isAdmin: hasPermission(principal, "admin.access"),
    };
  } finally {
    await session.close();
  }
}

export async function loadCustomerContext() {
  const access = await requireCustomerPageAccess("today.view");
  if (!access) return null;
  return resolveCustomerContext((await cookies()).toString());
}

async function requireCustomerPageAccess(entitlement: CustomerEntitlement) {
  /*
   * The unauthenticated-preview shortcut is a SYNTHETIC_DEMO affordance
   * only: it lets a demo deployment with no database render the fixture
   * without a session. Reached in LIVE it would have been an outright
   * authentication bypass on a database fault, so it is now gated on the
   * explicit opt-in rather than on `customerFixtureMode()`'s former
   * platform inference.
   */
  if (syntheticDataAllowed()) {
    const runtime = await openDatabaseCustomerQueries();
    if (!runtime) return true;
    await runtime.close();
  }
  const cookieHeader = (await cookies()).toString();
  const request = new Request("https://velyq.local/customer", {
    headers: { cookie: cookieHeader },
  });
  const denied = await requireCustomerSession(request, entitlement);
  if (!denied) return true;
  if (denied.status === 401) redirect("/sign-in");
  return false;
}

function entitlementRequiredResult() {
  return {
    ok: false as const,
    code: "ENTITLEMENT_REQUIRED" as const,
    messageKey: "entitlementRequired",
  };
}

export function unavailable(requestId: string = crypto.randomUUID()) {
  return {
    ok: false as const,
    code: "UNAVAILABLE" as const,
    messageKey: "customerUnavailable",
    type: "https://velyq.dev/problems/customer-unavailable",
    title: "Customer data is temporarily unavailable",
    status: 503 as const,
    requestId,
  };
}

export async function customerOddsHistory(
  eventId: string,
  outcomeId: string | null,
  asOf: Date,
) {
  const runtime = await openDatabaseCustomerQueries();
  if (runtime) {
    try {
      if (!outcomeId) return { ambiguous: true as const };
      return await runtime.queries.getOddsHistory(eventId, outcomeId, asOf);
    } catch {
      return { unavailable: true as const };
    } finally {
      await runtime.close();
    }
  }
  return null;
}
