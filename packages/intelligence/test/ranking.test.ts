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
});
