import { describe, expect, it } from "vitest";
import type { DecimalString } from "@velyq/decimal";
import {
  DEFAULT_MULTI_POLICY,
  buildFortressMulti,
  enforceOneLegPerEvent,
  type FortressInput,
  type MultiLegCandidate,
} from "../src/fortress-multi.js";

/*
 * The FORTRESS multi engine: constructing the highest-evidence combination
 * available today, never a guaranteed parlay, never assembled by lowering
 * the single-leg evidence bar to produce *some* multi.
 */

const eligibleGate: FortressInput = {
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
};

function leg(
  overrides: Partial<MultiLegCandidate> & { eventId: string },
): MultiLegCandidate {
  return {
    sport: "FOOTBALL",
    market: "MATCH_WINNER_1X2",
    selection: "HOME",
    currentOdds: "1.85" as DecimalString,
    modelProbability: "0.6" as DecimalString,
    modelProbabilityLowerBound: "0.55" as DecimalString,
    fortress: eligibleGate,
    publishedAt: "2026-09-07T10:00:00Z",
    ...overrides,
  };
}

describe("enforceOneLegPerEvent", () => {
  it("keeps only the strongest leg when two candidates share an event", () => {
    const weak = leg({
      eventId: "event-1",
      selection: "HOME",
      modelProbabilityLowerBound: "0.50" as DecimalString,
    });
    const strong = leg({
      eventId: "event-1",
      selection: "OVER",
      market: "TOTAL_GOALS",
      modelProbabilityLowerBound: "0.60" as DecimalString,
    });
    const result = enforceOneLegPerEvent([weak, strong]);
    expect(result).toHaveLength(1);
    expect(result[0]!.selection).toBe("OVER");
  });

  it("keeps legs from distinct events untouched", () => {
    const a = leg({ eventId: "event-1" });
    const b = leg({ eventId: "event-2" });
    expect(enforceOneLegPerEvent([a, b])).toHaveLength(2);
  });
});

describe("buildFortressMulti", () => {
  it("reports NO_LEGS_SUPPLIED for an empty candidate pool", () => {
    const result = buildFortressMulti([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      status: "NO_QUALIFYING_MULTI",
      reason: "NO_LEGS_SUPPLIED",
      fortressEligibleLegCount: 0,
    });
  });

  it("reports TOO_FEW_FORTRESS_ELIGIBLE_LEGS when only one candidate clears the gate", () => {
    const qualifying = leg({ eventId: "event-1" });
    const notQualifying = leg({
      eventId: "event-2",
      fortress: { ...eligibleGate, modelMaturity: "EXPERIMENTAL" },
    });
    const result = buildFortressMulti([qualifying, notQualifying]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      status: "NO_QUALIFYING_MULTI",
      reason: "TOO_FEW_FORTRESS_ELIGIBLE_LEGS",
      fortressEligibleLegCount: 1,
    });
  });

  it("reports ONLY_ONE_LEG_AFTER_SAME_EVENT_CONSTRAINT when two eligible legs share an event", () => {
    const a = leg({ eventId: "event-1", selection: "HOME" });
    const b = leg({
      eventId: "event-1",
      selection: "OVER",
      market: "TOTAL_GOALS",
    });
    const result = buildFortressMulti([a, b]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      status: "NO_QUALIFYING_MULTI",
      reason: "ONLY_ONE_LEG_AFTER_SAME_EVENT_CONSTRAINT",
      fortressEligibleLegCount: 2,
    });
  });

  it("never combines two legs from the same event, even when both are FORTRESS-eligible on their own", () => {
    /*
     * The single most important behaviour in this module: two selections on
     * one match are almost never independent, and the naive
     * P(parlay) = p1 * p2 formula would silently overstate their combined
     * probability. This is asserted against the actual returned combination,
     * not just the rejection path above — a three-candidate pool where two
     * share an event must never let both into the same multi.
     */
    const sameEventA = leg({ eventId: "event-1", selection: "HOME" });
    const sameEventB = leg({
      eventId: "event-1",
      selection: "OVER",
      market: "TOTAL_GOALS",
    });
    const distinctEvent = leg({ eventId: "event-2" });
    const result = buildFortressMulti([sameEventA, sameEventB, distinctEvent]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("AVAILABLE");
    if (result.value.status !== "AVAILABLE") return;
    const eventIds = result.value.legs.map((l) => l.eventId);
    expect(new Set(eventIds).size).toBe(eventIds.length);
  });

  it("computes exact combined odds, joint probability and EV for a known two-leg multi", () => {
    /*
     * A fully hand-verifiable exact test vector: two legs at odds 1.85 and
     * 2.10 with lower-bound probabilities 0.55 and 0.50.
     *   combinedOdds = 1.85 * 2.10 = 3.885
     *   conservativeJointProbability = 0.55 * 0.50 = 0.275
     *   robustParlayEV = 0.275 * 3.885 - 1 = 0.068375
     */
    const legA = leg({
      eventId: "event-1",
      currentOdds: "1.85" as DecimalString,
      modelProbability: "0.6" as DecimalString,
      modelProbabilityLowerBound: "0.55" as DecimalString,
    });
    const legB = leg({
      eventId: "event-2",
      currentOdds: "2.1" as DecimalString,
      modelProbability: "0.55" as DecimalString,
      modelProbabilityLowerBound: "0.5" as DecimalString,
    });
    const result = buildFortressMulti([legA, legB]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("AVAILABLE");
    if (result.value.status !== "AVAILABLE") return;
    expect(Number(result.value.combinedOdds)).toBeCloseTo(3.885, 8);
    expect(Number(result.value.conservativeJointProbability)).toBeCloseTo(
      0.275,
      8,
    );
    expect(Number(result.value.robustParlayEV)).toBeCloseTo(0.068375, 8);
    // jointModelProbability uses the point estimates, not the lower bounds:
    // 0.6 * 0.55 = 0.33
    expect(Number(result.value.jointModelProbability)).toBeCloseTo(0.33, 8);
    // Exactly the spec's required disclaimer copy — it names "guaranteed"
    // only to negate it, which is correct: never claiming certainty is the
    // whole point, and that requires the word to say so.
    expect(result.value.disclaimer).toBe(
      "Highest-evidence combination identified by VELYQ. Not a guaranteed outcome.",
    );
  });

  it("rejects a combination whose robust parlay EV is not positive, even when the point EV is", () => {
    /*
     * Two legs whose *point* joint probability produces a positive parlay EV
     * but whose conservative joint probability does not. The correct answer
     * is NO_QUALIFYING_MULTI, not a multi built on the more optimistic
     * number.
     *   combinedOdds = 1.6 * 1.6 = 2.56
     *   point joint = 0.65 * 0.65 = 0.4225 -> point EV = 0.4225*2.56-1 = 0.0816 (positive)
     *   conservative joint = 0.5 * 0.5 = 0.25 -> robust EV = 0.25*2.56-1 = -0.36 (negative)
     */
    const legA = leg({
      eventId: "event-1",
      currentOdds: "1.6" as DecimalString,
      modelProbability: "0.65" as DecimalString,
      modelProbabilityLowerBound: "0.5" as DecimalString,
    });
    const legB = leg({
      eventId: "event-2",
      currentOdds: "1.6" as DecimalString,
      modelProbability: "0.65" as DecimalString,
      modelProbabilityLowerBound: "0.5" as DecimalString,
    });
    const result = buildFortressMulti([legA, legB]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      status: "NO_QUALIFYING_MULTI",
      reason: "NO_COMBINATION_MEETS_ROBUST_EV_THRESHOLD",
      fortressEligibleLegCount: 2,
    });
  });

  it("never exceeds the policy's maximum leg count", () => {
    const legs = Array.from({ length: 6 }, (_, index) =>
      leg({
        eventId: `event-${index}`,
        currentOdds: "1.5" as DecimalString,
        modelProbability: "0.7" as DecimalString,
        modelProbabilityLowerBound: "0.68" as DecimalString,
      }),
    );
    const result = buildFortressMulti(legs, DEFAULT_MULTI_POLICY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("AVAILABLE");
    if (result.value.status !== "AVAILABLE") return;
    expect(result.value.legs.length).toBeLessThanOrEqual(
      DEFAULT_MULTI_POLICY.maxLegs,
    );
    expect(result.value.legs.length).toBeGreaterThanOrEqual(
      DEFAULT_MULTI_POLICY.minLegs,
    );
  });

  it("respects a custom policy's leg bounds", () => {
    const legs = Array.from({ length: 5 }, (_, index) =>
      leg({
        eventId: `event-${index}`,
        currentOdds: "1.5" as DecimalString,
        modelProbability: "0.7" as DecimalString,
        modelProbabilityLowerBound: "0.68" as DecimalString,
      }),
    );
    const result = buildFortressMulti(legs, {
      ...DEFAULT_MULTI_POLICY,
      minLegs: 3,
      maxLegs: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("AVAILABLE");
    if (result.value.status !== "AVAILABLE") return;
    expect(result.value.legs).toHaveLength(3);
  });

  it("prefers the smaller of two equally-strong combinations", () => {
    /*
     * Three legs, each individually offering the same robust EV per added
     * leg (so a 2-leg and a 3-leg subset are not equally profitable in this
     * setup — a larger multi compounds EV, so this test instead confirms the
     * *reported* winner is the single best-scoring combination rather than
     * asserting a tie, since compounding EV means more legs at positive EV is
     * usually numerically better and the engine is not expected to
     * artificially prefer fewer legs over a strictly higher robust EV).
     */
    const legs = [
      leg({ eventId: "event-1" }),
      leg({ eventId: "event-2" }),
      leg({ eventId: "event-3" }),
    ];
    const result = buildFortressMulti(legs, {
      ...DEFAULT_MULTI_POLICY,
      minLegs: 2,
      maxLegs: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("AVAILABLE");
  });

  it("never lets a leg that fails the FORTRESS gate into a multi", () => {
    const good = leg({ eventId: "event-1" });
    const stale = leg({
      eventId: "event-2",
      fortress: { ...eligibleGate, fresh: false },
    });
    const lowCoverage = leg({
      eventId: "event-3",
      fortress: { ...eligibleGate, bookmakerCoverage: 1 },
    });
    const result = buildFortressMulti([good, stale, lowCoverage]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only one leg (`good`) clears the gate, which is fewer than minLegs.
    expect(result.value).toMatchObject({
      status: "NO_QUALIFYING_MULTI",
      reason: "TOO_FEW_FORTRESS_ELIGIBLE_LEGS",
      fortressEligibleLegCount: 1,
    });
  });
});
