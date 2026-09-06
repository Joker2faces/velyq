import type { DecisionInput } from "./decision.js";
import type { PriceValidity } from "./price.js";

export const QUALITY_POLICY_VERSION = "quality.v1" as const;

export type QualityGrade = "HIGH" | "MEDIUM" | "LOW" | "INVALID";

export type QualityRiskFlag =
  | "STALE_PRICE"
  | "MISSING_PRICE"
  | "INSUFFICIENT_COVERAGE"
  | "LINEUP_UNCERTAIN"
  | "INVALID_PRICE";

export type DecisionQualityInput = Readonly<{
  readonly price: PriceValidity;
  readonly freshness: DecisionInput["freshness"];
  readonly coverage: DecisionInput["coverage"];
  readonly lineup: DecisionInput["lineup"];
}>;

export type DecisionQuality = Readonly<{
  readonly policyVersion: typeof QUALITY_POLICY_VERSION;
  readonly grade: QualityGrade;
  readonly score: number;
  readonly reasonCodes: readonly string[];
  readonly riskFlags: readonly QualityRiskFlag[];
  readonly invalidationConditions: readonly string[];
}>;

function gradeFor(score: number): QualityGrade {
  if (score >= 90) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

/** Assesses the operational reliability of a decision, independently of its EV. */
export function assessDecisionQuality(
  input: DecisionQualityInput,
): DecisionQuality {
  if (input.price.status === "INVALID_PRICE") {
    return Object.freeze({
      policyVersion: QUALITY_POLICY_VERSION,
      grade: "INVALID",
      score: 0,
      reasonCodes: Object.freeze(["INVALID_PRICE"]),
      riskFlags: Object.freeze<readonly QualityRiskFlag[]>(["INVALID_PRICE"]),
      invalidationConditions: Object.freeze(["REPLACE_INVALID_PRICE"]),
    });
  }

  let score = 100;
  const reasonCodes: string[] = [];
  const riskFlags: QualityRiskFlag[] = [];
  const invalidationConditions: string[] = [];

  if (input.freshness === "STALE") {
    score -= 55;
    reasonCodes.push("STALE_EVIDENCE");
    riskFlags.push("STALE_PRICE");
    invalidationConditions.push("REFRESH_PRICE_EVIDENCE");
  } else if (input.freshness === "MISSING") {
    score -= 85;
    reasonCodes.push("MISSING_EVIDENCE_FRESHNESS");
    riskFlags.push("MISSING_PRICE");
    invalidationConditions.push("RECORD_PRICE_FRESHNESS");
  }

  if (input.coverage === "LOW") {
    score -= 55;
    reasonCodes.push("LOW_COVERAGE");
    riskFlags.push("INSUFFICIENT_COVERAGE");
    invalidationConditions.push("INCREASE_MARKET_COVERAGE");
  } else if (input.coverage === "MISSING") {
    score -= 70;
    reasonCodes.push("MISSING_COVERAGE");
    riskFlags.push("INSUFFICIENT_COVERAGE");
    invalidationConditions.push("RECORD_MARKET_COVERAGE");
  }

  if (input.lineup === "EXPECTED") {
    score -= 10;
    reasonCodes.push("LINEUP_NOT_OFFICIAL");
    riskFlags.push("LINEUP_UNCERTAIN");
    invalidationConditions.push("CONFIRM_LINEUP");
  } else if (input.lineup === "MISSING") {
    score -= 25;
    reasonCodes.push("LINEUP_UNAVAILABLE");
    riskFlags.push("LINEUP_UNCERTAIN");
    invalidationConditions.push("CONFIRM_LINEUP");
  } else if (input.lineup === "CHANGED") {
    score -= 25;
    reasonCodes.push("LINEUP_CHANGED");
    riskFlags.push("LINEUP_UNCERTAIN");
    invalidationConditions.push("REASSESS_AFTER_LINEUP_CHANGE");
  }

  const boundedScore = Math.max(0, score);
  return Object.freeze({
    policyVersion: QUALITY_POLICY_VERSION,
    grade: gradeFor(boundedScore),
    score: boundedScore,
    reasonCodes: Object.freeze(reasonCodes),
    riskFlags: Object.freeze(riskFlags),
    invalidationConditions: Object.freeze(invalidationConditions),
  });
}
