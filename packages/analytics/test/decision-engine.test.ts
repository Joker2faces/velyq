import { describe, expect, it } from "vitest";

import {
  assessDataQuality,
  DEFAULT_DATA_QUALITY_POLICY,
} from "../src/index.js";
import {
  DEFAULT_DECISION_POLICY,
  evaluateDecision,
} from "../src/decision-engine.js";

const goodQuality = assessDataQuality({
  policyVersion: DEFAULT_DATA_QUALITY_POLICY.policyVersion,
  asOf: "2026-09-08T00:00:00Z",
  receivedAt: "2026-09-08T00:00:00Z",
  priceCount: 3,
  bookmakerCount: 3,
  lineup: "OFFICIAL",
  mappingConfidence: "HIGH",
  edgeAvailable: true,
  edgePresent: true,
});

describe("evaluateDecision", () => {
  it("promotes to STRONG_EDGE only when both edge and EV clear the policy threshold", () => {
    // model 60%, odds 1.85 -> implied 54.05%, edge ~5.9pp, EV ~11%
    const result = evaluateDecision({
      modelProbability: 0.6,
      currentOdds: 1.85,
      quality: goodQuality,
      lineup: "OFFICIAL",
    });
    expect(result.status).toBe("STRONG_EDGE");
    expect(result.edge).toBeCloseTo(0.6 - 1 / 1.85, 6);
  });

  it("never fabricates an edge when odds are missing -- falls through to a refusal state, never STRONG_EDGE", () => {
    const result = evaluateDecision({
      modelProbability: 0.6,
      currentOdds: null,
      quality: goodQuality,
      lineup: "OFFICIAL",
    });
    expect(result.status).not.toBe("STRONG_EDGE");
    expect(result.whyNotCodes).toContain("MARKET_DATA_UNAVAILABLE");
  });

  it("stays NO_BET when an edge exists but is below the policy threshold", () => {
    // model 51%, odds 1.96 -> implied ~51.02%, edge is essentially zero
    const result = evaluateDecision({
      modelProbability: 0.51,
      currentOdds: 1.96,
      quality: goodQuality,
      lineup: "OFFICIAL",
    });
    expect(result.status).toBe("NO_BET");
    expect(result.whyNotCodes).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/EDGE_TOO_SMALL|PRICE_TOO_SHORT/),
      ]),
    );
  });

  it("never promotes to STRONG_EDGE when the lineup is not yet official, even with a real edge", () => {
    const result = evaluateDecision({
      modelProbability: 0.6,
      currentOdds: 1.85,
      quality: goodQuality,
      lineup: "MISSING",
    });
    expect(result.status).toBe("WAIT_FOR_LINEUP");
  });

  it("computes fair odds as the exact inverse of the model probability", () => {
    const result = evaluateDecision({
      modelProbability: 0.6,
      currentOdds: 1.85,
      quality: goodQuality,
      lineup: "OFFICIAL",
    });
    expect(Number(result.fairOdds)).toBeCloseTo(1 / 0.6, 8);
  });

  it("respects a custom, stricter policy", () => {
    const strictPolicy = {
      version: "decision-policy.v2-strict",
      minimumEdge: 0.5,
      minimumExpectedValue: 0.5,
    };
    const result = evaluateDecision({
      modelProbability: 0.6,
      currentOdds: 1.85,
      quality: goodQuality,
      lineup: "OFFICIAL",
      policy: strictPolicy,
    });
    expect(result.status).toBe("NO_BET");
  });

  it("uses the documented default policy threshold (3 percentage points)", () => {
    expect(DEFAULT_DECISION_POLICY.minimumEdge).toBe(0.03);
  });
});
