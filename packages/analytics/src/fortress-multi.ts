import {
  decimalOdds,
  multiplyDecimalStrings,
  probability,
  subtractDecimalStrings,
  type DecimalResult,
  type DecimalString,
} from "@velyq/decimal";
import { isFortress, type FortressInput } from "./research-v3.js";

/**
 * VELYQ FORTRESS MULTI: constructing the highest-evidence multi-selection
 * candidate available from today's real markets — never a guarantee, never
 * "sure", and never assembled by relaxing the single-leg evidence bar just
 * to produce *some* multi.
 *
 * Three rules carry the whole module, and each exists because the naive
 * version of a parlay engine gets it wrong in a specific, costly way:
 *
 *   1. **Every leg must independently clear the FORTRESS bar on its own
 *      merits.** A leg is never added because it "completes" a combination —
 *      see `FORTRESS_ELIGIBLE` below, which is exactly `isFortress` from
 *      `research-v3.ts`, the same gate a single selection has to clear.
 *   2. **At most one leg per event, until a validated same-game joint model
 *      exists.** Same-match selections are almost never independent (a home
 *      win correlates with the home team's total, correlates with BTTS), and
 *      the naive `P(parlay) = p1 * p2 * ...` formula silently overstates the
 *      combination's probability the moment two legs share an event. This
 *      module enforces the one-leg-per-event constraint structurally — it is
 *      not a policy toggle a caller can bypass by omission.
 *   3. **The conservative (lower-bound) joint probability decides whether a
 *      multi is recommended, not the point estimate.** A combination whose
 *      point-estimate EV is positive but whose conservative EV is not is
 *      exactly the kind of multi that looks appealing and is not
 *      evidence-backed — `NO_QUALIFYING_MULTI` is the correct answer for it.
 */

/** Exactly the single-selection FORTRESS gate. A leg that would not qualify
    as a standalone FORTRESS single may never appear in a multi — the multi
    engine does not get a lower bar than the single-selection product. */
export const FORTRESS_ELIGIBLE = isFortress;
export type { FortressInput };

export type MultiPolicy = Readonly<{
  version: "fortress-multi.v1";
  /** Inclusive bounds on how many legs a candidate multi may contain. Never
      hardcoded elsewhere in this module — every combination search reads
      these two numbers. */
  minLegs: number;
  maxLegs: number;
  /** The conservative (lower-bound) joint probability × combined odds − 1
      must exceed this to be recommended. */
  minimumRobustParlayEV: DecimalString;
}>;

export const DEFAULT_MULTI_POLICY: MultiPolicy = Object.freeze({
  version: "fortress-multi.v1",
  minLegs: 2,
  maxLegs: 4,
  minimumRobustParlayEV: "0" as DecimalString,
});

export type MultiLegCandidate = Readonly<{
  eventId: string;
  sport: "FOOTBALL" | "BASKETBALL";
  market: string;
  selection: string;
  currentOdds: DecimalString;
  /** The point model probability for this exact selection — used only for
      the (reported, never decision-driving) point-estimate joint
      probability. */
  modelProbability: DecimalString;
  /** The conservative (lower-bound) probability for this exact selection.
      This is what the joint probability that actually gates the
      recommendation is built from. */
  modelProbabilityLowerBound: DecimalString;
  /** The full evidence gate this leg was actually evaluated against — kept
      alongside the leg so a rejected candidate's reason is inspectable. */
  fortress: FortressInput;
  publishedAt: string;
}>;

export type MultiRejectionReason =
  | "NO_LEGS_SUPPLIED"
  | "TOO_FEW_FORTRESS_ELIGIBLE_LEGS"
  | "ONLY_ONE_LEG_AFTER_SAME_EVENT_CONSTRAINT"
  | "NO_COMBINATION_MEETS_ROBUST_EV_THRESHOLD";

export type FortressMultiCandidate = Readonly<{
  status: "AVAILABLE";
  policyVersion: MultiPolicy["version"];
  legs: readonly MultiLegCandidate[];
  combinedOdds: DecimalString;
  /** Product of each leg's point `modelProbability`. Reported for
      transparency only — never what gates the recommendation. */
  jointModelProbability: DecimalString;
  /** Product of each leg's `modelProbabilityLowerBound`. This is the
      probability the recommendation is actually based on. */
  conservativeJointProbability: DecimalString;
  parlayEV: DecimalString;
  robustParlayEV: DecimalString;
  disclaimer: "Highest-evidence combination identified by VELYQ. Not a guaranteed outcome.";
}>;

export type FortressMultiResult =
  | FortressMultiCandidate
  | Readonly<{
      status: "NO_QUALIFYING_MULTI";
      policyVersion: MultiPolicy["version"];
      reason: MultiRejectionReason;
      /** How many candidates independently cleared the FORTRESS gate before
          the same-event and combination search were applied — the number
          that makes "no multi today" a legible, non-suspicious answer
          rather than a black box. */
      fortressEligibleLegCount: number;
    }>;

function jointProduct(
  values: readonly DecimalString[],
): DecimalResult<DecimalString> {
  let product = "1" as DecimalString;
  for (const value of values) {
    const checked = probability(value);
    if (!checked.ok) return checked;
    const next = multiplyDecimalStrings(product, value);
    if (!next.ok) return next;
    product = next.value;
  }
  return { ok: true, value: product };
}

function combineOdds(
  legs: readonly MultiLegCandidate[],
): DecimalResult<DecimalString> {
  let product = "1" as DecimalString;
  for (const leg of legs) {
    const checkedOdds = decimalOdds(leg.currentOdds);
    if (!checkedOdds.ok) return checkedOdds;
    const next = multiplyDecimalStrings(product, leg.currentOdds);
    if (!next.ok) return next;
    product = next.value;
  }
  return { ok: true, value: product };
}

function expectedValueOf(
  probabilityValue: DecimalString,
  odds: DecimalString,
): DecimalResult<DecimalString> {
  const product = multiplyDecimalStrings(probabilityValue, odds);
  if (!product.ok) return product;
  return subtractDecimalStrings(product.value, "1" as DecimalString);
}

/**
 * Enforces "at most one leg per event": given a pool already filtered to
 * FORTRESS-eligible legs, keeps only the strongest leg (by conservative
 * probability) for each event and discards the rest.
 *
 * This is the one place same-event correlation is handled, and it is
 * handled by exclusion rather than by an attempted joint model — per the
 * module's governing rule, a same-game joint model is not assumed to exist
 * until one is explicitly validated.
 */
export function enforceOneLegPerEvent(
  candidates: readonly MultiLegCandidate[],
): readonly MultiLegCandidate[] {
  const bestPerEvent = new Map<string, MultiLegCandidate>();
  for (const candidate of candidates) {
    const existing = bestPerEvent.get(candidate.eventId);
    if (
      !existing ||
      Number(candidate.modelProbabilityLowerBound) >
        Number(existing.modelProbabilityLowerBound)
    ) {
      bestPerEvent.set(candidate.eventId, candidate);
    }
  }
  return [...bestPerEvent.values()];
}

/** All combinations of `pool` with size in `[minSize, maxSize]`, smallest
    first — smaller, more defensible multis are preferred over larger ones
    of otherwise-equal quality when the caller picks among ties. */
function combinationsInRange<T>(
  pool: readonly T[],
  minSize: number,
  maxSize: number,
): T[][] {
  const results: T[][] = [];
  const build = (start: number, current: T[]) => {
    if (current.length >= minSize && current.length <= maxSize) {
      results.push([...current]);
    }
    if (current.length === maxSize) return;
    for (let i = start; i < pool.length; i += 1) {
      current.push(pool[i]!);
      build(i + 1, current);
      current.pop();
    }
  };
  build(0, []);
  return results.sort((a, b) => a.length - b.length);
}

function evaluateCombination(
  legs: readonly MultiLegCandidate[],
  policy: MultiPolicy,
): DecimalResult<FortressMultiCandidate | null> {
  const odds = combineOdds(legs);
  if (!odds.ok) return odds;
  const jointModel = jointProduct(legs.map((leg) => leg.modelProbability));
  if (!jointModel.ok) return jointModel;
  const conservativeJoint = jointProduct(
    legs.map((leg) => leg.modelProbabilityLowerBound),
  );
  if (!conservativeJoint.ok) return conservativeJoint;
  const parlayEV = expectedValueOf(jointModel.value, odds.value);
  if (!parlayEV.ok) return parlayEV;
  const robustParlayEV = expectedValueOf(conservativeJoint.value, odds.value);
  if (!robustParlayEV.ok) return robustParlayEV;
  const meetsThreshold = subtractDecimalStrings(
    robustParlayEV.value,
    policy.minimumRobustParlayEV,
  );
  if (!meetsThreshold.ok) return meetsThreshold;
  if (meetsThreshold.value.startsWith("-")) return { ok: true, value: null };
  return {
    ok: true,
    value: {
      status: "AVAILABLE",
      policyVersion: policy.version,
      legs,
      combinedOdds: odds.value,
      jointModelProbability: jointModel.value,
      conservativeJointProbability: conservativeJoint.value,
      parlayEV: parlayEV.value,
      robustParlayEV: robustParlayEV.value,
      disclaimer:
        "Highest-evidence combination identified by VELYQ. Not a guaranteed outcome.",
    },
  };
}

/**
 * Builds today's FORTRESS MULTI candidate, or explains precisely why none
 * qualifies.
 *
 * `candidates` should be every leg VELYQ currently has real evidence for —
 * this function itself re-applies the FORTRESS gate (`FORTRESS_ELIGIBLE`) so
 * a caller cannot accidentally widen the pool by pre-filtering incorrectly.
 * Among every valid combination in `[policy.minLegs, policy.maxLegs]` that
 * clears `minimumRobustParlayEV`, the one with the highest robust parlay EV
 * is returned; ties prefer the smaller combination (fewer independent ways
 * to lose).
 */
export function buildFortressMulti(
  candidates: readonly MultiLegCandidate[],
  policy: MultiPolicy = DEFAULT_MULTI_POLICY,
): DecimalResult<FortressMultiResult> {
  if (candidates.length === 0) {
    return {
      ok: true,
      value: {
        status: "NO_QUALIFYING_MULTI",
        policyVersion: policy.version,
        reason: "NO_LEGS_SUPPLIED",
        fortressEligibleLegCount: 0,
      },
    };
  }
  const eligible = candidates.filter((candidate) =>
    FORTRESS_ELIGIBLE(candidate.fortress),
  );
  if (eligible.length < policy.minLegs) {
    return {
      ok: true,
      value: {
        status: "NO_QUALIFYING_MULTI",
        policyVersion: policy.version,
        reason: "TOO_FEW_FORTRESS_ELIGIBLE_LEGS",
        fortressEligibleLegCount: eligible.length,
      },
    };
  }
  const uncorrelated = enforceOneLegPerEvent(eligible);
  if (uncorrelated.length < policy.minLegs) {
    return {
      ok: true,
      value: {
        status: "NO_QUALIFYING_MULTI",
        policyVersion: policy.version,
        reason: "ONLY_ONE_LEG_AFTER_SAME_EVENT_CONSTRAINT",
        fortressEligibleLegCount: eligible.length,
      },
    };
  }
  const combinations = combinationsInRange(
    uncorrelated,
    policy.minLegs,
    policy.maxLegs,
  );
  let best: FortressMultiCandidate | null = null;
  for (const combination of combinations) {
    const evaluated = evaluateCombination(combination, policy);
    if (!evaluated.ok) return evaluated;
    if (!evaluated.value) continue;
    if (
      !best ||
      Number(evaluated.value.robustParlayEV) > Number(best.robustParlayEV)
    ) {
      best = evaluated.value;
    }
  }
  if (!best) {
    return {
      ok: true,
      value: {
        status: "NO_QUALIFYING_MULTI",
        policyVersion: policy.version,
        reason: "NO_COMBINATION_MEETS_ROBUST_EV_THRESHOLD",
        fortressEligibleLegCount: eligible.length,
      },
    };
  }
  return { ok: true, value: best };
}
