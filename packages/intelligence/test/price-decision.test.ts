import { describe, expect, it } from "vitest";

import {
  createPriceSensitivity,
  evaluateDecision,
  evaluatePriceValidity,
} from "../src/index.js";

const attractivePrice = evaluatePriceValidity({
  modelProbability: "0.6",
  currentOdds: "1.85",
});

describe("decimal-safe price validity", () => {
  it("derives a valid attractive price from model probability and market odds", () => {
    expect(attractivePrice).toMatchObject({
      status: "ATTRACTIVE",
      modelMaturity: "EXPERIMENTAL",
      fairOdds: "1.666666666666666666666666666667",
      minimumOdds: "1.666666666666666666666666666667",
      marketImpliedProbability: "0.540540540540540540540540540541",
      probabilityEdge: "0.059459459459459459459459459459",
      expectedValue: "0.11",
    });
  });

  it("rejects absent or invalid prices and non-actionable probability boundaries", () => {
    for (const input of [
      { modelProbability: "0.6", currentOdds: undefined },
      { modelProbability: "0.6", currentOdds: "1" },
      { modelProbability: "0", currentOdds: "1.85" },
      { modelProbability: "1", currentOdds: "1.85" },
    ]) {
      expect(evaluatePriceValidity(input)).toMatchObject({
        status: "INVALID_PRICE",
        modelMaturity: "EXPERIMENTAL",
      });
    }
  });

  it("calculates decimal-safe movement across candidate prices", () => {
    const scenarios = createPriceSensitivity({
      modelProbability: "0.6",
      candidateOdds: ["2.1", "1.85"],
    });

    expect(scenarios).toHaveLength(2);
    expect(scenarios[1]).toMatchObject({
      candidateOdds: "1.85",
      movement: "-0.119047619047619047619047619048",
      status: "ATTRACTIVE",
    });
  });
});

describe("deterministic decision verdicts", () => {
  const decisionInput = {
    price: attractivePrice,
    freshness: "FRESH" as const,
    lineup: "OFFICIAL" as const,
    coverage: "SUFFICIENT" as const,
    edgePreviouslyPresent: false,
  };

  it("classifies a material positive EV as a strong edge", () => {
    expect(evaluateDecision(decisionInput)).toMatchObject({
      state: "STRONG_EDGE",
      modelMaturity: "EXPERIMENTAL",
    });
  });

  it("does not recommend a zero-EV fair price", () => {
    const fairPrice = evaluatePriceValidity({
      modelProbability: "0.5",
      currentOdds: "2",
    });

    expect(
      evaluateDecision({ ...decisionInput, price: fairPrice }),
    ).toMatchObject({ state: "NO_BET" });
  });

  it.each([
    ["stale price", { freshness: "STALE" as const }, "WAIT"],
    ["missing lineup", { lineup: "MISSING" as const }, "WAIT_FOR_LINEUP"],
    ["low coverage", { coverage: "LOW" as const }, "INSUFFICIENT_DATA"],
  ] as const)(
    "lets %s override a numerical strong edge",
    (_condition, override, state) => {
      expect(evaluateDecision({ ...decisionInput, ...override })).toMatchObject(
        { state },
      );
    },
  );

  it("records edge disappearance after a previously positive price loses its edge", () => {
    const noEdgePrice = evaluatePriceValidity({
      modelProbability: "0.6",
      currentOdds: "1.5",
    });

    expect(
      evaluateDecision({
        ...decisionInput,
        price: noEdgePrice,
        edgePreviouslyPresent: true,
      }),
    ).toMatchObject({ state: "EDGE_DISAPPEARED" });
  });
});
