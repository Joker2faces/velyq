import { describe, expect, it } from "vitest";

import {
  buildMarketMap,
  prioritizeToday,
  rankOpportunities,
} from "../src/index.js";

describe("market maps", () => {
  it("exposes consensus markets as stable provider-neutral DTOs", () => {
    // Break caught: leaking a source observation into the map would couple consumers to a provider.
    expect(
      buildMarketMap([
        {
          market: "TWO_WAY",
          observations: [
            { bookmaker: "alpha", outcome: "OVER", odds: "2" },
            { bookmaker: "alpha", outcome: "UNDER", odds: "2" },
          ],
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        market: "TWO_WAY",
        normalizationVersion: "no-vig.v1",
        bookmakerCount: 1,
      }),
    ]);
  });

  it("exposes neutral best-odds and outlier bookmaker provenance", () => {
    // Break caught: market maps that omit consensus provenance make derived quotes unauditable.
    const [market] = buildMarketMap([
      {
        market: "TWO_WAY",
        observations: [
          { bookmaker: "alpha", outcome: "OVER", odds: "2" },
          { bookmaker: "alpha", outcome: "UNDER", odds: "2" },
          { bookmaker: "beta", outcome: "OVER", odds: "2.1" },
          { bookmaker: "beta", outcome: "UNDER", odds: "1.91" },
          { bookmaker: "gamma", outcome: "OVER", odds: "5" },
          { bookmaker: "gamma", outcome: "UNDER", odds: "1.25" },
        ],
      },
    ]);

    expect(market?.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: "OVER",
          bestOddsBookmakers: ["gamma"],
          outlierBookmakers: ["gamma"],
        }),
      ]),
    );
  });
});

describe("opportunity ranking", () => {
  const opportunities = [
    {
      id: "stale-high",
      expectedValue: "0.5",
      freshness: "STALE",
      actionable: true,
    },
    {
      id: "fresh-low",
      expectedValue: "0.05",
      freshness: "FRESH",
      actionable: true,
    },
    {
      id: "fresh-watch",
      expectedValue: "0.9",
      freshness: "FRESH",
      actionable: false,
    },
  ] as const;

  it("creates deterministic decimal-safe rank outputs", () => {
    // Break caught: sorting decimal strings lexically would rank 0.9 below 0.10 incorrectly.
    expect(rankOpportunities(opportunities)).toEqual([
      expect.objectContaining({
        id: "fresh-low",
        rank: 1,
        policyVersion: "rank.v1",
      }),
      expect.objectContaining({
        id: "stale-high",
        rank: 2,
        policyVersion: "rank.v1",
      }),
      expect.objectContaining({
        id: "fresh-watch",
        rank: 3,
        policyVersion: "rank.v1",
      }),
    ]);
  });

  it("prioritizes fresh actionable opportunities ahead of stale higher-EV alternatives", () => {
    // Break caught: EV-first ordering would surface stale opportunities before usable ones.
    expect(
      prioritizeToday(opportunities).map((opportunity) => opportunity.id),
    ).toEqual(["fresh-low", "stale-high", "fresh-watch"]);
  });

  it("rejects expected values outside the semantic expected-value bounds and scale", () => {
    // Break caught: generic decimals allow EV values that cannot satisfy the expected-value contract.
    const ranked = rankOpportunities([
      {
        id: "too-many-decimals",
        expectedValue: "0.1234567890123",
        freshness: "FRESH",
        actionable: true,
      },
      {
        id: "too-large",
        expectedValue: "1000000",
        freshness: "FRESH",
        actionable: true,
      },
    ]);

    expect(ranked).toEqual([
      expect.objectContaining({
        id: "too-large",
        expectedValue: null,
        reasonCodes: expect.arrayContaining(["INVALID_EXPECTED_VALUE"]),
      }),
      expect.objectContaining({
        id: "too-many-decimals",
        expectedValue: null,
        reasonCodes: expect.arrayContaining(["INVALID_EXPECTED_VALUE"]),
      }),
    ]);
  });
});
