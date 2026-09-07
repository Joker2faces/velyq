import { describe, expect, it } from "vitest";
import type {
  ApiSportsClient,
  ApiSportsResponse,
} from "../../packages/providers/src/apisports.js";
import {
  discoverAllEvents,
  oddsRequestBudget,
  prioritizeEventsForOddsCollection,
  runApiSportsIngestion,
  runIdentity,
} from "../scripts/apisports-ingest.js";

/**
 * Guards the fix for the production activation cap: fixture/game discovery
 * used to be hard-capped at `slice(0, 2)`, which is why production held
 * exactly two football events and two basketball events for the whole day
 * regardless of how many the provider actually reported. Every test below
 * runs against a fake `ApiSportsClient` rather than the real network — no
 * `APISPORTS_KEY` is available in this environment, so nothing here makes a
 * live call.
 */

function fixture(id: number, isoDate: string, home: string, away: string) {
  return {
    fixture: { id, date: isoDate, status: { short: "NS" } },
    league: { name: "Test League" },
    teams: { home: { name: home }, away: { name: away } },
  };
}

function fakeClient(
  responses: Readonly<
    Record<
      string,
      readonly {
        status: number;
        body: ApiSportsResponse;
        quota: {
          state: "HEALTHY" | "CONSERVE" | "CRITICAL" | "EXHAUSTED";
          requestsRemaining: number | null;
        };
      }[]
    >
  >,
): { client: ApiSportsClient; calls: string[] } {
  const cursor = new Map<string, number>();
  const calls: string[] = [];
  return {
    calls,
    client: {
      async get(path, query = {}) {
        const key = `${path}:${JSON.stringify(query)}`;
        calls.push(key);
        const bucket = responses[path] ?? [];
        const index = cursor.get(path) ?? 0;
        const next = bucket[Math.min(index, bucket.length - 1)];
        cursor.set(path, index + 1);
        if (!next) throw new Error(`no fake response configured for ${path}`);
        return next;
      },
    },
  };
}

const HEALTHY = { state: "HEALTHY" as const, requestsRemaining: 200 };

describe("discoverAllEvents", () => {
  it("returns every event the provider reports, with no cap", async () => {
    const many = Array.from({ length: 47 }, (_, i) =>
      fixture(1000 + i, "2026-09-07T18:00:00Z", `Home ${i}`, `Away ${i}`),
    );
    const { client } = fakeClient({
      "/fixtures": [{ status: 200, body: { response: many }, quota: HEALTHY }],
    });
    const result = await discoverAllEvents(client, "football", "2026-09-07");
    expect(result.records).toHaveLength(47);
  });

  it("follows paging.total across multiple pages", async () => {
    const { client, calls } = fakeClient({
      "/fixtures": [
        {
          status: 200,
          body: {
            response: [fixture(1, "2026-09-07T10:00:00Z", "A", "B")],
            paging: { current: 1, total: 2 },
          },
          quota: HEALTHY,
        },
        {
          status: 200,
          body: {
            response: [fixture(2, "2026-09-07T12:00:00Z", "C", "D")],
            paging: { current: 2, total: 2 },
          },
          quota: HEALTHY,
        },
      ],
    });
    const result = await discoverAllEvents(client, "football", "2026-09-07");
    expect(result.records).toHaveLength(2);
    expect(result.pagesFetched).toBe(2);
    expect(calls).toHaveLength(2);
  });

  /*
   * Caught live, against the real API, while deploying: the first request
   * for a date's fixtures was sending `page=1` unconditionally. The real
   * endpoint does not accept a `page` parameter at all for a single date —
   * it rejects the whole request (`errors: { page: "The Page field do not
   * exist." }`) and returns `results: 0`, which read as an ordinary empty
   * sports day rather than a malformed request, and would have silently
   * discarded every fixture for the date in production.
   */
  it("omits the page parameter on the first request", async () => {
    const { client, calls } = fakeClient({
      "/fixtures": [{ status: 200, body: { response: [] }, quota: HEALTHY }],
    });
    await discoverAllEvents(client, "football", "2026-09-07");
    expect(calls).toEqual(['/fixtures:{"date":"2026-09-07"}']);
  });

  it("includes the page parameter only once a response reports more pages", async () => {
    const { client, calls } = fakeClient({
      "/fixtures": [
        {
          status: 200,
          body: {
            response: [fixture(1, "2026-09-07T10:00:00Z", "A", "B")],
            paging: { current: 1, total: 2 },
          },
          quota: HEALTHY,
        },
        {
          status: 200,
          body: {
            response: [fixture(2, "2026-09-07T12:00:00Z", "C", "D")],
            paging: { current: 2, total: 2 },
          },
          quota: HEALTHY,
        },
      ],
    });
    await discoverAllEvents(client, "football", "2026-09-07");
    expect(calls).toEqual([
      '/fixtures:{"date":"2026-09-07"}',
      '/fixtures:{"date":"2026-09-07","page":2}',
    ]);
  });

  it("aborts discovery when the provider rejects the request, rather than treating it as an empty day", async () => {
    const { client } = fakeClient({
      "/fixtures": [
        {
          status: 200,
          body: {
            response: [],
            errors: { page: "The Page field do not exist." },
          },
          quota: HEALTHY,
        },
      ],
    });
    await expect(
      discoverAllEvents(client, "football", "2026-09-07"),
    ).rejects.toThrow("PROVIDER_DISCOVERY_REJECTED");
  });

  it("stops paginating once the provider reports quota exhaustion", async () => {
    const { client, calls } = fakeClient({
      "/fixtures": [
        {
          status: 200,
          body: {
            response: [fixture(1, "2026-09-07T10:00:00Z", "A", "B")],
            paging: { current: 1, total: 5 },
          },
          quota: { state: "EXHAUSTED", requestsRemaining: 0 },
        },
      ],
    });
    await discoverAllEvents(client, "football", "2026-09-07");
    expect(calls).toHaveLength(1);
  });
});

describe("prioritizeEventsForOddsCollection", () => {
  it("orders soonest kickoff first, on either side of now", () => {
    const now = new Date("2026-09-07T12:00:00Z");
    const events = [
      normalize("far-future", "2026-09-08T12:00:00Z"),
      normalize("just-started", "2026-09-07T11:55:00Z"),
      normalize("near-kickoff", "2026-09-07T12:10:00Z"),
      normalize("long-past", "2026-09-06T00:00:00Z"),
    ];
    const ordered = prioritizeEventsForOddsCollection(events, now);
    expect(ordered.map((e) => e.providerEventId)).toEqual([
      "just-started",
      "near-kickoff",
      "far-future",
      "long-past",
    ]);
  });

  /*
   * The defect this pins cost a whole day of odds budget. Ordering by kickoff
   * alone spent all nineteen available requests on whichever fixtures started
   * soonest, and on a 259-fixture matchday those are unmapped South American
   * and reserve leagues — so the two fixtures that were actually eligible got
   * no prices at all and stopped at NO_ODDS_AT_CUTOFF.
   */
  it("buys prices for eligible competitions before anything else", () => {
    const now = new Date("2026-09-07T12:00:00Z");
    const events = [
      normalize("obscure-imminent", "2026-09-07T12:01:00Z", "999"),
      normalize("eligible-later", "2026-09-08T12:00:00Z", "88"),
      normalize("obscure-soon", "2026-09-07T12:05:00Z", "998"),
      normalize("eligible-latest", "2026-09-08T18:00:00Z", "135"),
    ];

    const ordered = prioritizeEventsForOddsCollection(
      events,
      now,
      new Set(["88", "135"]),
    );

    expect(ordered.map((e) => e.providerEventId)).toEqual([
      "eligible-later",
      "eligible-latest",
      "obscure-imminent",
      "obscure-soon",
    ]);
  });

  it("deprioritises rather than excludes, so leftover budget still buys them", () => {
    const now = new Date("2026-09-07T12:00:00Z");
    const events = [
      normalize("obscure", "2026-09-07T12:01:00Z", "999"),
      normalize("eligible", "2026-09-08T12:00:00Z", "88"),
    ];

    /* Both are still present; only the order changed. */
    expect(
      prioritizeEventsForOddsCollection(events, now, new Set(["88"])),
    ).toHaveLength(2);
  });

  it("falls back to kickoff order when no eligibility is supplied", () => {
    const now = new Date("2026-09-07T12:00:00Z");
    const events = [
      normalize("later", "2026-09-08T12:00:00Z", "88"),
      normalize("sooner", "2026-09-07T12:01:00Z", "999"),
    ];

    expect(
      prioritizeEventsForOddsCollection(events, now).map(
        (e) => e.providerEventId,
      ),
    ).toEqual(["sooner", "later"]);
  });

  function normalize(
    providerEventId: string,
    scheduledAt: string,
    competitionProviderId: string | null = null,
  ) {
    return {
      sport: "FOOTBALL" as const,
      providerEventId,
      competition: "Test",
      competitionProviderId,
      competitionCountry: null,
      competitionCountryCode: null,
      season: null,
      participants: ["A", "B"],
      scheduledAt,
      status: "NS",
      provider: "API_SPORTS" as const,
      sourceReference: "test",
    };
  }
});

describe("oddsRequestBudget", () => {
  it("stops odds collection entirely when quota is exhausted or critical", () => {
    expect(
      oddsRequestBudget(
        100,
        { state: "EXHAUSTED", requestsRemaining: 0 },
        40,
        0.25,
      ),
    ).toBe(0);
    expect(
      oddsRequestBudget(
        100,
        { state: "CRITICAL", requestsRemaining: 5 },
        40,
        0.25,
      ),
    ).toBe(0);
  });

  it("never spends the reserved fraction of a known remaining count", () => {
    const budget = oddsRequestBudget(
      100,
      { state: "HEALTHY", requestsRemaining: 100 },
      1000,
      0.25,
    );
    // 25% of 100 reserved leaves at most 75 spendable.
    expect(budget).toBeLessThanOrEqual(75);
  });

  it("halves the per-invocation ceiling under CONSERVE", () => {
    const conserve = oddsRequestBudget(
      1000,
      { state: "CONSERVE", requestsRemaining: 1000 },
      40,
      0.25,
    );
    const healthy = oddsRequestBudget(
      1000,
      { state: "HEALTHY", requestsRemaining: 1000 },
      40,
      0.25,
    );
    expect(conserve).toBeLessThan(healthy);
    expect(conserve).toBeLessThanOrEqual(20);
  });

  it("never requests more than the number of discovered events", () => {
    expect(
      oddsRequestBudget(
        3,
        { state: "HEALTHY", requestsRemaining: 100000 },
        40,
        0.25,
      ),
    ).toBe(3);
  });

  it("falls back to the per-invocation ceiling when the provider reports no count", () => {
    /* A single poll must still be bounded even with no numeric signal from
       the provider at all. */
    expect(
      oddsRequestBudget(
        1000,
        { state: "HEALTHY", requestsRemaining: null },
        40,
        0.25,
      ),
    ).toBe(40);
  });
});

describe("runApiSportsIngestion (dry run, no VELYQ_DATABASE_URL touched)", () => {
  it("discovers and reports every event, not just the first two", async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      fixture(2000 + i, "2026-09-07T18:00:00Z", `Home ${i}`, `Away ${i}`),
    );
    const { client } = fakeClient({
      "/fixtures": [{ status: 200, body: { response: many }, quota: HEALTHY }],
      "/odds": [{ status: 200, body: { response: [] }, quota: HEALTHY }],
    });
    const result = await runApiSportsIngestion({
      sport: "football",
      date: "2026-09-07",
      commit: false,
      client,
      now: new Date("2026-09-07T09:00:00Z"),
    });
    expect(result.eventsDiscovered).toBe(12);
    expect(result.events).toBe(12);
    expect(result.status).toBe("DRY_RUN");
    expect(result.persisted).toBe(false);
  });

  it("skips odds requests for events beyond the quota-derived budget", async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      fixture(3000 + i, "2026-09-07T18:00:00Z", `Home ${i}`, `Away ${i}`),
    );
    const { client, calls } = fakeClient({
      "/fixtures": [
        {
          status: 200,
          body: { response: many },
          quota: { state: "HEALTHY", requestsRemaining: 8 },
        },
      ],
      "/odds": [
        {
          status: 200,
          body: { response: [] },
          quota: { state: "HEALTHY", requestsRemaining: 8 },
        },
      ],
    });
    const result = await runApiSportsIngestion({
      sport: "football",
      date: "2026-09-07",
      commit: false,
      client,
      now: new Date("2026-09-07T09:00:00Z"),
      maxOddsRequests: 40,
      reserveFraction: 0.25,
    });
    // requestsRemaining=8, 25% reserved -> floor(8*0.75)=6 spendable.
    expect(result.oddsRequestsUsed).toBe(6);
    expect(result.oddsRequestsSkippedForQuota).toBe(4);
    expect(calls.filter((c) => c.startsWith("/odds")).length).toBe(6);
    // Discovery is never rationed: all 10 events are still persisted-shaped
    // in the result even though only 6 got an odds request.
    expect(result.eventsDiscovered).toBe(10);
  });

  it("still discovers the full catalog when the quota is already exhausted", async () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      fixture(4000 + i, "2026-09-07T18:00:00Z", `Home ${i}`, `Away ${i}`),
    );
    const { client, calls } = fakeClient({
      "/fixtures": [
        {
          status: 200,
          body: { response: many },
          quota: { state: "EXHAUSTED", requestsRemaining: 0 },
        },
      ],
    });
    const result = await runApiSportsIngestion({
      sport: "football",
      date: "2026-09-07",
      commit: false,
      client,
      now: new Date("2026-09-07T09:00:00Z"),
    });
    expect(result.eventsDiscovered).toBe(5);
    expect(result.oddsRequestsUsed).toBe(0);
    expect(result.oddsRequestsSkippedForQuota).toBe(5);
    expect(result.quotaState).toBe("EXHAUSTED");
    expect(calls.some((c) => c.startsWith("/odds"))).toBe(false);
  });
});

describe("runIdentity", () => {
  /*
   * The bug this guards: run identity used to be `sport:date` alone, so
   * every poll for the same sport on the same day collapsed onto one
   * `provider_sync_runs` row via `on conflict do nothing` — the closing
   * `update` kept re-targeting that same original row, and a day with
   * several scheduled polls showed exactly one operational run, never
   * several. That is precisely what an admin console auditing "how many
   * times did we actually poll today" needs to be able to see.
   */
  it("gives two polls of the same sport and date distinct run identities", () => {
    const first = runIdentity(
      "football",
      "2026-09-07",
      "2026-09-07T04:15:00.000Z",
    );
    const second = runIdentity(
      "football",
      "2026-09-07",
      "2026-09-07T14:15:00.000Z",
    );
    expect(first).not.toBe(second);
  });

  it("is deterministic for the same sport, date and timestamp", () => {
    const a = runIdentity(
      "basketball",
      "2026-09-07",
      "2026-09-07T04:15:00.000Z",
    );
    const b = runIdentity(
      "basketball",
      "2026-09-07",
      "2026-09-07T04:15:00.000Z",
    );
    expect(a).toBe(b);
  });

  it("separates football and basketball runs on the same date", () => {
    const football = runIdentity(
      "football",
      "2026-09-07",
      "2026-09-07T04:15:00.000Z",
    );
    const basketball = runIdentity(
      "basketball",
      "2026-09-07",
      "2026-09-07T04:15:00.000Z",
    );
    expect(football).not.toBe(basketball);
  });
});
