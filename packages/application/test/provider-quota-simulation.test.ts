import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  ASSUMED_DAILY_LIMIT,
  DAILY_PURPOSE_BUDGET,
  RECOVERY_RESERVE,
  purposeRequestBudget,
  providerQuotaState,
  type IngestionPurpose,
  type ProviderQuotaSnapshot,
} from "../src/provider-quota.js";
import {
  runProviderIngestion,
  type LineupCandidate,
  type OddsCandidate,
  type ProviderIngestionDeps,
  type ResultCandidate,
} from "../src/provider-ingestion.js";

/**
 * Whole-day quota simulations.
 *
 * The scheduler wakes every fifteen minutes: 96 times a day against a plan of
 * about 100 requests. The claim the whole design rests on is that 96 wake-ups
 * does NOT mean 96 provider calls -- and with four phases now competing
 * (discovery, lineups, odds, results) that claim is worth proving by
 * simulation rather than by reading the code.
 *
 * These run the real orchestrator over a real day's wake-ups with in-memory
 * ports, carrying quota state forward exactly as the database would. They are
 * deterministic: no clock, no randomness, no network.
 */

const WAKE_UPS_PER_DAY = 96;
const CADENCE_MINUTES = 15;
const DAY_START = Date.parse("2026-09-20T00:00:00.000Z");

type Fixture = { id: string };
type Odds = { fixtureId: string };
type Result = { fixtureId: string };
type Lineup = { fixtureId: string };

type DayShape = Readonly<{
  /** Dates whose fixture list is due, per wake-up index. */
  discoveryDue: (index: number) => readonly string[];
  oddsDue: (index: number) => readonly OddsCandidate[];
  lineupDue: (index: number) => readonly LineupCandidate[];
  resultDue: (index: number) => readonly ResultCandidate[];
}>;

type DayOutcome = Readonly<{
  providerCalls: number;
  zeroCallWakeUps: number;
  byPurpose: Readonly<Record<IngestionPurpose, number>>;
  remainingAtEnd: number;
}>;

/**
 * Runs a full day.
 *
 * Quota state and per-purpose spend are carried across wake-ups the way the
 * database carries them, so a budget genuinely depletes rather than resetting
 * each run. The provider is modelled as always answering and always reporting
 * its remaining count, which is the *generous* case for spending -- a failing
 * provider spends no less, because a failed attempt is charged too.
 */
async function simulateDay(shape: DayShape): Promise<DayOutcome> {
  const spent: Record<IngestionPurpose, number> = {
    DISCOVERY: 0,
    ODDS: 0,
    LINEUP: 0,
    RESULT: 0,
  };
  let remaining = ASSUMED_DAILY_LIMIT;
  let providerCalls = 0;
  let zeroCallWakeUps = 0;

  for (let index = 0; index < WAKE_UPS_PER_DAY; index += 1) {
    const now = new Date(DAY_START + index * CADENCE_MINUTES * 60_000);
    const snapshot: ProviderQuotaSnapshot = {
      dailyLimit: ASSUMED_DAILY_LIMIT,
      remaining,
      quotaDay: "2026-09-20",
      observedAt: now,
    };

    const charge = (purpose: IngestionPurpose) => {
      spent[purpose] += 1;
      remaining = Math.max(0, remaining - 1);
      providerCalls += 1;
    };

    const deps: ProviderIngestionDeps<Fixture, Odds, Result, Lineup> = {
      clock: () => now,
      loadQuotaSnapshot: async () => snapshot,
      recordQuotaObservation: async () => {},
      recordRequestAttempt: async () => {},
      spentToday: async () => ({ ...spent }),
      discoveryDueDates: async () => shape.discoveryDue(index),
      oddsCandidates: async () => shape.oddsDue(index),
      lineupCandidates: async () => shape.lineupDue(index),
      resultCandidates: async () => shape.resultDue(index),
      discoverFixtures: async (date) => {
        charge("DISCOVERY");
        return {
          ok: true,
          value: [
            {
              providerEventId: `fixture-${date}`,
              competitionProviderId: "39",
              scheduledAt: now.toISOString(),
              payload: { id: date },
            },
          ],
          quota: {
            remaining,
            dailyLimit: ASSUMED_DAILY_LIMIT,
            observedAt: now,
          },
        };
      },
      fetchOdds: async (id) => {
        charge("ODDS");
        return {
          ok: true,
          value: [{ fixtureId: id }],
          quota: {
            remaining,
            dailyLimit: ASSUMED_DAILY_LIMIT,
            observedAt: now,
          },
        };
      },
      fetchLineups: async (id) => {
        charge("LINEUP");
        return {
          ok: true,
          value: [{ fixtureId: id }],
          quota: {
            remaining,
            dailyLimit: ASSUMED_DAILY_LIMIT,
            observedAt: now,
          },
        };
      },
      fetchResults: async (ids) => {
        charge("RESULT");
        return {
          ok: true,
          value: ids.map((id) => ({ fixtureId: id })),
          quota: {
            remaining,
            dailyLimit: ASSUMED_DAILY_LIMIT,
            observedAt: now,
          },
        };
      },
      probeQuotaStatus: async () => {
        charge("DISCOVERY");
        return {
          ok: true,
          value: null,
          quota: {
            remaining,
            dailyLimit: ASSUMED_DAILY_LIMIT,
            observedAt: now,
          },
        };
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
      persistLineups: async (lineups) => ({
        received: lineups.length,
        written: lineups.length,
        duplicate: 0,
        official: 1,
        skippedByReason: {},
      }),
      persistResults: async (results) => ({
        received: results.length,
        written: results.length,
        duplicate: 0,
        settlementsWritten: results.length,
        skippedByReason: {},
      }),
    };

    const before = providerCalls;
    await runProviderIngestion(deps, { trigger: "SCHEDULER" });
    if (providerCalls === before) zeroCallWakeUps += 1;
  }

  return {
    providerCalls,
    zeroCallWakeUps,
    byPurpose: { ...spent },
    remainingAtEnd: remaining,
  };
}

/*
 * Collected so the measured day totals can be quoted in the release
 * documentation rather than estimated there. Vitest's reporter swallows
 * console output from tests, so this is written to a file.
 */
const measured: Record<string, DayOutcome> = {};

const none = () => [];
const oddsCandidate = (id: string): OddsCandidate => ({
  providerFixtureId: id,
  kickoffAt: new Date(DAY_START + 18 * 3_600_000),
  competitionMapped: true,
});
const lineupCandidate = (id: string): LineupCandidate => ({
  providerFixtureId: id,
  kickoffAt: new Date(DAY_START + 18 * 3_600_000),
});
const resultCandidate = (id: string): ResultCandidate => ({
  providerFixtureId: id,
  kickoffAt: new Date(DAY_START + 12 * 3_600_000),
});

describe("whole-day quota simulation", () => {
  /*
   * A quiet day: nothing is ever due. This is the load-bearing claim -- if an
   * idle wake-up spent anything, 96 of them would exhaust a 100-request plan
   * before any fixture anybody cares about was priced.
   */
  it("quiet day: an idle wake-up spends nothing", async () => {
    const day = await simulateDay({
      discoveryDue: none,
      oddsDue: none,
      lineupDue: none,
      resultDue: none,
    });

    /*
     * Not literally zero: the first wake-up probes once, because the quota is
     * genuinely unknown at the start of a UTC day and one request buys a known
     * budget for the other 95. That probe is itself budgeted -- it was the one
     * unbounded call in the pass, which on a bad day meant 96 status calls.
     */
    measured["quiet"] = day;
    /* Measured: exactly zero, and every one of the 96 wake-ups idle. */
    expect(day.providerCalls).toBe(0);
    expect(day.zeroCallWakeUps).toBe(WAKE_UPS_PER_DAY);
    expect(day.zeroCallWakeUps).toBeGreaterThanOrEqual(WAKE_UPS_PER_DAY - 1);
    expect(day.remainingAtEnd).toBeGreaterThanOrEqual(ASSUMED_DAILY_LIMIT - 1);
  });

  /*
   * A normal football day: the horizon needs discovering, a handful of
   * fixtures need pricing through the afternoon, two have lineups published
   * before kickoff, and the evening's results settle.
   */
  it("normal day: stays well inside the plan and leaves the reserve intact", async () => {
    const day = await simulateDay({
      /* Two dates due, early, then satisfied. */
      discoveryDue: (index) => (index < 2 ? ["2026-09-20", "2026-09-21"] : []),
      /*
       * Six fixtures, due at the real cadence rather than on every wake-up.
       *
       * `oddsCandidates` returns only fixtures whose refresh interval has
       * elapsed, and the policy's bands are 360 minutes when kickoff is far
       * off, tightening to 15 in the last 45 minutes. Modelling odds as
       * always-due is the heavy case, not a normal one -- so here they are due
       * every two hours through the day and on every wake-up only in the final
       * hour before an 18:00 kickoff.
       */
      oddsDue: (index) => {
        const nearKickoff = index >= 68 && index <= 72;
        const periodic = index >= 8 && index % 8 === 0;
        return nearKickoff || periodic
          ? ["a", "b", "c", "d", "e", "f"].map(oddsCandidate)
          : [];
      },
      /* Two fixtures inside the lineup window in the evening. */
      lineupDue: (index) =>
        index >= 64 && index <= 72 ? ["a", "b"].map(lineupCandidate) : [],
      /* Results become askable after the evening's matches finish. */
      resultDue: (index) =>
        index >= 84 ? ["a", "b", "c"].map(resultCandidate) : [],
    });

    measured["normal"] = day;
    /*
     * Measured: 30 calls, 66 of 96 wake-ups idle, 70 left. Pinned as an upper
     * bound rather than an equality so an unrelated policy change does not
     * fail here spuriously -- but tight enough that a regression which starts
     * spending on idle wake-ups does.
     */
    expect(day.providerCalls).toBeLessThanOrEqual(35);
    expect(day.zeroCallWakeUps).toBeGreaterThanOrEqual(60);
    expect(day.remainingAtEnd).toBeGreaterThanOrEqual(60);
    /* The reserve is never allocated to a purpose, so it must survive. */
    expect(day.remainingAtEnd).toBeGreaterThanOrEqual(RECOVERY_RESERVE);
    for (const purpose of [
      "DISCOVERY",
      "ODDS",
      "LINEUP",
      "RESULT",
    ] as IngestionPurpose[]) {
      expect(day.byPurpose[purpose]).toBeLessThanOrEqual(
        DAILY_PURPOSE_BUDGET[purpose],
      );
    }
  });

  /*
   * A heavy day: everything is due on every wake-up. This is the case that
   * decides whether the per-purpose budgets are real or decorative.
   */
  it("heavy day: every purpose stops at its own budget", async () => {
    const day = await simulateDay({
      discoveryDue: () => ["2026-09-20", "2026-09-21", "2026-09-22"],
      oddsDue: () =>
        Array.from({ length: 40 }, (_, i) => oddsCandidate(`odds-${i}`)),
      lineupDue: () =>
        Array.from({ length: 20 }, (_, i) => lineupCandidate(`lineup-${i}`)),
      resultDue: () =>
        Array.from({ length: 30 }, (_, i) => resultCandidate(`result-${i}`)),
    });

    measured["heavy"] = day;
    for (const purpose of [
      "DISCOVERY",
      "ODDS",
      "LINEUP",
      "RESULT",
    ] as IngestionPurpose[]) {
      expect(
        day.byPurpose[purpose],
        `${purpose} exceeded its daily budget`,
      ).toBeLessThanOrEqual(DAILY_PURPOSE_BUDGET[purpose]);
    }

    /*
     * The per-run ceiling is the other half: one provider call per wake-up
     * means a day cannot exceed the number of wake-ups however much is due.
     *
     * Measured: 93 calls, which is exactly the sum of the purpose budgets --
     * so the budgets, not the cadence, are what bound a heavy day.
     */
    expect(day.providerCalls).toBeLessThanOrEqual(WAKE_UPS_PER_DAY);
    expect(day.providerCalls).toBe(93);
  });

  /*
   * The worst case, and the one that actually matters commercially: with
   * everything due all day, does the day still end with a usable reserve?
   */
  it("worst case: the recovery reserve is never spent", async () => {
    const day = await simulateDay({
      discoveryDue: () => ["2026-09-20", "2026-09-21", "2026-09-22"],
      oddsDue: () =>
        Array.from({ length: 100 }, (_, i) => oddsCandidate(`odds-${i}`)),
      lineupDue: () =>
        Array.from({ length: 100 }, (_, i) => lineupCandidate(`lineup-${i}`)),
      resultDue: () =>
        Array.from({ length: 100 }, (_, i) => resultCandidate(`result-${i}`)),
    });

    measured["worstCase"] = day;
    expect(day.remainingAtEnd).toBeGreaterThanOrEqual(RECOVERY_RESERVE);
    /*
     * And the total is bounded by the sum of the purpose budgets, not by the
     * plan. That difference -- 93 allocated against 100 available -- is the
     * reserve, and it is what makes a bad day recoverable rather than a day
     * that has already spent everything.
     */
    const allocated = Object.values(DAILY_PURPOSE_BUDGET).reduce(
      (total, value) => total + value,
      0,
    );
    expect(allocated).toBe(ASSUMED_DAILY_LIMIT - RECOVERY_RESERVE);
    expect(day.providerCalls).toBeLessThanOrEqual(allocated);
    /*
     * Measured: the worst case spends exactly the allocation and ends with
     * exactly the reserve. Not approximately -- exactly, which is what makes
     * the reserve a real guarantee rather than a hope.
     */
    expect(day.providerCalls).toBe(allocated);
    expect(day.remainingAtEnd).toBe(RECOVERY_RESERVE);
  });

  afterAll(() => {
    writeFileSync(
      process.env["VELYQ_QUOTA_SIMULATION_OUT"] ??
        join(tmpdir(), "velyq-quota-simulation.json"),
      `${JSON.stringify(measured, null, 2)}
`,
      "utf8",
    );
  });

  /*
   * Simulations are only as good as their determinism. If the same day
   * produced different numbers on a second run, none of the above would mean
   * anything.
   */
  it("is deterministic across runs", async () => {
    const shape: DayShape = {
      discoveryDue: (index) => (index < 2 ? ["2026-09-20"] : []),
      oddsDue: (index) => (index > 4 ? [oddsCandidate("a")] : []),
      lineupDue: (index) => (index > 60 ? [lineupCandidate("a")] : []),
      resultDue: (index) => (index > 88 ? [resultCandidate("a")] : []),
    };
    const first = await simulateDay(shape);
    const second = await simulateDay(shape);
    expect(second).toEqual(first);
  });
});

describe("quota state and budget arithmetic", () => {
  /* The reserve is defined by subtraction, so it can be asserted directly. */
  it("allocates exactly the plan minus the reserve", () => {
    const allocated = Object.values(DAILY_PURPOSE_BUDGET).reduce(
      (total, value) => total + value,
      0,
    );
    expect(allocated + RECOVERY_RESERVE).toBe(ASSUMED_DAILY_LIMIT);
  });

  it("stops all ordinary polling once the reserve is being eaten", () => {
    const now = new Date(DAY_START);
    const snapshot = (remaining: number): ProviderQuotaSnapshot => ({
      dailyLimit: ASSUMED_DAILY_LIMIT,
      remaining,
      quotaDay: "2026-09-20",
      observedAt: now,
    });

    /*
     * Inside the reserve is CRITICAL rather than EXHAUSTED -- there are still
     * requests left, they are just not ours to spend on polling. EXHAUSTED is
     * reserved for genuinely none remaining. What matters for the product is
     * that both stop every purpose, which is asserted below rather than
     * inferred from the state name.
     */
    expect(providerQuotaState(snapshot(RECOVERY_RESERVE - 1), now)).toBe(
      "CRITICAL",
    );
    expect(providerQuotaState(snapshot(RECOVERY_RESERVE), now)).toBe(
      "CRITICAL",
    );
    expect(providerQuotaState(snapshot(0), now)).toBe("EXHAUSTED");
    /* One above the reserve is spendable again. */
    expect(providerQuotaState(snapshot(RECOVERY_RESERVE + 1), now)).not.toBe(
      "CRITICAL",
    );

    for (const remaining of [0, RECOVERY_RESERVE - 1, RECOVERY_RESERVE]) {
      for (const purpose of [
        "DISCOVERY",
        "ODDS",
        "LINEUP",
        "RESULT",
      ] as IngestionPurpose[]) {
        const budget = purposeRequestBudget({
          purpose,
          snapshot: snapshot(remaining),
          spentToday: 0,
          candidates: 10,
          now,
        });
        expect(
          budget.allowed,
          `${purpose} still spending with ${remaining} remaining`,
        ).toBe(0);
      }
    }
  });
});
