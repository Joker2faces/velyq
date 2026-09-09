import { describe, expect, it } from "vitest";

import {
  prioritizeOddsCandidates,
  runProviderIngestion,
  type DiscoveredFixture,
  type OddsCandidate,
  type ObservedQuota,
  type ProviderCallOutcome,
  type ProviderIngestionDeps,
} from "../src/provider-ingestion.js";
import type { ProviderQuotaSnapshot } from "../src/provider-quota.js";

const NOW = new Date("2026-09-09T12:00:00.000Z");
const TODAY = "2026-09-09";

type Fixture = { id: string };
type Odds = { fixtureId: string; price: string };

function quota(remaining: number | null): ObservedQuota {
  return { remaining, dailyLimit: 100, observedAt: NOW };
}

function healthySnapshot(
  overrides: Partial<ProviderQuotaSnapshot> = {},
): ProviderQuotaSnapshot {
  return {
    dailyLimit: 100,
    remaining: 90,
    quotaDay: TODAY,
    observedAt: NOW,
    ...overrides,
  };
}

function fixture(id: string, league = "39"): DiscoveredFixture<Fixture> {
  return {
    providerEventId: id,
    competitionProviderId: league,
    scheduledAt: "2026-09-09T18:00:00.000Z",
    payload: { id },
  };
}

function candidate(
  providerFixtureId: string,
  overrides: Partial<OddsCandidate> = {},
): OddsCandidate {
  return {
    providerFixtureId,
    kickoffAt: new Date("2026-09-09T18:00:00.000Z"),
    competitionMapped: true,
    ...overrides,
  };
}

/** Records every provider call so a test can assert the budget actually spent. */
type Harness = {
  deps: ProviderIngestionDeps<Fixture, Odds>;
  calls: string[];
  recordedQuota: ObservedQuota[];
};

function harness(
  overrides: Partial<ProviderIngestionDeps<Fixture, Odds>> = {},
  options: Readonly<{
    snapshot?: ProviderQuotaSnapshot;
    dueDates?: readonly string[];
    candidates?: readonly OddsCandidate[];
  }> = {},
): Harness {
  const calls: string[] = [];
  const recordedQuota: ObservedQuota[] = [];

  const deps: ProviderIngestionDeps<Fixture, Odds> = {
    clock: () => NOW,
    loadQuotaSnapshot: async () => options.snapshot ?? healthySnapshot(),
    recordQuotaObservation: async (observed) => {
      recordedQuota.push(observed);
    },
    spentToday: async () => ({
      DISCOVERY: 0,
      ODDS: 0,
      LINEUP: 0,
      RESULT: 0,
    }),
    discoveryDueDates: async () => options.dueDates ?? [],
    oddsCandidates: async () => options.candidates ?? [],
    discoverFixtures: async (date) => {
      calls.push(`discover:${date}`);
      return { ok: true, value: [fixture("100")], quota: quota(80) };
    },
    fetchOdds: async (id) => {
      calls.push(`odds:${id}`);
      return {
        ok: true,
        value: [{ fixtureId: id, price: "1.85" }],
        quota: quota(79),
      };
    },
    probeQuotaStatus: async () => {
      calls.push("status");
      return { ok: true, value: null, quota: quota(100) };
    },
    persistFixtures: async (fixtures) => ({
      received: fixtures.length,
      written: fixtures.length,
      skippedByReason: {},
    }),
    persistOdds: async (observations) => ({
      received: observations.length,
      written: observations.length,
      duplicate: 0,
      skippedByReason: {},
    }),
    ...overrides,
  };
  return { deps, calls, recordedQuota };
}

describe("runProviderIngestion", () => {
  it("makes zero provider calls when nothing is due, which is the normal healthy wake-up", async () => {
    /*
     * The whole point of the design: the scheduler may wake this every few
     * minutes, and on a ~100-request day a wake-up that spends a request
     * just because it woke would exhaust the budget before the fixtures
     * anybody cares about are priced.
     */
    const { deps, calls } = harness();
    const result = await runProviderIngestion(deps, { trigger: "SCHEDULER" });

    expect(calls).toEqual([]);
    expect(result.providerCallsUsed).toBe(0);
    expect(result.quotaProbed).toBe(false);
  });

  it("discovers only the dates that are due", async () => {
    const { deps, calls } = harness({}, { dueDates: ["2026-09-09"] });
    const result = await runProviderIngestion(deps, { trigger: "SCHEDULER" });

    expect(calls).toEqual(["discover:2026-09-09"]);
    expect(result.fixturesWritten).toBe(1);
    expect(result.providerCallsUsed).toBe(1);
  });

  it("requests odds one at a time, so a refusal can stop the rest", async () => {
    const seen: string[] = [];
    const { deps } = harness(
      {
        fetchOdds: async (
          id,
        ): Promise<ProviderCallOutcome<readonly Odds[]>> => {
          seen.push(id);
          /* Refused on the second fixture, with three still queued. */
          if (seen.length === 2)
            return { ok: false, reason: "RATE_LIMITED", quota: null };
          return { ok: true, value: [], quota: quota(70) };
        },
      },
      {
        candidates: [
          candidate("a"),
          candidate("b"),
          candidate("c"),
          candidate("d"),
        ],
      },
    );

    const result = await runProviderIngestion(deps, { trigger: "SCHEDULER" });

    /*
     * Concurrent requests would have spent all four before the 429 could be
     * seen. Sequential means exactly two were spent.
     */
    expect(seen).toHaveLength(2);
    expect(result.oddsRequestsAttempted).toBe(2);
    expect(result.errorsByReason["ODDS_RATE_LIMITED"]).toBe(1);
  });

  it("treats a refusal as an exhausted budget even when the provider sends no count with it", async () => {
    const { deps, recordedQuota } = harness(
      {
        fetchOdds: async () => ({
          ok: false,
          reason: "RATE_LIMITED",
          quota: null,
        }),
      },
      { candidates: [candidate("a"), candidate("b")] },
    );

    const result = await runProviderIngestion(deps, { trigger: "SCHEDULER" });

    /*
     * A refusal is the most reliable signal available, so it is written
     * through as remaining = 0 rather than leaving a stale healthy figure
     * that the next wake-up would happily spend against.
     */
    expect(recordedQuota.at(-1)?.remaining).toBe(0);
    expect(result.quotaStateAtEnd).toBe("EXHAUSTED");
  });

  it("keeps going past a single retryable failure without abandoning the pass", async () => {
    let attempt = 0;
    const { deps } = harness(
      {
        fetchOdds: async (id) => {
          attempt += 1;
          if (attempt === 1)
            return { ok: false, reason: "RETRYABLE", quota: quota(85) };
          return {
            ok: true,
            value: [{ fixtureId: id, price: "2.00" }],
            quota: quota(84),
          };
        },
      },
      { candidates: [candidate("a"), candidate("b")] },
    );

    const result = await runProviderIngestion(deps, { trigger: "SCHEDULER" });

    expect(result.oddsRequestsAttempted).toBe(2);
    expect(result.errorsByReason["ODDS_RETRYABLE"]).toBe(1);
    expect(result.oddsObservationsWritten).toBe(1);
  });

  it("spends nothing on odds once the quota is exhausted, and says why", async () => {
    const { deps, calls } = harness(
      {},
      {
        snapshot: healthySnapshot({ remaining: 0 }),
        candidates: [candidate("a"), candidate("b")],
      },
    );

    const result = await runProviderIngestion(deps, { trigger: "SCHEDULER" });

    expect(calls).toEqual([]);
    expect(result.skippedByReason["ODDS_QUOTA_EXHAUSTED"]).toBe(1);
  });

  it("probes the status endpoint only when idle and the quota is unknown", async () => {
    const { deps, calls } = harness(
      {},
      { snapshot: healthySnapshot({ remaining: null }) },
    );

    const result = await runProviderIngestion(deps, { trigger: "SCHEDULER" });

    expect(calls).toEqual(["status"]);
    expect(result.quotaProbed).toBe(true);
    expect(result.providerCallsUsed).toBe(1);
  });

  it("never probes the status endpoint when it did real work, since the headers already told it", async () => {
    const { deps, calls } = harness(
      {},
      {
        snapshot: healthySnapshot({ remaining: null }),
        dueDates: ["2026-09-09"],
      },
    );

    const result = await runProviderIngestion(deps, { trigger: "SCHEDULER" });

    expect(calls).toEqual(["discover:2026-09-09"]);
    expect(result.quotaProbed).toBe(false);
  });

  it("records the policy version and the quota it ended on", async () => {
    const { deps } = harness({}, { dueDates: ["2026-09-09"] });
    const result = await runProviderIngestion(deps, { trigger: "MANUAL" });

    expect(result.trigger).toBe("MANUAL");
    expect(result.quotaPolicyVersion).toMatch(/^provider-quota-policy-v\d+$/);
    expect(result.quotaRemainingAtEnd).toBe(80);
    expect(result.quotaDay).toBe(TODAY);
  });
});

describe("prioritizeOddsCandidates", () => {
  it("funds reviewed competitions before unmapped ones, whatever the kickoff order", async () => {
    /*
     * The defect this prevents: ordering by kickoff alone spent a whole day's
     * odds budget on whichever fixtures started soonest, which on a busy
     * matchday are minor leagues the model cannot price -- while the few
     * eligible fixtures got nothing and stopped at NO_ODDS_AT_CUTOFF.
     */
    const ordered = prioritizeOddsCandidates(
      [
        candidate("unmapped-imminent", {
          competitionMapped: false,
          kickoffAt: new Date("2026-09-09T12:05:00.000Z"),
        }),
        candidate("mapped-later", {
          kickoffAt: new Date("2026-09-09T20:00:00.000Z"),
        }),
      ],
      NOW,
    );

    expect(ordered.map((item) => item.providerFixtureId)).toEqual([
      "mapped-later",
      "unmapped-imminent",
    ]);
  });

  it("orders within a tier by nearest kickoff, before or after now", async () => {
    const ordered = prioritizeOddsCandidates(
      [
        candidate("far", { kickoffAt: new Date("2026-09-09T22:00:00.000Z") }),
        /* Already started: its closing price still needs observing. */
        candidate("just-started", {
          kickoffAt: new Date("2026-09-09T11:45:00.000Z"),
        }),
        candidate("soon", { kickoffAt: new Date("2026-09-09T13:00:00.000Z") }),
      ],
      NOW,
    );

    expect(ordered.map((item) => item.providerFixtureId)).toEqual([
      "just-started",
      "soon",
      "far",
    ]);
  });

  it("is deterministic for identical kickoffs", async () => {
    const ordered = prioritizeOddsCandidates(
      [candidate("b"), candidate("a")],
      NOW,
    );
    expect(ordered.map((item) => item.providerFixtureId)).toEqual(["a", "b"]);
  });
});

describe("per-run ceiling", () => {
  it("bounds one invocation even when the daily budget would allow more", async () => {
    /*
     * The executor is a serverless function with a wall-clock limit, and
     * odds requests are sequential. Without this ceiling a busy matchday
     * would be truncated mid-request, spending quota on a response that was
     * never persisted.
     */
    const { deps, calls } = harness(
      {},
      {
        candidates: Array.from({ length: 10 }, (_, index) =>
          candidate(`fixture-${index}`),
        ),
      },
    );

    const result = await runProviderIngestion(deps, {
      trigger: "SCHEDULER",
      maxOddsRequestsPerRun: 3,
    });

    expect(calls).toHaveLength(3);
    expect(result.oddsRequestsAttempted).toBe(3);
    expect(result.skippedByReason["ODDS_RUN_CEILING"]).toBe(1);
  });

  it("does not report a run ceiling when it was not the binding limit", async () => {
    const { deps } = harness({}, { candidates: [candidate("only")] });
    const result = await runProviderIngestion(deps, {
      trigger: "SCHEDULER",
      maxOddsRequestsPerRun: 4,
    });

    expect(result.oddsRequestsAttempted).toBe(1);
    expect(result.skippedByReason["ODDS_RUN_CEILING"]).toBeUndefined();
  });
});
