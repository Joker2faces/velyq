import { DatabaseCustomerQueryAdapter } from "@velyq/database";
import type { CustomerEntitlement, CustomerPlan } from "@velyq/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeState = vi.hoisted(() => ({
  available: true,
  source: "hyperdrive" as "node" | "hyperdrive",
  permissionRows: [] as Array<{
    roleCode: string;
    permissionCode: string;
  }>,
  subscriptionRows: [] as Array<{ plan: string; status: string }>,
  sessions: [] as Array<{ close: ReturnType<typeof vi.fn> }>,
}));

function queryResult(rows: readonly Record<string, unknown>[]) {
  const query = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    orderBy: () => query,
    limit: async () => rows,
    then: <TResult1 = readonly Record<string, unknown>[], TResult2 = never>(
      onfulfilled?:
        | ((
            value: readonly Record<string, unknown>[],
          ) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(rows).then(onfulfilled, onrejected),
  };
  return query;
}

vi.mock("../app/runtime-database/runtime-database", () => ({
  openRuntimeDatabaseSession: async () => {
    if (!runtimeState.available) return null;

    const database = {
      select(selection: Record<string, unknown> = {}) {
        if ("permissionCode" in selection)
          return queryResult(runtimeState.permissionRows);
        if ("plan" in selection)
          return queryResult(runtimeState.subscriptionRows);
        return queryResult([]);
      },
    };
    const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    runtimeState.sessions.push({ close });

    return {
      source: runtimeState.source,
      client: { database, close },
      database,
      close,
    };
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    toString: () => "velyq_access_token=access-token",
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`Unexpected redirect to ${path}`);
  },
}));

import { requireCustomerSession } from "../app/api/auth";
import { openDatabaseCustomerQueries } from "../app/customer-database";
import {
  customerOddsHistory,
  customerService,
  loadCustomerContext,
} from "../app/customer-runtime";

const originalEnvironment = { ...process.env };

function authenticatedRequest() {
  return new Request("https://velyq.test/customer", {
    headers: { cookie: "velyq_access_token=access-token" },
  });
}

function expectEverySessionClosed() {
  expect(runtimeState.sessions.length).toBeGreaterThan(0);
  for (const session of runtimeState.sessions)
    expect(session.close).toHaveBeenCalledTimes(1);
}

beforeEach(() => {
  process.env = {
    ...originalEnvironment,
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
  };
  delete process.env["VELYQ_DATABASE_URL"];
  delete process.env["VELYQ_SYNTHETIC_PREVIEW"];
  delete process.env["VELYQ_CUSTOMER_INTELLIGENCE_MODE"];
  runtimeState.available = true;
  runtimeState.source = "hyperdrive";
  runtimeState.permissionRows = [
    { roleCode: "CUSTOMER", permissionCode: "customer.read" },
  ];
  runtimeState.subscriptionRows = [];
  runtimeState.sessions.length = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(
        JSON.stringify({ id: "customer-1", email: "one@velyq.test" }),
        { status: 200 },
      ),
  );
});

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.restoreAllMocks();
});

describe("runtime customer queries", () => {
  it("returns null when no runtime database session is available", async () => {
    runtimeState.available = false;

    await expect(openDatabaseCustomerQueries()).resolves.toBeNull();
  });

  it("creates a fresh Hyperdrive adapter for every acquisition", async () => {
    const first = await openDatabaseCustomerQueries();
    const second = await openDatabaseCustomerQueries();

    expect(first?.queries).toBeInstanceOf(DatabaseCustomerQueryAdapter);
    expect(second?.queries).toBeInstanceOf(DatabaseCustomerQueryAdapter);
    expect(first?.queries).not.toBe(second?.queries);
    expect(runtimeState.sessions).toHaveLength(2);
    await first?.close();
    await second?.close();
    expectEverySessionClosed();
  });
});

describe("runtime customer authorization", () => {
  it("requires customer.read and closes the permission session", async () => {
    runtimeState.permissionRows = [
      { roleCode: "CUSTOMER", permissionCode: "admin.access" },
    ];

    const denied = await requireCustomerSession(authenticatedRequest());

    expect(denied?.status).toBe(403);
    await expect(denied?.json()).resolves.toMatchObject({ code: "FORBIDDEN" });
    expectEverySessionClosed();
  });

  it("fails closed without a database unless preview is explicitly enabled", async () => {
    runtimeState.available = false;

    const unavailable = await requireCustomerSession(authenticatedRequest());
    expect(unavailable?.status).toBe(503);
    await expect(unavailable?.json()).resolves.toMatchObject({
      code: "AUTHORIZATION_UNAVAILABLE",
    });

    process.env["VELYQ_SYNTHETIC_PREVIEW"] = "true";
    await expect(
      requireCustomerSession(authenticatedRequest(), "today.view"),
    ).resolves.toBeNull();
    const paid = await requireCustomerSession(
      authenticatedRequest(),
      "match.detail",
    );
    expect(paid?.status).toBe(403);
    await expect(paid?.json()).resolves.toMatchObject({
      code: "ENTITLEMENT_REQUIRED",
    });
    expect(runtimeState.sessions).toHaveLength(0);
  });

  it.each<{
    plan: CustomerPlan;
    status: string | null;
    allowed: CustomerEntitlement;
    denied?: CustomerEntitlement;
  }>([
    {
      plan: "FREE",
      status: null,
      allowed: "today.view",
      denied: "match.detail",
    },
    {
      plan: "PRO",
      status: "active",
      allowed: "edge.full",
      denied: "match.detail",
    },
    { plan: "ELITE", status: "trialing", allowed: "match.detail" },
  ])(
    "derives $plan entitlements from database subscription state",
    async ({ plan, status, allowed, denied }) => {
      runtimeState.subscriptionRows = status ? [{ plan, status }] : [];

      await expect(
        requireCustomerSession(authenticatedRequest(), allowed),
      ).resolves.toBeNull();
      if (denied) {
        const response = await requireCustomerSession(
          authenticatedRequest(),
          denied,
        );
        expect(response?.status).toBe(403);
        await expect(response?.json()).resolves.toMatchObject({
          code: "ENTITLEMENT_REQUIRED",
        });
      }
      expectEverySessionClosed();
    },
  );
});

describe("request-scoped customer data", () => {
  it("closes the database session after loading Today", async () => {
    const service = await customerService();
    if (!service) throw new Error("Expected the database customer service");

    expect(runtimeState.sessions).toHaveLength(1);
    expect(runtimeState.sessions[0]?.close).not.toHaveBeenCalled();
    try {
      await expect(service.getToday(new Date())).resolves.toMatchObject({
        ok: true,
        value: { matches: [] },
      });
    } finally {
      await service.close();
    }
    expectEverySessionClosed();
  });

  it("closes the database session after loading a Match", async () => {
    const service = await customerService();
    if (!service) throw new Error("Expected the database customer service");

    expect(runtimeState.sessions).toHaveLength(1);
    expect(runtimeState.sessions[0]?.close).not.toHaveBeenCalled();
    try {
      await expect(
        service.getMatch("missing-event", new Date()),
      ).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
    } finally {
      await service.close();
    }
    expectEverySessionClosed();
  });

  it("closes an acquired session when odds history is ambiguous", async () => {
    await expect(
      customerOddsHistory("event-1", null, new Date()),
    ).resolves.toEqual({ ambiguous: true });
    expectEverySessionClosed();
  });

  it("closes authorization and account sessions after loading Account", async () => {
    runtimeState.subscriptionRows = [{ plan: "PRO", status: "active" }];

    await expect(loadCustomerContext()).resolves.toMatchObject({
      email: "one@velyq.test",
      plan: "PRO",
      isAdmin: false,
    });
    expect(runtimeState.sessions).toHaveLength(2);
    expectEverySessionClosed();
  });
});
