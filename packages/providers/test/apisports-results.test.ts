import { describe, expect, it } from "vitest";
import {
  normalizeFootballResult,
  resultLifecycleStatus,
} from "../src/apisports.js";

/**
 * Result normalization is the boundary where a provider's fixture-status
 * vocabulary becomes the six lifecycle states the application settles on.
 *
 * Every assertion here protects a decision that would otherwise be made
 * silently by a lookup table: whether a match is over, whether it can still
 * resume, and whether a missing score is a zero.
 */

function fixture(
  overrides: Record<string, unknown> = {},
  goals: Record<string, unknown> = {},
) {
  return {
    fixture: {
      id: 1_015_243,
      date: "2026-09-10T18:30:00+00:00",
      timestamp: 1_789_065_000,
      status: { short: "FT", long: "Match Finished" },
      ...overrides,
    },
    goals: { home: 2, away: 1, ...goals },
  };
}

describe("normalizeFootballResult", () => {
  it("reads the score and the provider's own observation instant", () => {
    const result = normalizeFootballResult(fixture());
    expect(result).toEqual({
      sport: "FOOTBALL",
      providerEventId: "1015243",
      status: "FINAL",
      homeScore: 2,
      awayScore: 1,
      providerObservedAt: new Date(1_789_065_000 * 1000).toISOString(),
      provider: "API_SPORTS",
      sourceReference: "api-sports:football:results",
    });
  });

  it("falls back to the fixture date when no unix timestamp is present", () => {
    const result = normalizeFootballResult(fixture({ timestamp: undefined }));
    expect(result.providerObservedAt).toBe(
      new Date("2026-09-10T18:30:00+00:00").toISOString(),
    );
  });

  /*
   * A result with no attributable instant is not partially usable: freshness,
   * ordering and idempotency all key off it.
   */
  it("refuses a result with no observation instant at all", () => {
    expect(() =>
      normalizeFootballResult(fixture({ timestamp: undefined, date: null })),
    ).toThrow("RESULT_OBSERVED_AT_MISSING");
  });

  it("refuses a result with no fixture identity", () => {
    expect(() => normalizeFootballResult(fixture({ id: "1015243" }))).toThrow(
      "INVALID_FOOTBALL_RESULT",
    );
  });

  it("refuses a result with no status", () => {
    expect(() => normalizeFootballResult(fixture({ status: {} }))).toThrow(
      "RESULT_STATUS_MISSING",
    );
  });

  /*
   * The alternative to throwing is inventing a lifecycle state for a code we
   * have not considered -- and a wrong state settles or voids real decisions.
   */
  it("refuses an unmapped provider status rather than guessing", () => {
    expect(() =>
      normalizeFootballResult(fixture({ status: { short: "WO" } })),
    ).toThrow("RESULT_STATUS_UNMAPPED:WO");
    expect(() =>
      normalizeFootballResult(fixture({ status: { short: "AWD" } })),
    ).toThrow("RESULT_STATUS_UNMAPPED:AWD");
  });

  /*
   * settleDecision already answers UNSETTLED for a final match with no score.
   * Substituting 0-0 here would settle every decision on the match as a loss.
   */
  it("keeps a missing score null instead of substituting zero", () => {
    const result = normalizeFootballResult(
      fixture({}, { home: null, away: null }),
    );
    expect(result.homeScore).toBeNull();
    expect(result.awayScore).toBeNull();
    expect(result.status).toBe("FINAL");
  });

  it("keeps a genuine nil-nil distinguishable from a missing score", () => {
    const result = normalizeFootballResult(fixture({}, { home: 0, away: 0 }));
    expect(result.homeScore).toBe(0);
    expect(result.awayScore).toBe(0);
  });

  it("rejects a negative or fractional goal count as not reported", () => {
    expect(
      normalizeFootballResult(fixture({}, { home: -1 })).homeScore,
    ).toBeNull();
    expect(
      normalizeFootballResult(fixture({}, { home: 1.5 })).homeScore,
    ).toBeNull();
  });
});

describe("resultLifecycleStatus", () => {
  it("treats full time, extra time and penalties alike as final", () => {
    for (const code of ["FT", "AET", "PEN"]) {
      expect(resultLifecycleStatus(code)).toBe("FINAL");
    }
  });

  /*
   * An interrupted or suspended match may resume. Mapping either to ABANDONED
   * would VOID decisions that are still live.
   */
  it("keeps an interrupted or suspended match in progress, not abandoned", () => {
    expect(resultLifecycleStatus("INT")).toBe("IN_PROGRESS");
    expect(resultLifecycleStatus("SUSP")).toBe("IN_PROGRESS");
  });

  it("separates postponed, cancelled and abandoned", () => {
    expect(resultLifecycleStatus("PST")).toBe("POSTPONED");
    expect(resultLifecycleStatus("CANC")).toBe("CANCELLED");
    expect(resultLifecycleStatus("ABD")).toBe("ABANDONED");
  });

  it("maps every pre-match code to scheduled", () => {
    expect(resultLifecycleStatus("NS")).toBe("SCHEDULED");
    expect(resultLifecycleStatus("TBD")).toBe("SCHEDULED");
  });

  it("answers null for a code it does not know", () => {
    expect(resultLifecycleStatus("WO")).toBeNull();
    expect(resultLifecycleStatus("")).toBeNull();
  });

  it("is insensitive to provider casing and padding", () => {
    expect(resultLifecycleStatus(" ft ")).toBe("FINAL");
  });
});
