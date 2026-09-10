import { describe, expect, it } from "vitest";
import {
  deduplicateObservations,
  normalizeOdds,
  splitLineBearingSelection,
  type OddsObservationV3,
} from "../src/apisports.js";

/**
 * API-Sports puts a goals total's line inside the selection string rather than
 * in the `handicap` field, so the line has to be lifted out before anything
 * downstream can key on it. Left embedded, two different lines from one
 * bookmaker at one instant look like two quotes on a single market.
 */

const INGESTED_AT = "2026-09-19T12:00:01.000Z";

function response(
  bets: readonly Record<string, unknown>[],
  bookmaker = "Test Book",
) {
  return {
    fixture: { id: 900001 },
    bookmakers: [{ id: 8, name: bookmaker, bets }],
  };
}

describe("splitLineBearingSelection", () => {
  it("lifts the line out of the selection", () => {
    expect(splitLineBearingSelection("Over 2.5")).toEqual({
      selection: "OVER",
      line: "2.5",
    });
    expect(splitLineBearingSelection("Under 3.5")).toEqual({
      selection: "UNDER",
      line: "3.5",
    });
  });

  it("tolerates provider casing and padding", () => {
    expect(splitLineBearingSelection("  over   1.5 ")).toEqual({
      selection: "OVER",
      line: "1.5",
    });
  });

  it("handles integer and multi-digit lines", () => {
    expect(splitLineBearingSelection("Over 10")?.line).toBe("10");
    expect(splitLineBearingSelection("Under 0.5")?.line).toBe("0.5");
  });

  /*
   * Returning null rather than guessing: an unrecognised selection stays
   * verbatim and is refused downstream as unmapped, instead of being
   * silently reinterpreted as a line it does not carry.
   */
  it("answers null for anything that is not an over/under line", () => {
    for (const value of [
      "Home",
      "Yes",
      "Over",
      "2.5",
      "Over 2.5 Goals",
      "",
      "Overtime 2.5",
    ]) {
      expect(splitLineBearingSelection(value)).toBeNull();
    }
  });
});

describe("normalizeOdds for goals totals", () => {
  it("emits OVER and UNDER with the line as its own field", () => {
    const observations = normalizeOdds(
      response([
        {
          id: 5,
          name: "Goals Over/Under",
          values: [
            { value: "Over 2.5", odd: "1.95" },
            { value: "Under 2.5", odd: "1.90" },
          ],
        },
      ]),
      "FOOTBALL",
      INGESTED_AT,
    );

    expect(observations).toHaveLength(2);
    expect(observations[0]).toMatchObject({
      canonicalMarket: "TOTAL_GOALS",
      selection: "OVER",
      line: "2.5",
      decimalOdds: "1.95",
    });
    expect(observations[1]).toMatchObject({
      selection: "UNDER",
      line: "2.5",
      decimalOdds: "1.90",
    });
  });

  it("keeps two different lines as two observations", () => {
    const observations = normalizeOdds(
      response([
        {
          id: 5,
          values: [
            { value: "Over 2.5", odd: "1.95" },
            { value: "Over 3.5", odd: "3.20" },
          ],
        },
      ]),
      "FOOTBALL",
      INGESTED_AT,
    );
    expect(observations.map((item) => item.line)).toEqual(["2.5", "3.5"]);
  });

  /*
   * The match-result market has no line, and must not acquire one from a
   * selection that happens to contain a number.
   */
  it("leaves the match-result market lineless", () => {
    const observations = normalizeOdds(
      response([
        {
          id: 1,
          values: [
            { value: "Home", odd: "2.10" },
            { value: "Draw", odd: "3.40" },
          ],
        },
      ]),
      "FOOTBALL",
      INGESTED_AT,
    );
    expect(observations[0]?.selection).toBe("Home");
    expect(observations[0]?.line).toBeUndefined();
  });

  /*
   * For a goals total the provider leaves `handicap` empty and puts the real
   * line in the selection, so preferring `handicap` would discard the only
   * line that was actually quoted.
   */
  it("prefers the selection's own line over a handicap field", () => {
    const observations = normalizeOdds(
      response([
        {
          id: 5,
          values: [{ value: "Over 2.5", odd: "1.95", handicap: "1.0" }],
        },
      ]),
      "FOOTBALL",
      INGESTED_AT,
    );
    expect(observations[0]?.line).toBe("2.5");
  });

  it("still uses the handicap field for a market that supplies one", () => {
    const observations = normalizeOdds(
      response([
        {
          id: 1,
          values: [{ value: "Home", odd: "1.95", handicap: "-1.0" }],
        },
      ]),
      "FOOTBALL",
      INGESTED_AT,
    );
    expect(observations[0]?.line).toBe("-1.0");
  });

  /*
   * An unparseable totals selection keeps its raw text and no line, so the
   * writer rejects it as unmapped rather than storing a lineless quote on a
   * market that requires a line.
   */
  it("leaves an unparseable totals selection verbatim and lineless", () => {
    const observations = normalizeOdds(
      response([{ id: 5, values: [{ value: "Exactly 2", odd: "8.00" }] }]),
      "FOOTBALL",
      INGESTED_AT,
    );
    expect(observations[0]?.selection).toBe("Exactly 2");
    expect(observations[0]?.line).toBeUndefined();
  });
});

describe("deduplicateObservations", () => {
  function observation(
    overrides: Partial<OddsObservationV3> = {},
  ): OddsObservationV3 {
    return {
      sport: "FOOTBALL",
      eventId: "event-1",
      competitionId: "competition-1",
      bookmakerId: "book-1",
      market: "FOOTBALL_FULL_TIME_TOTAL",
      providerMarket: "5",
      selection: "OVER",
      decimalOdds: "1.95" as OddsObservationV3["decimalOdds"],
      providerObservedAt: "2026-09-19T12:00:00.000Z",
      ingestedAt: INGESTED_AT,
      provider: "API_SPORTS",
      sourceReference: "test",
      ...overrides,
    };
  }

  /*
   * Without the line in the key, OVER 2.5 and OVER 3.5 from one bookmaker at
   * one instant collapse into a single observation -- and which one survives
   * depends on iteration order.
   */
  it("keeps two lines of the same market apart", () => {
    const kept = deduplicateObservations([
      observation({ line: "2.5" }),
      observation({ line: "3.5" }),
    ]);
    expect(kept).toHaveLength(2);
  });

  it("still collapses a genuinely identical observation", () => {
    const kept = deduplicateObservations([
      observation({ line: "2.5" }),
      observation({ line: "2.5" }),
    ]);
    expect(kept).toHaveLength(1);
  });

  it("treats an absent line as its own value rather than a wildcard", () => {
    const kept = deduplicateObservations([
      observation({ line: undefined }),
      observation({ line: "2.5" }),
    ]);
    expect(kept).toHaveLength(2);
  });
});
