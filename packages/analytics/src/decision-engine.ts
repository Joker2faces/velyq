import type { DecimalString } from "@velyq/decimal";
import { decideRecommendation, type DataQualityAssessment } from "./index.js";

/**
 * The deterministic boundary between "VELYQ has a forecast for this" and
 * "VELYQ recommends this".
 *
 * `decideRecommendation` (performance.ts) already owns every refusal state
 * -- INSUFFICIENT_DATA, WAIT, WAIT_FOR_LINEUP, EDGE_DISAPPEARED, and the
 * fallthrough NO_BET -- and its own comment already documents why STRONG_EDGE
 * promotion is a separate, stricter gate: reaching "an edge is present and
 * the evidence is fresh enough to consider" is necessary but not sufficient.
 * This function is that stricter gate, layered on top rather than
 * duplicated: it computes the actual edge/EV from a model probability and
 * the current market price, and only escalates NO_BET to STRONG_EDGE when
 * both clear an explicit, versioned threshold. It never fabricates an edge
 * -- missing odds falls straight through to decideRecommendation's own
 * INSUFFICIENT_DATA/WAIT handling, and an edge below threshold stays NO_BET.
 */
export type DecisionPolicy = Readonly<{
  version: string;
  /** Minimum (modelProbability - marketImpliedProbability) to promote to STRONG_EDGE. */
  minimumEdge: number;
  /** Minimum expected value (modelProbability * odds - 1) to promote to STRONG_EDGE. */
  minimumExpectedValue: number;
}>;

export const DEFAULT_DECISION_POLICY: DecisionPolicy = Object.freeze({
  version: "decision-policy.v1",
  minimumEdge: 0.03,
  minimumExpectedValue: 0,
});

export type DecisionEvaluation = Readonly<{
  status:
    | "STRONG_EDGE"
    | "NO_BET"
    | "WAIT"
    | "WAIT_FOR_LINEUP"
    | "INSUFFICIENT_DATA"
    | "EDGE_DISAPPEARED";
  fairOdds: DecimalString | null;
  expectedValue: DecimalString | null;
  edge: number | null;
  whyNotCodes: readonly string[];
}>;

/**
 * Evaluates one forecasted selection end to end: refusal states first (via
 * decideRecommendation), STRONG_EDGE promotion only for whatever remains.
 *
 * `modelProbability` must already have cleared the model's own eligibility
 * gate (a real fitted probability) -- this decides whether that forecast is
 * currently actionable, never whether a forecast exists at all.
 */
export function evaluateDecision(
  input: Readonly<{
    modelProbability: number;
    /** The current best available decimal odds for this exact selection, or
        null when no market price exists yet. */
    currentOdds: number | null;
    quality: DataQualityAssessment;
    lineup: "EXPECTED" | "OFFICIAL" | "MISSING" | "CHANGED";
    hadPriorEdge?: boolean;
    policy?: DecisionPolicy;
  }>,
): DecisionEvaluation {
  const policy = input.policy ?? DEFAULT_DECISION_POLICY;
  const fairOdds =
    input.modelProbability > 0
      ? (String(1 / input.modelProbability) as DecimalString)
      : null;

  /*
   * decideRecommendation treats "no odds" as INSUFFICIENT_DATA -- correct
   * for "the model itself has nothing", wrong for "the forecast exists but
   * no market price does yet". Those are different products: the first
   * hides the match, the second must still show the forecast. Handled here,
   * before delegating, rather than changing decideRecommendation's existing
   * meaning for callers that genuinely have no forecast at all.
   */
  if (input.currentOdds === null) {
    return {
      status: "WAIT",
      fairOdds,
      expectedValue: null,
      edge: null,
      whyNotCodes: ["MARKET_DATA_UNAVAILABLE"],
    };
  }

  const marketImpliedProbability =
    input.currentOdds === null ? null : 1 / input.currentOdds;
  const edge =
    marketImpliedProbability === null
      ? null
      : input.modelProbability - marketImpliedProbability;
  const expectedValue =
    input.currentOdds === null
      ? null
      : input.modelProbability * input.currentOdds - 1;
  const meetsPolicy =
    edge !== null &&
    expectedValue !== null &&
    edge >= policy.minimumEdge &&
    expectedValue >= policy.minimumExpectedValue;

  /*
   * Quality has to bind promotion, not merely be mentioned by it.
   *
   * `decideRecommendation` names grade C and F as quality refusals, but
   * returns "NO_BET" for them and for its own fallthrough -- and promotion
   * fired on any "NO_BET" that cleared the edge/EV policy. So a grade F
   * selection was promoted to STRONG_EDGE by a large enough edge, which is
   * the opposite of what the comment there claims. It is reachable: a grade
   * can be driven to F by NO_BOOKMAKER_COVERAGE, LOW_MAPPING_CONFIDENCE,
   * LOW_SOURCE_AUTHORITY or INCONSISTENT_DATA, none of which the earlier
   * MISSING_PRICE / STALE_DATA branches inspect.
   *
   * Only masked today, not harmless: the forecast cycle downgrades every
   * STRONG_EDGE while the artifact is EXPERIMENTAL, so nothing reaches a
   * customer -- and the day maturity advances this becomes a promoted bet
   * on evidence the quality engine already rejected.
   */
  const qualityPermitsPromotion =
    input.quality.grade !== "F" && input.quality.grade !== "C";

  const gate = decideRecommendation({
    quality: input.quality,
    lineup: input.lineup,
    edgeAvailable: input.currentOdds !== null,
    edgePresent: meetsPolicy,
    ...(input.hadPriorEdge === undefined
      ? {}
      : { hadPriorEdge: input.hadPriorEdge }),
  });

  return {
    status:
      gate === "NO_BET" && meetsPolicy && qualityPermitsPromotion
        ? "STRONG_EDGE"
        : gate,
    fairOdds,
    expectedValue:
      expectedValue === null ? null : (String(expectedValue) as DecimalString),
    edge,
    whyNotCodes:
      gate === "NO_BET" && !meetsPolicy
        ? edge === null
          ? ["MARKET_DATA_UNAVAILABLE"]
          : [edge < policy.minimumEdge ? "EDGE_TOO_SMALL" : "PRICE_TOO_SHORT"]
        : /* A refusal on quality alone has to say so, or the decision reads
             as an unexplained NO_BET on a price that did clear the policy. */
          gate === "NO_BET" && meetsPolicy && !qualityPermitsPromotion
          ? ["QUALITY_TOO_LOW"]
          : [],
  };
}
