import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * What the owner actually saw, asserted at the service boundary.
 *
 * Authenticated QA on the Cloudflare release candidate returned "Synthetic
 * data", "Development heuristic", Premier Synthetic League, Northbridge
 * United / Riverside Athletic / Harbor Rovers and a "Synthetic QA sample"
 * history, on a deployment reported as LIVE. These tests read what
 * `customerService()` actually hands the pages and assert those markers
 * cannot appear in LIVE -- and, in the demo mode, that they do, so a
 * regression here cannot pass by the assertions being vacuous.
 */
const SYNTHETIC_MARKERS = [
  "Synthetic data",
  "Synthetic QA sample",
  "Premier Synthetic League",
  "Northbridge United",
  "Riverside Athletic",
  "Eastvale City",
  "Kingsport FC",
  "Harbor Rovers",
  "Oldtown FC",
  "Lakeside Albion",
  "Metro Vale",
  "Southport Vale",
  "Cedar Athletic",
  "Westhaven FC",
  "Union Park",
];

/*
 * The mode is injected by mocking app/data-mode rather than by setting
 * VELYQ_CUSTOMER_INTELLIGENCE_MODE. `process.env` is a process-wide global
 * that sibling test files in the same worker also rewrite wholesale, and
 * depending on it here made this file fail intermittently (roughly two runs
 * in three) under the full parallel suite -- a LIVE case would occasionally
 * observe another file's SYNTHETIC_DEMO and legitimately serve the fixture.
 *
 * The env-to-mode mapping itself is not skipped, just tested where it can
 * be tested deterministically: app/test/live-data-mode.test.ts covers it
 * against real environment variables with no async or module-registry
 * interaction. This file covers the other half -- what customerService()
 * does with a given mode -- and needs that mode to be unambiguous.
 */
const originalEnvironment = { ...process.env };

function mockDataMode(mode: "LIVE" | "SYNTHETIC_DEMO") {
  vi.doMock("../app/data-mode", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../app/data-mode")>()),
    configuredDataMode: () => mode,
    syntheticDataAllowed: () => mode === "SYNTHETIC_DEMO",
  }));
}

/** A database-backed read model that legitimately has nothing to show. */
const emptyLiveToday = {
  syntheticLabel: null,
  asOf: "2026-09-09T12:00:00.000Z",
  matches: [],
};

function mockDatabaseAvailable(available: boolean) {
  vi.doMock("../app/customer-database", () => ({
    openDatabaseCustomerQueries: async () =>
      available
        ? {
            queries: {
              getToday: async () => emptyLiveToday,
              getMatch: async () => null,
            },
            close: async () => {},
          }
        : null,
    customerDatabaseMapper: {
      mapToday: (raw: unknown) => raw,
      mapMatch: (raw: unknown) => raw,
    },
  }));
}

async function loadCustomerService() {
  vi.resetModules();
  const { customerService } = await import("../app/customer-runtime");
  return customerService;
}

beforeEach(() => {
  process.env = { ...originalEnvironment };
  delete process.env["VELYQ_CUSTOMER_INTELLIGENCE_MODE"];
  delete process.env["VELYQ_SYNTHETIC_PREVIEW"];
  delete process.env["VERCEL_ENV"];
});

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.restoreAllMocks();
  vi.doUnmock("../app/customer-database");
  vi.doUnmock("../app/data-mode");
});

describe("LIVE customer service", () => {
  it("serves the real database read model, with no synthetic marker anywhere", async () => {
    mockDataMode("LIVE");
    mockDatabaseAvailable(true);

    const service = await (await loadCustomerService())();
    expect(service).not.toBeNull();
    const result = await service!.getToday(new Date("2026-09-09T12:00:00Z"));
    await service!.close();

    expect(result.ok).toBe(true);
    const payload = JSON.stringify(result);
    for (const marker of SYNTHETIC_MARKERS) {
      expect(payload).not.toContain(marker);
    }
  });

  /* Zero real fixtures is a correct answer, and must render as zero. */
  it("reports an honestly empty day rather than filling it with fixtures", async () => {
    mockDataMode("LIVE");
    mockDatabaseAvailable(true);

    const service = await (await loadCustomerService())();
    const result = await service!.getToday(new Date("2026-09-09T12:00:00Z"));
    await service!.close();

    expect(result.ok && result.value.matches).toEqual([]);
  });

  it("never dates the day to the Unix epoch", async () => {
    mockDataMode("LIVE");
    mockDatabaseAvailable(true);

    const service = await (await loadCustomerService())();
    const result = await service!.getToday(new Date("2026-09-09T12:00:00Z"));
    await service!.close();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.asOf).not.toContain("1970");
    expect(new Date(result.value.asOf).getUTCFullYear()).toBeGreaterThan(1970);
  });

  /*
   * The P0 itself: a database fault is an outage, and callers render the
   * null as a 503. It is not a licence to invent football.
   */
  it("resolves to null -- an honest 503 -- when the database is unavailable", async () => {
    mockDataMode("LIVE");
    mockDatabaseAvailable(false);

    expect(await (await loadCustomerService())()).toBeNull();
  });

  it("stays closed even with the retired preview flag set", async () => {
    mockDataMode("LIVE");
    process.env["VELYQ_SYNTHETIC_PREVIEW"] = "true";
    mockDatabaseAvailable(false);

    expect(await (await loadCustomerService())()).toBeNull();
  });

  it("stays closed on a platform with no Vercel environment, as on Cloudflare", async () => {
    /* Cloudflare has no VERCEL_ENV, and a non-production NODE_ENV must not
       matter: the mode alone decides, and here it is LIVE. */
    mockDataMode("LIVE");
    process.env = { ...process.env, NODE_ENV: "development" };
    delete process.env["VERCEL_ENV"];
    mockDatabaseAvailable(false);

    expect(await (await loadCustomerService())()).toBeNull();
  });
});

describe("SYNTHETIC_DEMO customer service", () => {
  /*
   * The inverse assertion. Without this, the LIVE tests above could pass
   * because the markers moved or were renamed rather than because LIVE
   * stopped serving them.
   */
  it("still serves the fixture, markers and all, so the LIVE assertions stay meaningful", async () => {
    mockDataMode("SYNTHETIC_DEMO");
    mockDatabaseAvailable(false);

    const service = await (await loadCustomerService())();
    expect(service).not.toBeNull();
    const result = await service!.getToday(new Date("2026-09-09T12:00:00Z"));
    await service!.close();

    const payload = JSON.stringify(result);
    expect(payload).toContain("Synthetic data");
    expect(payload).toContain("Premier Synthetic League");
    expect(payload).toContain("Northbridge United");
  });
});
