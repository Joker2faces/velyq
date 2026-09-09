import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  configuredDataMode,
  resolveCustomerDataSource,
  syntheticDataAllowed,
} from "../app/data-mode";

/*
 * The P0 this file exists for.
 *
 * An authenticated Cloudflare release candidate served the synthetic
 * fixture -- "Synthetic data", "Development heuristic", Premier Synthetic
 * League, Northbridge United, a fabricated settled-decision history, and a
 * "Thursday, 01 January 1970" dateline -- while its own health endpoint
 * reported LIVE with syntheticOnly: false.
 *
 * Three separate inferences had to agree for that to happen, and every one
 * of them was a platform or availability signal standing in for a data
 * decision. These tests pin the replacement rule: synthetic football is
 * reachable through exactly one explicit door, and LIVE fails closed.
 */
const originalEnvironment = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnvironment };
  delete process.env["VELYQ_CUSTOMER_INTELLIGENCE_MODE"];
  delete process.env["VELYQ_SYNTHETIC_PREVIEW"];
  delete process.env["VERCEL_ENV"];
});

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.restoreAllMocks();
});

describe("authoritative customer data mode", () => {
  it("treats only the exact SYNTHETIC_DEMO opt-in as synthetic", () => {
    process.env["VELYQ_CUSTOMER_INTELLIGENCE_MODE"] = "SYNTHETIC_DEMO";
    expect(configuredDataMode()).toBe("SYNTHETIC_DEMO");
    expect(syntheticDataAllowed()).toBe(true);
  });

  /*
   * Absence of configuration must never be a licence to fabricate data --
   * the old inference defaulted the other way, which is precisely how a
   * Worker with no Vercel variables became synthetic-capable.
   */
  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["LIVE", "LIVE"],
    ["lowercase synthetic_demo", "synthetic_demo"],
    ["near-miss SYNTHETIC", "SYNTHETIC"],
    ["padded SYNTHETIC_DEMO", " SYNTHETIC_DEMO "],
    ["DEMO", "DEMO"],
  ])("fails closed to LIVE when the mode is %s", (_label, value) => {
    if (value === undefined)
      delete process.env["VELYQ_CUSTOMER_INTELLIGENCE_MODE"];
    else process.env["VELYQ_CUSTOMER_INTELLIGENCE_MODE"] = value;
    expect(configuredDataMode()).toBe("LIVE");
    expect(syntheticDataAllowed()).toBe(false);
  });

  it("ignores the platform entirely: no VERCEL_ENV, NODE_ENV or preview flag grants synthetic", () => {
    process.env = { ...process.env, NODE_ENV: "development" };
    process.env["VELYQ_SYNTHETIC_PREVIEW"] = "true";
    delete process.env["VERCEL_ENV"];
    expect(configuredDataMode()).toBe("LIVE");
    expect(syntheticDataAllowed()).toBe(false);
  });
});

describe("customer data source resolution", () => {
  it("uses the real database in LIVE when the database is available", () => {
    expect(resolveCustomerDataSource("LIVE", true)).toBe("DATABASE");
  });

  /*
   * The removed fallback: a database fault used to become fabricated
   * football rather than an outage.
   */
  it("is UNAVAILABLE -- never FIXTURE -- in LIVE without a database", () => {
    expect(resolveCustomerDataSource("LIVE", false)).toBe("UNAVAILABLE");
  });

  it("uses the fixture in the explicit demo mode, database or not", () => {
    expect(resolveCustomerDataSource("SYNTHETIC_DEMO", false)).toBe("FIXTURE");
    expect(resolveCustomerDataSource("SYNTHETIC_DEMO", true)).toBe("FIXTURE");
  });

  it("never returns FIXTURE for any LIVE input", () => {
    for (const databaseAvailable of [true, false]) {
      expect(resolveCustomerDataSource("LIVE", databaseAvailable)).not.toBe(
        "FIXTURE",
      );
    }
  });
});

describe("health endpoint agrees with the real customer data source", () => {
  async function health() {
    vi.resetModules();
    const { GET } = await import("../app/api/health/route");
    return (await (await GET()).json()) as Record<string, unknown>;
  }

  it("reports LIVE/DATABASE with synthetic disabled when the database answers", async () => {
    process.env["VELYQ_CUSTOMER_INTELLIGENCE_MODE"] = "LIVE";
    vi.doMock("../app/runtime-database/runtime-database", () => ({
      openRuntimeDatabaseSession: async () => ({
        source: "hyperdrive",
        close: async () => {},
      }),
    }));

    expect(await health()).toMatchObject({
      configuredDataMode: "LIVE",
      effectiveCustomerDataMode: "LIVE",
      customerDataSource: "DATABASE",
      syntheticFallbackAllowed: false,
      databaseAvailable: true,
    });
  });

  /*
   * The old endpoint would have said LIVE / syntheticOnly:false here too,
   * which is exactly the report that hid the outage. It must now say the
   * customer surface has no data.
   */
  it("reports UNAVAILABLE, not a fixture, when LIVE has no database", async () => {
    process.env["VELYQ_CUSTOMER_INTELLIGENCE_MODE"] = "LIVE";
    vi.doMock("../app/runtime-database/runtime-database", () => ({
      openRuntimeDatabaseSession: async () => null,
    }));

    const body = await health();
    expect(body).toMatchObject({
      configuredDataMode: "LIVE",
      customerDataSource: "UNAVAILABLE",
      syntheticFallbackAllowed: false,
      databaseAvailable: false,
    });
    expect(body["customerDataSource"]).not.toBe("FIXTURE");
  });

  it("admits it is serving the fixture in the explicit demo mode", async () => {
    process.env["VELYQ_CUSTOMER_INTELLIGENCE_MODE"] = "SYNTHETIC_DEMO";
    expect(await health()).toMatchObject({
      configuredDataMode: "SYNTHETIC_DEMO",
      customerDataSource: "FIXTURE",
      syntheticFallbackAllowed: true,
      syntheticOnly: true,
    });
  });
});
