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

  /*
   * Quality must bind promotion. This was the gap: `decideRecommendation`
   * names grade C and F as quality refusals but returns "NO_BET" for them
   * and for its own fallthrough, and promotion fired on any "NO_BET" that
   * cleared the edge/EV policy -- so a grade F selection with a real edge
   * was promoted to STRONG_EDGE on evidence the quality engine had already
   * rejected. Nothing covered it, and the EXPERIMENTAL maturity downgrade
   * hid it from production.
   */
  it("never promotes a selection whose evidence quality was rejected", () => {
    /*
     * A fresh price that is present, with an official lineup -- so neither
     * MISSING_PRICE, STALE_DATA nor the lineup branch catches it. What is
     * wrong is the evidence around it: nobody is quoting it, the identity is
     * unresolved, the source is unknown and the sources conflict. Weights
     * are 1 each and grade C starts at 4.5, so this scores
     * 1 + 1 + 0 + 1 + 0.5 + 0 + 0 = 3.5 -> F.
     */
    const rejectedQuality = assessDataQuality({
      policyVersion: DEFAULT_DATA_QUALITY_POLICY.policyVersion,
      asOf: "2026-09-08T00:00:00Z",
      receivedAt: "2026-09-08T00:00:00Z",
      priceCount: 1,
      bookmakerCount: 0,
      lineup: "OFFICIAL",
      mappingConfidence: "LOW",
      sourceAuthority: "UNKNOWN",
      consistency: "CONFLICTING",
      edgeAvailable: true,
      edgePresent: true,
    });
    expect(rejectedQuality.grade).toBe("F");
    expect(rejectedQuality.reasonCodes).toContain("NO_BOOKMAKER_COVERAGE");
    expect(rejectedQuality.reasonCodes).not.toContain("MISSING_PRICE");
    expect(rejectedQuality.reasonCodes).not.toContain("STALE_DATA");

    const result = evaluateDecision({
      modelProbability: 0.6,
      currentOdds: 1.85,
      quality: rejectedQuality,
      lineup: "OFFICIAL",
    });

    expect(result.status).toBe("NO_BET");
    /* And it says why, rather than reading as an unexplained refusal on a
       price that did clear the policy. */
    expect(result.whyNotCodes).toContain("QUALITY_TOO_LOW");
  });

  it("still promotes the same edge once the evidence is good", () => {
    /* Guards against fixing the hole by simply refusing everything. */
    const result = evaluateDecision({
      modelProbability: 0.6,
      currentOdds: 1.85,
      quality: goodQuality,
      lineup: "OFFICIAL",
    });

    expect(result.status).toBe("STRONG_EDGE");
    expect(result.whyNotCodes).toEqual([]);
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
