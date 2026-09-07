import { describe, expect, it } from "vitest";
import type { DecimalString } from "@velyq/decimal";
import {
  deVig,
  isFortress,
  robustMetrics,
  type FortressInput,
} from "../src/research-v3.js";

const implied = (values: readonly string[]) =>
  values as unknown as readonly DecimalString[];

function sum(values: readonly DecimalString[]): number {
  return values.reduce((total, value) => total + Number(value), 0);
}

/*
 * Guards a real bug found while building the FORTRESS multi engine on top of
 * this function: POWER halved every input and SHIN multiplied every input by
 * a fixed 0.99, then both divided by the sum of the *original* inputs.
 * Neither transform preserves that sum, so the results summed to 0.5
 * (POWER) or 0.99 (SHIN) — every de-vigged probability this function ever
 * returned for those two methods understated every outcome by a fixed,
 * market-independent factor. Nothing in the codebase called this function
 * outside its own (previously nonexistent) tests, so nothing live was
 * affected, but it was wrong on its own terms.
 */
describe("deVig", () => {
  // implied: 0.5, 0.285714286, 0.25 -> raw sum 1.035714286 (3.57% overround)
  const THREE_WAY = implied(["0.5", "0.2857142857", "0.25"]);

  it("sums to 1 for MULTIPLICATIVE (already correct before this fix)", () => {
    const result = deVig(THREE_WAY, "MULTIPLICATIVE");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sum(result.value)).toBeCloseTo(1, 8);
  });

  it("sums to 1 for POWER, not 0.5", () => {
    const result = deVig(THREE_WAY, "POWER");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sum(result.value)).toBeCloseTo(1, 6);
  });

  it("sums to 1 for SHIN, not 0.99", () => {
    const result = deVig(THREE_WAY, "SHIN");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sum(result.value)).toBeCloseTo(1, 6);
  });

  it("preserves outcome ordering for both iterative methods", () => {
    const power = deVig(THREE_WAY, "POWER");
    const shin = deVig(THREE_WAY, "SHIN");
    expect(power.ok && shin.ok).toBe(true);
    if (!power.ok || !shin.ok) return;
    for (const result of [power.value, shin.value]) {
      expect(Number(result[0])).toBeGreaterThan(Number(result[1]));
      expect(Number(result[1])).toBeGreaterThan(Number(result[2]));
    }
  });

  it("rejects a market with zero or negative overround for the iterative methods", () => {
    const fair = implied(["0.5", "0.5"]);
    expect(deVig(fair, "POWER").ok).toBe(false);
    expect(deVig(fair, "SHIN").ok).toBe(false);
  });
});

/*
 * Sanity coverage for the two functions the FORTRESS multi engine is built
 * directly on top of. Neither had a dedicated test file before this change.
 */
describe("robustMetrics", () => {
  it("computes the robust edge and robust EV exactly per the documented formulas", () => {
    const result = robustMetrics({
      model: {
        pointProbability: "0.6" as DecimalString,
        lowerProbabilityBound: "0.55" as DecimalString,
        upperProbabilityBound: "0.65" as DecimalString,
        uncertaintyMethod: "ENSEMBLE_DISPERSION",
      },
      marketHigh: "0.5" as DecimalString,
      odds: "1.85" as DecimalString,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // robustProbabilityEdge = lowerBound - marketHigh = 0.55 - 0.5 = 0.05
    expect(Number(result.value.robustProbabilityEdge)).toBeCloseTo(0.05, 8);
    // robustEV = lowerBound * odds - 1 = 0.55 * 1.85 - 1 = 0.0175
    expect(Number(result.value.robustEV)).toBeCloseTo(0.0175, 8);
    // fairOddsConservative = 1 / lowerBound
    expect(Number(result.value.fairOddsConservative)).toBeCloseTo(1 / 0.55, 6);
  });

  it("returns null robust metrics when no uncertainty bound is available", () => {
    const result = robustMetrics({
      model: {
        pointProbability: "0.6" as DecimalString,
        lowerProbabilityBound: null,
        upperProbabilityBound: null,
        uncertaintyMethod: "UNCERTAINTY_UNAVAILABLE",
      },
      marketHigh: "0.5" as DecimalString,
      odds: "1.85" as DecimalString,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.robustProbabilityEdge).toBeNull();
    expect(result.value.robustEV).toBeNull();
    expect(result.value.fairOddsConservative).toBeNull();
  });
});

describe("isFortress", () => {
  const baseline: FortressInput = {
    robustEdge: "0.05" as DecimalString,
    robustEV: "0.02" as DecimalString,
    fresh: true,
    bookmakerCoverage: 3,
    uncertaintyAvailable: true,
    evidenceAvailable: true,
    mappingConfidence: "HIGH",
    modelMaturity: "VALIDATED",
    criticalRisk: false,
    priceValid: true,
    lineupConfirmed: true,
  };

  it("qualifies when every gate passes", () => {
    expect(isFortress(baseline)).toBe(true);
  });

  it("never qualifies an EXPERIMENTAL model, however strong the edge", () => {
    /*
     * The property that matters most for the whole product: a model that has
     * not been validated must never produce the top evidence grade, no
     * matter how favourable its point estimate looks.
     */
    expect(isFortress({ ...baseline, modelMaturity: "EXPERIMENTAL" })).toBe(
      false,
    );
  });

  it("never qualifies a negative robust edge or robust EV", () => {
    expect(
      isFortress({ ...baseline, robustEdge: "-0.01" as DecimalString }),
    ).toBe(false);
    expect(
      isFortress({ ...baseline, robustEV: "-0.01" as DecimalString }),
    ).toBe(false);
  });

  it("never qualifies with no uncertainty bound at all", () => {
    expect(
      isFortress({
        ...baseline,
        robustEdge: null,
        robustEV: null,
        uncertaintyAvailable: false,
      }),
    ).toBe(false);
  });

  it("never qualifies below the minimum bookmaker coverage", () => {
    expect(isFortress({ ...baseline, bookmakerCoverage: 1 })).toBe(false);
  });

  it("never qualifies with a critical risk flag or an invalid price", () => {
    expect(isFortress({ ...baseline, criticalRisk: true })).toBe(false);
    /*
     * The lineup gate. FORTRESS claims the pre-match evidence is complete, so
     * an unpublished or uncovered XI disqualifies it outright — however large
     * the edge, which is exactly the case where the temptation is greatest.
     */
    expect(isFortress({ ...baseline, lineupConfirmed: false })).toBe(false);
    expect(
      isFortress({
        ...baseline,
        lineupConfirmed: false,
        robustEdge: "0.40" as DecimalString,
        robustEV: "0.35" as DecimalString,
      }),
    ).toBe(false);
    expect(isFortress({ ...baseline, priceValid: false })).toBe(false);
  });
});
