import {
  MappedCustomerQueryService,
  type CustomerReadResult,
} from "@velyq/application";
import type { CustomerMatchDto, CustomerTodayDto } from "@velyq/contracts";
import type { CustomerRawMatch, CustomerRawToday } from "@velyq/database";
import {
  customerDatabaseMapper,
  databaseCustomerQueries,
} from "./customer-database";
import { customerToday } from "./customer-data";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { customerFixtureMode, requireCustomerSession } from "./api/auth";
import { desc, eq } from "drizzle-orm";
import { subscriptions } from "@velyq/database/schema/private";
import {
  createPrivilegedDatabaseClient,
  DatabasePermissionResolver,
} from "@velyq/database";
import {
  hasPermission,
  resolveCustomerEntitlements,
  type CustomerEntitlement,
  type CustomerPlan,
  type SubscriptionStatus,
} from "@velyq/auth";

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
          return customerToday;
        },
        async getMatch(eventId) {
          return (
            customerToday.matches.find((match) => match.eventId === eventId) ??
            null
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
          return customerToday;
        },
        async getMatch() {
          return (
            customerToday.matches.find((match) => match.eventId === eventId) ??
            null
          );
        },
      },
      { mapToday: () => customerToday, mapMatch: (raw) => raw },
    ).getMatch(eventId, asOf);
  },
};
/* The two application services keep today and match DTO types distinct. */
function databaseService(
  database: NonNullable<ReturnType<typeof databaseCustomerQueries>>,
): CustomerService {
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
  };
}

export function customerService() {
  if (process.env["VELYQ_CUSTOMER_INTELLIGENCE_MODE"] === "SYNTHETIC_DEMO") {
    return fixtureService;
  }
  const database = databaseCustomerQueries();
  if (database) {
    return databaseService(database);
  }
  return customerFixtureMode() ? fixtureService : null;
}

export async function loadCustomerToday(
  entitlement: CustomerEntitlement = "today.view",
) {
  await requireCustomerPageAccess(entitlement);
  const service = customerService();
  if (!service) return unavailable() as CustomerReadResult<CustomerTodayDto>;
  return service.getToday(new Date());
}

export async function loadCustomerMatch(eventId: string) {
  await requireCustomerPageAccess("match.detail");
  const service = customerService();
  if (!service) return unavailable() as CustomerReadResult<CustomerMatchDto>;
  return service.getMatch(eventId, new Date());
}

export async function loadCustomerContext() {
  await requireCustomerPageAccess("today.view");
  const cookieHeader = (await cookies()).toString();
  const token = cookieHeader.match(/(?:^|; )velyq_access_token=([^;]+)/)?.[1];
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const databaseUrl = process.env["VELYQ_DATABASE_URL"];
  if (!token || !url || !key || !databaseUrl) return null;
  const identity = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!identity.ok) return null;
  const user = (await identity.json()) as { id?: string; email?: string };
  if (!user.id) return null;
  const client = createPrivilegedDatabaseClient({
    connectionString: databaseUrl,
  });
  try {
    const principal = await new DatabasePermissionResolver(
      client.database,
    ).resolve(user.id);
    const rows = await client.database
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
    const resolved = resolveCustomerEntitlements({ plan, status });
    return {
      email: user.email ?? "",
      plan: resolved.plan,
      status: resolved.subscriptionStatus,
      entitlements: resolved.entitlements,
      isAdmin: hasPermission(principal, "admin.access"),
    };
  } finally {
    await client.close();
  }
}

async function requireCustomerPageAccess(entitlement: CustomerEntitlement) {
  if (!process.env["VELYQ_DATABASE_URL"] && customerFixtureMode()) return;
  const cookieHeader = (await cookies()).toString();
  const request = new Request("https://velyq.local/customer", {
    headers: { cookie: cookieHeader },
  });
  const denied = await requireCustomerSession(request, entitlement);
  if (denied) redirect("/sign-in");
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
  const database = databaseCustomerQueries();
  if (database) {
    if (!outcomeId) return { ambiguous: true as const };
    try {
      return await database.getOddsHistory(eventId, outcomeId, asOf);
    } catch {
      return { unavailable: true as const };
    }
  }
  return null;
}
