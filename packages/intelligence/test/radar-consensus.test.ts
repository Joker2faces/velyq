import { describe, expect, it } from "vitest";

import {
  analyzeRadarMovement,
  calculateMarketConsensus,
} from "../src/index.js";

describe("RADAR movement", () => {
  it("classifies a valid 2.10 to 1.85 price shortening with the movement policy", () => {
    // Break caught: reversing the odds change would make a shortening appear as a drift.
    expect(
      analyzeRadarMovement({
        observations: [
          {
            bookmaker: "alpha",
            observedAt: "2026-09-06T10:00:00.000Z",
            odds: "2.1",
          },
          {
            bookmaker: "alpha",
            observedAt: "2026-09-06T11:00:00.000Z",
            odds: "1.85",
          },
        ],
      }),
    ).toMatchObject({
      policyVersion: "movement.v1",
      state: "SHORTENED",
      openingOdds: "2.1",
      currentOdds: "1.85",
      movement: "-0.119047619047619047619047619048",
      bookmakerCount: 1,
    });
  });

  it("excludes invalid odds and duplicate bookmaker observations from RADAR movement", () => {
    // Break caught: counting an invalid or duplicate update could manufacture a movement signal.
    expect(
      analyzeRadarMovement({
        observations: [
          {
            bookmaker: "alpha",
            observedAt: "2026-09-06T10:00:00.000Z",
            odds: "2.1",
          },
          {
            bookmaker: "alpha",
            observedAt: "2026-09-06T10:00:00.000Z",
            odds: "1.9",
          },
          {
            bookmaker: "beta",
            observedAt: "2026-09-06T10:30:00.000Z",
            odds: "1",
          },
        ],
      }),
    ).toMatchObject({
      state: "INSUFFICIENT_HISTORY",
      openingOdds: null,
      currentOdds: null,
      movement: null,
      bookmakerCount: 1,
      reasonCodes: expect.arrayContaining([
        "DUPLICATE_BOOKMAKER_OBSERVATION",
        "INVALID_ODDS",
      ]),
    });
  });

  it("orders timezone-offset ISO timestamps by instant", () => {
    // Break caught: lexical timestamp ordering reverses observations with different UTC offsets.
    expect(
      analyzeRadarMovement({
        observations: [
          {
            bookmaker: "alpha",
            observedAt: "2026-09-06T08:30:00Z",
            odds: "1.9",
          },
          {
            bookmaker: "alpha",
            observedAt: "2026-09-06T10:00:00+02:00",
            odds: "2.1",
          },
        ],
      }),
    ).toMatchObject({
      state: "SHORTENED",
      openingOdds: "2.1",
      currentOdds: "1.9",
      sourceBookmakers: ["alpha"],
    });
  });

  it("rejects observations with invalid ISO timestamps", () => {
    // Break caught: an unparseable timestamp could be ordered into a movement stream.
    expect(
      analyzeRadarMovement({
        observations: [
          { bookmaker: "alpha", observedAt: "not-an-ISO-timestamp", odds: "2.1" },
          {
            bookmaker: "alpha",
            observedAt: "2026-09-06T10:30:00Z",
            odds: "1.9",
          },
        ],
      }),
    ).toMatchObject({
      state: "INSUFFICIENT_HISTORY",
      reasonCodes: expect.arrayContaining(["INVALID_OBSERVED_AT"]),
    });
  });

  it("selects one deterministic bookmaker stream instead of combining bookmakers", () => {
    // Break caught: combining alpha's opening price with beta's current price fabricates provenance.
    const result = analyzeRadarMovement({
      observations: [
        {
          bookmaker: "beta",
          observedAt: "2026-09-06T10:00:00Z",
          odds: "1.8",
        },
        {
          bookmaker: "alpha",
          observedAt: "2026-09-06T11:00:00Z",
          odds: "2",
        },
        {
          bookmaker: "alpha",
          observedAt: "2026-09-06T10:00:00Z",
          odds: "2.1",
        },
        {
          bookmaker: "beta",
          observedAt: "2026-09-06T11:00:00Z",
          odds: "1.7",
        },
      ],
    });

    expect(result).toMatchObject({
      state: "SHORTENED",
      openingOdds: "2.1",
      currentOdds: "2",
      bookmakerCount: 2,
      sourceBookmakers: ["alpha"],
      reasonCodes: expect.arrayContaining(["MULTIPLE_BOOKMAKER_STREAMS"]),
    });
  });
});

describe("market consensus", () => {
  it("proportionally removes vig from every 1X2 outcome", () => {
    // Break caught: returning raw implied values would leave the normalized market above 1.
    const consensus = calculateMarketConsensus({
      market: "1X2",
      observations: [
        { bookmaker: "alpha", outcome: "HOME", odds: "1.6" },
        { bookmaker: "alpha", outcome: "DRAW", odds: "3.2" },
        { bookmaker: "alpha", outcome: "AWAY", odds: "3.2" },
      ],
    });

    expect(consensus).toMatchObject({
      normalizationVersion: "no-vig.v1",
      overround: "1.25",
      bookmakerCount: 1,
    });
    expect(consensus.outcomes).toEqual([
      expect.objectContaining({
        outcome: "HOME",
        rawImpliedProbability: "0.625",
        normalizedImpliedProbability: "0.5",
      }),
      expect.objectContaining({
        outcome: "DRAW",
        rawImpliedProbability: "0.3125",
        normalizedImpliedProbability: "0.25",
      }),
      expect.objectContaining({
        outcome: "AWAY",
        rawImpliedProbability: "0.3125",
        normalizedImpliedProbability: "0.25",
      }),
    ]);
  });

  it("normalizes two-way prices and marks a materially remote bookmaker as an outlier candidate", () => {
    // Break caught: accepting every price equally hides materially divergent bookmaker quotes.
    const consensus = calculateMarketConsensus({
      market: "TWO_WAY",
      observations: [
        { bookmaker: "alpha", outcome: "OVER", odds: "2" },
        { bookmaker: "alpha", outcome: "UNDER", odds: "2" },
        { bookmaker: "beta", outcome: "OVER", odds: "2.1" },
        { bookmaker: "beta", outcome: "UNDER", odds: "1.91" },
        { bookmaker: "gamma", outcome: "OVER", odds: "5" },
        { bookmaker: "gamma", outcome: "UNDER", odds: "1.25" },
      ],
    });

    expect(consensus.overround).toBe("1");
    expect(consensus.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: "OVER",
          normalizedProbabilitySum: "1",
          bookmakerCount: 3,
          outlierCandidate: true,
        }),
        expect.objectContaining({
          outcome: "UNDER",
          normalizedProbabilitySum: "1",
        }),
      ]),
    );
  });

  it("keeps neutral bookmaker provenance for best odds and outlier assessments", () => {
    // Break caught: derived price summaries without their bookmaker sources cannot be audited.
    const consensus = calculateMarketConsensus({
      market: "TWO_WAY",
      observations: [
        { bookmaker: "alpha", outcome: "OVER", odds: "2" },
        { bookmaker: "alpha", outcome: "UNDER", odds: "2" },
        { bookmaker: "beta", outcome: "OVER", odds: "2.1" },
        { bookmaker: "beta", outcome: "UNDER", odds: "1.91" },
        { bookmaker: "gamma", outcome: "OVER", odds: "5" },
        { bookmaker: "gamma", outcome: "UNDER", odds: "1.25" },
      ],
    });

    expect(consensus.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: "OVER",
          bestOdds: "5",
          bestOddsBookmakers: ["gamma"],
          outlierBookmakers: ["gamma"],
        }),
      ]),
    );
  });

  it("withholds consensus for malformed or incomplete bookmaker markets", () => {
    // Break caught: a partial market would otherwise be reported as a valid no-vig consensus.
    expect(
      calculateMarketConsensus({
        market: "TWO_WAY",
        observations: [
          { bookmaker: "alpha", outcome: "OVER", odds: "1" },
          { bookmaker: "alpha", outcome: "UNDER", odds: "2" },
        ],
      }),
    ).toMatchObject({
      bookmakerCount: 0,
      overround: null,
      outcomes: [],
      reasonCodes: ["INVALID_ODDS", "INSUFFICIENT_MARKET_OUTCOMES"],
    });
  });
});
