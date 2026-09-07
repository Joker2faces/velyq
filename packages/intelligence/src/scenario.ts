import { subtractDecimalStrings, type DecimalString } from "@velyq/decimal";

import { evaluatePriceValidity, type PriceValidity } from "./price.js";

export type ScenarioQuality = Readonly<{
  readonly grade: string;
  readonly score: number;
  readonly reasonCodes: readonly string[];
  readonly riskFlags: readonly string[];
}>;

export type ScenarioInput = Readonly<{
  readonly baseline: Readonly<{
    readonly modelProbability: string | null;
    readonly odds: string | null;
    readonly quality: ScenarioQuality;
  }>;
  readonly changed: Readonly<{
    readonly modelProbability: string | null;
    readonly odds: string | null;
    readonly quality: ScenarioQuality;
  }>;
}>;

export type ScenarioQualityChange =
  | "GRADE_CHANGED"
  | "SCORE_CHANGED"
  | "REASON_CODES_CHANGED"
  | "RISK_FLAGS_CHANGED";

export type ScenarioAnalysis = Readonly<{
  readonly baseline: PriceValidity;
  readonly changed: PriceValidity;
  readonly expectedValueSensitivity: DecimalString | null;
  readonly priceThresholdCrossed: boolean;
  readonly modelProbabilityChanged: boolean;
  readonly qualityChanges: readonly ScenarioQualityChange[];
}>;

function arrayEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function qualityChanges(
  input: ScenarioInput,
): readonly ScenarioQualityChange[] {
  const changes: ScenarioQualityChange[] = [];
  if (input.baseline.quality.grade !== input.changed.quality.grade)
    changes.push("GRADE_CHANGED");
  if (input.baseline.quality.score !== input.changed.quality.score)
    changes.push("SCORE_CHANGED");
  if (
    !arrayEqual(
      input.baseline.quality.reasonCodes,
      input.changed.quality.reasonCodes,
    )
  )
    changes.push("REASON_CODES_CHANGED");
  if (
    !arrayEqual(
      input.baseline.quality.riskFlags,
      input.changed.quality.riskFlags,
    )
  )
    changes.push("RISK_FLAGS_CHANGED");
  return Object.freeze(changes);
}

/** Evaluates explicitly supplied price and probability changes without inferring lineup effects. */
export function analyzeScenario(input: ScenarioInput): ScenarioAnalysis {
  const baseline = evaluatePriceValidity({
    modelProbability: input.baseline.modelProbability,
    currentOdds: input.baseline.odds,
  });
  const changed = evaluatePriceValidity({
    modelProbability: input.changed.modelProbability,
    currentOdds: input.changed.odds,
  });
  const expectedValueSensitivity =
    baseline.expectedValue && changed.expectedValue
      ? subtractDecimalStrings(changed.expectedValue, baseline.expectedValue)
      : null;

  return Object.freeze({
    baseline,
    changed,
    expectedValueSensitivity: expectedValueSensitivity?.ok
      ? expectedValueSensitivity.value
      : null,
    priceThresholdCrossed:
      (baseline.status === "ATTRACTIVE") !== (changed.status === "ATTRACTIVE"),
    modelProbabilityChanged:
      baseline.modelProbability !== changed.modelProbability,
    qualityChanges: qualityChanges(input),
  });
}
