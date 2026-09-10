import { describe, expect, it } from "vitest";
import {
  MINUTES_AFTER_KICKOFF_TO_STOP_ASKING,
  MINUTES_BEFORE_KICKOFF_TO_START_ASKING,
  RETRY_MINUTES_WHILE_NOT_OFFICIAL,
  lineupRequestDue,
  prioritizeLineupCandidates,
} from "../src/lineup-freshness.js";

/**
 * The lineup budget is fifteen requests a day -- a quarter of the odds budget
 * -- and the window in which a lineup is worth asking for is under two hours
 * wide. Every case below is a way for one fixture to spend the whole day.
 */

const KICKOFF = new Date("2026-09-20T18:00:00Z");
const beforeKickoff = (minutes: number) =>
  new Date(KICKOFF.getTime() - minutes * 60_000);

function due(overrides: Partial<Parameters<typeof lineupRequestDue>[0]> = {}) {
  return lineupRequestDue({
    kickoffAt: KICKOFF,
    asOf: beforeKickoff(MINUTES_BEFORE_KICKOFF_TO_START_ASKING),
    knownStatus: null,
    competitionSupported: true,
    lastRequestedAt: null,
    ...overrides,
  });
}

describe("lineupRequestDue", () => {
  it("does not ask before the window opens", () => {
    expect(
      due({
        asOf: beforeKickoff(MINUTES_BEFORE_KICKOFF_TO_START_ASKING + 1),
      }),
    ).toEqual({ due: false, reason: "TOO_EARLY" });
  });

  it("asks as soon as the window opens", () => {
    expect(due()).toEqual({ due: true, reason: "NEVER_REQUESTED" });
  });

  /*
   * The invariant that bounds the pass: a confirmed sheet will not change, so
   * one OFFICIAL answer ends the fixture's cost.
   */
  it("never asks again once the sheet is official", () => {
    expect(due({ knownStatus: "OFFICIAL", asOf: beforeKickoff(10) })).toEqual({
      due: false,
      reason: "ALREADY_OFFICIAL",
    });
  });

  /*
   * EXPECTED is the state that must be replaced by the confirmed sheet, and
   * it is also the state in which WAIT_FOR_LINEUP stays closed. Treating it
   * as an answer would stop us asking and leave the gate shut forever.
   */
  it("keeps asking when only a provisional sheet is known", () => {
    expect(due({ knownStatus: "EXPECTED" }).due).toBe(true);
  });

  it("keeps asking when the provider previously had nothing", () => {
    expect(due({ knownStatus: "UNAVAILABLE" }).due).toBe(true);
  });

  /*
   * A lineup for a fixture the model cannot price cannot change any decision,
   * because there is no decision. Spending on it takes budget from a fixture
   * that has one.
   */
  it("does not spend on a competition the model cannot price", () => {
    expect(due({ competitionSupported: false })).toEqual({
      due: false,
      reason: "COMPETITION_UNSUPPORTED",
    });
  });

  it("reports official ahead of an unsupported competition", () => {
    /* Both apply; the terminal answer is the more useful one to report,
       because it means the fixture is finished rather than excluded. */
    expect(
      due({ knownStatus: "OFFICIAL", competitionSupported: false }).reason,
    ).toBe("ALREADY_OFFICIAL");
  });

  it("respects the retry interval", () => {
    const asOf = beforeKickoff(30);
    expect(
      due({
        asOf,
        lastRequestedAt: new Date(
          asOf.getTime() - (RETRY_MINUTES_WHILE_NOT_OFFICIAL - 1) * 60_000,
        ),
      }),
    ).toEqual({ due: false, reason: "RETRY_INTERVAL_NOT_ELAPSED" });
    expect(
      due({
        asOf,
        lastRequestedAt: new Date(
          asOf.getTime() - RETRY_MINUTES_WHILE_NOT_OFFICIAL * 60_000,
        ),
      }),
    ).toEqual({ due: true, reason: "RETRY_INTERVAL_ELAPSED" });
  });

  /* Clock skew must not read as "asked long ago" and reopen the fixture. */
  it("treats a last-requested time in the future as just-asked", () => {
    const asOf = beforeKickoff(30);
    expect(
      due({
        asOf,
        lastRequestedAt: new Date(asOf.getTime() + 60 * 60_000),
      }).due,
    ).toBe(false);
  });

  /*
   * A sheet published at kickoff is still worth recording: the decision it
   * would have informed is closed, but the evidence timeline and the autopsy
   * both read it.
   */
  it("keeps asking for a short while after kickoff", () => {
    expect(
      due({
        asOf: new Date(
          KICKOFF.getTime() +
            (MINUTES_AFTER_KICKOFF_TO_STOP_ASKING - 1) * 60_000,
        ),
      }).due,
    ).toBe(true);
  });

  it("closes the window once the lineup can inform nothing", () => {
    expect(
      due({
        asOf: new Date(
          KICKOFF.getTime() +
            (MINUTES_AFTER_KICKOFF_TO_STOP_ASKING + 1) * 60_000,
        ),
      }),
    ).toEqual({ due: false, reason: "WINDOW_CLOSED" });
  });

  /*
   * The whole-day scenario, counted. Ninety minutes of window with a
   * twenty-minute retry is at most six requests for one fixture, against a
   * fifteen-request budget -- so a single fixture cannot consume the day, but
   * three of them could, which is why the pass also has a per-run ceiling.
   */
  it("bounds one fixture to a handful of requests across the window", () => {
    let asOf = beforeKickoff(MINUTES_BEFORE_KICKOFF_TO_START_ASKING);
    let lastRequestedAt: Date | null = null;
    let requests = 0;
    const end = new Date(
      KICKOFF.getTime() + MINUTES_AFTER_KICKOFF_TO_STOP_ASKING * 60_000,
    );
    /* Every scheduler wake-up across the window, at the real cadence. */
    while (asOf.getTime() <= end.getTime()) {
      const verdict = lineupRequestDue({
        kickoffAt: KICKOFF,
        asOf,
        knownStatus: "UNAVAILABLE",
        competitionSupported: true,
        lastRequestedAt,
      });
      if (verdict.due) {
        requests += 1;
        lastRequestedAt = asOf;
      }
      asOf = new Date(asOf.getTime() + 15 * 60_000);
    }
    expect(requests).toBeLessThanOrEqual(6);
    expect(requests).toBeGreaterThan(0);
  });
});

describe("prioritizeLineupCandidates", () => {
  /*
   * Nearest kickoff first -- the opposite of the result pass, because a
   * lineup's value expires at kickoff rather than growing after it.
   */
  it("spends the budget on the matches closest to starting", () => {
    /* Kickoff *times*, so the earliest absolute time is the match that
       starts soonest and whose lineup is most nearly out of time to matter. */
    const candidates = [
      { id: "kicksOffLast", kickoffAt: new Date("2026-09-20T20:00:00Z") },
      { id: "kicksOffFirst", kickoffAt: new Date("2026-09-20T17:00:00Z") },
      { id: "kicksOffSecond", kickoffAt: new Date("2026-09-20T18:00:00Z") },
    ];
    expect(prioritizeLineupCandidates(candidates).map((c) => c.id)).toEqual([
      "kicksOffFirst",
      "kicksOffSecond",
      "kicksOffLast",
    ]);
  });

  it("does not mutate the input", () => {
    const candidates = [
      { kickoffAt: new Date("2026-09-20T20:00:00Z") },
      { kickoffAt: new Date("2026-09-20T17:00:00Z") },
    ];
    const before = [...candidates];
    prioritizeLineupCandidates(candidates);
    expect(candidates).toEqual(before);
  });
});
