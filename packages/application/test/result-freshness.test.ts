import { describe, expect, it } from "vitest";
import {
  GIVE_UP_AFTER_HOURS,
  MINUTES_AFTER_KICKOFF_BEFORE_ASKING,
  RETRY_MINUTES_WHILE_UNFINISHED,
  prioritizeResultCandidates,
  resultRequestDue,
} from "../src/result-freshness.js";

/**
 * The result pass has a 10-request daily budget. Every case below is a way of
 * spending more than that on one fixture, which is what the odds pass did
 * before `provider_odds_requests` existed: four consecutive runs, one request
 * each, eighteen duplicate rows written.
 */

const KICKOFF = new Date("2026-09-10T18:00:00Z");
const minutesAfterKickoff = (minutes: number) =>
  new Date(KICKOFF.getTime() + minutes * 60_000);

function due(overrides: Partial<Parameters<typeof resultRequestDue>[0]> = {}) {
  return resultRequestDue({
    kickoffAt: KICKOFF,
    asOf: minutesAfterKickoff(MINUTES_AFTER_KICKOFF_BEFORE_ASKING),
    knownStatus: null,
    lastRequestedAt: null,
    ...overrides,
  });
}

describe("resultRequestDue", () => {
  it("never asks about a match that has not kicked off", () => {
    expect(due({ asOf: minutesAfterKickoff(-1) })).toEqual({
      due: false,
      reason: "NOT_KICKED_OFF",
    });
  });

  /*
   * Asking at 115 minutes gets IN_PROGRESS back and forces a second request.
   * Two requests where one would do is 20% of the day's result budget.
   */
  it("waits until the match has plausibly finished", () => {
    expect(
      due({
        asOf: minutesAfterKickoff(MINUTES_AFTER_KICKOFF_BEFORE_ASKING - 1),
      }).reason,
    ).toBe("TOO_SOON_AFTER_KICKOFF");
    expect(due().due).toBe(true);
  });

  it("asks once as soon as the window opens", () => {
    expect(due()).toEqual({ due: true, reason: "NEVER_REQUESTED" });
  });

  /*
   * This is the invariant that bounds the whole pass: once a fixture is
   * answered it is never asked about again, so the cost is per fixture and
   * not per wake-up.
   */
  it("never asks again once the fixture is terminal", () => {
    for (const knownStatus of ["FINAL", "CANCELLED", "ABANDONED"] as const) {
      expect(due({ knownStatus, asOf: minutesAfterKickoff(60 * 24) })).toEqual({
        due: false,
        reason: "ALREADY_TERMINAL",
      });
    }
  });

  /*
   * A postponed match is normally replayed under the same fixture id. Treating
   * it as terminal would leave every decision on it permanently unsettled.
   */
  it("keeps asking about a postponed match, unlike a cancelled one", () => {
    expect(due({ knownStatus: "POSTPONED" }).due).toBe(true);
    expect(due({ knownStatus: "CANCELLED" }).due).toBe(false);
  });

  it("keeps asking about a match still in progress", () => {
    expect(due({ knownStatus: "IN_PROGRESS" }).due).toBe(true);
  });

  it("respects the retry interval after we have already asked", () => {
    const asOf = minutesAfterKickoff(MINUTES_AFTER_KICKOFF_BEFORE_ASKING + 60);
    expect(
      due({
        asOf,
        knownStatus: "IN_PROGRESS",
        lastRequestedAt: new Date(
          asOf.getTime() - (RETRY_MINUTES_WHILE_UNFINISHED - 1) * 60_000,
        ),
      }),
    ).toEqual({ due: false, reason: "RETRY_INTERVAL_NOT_ELAPSED" });
    expect(
      due({
        asOf,
        knownStatus: "IN_PROGRESS",
        lastRequestedAt: new Date(
          asOf.getTime() - RETRY_MINUTES_WHILE_UNFINISHED * 60_000,
        ),
      }),
    ).toEqual({ due: true, reason: "RETRY_INTERVAL_ELAPSED" });
  });

  /*
   * Scheduling on our own last-asked time is the whole point. A clock skew
   * that puts our last request in the future must not read as "asked long
   * ago" and re-open the fixture immediately.
   */
  it("treats a last-requested time in the future as just-asked", () => {
    const asOf = minutesAfterKickoff(MINUTES_AFTER_KICKOFF_BEFORE_ASKING + 60);
    expect(
      due({
        asOf,
        knownStatus: "IN_PROGRESS",
        lastRequestedAt: new Date(asOf.getTime() + 60 * 60_000),
      }).due,
    ).toBe(false);
  });

  /*
   * Without this, one fixture the provider never resolves becomes a standing
   * daily charge against a 10-request budget, forever.
   */
  it("gives up on a fixture the provider never resolves", () => {
    expect(
      due({
        asOf: minutesAfterKickoff(GIVE_UP_AFTER_HOURS * 60 + 1),
        knownStatus: "IN_PROGRESS",
      }),
    ).toEqual({ due: false, reason: "ABANDONED_AFTER_GRACE_PERIOD" });
  });

  it("is still asking at the edge of the give-up window", () => {
    expect(
      due({
        asOf: minutesAfterKickoff(GIVE_UP_AFTER_HOURS * 60),
        knownStatus: "IN_PROGRESS",
      }).due,
    ).toBe(true);
  });

  /*
   * A terminal fixture outside the give-up window must report the reason that
   * actually applies, because the funnel reads it to explain the queue.
   */
  it("reports terminal ahead of the give-up window", () => {
    expect(
      due({
        asOf: minutesAfterKickoff(GIVE_UP_AFTER_HOURS * 60 + 1),
        knownStatus: "FINAL",
      }).reason,
    ).toBe("ALREADY_TERMINAL");
  });
});

describe("prioritizeResultCandidates", () => {
  /*
   * Oldest first: a match that finished three hours ago is likelier to come
   * back FINAL than one that finished twenty minutes ago, so this maximises
   * the share of a small budget that produces a settlement.
   */
  it("spends the budget on the matches most likely to be finished", () => {
    const candidates = [
      { id: "recent", kickoffAt: minutesAfterKickoff(0) },
      { id: "oldest", kickoffAt: minutesAfterKickoff(-600) },
      { id: "middle", kickoffAt: minutesAfterKickoff(-180) },
    ];
    expect(prioritizeResultCandidates(candidates).map((c) => c.id)).toEqual([
      "oldest",
      "middle",
      "recent",
    ]);
  });

  it("does not mutate the input", () => {
    const candidates = [
      { kickoffAt: minutesAfterKickoff(0) },
      { kickoffAt: minutesAfterKickoff(-600) },
    ];
    const before = [...candidates];
    prioritizeResultCandidates(candidates);
    expect(candidates).toEqual(before);
  });
});
