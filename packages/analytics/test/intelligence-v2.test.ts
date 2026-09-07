import { describe, expect, it } from "vitest";
import {
  AI_ANALYST_ENABLED,
  brierScore,
  calibrationBuckets,
  decide,
  diffDecisions,
  isTemporallyValid,
  marketConsensus,
  markOutliers,
  prioritizeToday,
  radarMarket,
  rankOpportunity,
  watchEvent,
  postMatchAutopsy,
  priceSensitivity,
  priceValidity,
  summarizeMarket,
  validateLifecycleTransition,
} from "../src/intelligence-v2.js";

describe("intelligence completion v2", () => {
  it("keeps price validity and sensitivity decimal-safe", () => {
    const validity = priceValidity("0.6", "1.85");
    expect(validity.ok && validity.value.priceState).toBe("ATTRACTIVE");
    const sensitivity = priceSensitivity("0.6", ["1.6", "1.85", "2"]);
    expect(sensitivity.ok && sensitivity.value[1]?.expectedValue).toBe("0.11");
  });

  it("refuses stale or unconfirmed opportunities without inventing confidence", () => {
    const result = decide(
      {
        modelProbability: "0.6",
        currentOdds: "1.85",
        qualityScore: "0.75",
        lineup: "MISSING",
        stale: false,
        coverage: 2,
        mappingConfidence: "HIGH",
        modelMaturity: "EXPERIMENTAL",
        observationCount: 1,
      },
      "2026-09-07T00:00:00.000Z",
    );
    expect(result.ok && result.value.decision).toBe("WAIT_FOR_LINEUP");
    expect(result.ok && result.value.riskFlags).toContain("LINEUP_RISK");
  });

  it("protects lifecycle, historical cutoffs, and decision diffs", () => {
    expect(
      validateLifecycleTransition({ from: "EDGE", to: "EDGE_DISAPPEARED" }),
    ).toBe(true);
    expect(validateLifecycleTransition({ from: "NO_BET", to: "EDGE" })).toBe(
      false,
    );
    expect(
      isTemporallyValid({
        observedAt: "2026-09-01T00:00:00Z",
        featureCutoff: "2026-09-02T00:00:00Z",
        marketObservationCutoff: "2026-09-02T00:00:00Z",
      }),
    ).toBe(true);
    const before = {
      id: "a",
      decision: "EDGE" as const,
      price: "1.85",
      modelProbability: "0.60",
      expectedValue: "0.11",
      edge: "0.059",
      quality: "0.75",
      riskFlags: [],
      reasonCodes: [],
      timestamp: "2026-09-01",
      modelVersion: "m1",
      policyVersions: {},
      dataCutoff: "2026-09-01",
    };
    const after = {
      ...before,
      decision: "EDGE_DISAPPEARED" as const,
      price: "1.70",
    };
    expect(diffDecisions(before, after).map((item) => item.kind)).toEqual([
      "PRICE_CHANGED",
      "DECISION_CHANGED",
    ]);
  });

  it("summarizes bookmaker prices and evaluates outcomes", () => {
    const market = summarizeMarket([
      {
        bookmaker: "a",
        odds: "2.1",
        observedAt: "2026-09-01",
        ingestedAt: "2026-09-01",
        providerReference: "a",
      },
      {
        bookmaker: "b",
        odds: "1.85",
        observedAt: "2026-09-01",
        ingestedAt: "2026-09-01",
        providerReference: "b",
      },
    ]);
    expect(market.ok && market.value.bestOdds).toBe("2.1");
    const score = brierScore([
      { probability: "0.6", result: true },
      { probability: "0.4", result: false },
    ]);
    expect(score.ok && score.value).toBe("0.16");
  });

  it("keeps decision quality separate from match result and disables AI", () => {
    const autopsy = postMatchAutopsy({
      expectedValue: "0.11",
      result: "LOSS",
      decisionOdds: "1.85",
      closingOdds: "1.75",
    });
    expect(autopsy.ok && autopsy.value.decisionQuality).toBe("POSITIVE_EV");
    expect(autopsy.ok && autopsy.value.matchResult).toBe("LOSS");
    expect(AI_ANALYST_ENABLED).toBe(false);
  });

  it("provides deterministic ranking, calibration, consensus, radar, and alerts", () => {
    const ranked = rankOpportunity({
      quality: "0.9",
      expectedValue: "0.1",
      probabilityEdge: "0.05",
      freshness: "1",
      coverage: "1",
      lineup: "OFFICIAL",
      marketStability: "0.8",
      mappingConfidence: "1",
    });
    expect(ranked.ok).toBe(true);
    expect(
      prioritizeToday([
        {
          id: "watch",
          decision: "WATCH",
          quality: "1",
          freshness: "1",
          rank: "1",
        },
        {
          id: "edge",
          decision: "EDGE",
          quality: "0.5",
          freshness: "0.5",
          rank: "0.1",
        },
      ])[0]?.id,
    ).toBe("edge");
    expect(
      calibrationBuckets([{ probability: "0.6", result: true }], ["0.5", "0.7"])
        .ok,
    ).toBe(true);
    expect(marketConsensus(["2", "2.2"]).ok).toBe(true);
    expect(
      radarMarket({
        openingOdds: "2.1",
        previousOdds: "2",
        currentOdds: "1.85",
        observationCount: 3,
        windowSeconds: 600,
        freshness: "FRESH",
      }).value,
    ).toMatchObject({ direction: "DOWN" });
    expect(
      markOutliers([
        {
          bookmaker: "a",
          odds: "1.8",
          observedAt: "2026-09-01",
          ingestedAt: "2026-09-01",
          providerReference: "a",
        },
        {
          bookmaker: "b",
          odds: "2.5",
          observedAt: "2026-09-01",
          ingestedAt: "2026-09-01",
          providerReference: "b",
        },
      ]).ok,
    ).toBe(true);
    expect(
      watchEvent(
        { fixtureId: "fixture-1", market: "FT_1X2", selection: "HOME" },
        "EDGE_APPEARED",
        "2026-09-01",
      ).policyVersion,
    ).toBe("watch.v1");
  });
});
