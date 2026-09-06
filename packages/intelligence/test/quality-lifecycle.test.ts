import { describe, expect, it } from "vitest";

import {
  assessDecisionQuality,
  evaluateDecision,
  evaluatePriceValidity,
  transitionOpportunity,
} from "../src/index.js";

const strongEdge = evaluatePriceValidity({
  modelProbability: "0.6",
  currentOdds: "1.85",
});

describe("decision quality", () => {
  it("downgrades a high-EV decision when its price evidence is stale", () => {
    // Break caught: removing the stale-evidence penalty would incorrectly surface a strong edge as high quality.
    expect(
      assessDecisionQuality({
        price: strongEdge,
        freshness: "STALE",
        coverage: "SUFFICIENT",
        lineup: "OFFICIAL",
      }),
    ).toMatchObject({
      policyVersion: "quality.v1",
      grade: "LOW",
      reasonCodes: ["STALE_EVIDENCE"],
      riskFlags: ["STALE_PRICE"],
      invalidationConditions: ["REFRESH_PRICE_EVIDENCE"],
    });
  });

  it("flags low coverage even when the numerical price is attractive", () => {
    // Break caught: omitting coverage validation would let a sparse market look decision-ready.
    expect(
      assessDecisionQuality({
        price: strongEdge,
        freshness: "FRESH",
        coverage: "LOW",
        lineup: "OFFICIAL",
      }),
    ).toMatchObject({
      grade: "LOW",
      reasonCodes: ["LOW_COVERAGE"],
      riskFlags: ["INSUFFICIENT_COVERAGE"],
    });
  });

  it("records lineup uncertainty as an invalidation condition", () => {
    // Break caught: treating missing lineups as harmless would leave a decision actionable after its inputs changed.
    expect(
      assessDecisionQuality({
        price: strongEdge,
        freshness: "FRESH",
        coverage: "SUFFICIENT",
        lineup: "MISSING",
      }),
    ).toMatchObject({
      grade: "MEDIUM",
      reasonCodes: ["LINEUP_UNAVAILABLE"],
      riskFlags: ["LINEUP_UNCERTAIN"],
      invalidationConditions: ["CONFIRM_LINEUP"],
    });
  });
});

describe("opportunity lifecycle", () => {
  it("allows an observed edge to transition to edge disappeared", () => {
    // Break caught: a graph that cannot express an expired edge would misrepresent a valid decision change.
    expect(transitionOpportunity("EDGE", "EDGE_DISAPPEARED")).toEqual({
      ok: true,
      value: {
        from: "EDGE",
        to: "EDGE_DISAPPEARED",
        policyVersion: "decision.v1",
      },
    });
  });

  it("rejects an impossible edge-disappeared transition without a prior edge", () => {
    // Break caught: allowing NO_BET to become EDGE_DISAPPEARED fabricates edge history.
    expect(transitionOpportunity("NO_BET", "EDGE_DISAPPEARED")).toEqual({
      ok: false,
      error: {
        code: "INVALID_DECISION_TRANSITION",
        from: "NO_BET",
        to: "EDGE_DISAPPEARED",
        policyVersion: "decision.v1",
      },
    });
  });

  it("accepts every Task 1 decision state as a lifecycle state", () => {
    // Break caught: removing a valid Task 1 state from the graph makes a historical decision unrepresentable.
    const states = [
      "STRONG_EDGE",
      "EDGE",
      "WATCH",
      "WAIT",
      "WAIT_FOR_LINEUP",
      "NO_BET",
      "INSUFFICIENT_DATA",
      "EDGE_DISAPPEARED",
    ] as const;

    for (const state of states) {
      expect(transitionOpportunity(state, state)).toMatchObject({ ok: true });
    }
  });

  it("can persist the decision verdict supplied by Task 1", () => {
    // Break caught: an incompatible lifecycle contract would reject a real public decision verdict.
    const decision = evaluateDecision({
      price: strongEdge,
      freshness: "FRESH",
      lineup: "OFFICIAL",
      coverage: "SUFFICIENT",
      edgePreviouslyPresent: false,
    });

    expect(transitionOpportunity(decision.state, "EDGE")).toMatchObject({
      ok: true,
    });
  });
});
