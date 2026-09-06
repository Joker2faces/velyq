import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeState = vi.hoisted(() => ({
  available: true,
  billingCustomerRows: [] as Array<{ stripeCustomerId: string }>,
  subscriptionRows: [] as Array<Record<string, unknown>>,
  projectionRows: [] as Array<Record<string, unknown>>,
  insertRows: [] as Array<Record<string, unknown>>,
  selectError: null as Error | null,
  transactionError: null as Error | null,
  sessions: [] as Array<{ close: ReturnType<typeof vi.fn> }>,
}));

const stripeState = vi.hoisted(() => ({
  customersCreate: vi.fn(),
  checkoutList: vi.fn(),
  checkoutCreate: vi.fn(),
  constructEvent: vi.fn(),
}));

const customerState = vi.hoisted(() => ({
  close: vi.fn<() => Promise<void>>(),
}));

function queryResult(rows: readonly Record<string, unknown>[]) {
  const query = {
    from: () => query,
    where: () => query,
    orderBy: () => query,
    limit: async () => {
      if (runtimeState.selectError) throw runtimeState.selectError;
      return rows;
    },
  };
  return query;
}

function insertResult() {
  const query = {
    values: () => query,
    onConflictDoNothing: () => query,
    onConflictDoUpdate: () => query,
    returning: async () => runtimeState.insertRows,
    then: <TResult1 = unknown, TResult2 = never>(
      onfulfilled?:
        ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?:
        ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(undefined).then(onfulfilled, onrejected),
  };
  return query;
}

type DatabaseDouble = {
  select(selection?: Record<string, unknown>): ReturnType<typeof queryResult>;
  insert(): ReturnType<typeof insertResult>;
  transaction(
    work: (transaction: DatabaseDouble) => Promise<unknown>,
  ): Promise<unknown>;
};

function databaseDouble() {
  const database: DatabaseDouble = {
    select(selection: Record<string, unknown> = {}) {
      if ("periodStart" in selection)
        return queryResult(runtimeState.projectionRows);
      if ("stripeCustomerId" in selection)
        return queryResult(runtimeState.billingCustomerRows);
      return queryResult(runtimeState.subscriptionRows);
    },
    insert: () => insertResult(),
    transaction: async (work) => {
      if (runtimeState.transactionError) throw runtimeState.transactionError;
      return work(database);
    },
  };
  return database;
}

vi.mock("../app/runtime-database/runtime-database", () => ({
  openRuntimeDatabaseSession: async () => {
    if (!runtimeState.available) return null;
    const database = databaseDouble();
    const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    runtimeState.sessions.push({ close });
    return {
      source: "hyperdrive",
      client: { database, close },
      database,
      close,
    };
  },
}));

vi.mock("stripe", () => ({
  default: class Stripe {
    customers = { create: stripeState.customersCreate };
    checkout = {
      sessions: {
        list: stripeState.checkoutList,
        create: stripeState.checkoutCreate,
      },
    };
    webhooks = { constructEvent: stripeState.constructEvent };
  },
}));

vi.mock("../app/api/auth", () => ({
  customerRedirectUrl: () => null,
  getCookie: () => "access-token",
  requestId: () => "request-1",
  requireCustomerSession: async () => null,
}));

vi.mock("../app/customer-runtime", () => ({
  customerOddsHistory: async () => null,
  customerService: async () => ({
    getMatch: async () => ({
      ok: true,
      value: {
        syntheticLabel: "Synthetic data",
        openingOdds: "2.10",
        currentOdds: "2.20",
      },
    }),
    close: customerState.close,
  }),
  unavailable: () => ({ status: 503, requestId: "request-1" }),
}));

import { getOrCreateStripeCustomer, getStripeCustomer } from "../app/billing";
import { POST as checkout } from "../app/api/v1/billing/checkout/route";
import { GET as projection } from "../app/api/v1/billing/projection/route";
import { POST as webhook } from "../app/api/v1/billing/webhook/route";
import { GET as oddsHistory } from "../app/api/v1/events/[eventId]/odds-history/route";

const originalEnvironment = { ...process.env };

function expectEverySessionClosed() {
  expect(runtimeState.sessions.length).toBeGreaterThan(0);
  for (const session of runtimeState.sessions)
    expect(session.close).toHaveBeenCalledTimes(1);
}

function enableStripe() {
  process.env["STRIPE_SECRET_KEY"] = "sk_test_runtime";
  process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_runtime";
  process.env["STRIPE_PRO_PRICE_ID"] = "price_pro";
  process.env["STRIPE_ELITE_PRICE_ID"] = "price_elite";
}

beforeEach(() => {
  process.env = {
    ...originalEnvironment,
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
  };
  delete process.env["VELYQ_DATABASE_URL"];
  delete process.env["STRIPE_SECRET_KEY"];
  delete process.env["STRIPE_WEBHOOK_SECRET"];
  delete process.env["STRIPE_PRO_PRICE_ID"];
  delete process.env["STRIPE_ELITE_PRICE_ID"];
  runtimeState.available = true;
  runtimeState.billingCustomerRows = [];
  runtimeState.subscriptionRows = [];
  runtimeState.projectionRows = [];
  runtimeState.insertRows = [];
  runtimeState.selectError = null;
  runtimeState.transactionError = null;
  runtimeState.sessions.length = 0;
  stripeState.customersCreate.mockReset().mockResolvedValue({ id: "cus_new" });
  stripeState.checkoutList.mockReset().mockResolvedValue({ data: [] });
  stripeState.checkoutCreate.mockReset().mockResolvedValue({ url: null });
  stripeState.constructEvent.mockReset();
  customerState.close.mockReset().mockResolvedValue(undefined);
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

describe("runtime billing helpers", () => {
  it("keeps Stripe disabled without Stripe configuration", async () => {
    await expect(
      getOrCreateStripeCustomer("customer-1", "one@velyq.test"),
    ).rejects.toThrow("BILLING_NOT_CONFIGURED");
    expect(runtimeState.sessions).toHaveLength(0);
  });

  it("fails with existing billing semantics when no database source exists", async () => {
    runtimeState.available = false;

    await expect(getStripeCustomer("customer-1")).rejects.toThrow(
      "BILLING_NOT_CONFIGURED",
    );
    expect(runtimeState.sessions).toHaveLength(0);
  });

  it("closes the session after returning an existing Stripe customer", async () => {
    runtimeState.billingCustomerRows = [{ stripeCustomerId: "cus_existing" }];

    await expect(getStripeCustomer("customer-1")).resolves.toBe("cus_existing");
    expectEverySessionClosed();
  });

  it("closes the session when a billing query fails", async () => {
    runtimeState.selectError = new Error("database unavailable");

    await expect(getStripeCustomer("customer-1")).rejects.toThrow(
      "database unavailable",
    );
    expectEverySessionClosed();
  });

  it("closes the session on the existing-customer early return", async () => {
    enableStripe();
    runtimeState.billingCustomerRows = [{ stripeCustomerId: "cus_existing" }];

    await expect(
      getOrCreateStripeCustomer("customer-1", "one@velyq.test"),
    ).resolves.toBe("cus_existing");
    expectEverySessionClosed();
  });
});

describe("runtime billing routes", () => {
  it("closes both sessions on checkout's existing-subscription return", async () => {
    enableStripe();
    runtimeState.billingCustomerRows = [{ stripeCustomerId: "cus_existing" }];
    runtimeState.subscriptionRows = [{ id: "subscription-1" }];
    const request = new Request("https://velyq.test/api/v1/billing/checkout", {
      method: "POST",
      body: new URLSearchParams({ plan: "PRO" }),
    });

    const response = await checkout(request);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "SUBSCRIPTION_EXISTS",
    });
    expect(runtimeState.sessions).toHaveLength(2);
    expectEverySessionClosed();
  });

  it("returns billing unavailable when projection has no database source", async () => {
    runtimeState.available = false;

    const response = await projection(
      new Request("https://velyq.test/api/v1/billing/projection"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "BILLING_UNAVAILABLE",
    });
  });

  it("closes the projection session after a successful response", async () => {
    runtimeState.projectionRows = [
      {
        plan: "PRO",
        status: "active",
        periodStart: null,
        periodEnd: null,
        cancelAtPeriodEnd: false,
      },
    ];

    const response = await projection(
      new Request("https://velyq.test/api/v1/billing/projection"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ plan: "PRO" });
    expectEverySessionClosed();
  });

  it("closes the webhook session after a successful non-subscription event", async () => {
    enableStripe();
    runtimeState.insertRows = [{ stripeEventId: "event-1" }];
    stripeState.constructEvent.mockReturnValue({
      id: "event-1",
      type: "invoice.created",
      created: 1,
      data: { object: {} },
    });

    const response = await webhook(
      new Request("https://velyq.test/api/v1/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": "valid" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expectEverySessionClosed();
  });

  it("closes the webhook session when its transaction fails", async () => {
    enableStripe();
    runtimeState.transactionError = new Error("transaction failed");
    stripeState.constructEvent.mockReturnValue({
      id: "event-1",
      type: "invoice.created",
      created: 1,
      data: { object: {} },
    });

    await expect(
      webhook(
        new Request("https://velyq.test/api/v1/billing/webhook", {
          method: "POST",
          headers: { "stripe-signature": "valid" },
          body: "{}",
        }),
      ),
    ).rejects.toThrow("transaction failed");
    expectEverySessionClosed();
  });
});

describe("runtime odds history", () => {
  it("does not branch on a legacy direct database URL", async () => {
    process.env["VELYQ_DATABASE_URL"] = "postgres://legacy/direct";
    const response = await oddsHistory(
      new Request(
        "https://velyq.test/api/v1/events/11111111-1111-4111-8111-111111111111/odds-history",
      ),
      {
        params: Promise.resolve({
          eventId: "11111111-1111-4111-8111-111111111111",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      observations: [
        { observedAt: "2026-09-04T08:00:00.000Z", odds: "2.10" },
        { observedAt: "2026-09-04T10:00:00.000Z", odds: "2.20" },
      ],
    });
    expect(customerState.close).toHaveBeenCalledTimes(1);
  });
});
