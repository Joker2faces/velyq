import {
  addDecimalStrings,
  decimalOdds,
  divideDecimalStrings,
  edge,
  expectedValue,
  impliedProbability,
  multiplyDecimalStrings,
  probability,
  subtractDecimalStrings,
  type DecimalResult,
  type DecimalString,
} from "@velyq/decimal";

export type ValueMetrics = Readonly<{
  impliedProbability: DecimalString;
  fairOdds: DecimalString;
  probabilityEdge: DecimalString;
  expectedValue: DecimalString;
}>;

export function calculateValue(
  modelProbability: DecimalString,
  currentOdds: DecimalString,
): DecimalResult<ValueMetrics> {
  const odds = decimalOdds(currentOdds);
  const model = probability(modelProbability);
  const impliedRaw = divideDecimalStrings("1" as DecimalString, currentOdds);
  if (!odds.ok) return odds;
  if (!model.ok) return model;
  if (!impliedRaw.ok) return impliedRaw;
  const implied = impliedProbability(impliedRaw.value);
  if (!implied.ok) return implied;
  const fair = divideDecimalStrings("1" as DecimalString, modelProbability);
  if (!fair.ok) return fair;
  const probabilityEdge = subtractDecimalStrings(
    modelProbability,
    implied.value.value,
  );
  if (!probabilityEdge.ok) return probabilityEdge;
  const product = multiplyDecimalStrings(modelProbability, currentOdds);
  if (!product.ok) return product;
  const evRaw = subtractDecimalStrings(product.value, "1" as DecimalString);
  if (!evRaw.ok) return evRaw;
  const checkedEdge = edge(probabilityEdge.value);
  const ev = expectedValue(evRaw.value);
  if (!checkedEdge.ok) return checkedEdge;
  if (!ev.ok) return ev;
  return {
    ok: true,
    value: {
      impliedProbability: implied.value.value,
      fairOdds: fair.value,
      probabilityEdge: checkedEdge.value.value,
      expectedValue: ev.value.value,
    },
  };
}

export type EdgeHeuristic = Readonly<{
  validationStatus: "DEVELOPMENT_HEURISTIC";
  scoreVersion: string;
  score: DecimalString;
  components: Readonly<Record<string, DecimalString>>;
  reasonCodes: readonly string[];
}>;
export function calculateEdge(
  input: Readonly<{
    probabilityEdge: DecimalString;
    expectedValue: DecimalString;
    qualityScore: DecimalString;
    scoreVersion: string;
  }>,
): DecimalResult<EdgeHeuristic> {
  const score = edge(input.probabilityEdge);
  if (!score.ok) return score;
  const quality = probability(input.qualityScore);
  if (!quality.ok) return quality;
  const value = expectedValue(input.expectedValue);
  if (!value.ok) return value;
  return {
    ok: true,
    value: {
      validationStatus: "DEVELOPMENT_HEURISTIC",
      scoreVersion: input.scoreVersion,
      score: score.value.value,
      components: {
        probabilityEdge: score.value.value,
        expectedValue: value.value.value,
        quality: quality.value.value,
      },
      reasonCodes: ["OBSERVABLE_INPUTS_ONLY"],
    },
  };
}

export type RadarEvidence = Readonly<{
  validationStatus: "DEVELOPMENT_HEURISTIC";
  scoreVersion: string;
  openingOdds: DecimalString;
  currentOdds: DecimalString;
  movement: DecimalString;
  coverage: string;
  freshness: string;
  reasonCodes: readonly string[];
}>;
export function calculateRadar(
  input: Readonly<{
    openingOdds: DecimalString;
    currentOdds: DecimalString;
    bookmakerCoverage: number;
    observedAt: string;
    asOf: string;
    scoreVersion: string;
  }>,
): DecimalResult<RadarEvidence> {
  const opening = decimalOdds(input.openingOdds);
  const current = decimalOdds(input.currentOdds);
  if (!opening.ok) return opening;
  if (!current.ok) return current;
  const movement = subtractDecimalStrings(input.currentOdds, input.openingOdds);
  if (!movement.ok) return movement;
  const stale =
    Date.parse(input.asOf) - Date.parse(input.observedAt) > 15 * 60 * 1000;
  return {
    ok: true,
    value: {
      validationStatus: "DEVELOPMENT_HEURISTIC",
      scoreVersion: input.scoreVersion,
      openingOdds: opening.value.value,
      currentOdds: current.value.value,
      movement: movement.value,
      coverage: input.bookmakerCoverage > 0 ? "AVAILABLE" : "MISSING",
      freshness: stale ? "STALE" : "FRESH",
      reasonCodes: [
        "MARKET_MOVEMENT_DETECTED",
        ...(stale ? ["STALE_EVIDENCE"] : []),
      ],
    },
  };
}

export type QualityGrade = "A" | "B" | "C" | "D" | "F";
export type RecommendationStatus =
  | "NO_BET"
  | "WAIT"
  | "WAIT_FOR_LINEUP"
  | "INSUFFICIENT_DATA"
  | "EDGE_DISAPPEARED";
export type DataQualityAssessment = Readonly<{
  policyVersion: string;
  asOf: string;
  grade: QualityGrade;
  score: string;
  components: Readonly<Record<string, string>>;
  reasonCodes: readonly string[];
}>;
export type QualityInput = Readonly<{
  policyVersion: string;
  asOf: string;
  receivedAt: string;
  priceCount: number;
  bookmakerCount: number;
  lineup: "EXPECTED" | "OFFICIAL" | "MISSING" | "CHANGED";
  mappingConfidence: "HIGH" | "LOW";
  edgeAvailable: boolean;
  edgePresent: boolean;
}>;

export function assessDataQuality(input: QualityInput): DataQualityAssessment {
  const ageMs = Date.parse(input.asOf) - Date.parse(input.receivedAt);
  const stale = !Number.isFinite(ageMs) || ageMs > 15 * 60 * 1000;
  const components = {
    freshness: stale ? "0" : "1",
    priceCoverage: input.priceCount > 0 ? "1" : "0",
    bookmakerCoverage: input.bookmakerCount > 0 ? "1" : "0",
    lineupCertainty:
      input.lineup === "OFFICIAL"
        ? "1"
        : input.lineup === "EXPECTED"
          ? "0.75"
          : "0",
    mappingConfidence: input.mappingConfidence === "HIGH" ? "1" : "0.5",
  } as const;
  const reasonCodes = [
    ...(stale ? ["STALE_DATA"] : []),
    ...(input.priceCount === 0 ? ["MISSING_PRICE"] : []),
    ...(input.bookmakerCount === 0 ? ["NO_BOOKMAKER_COVERAGE"] : []),
    ...(input.lineup === "MISSING" ? ["MISSING_LINEUP"] : []),
    ...(input.mappingConfidence === "LOW" ? ["LOW_MAPPING_CONFIDENCE"] : []),
  ];
  const total = Object.values(components).reduce<DecimalString>(
    (sum, value) => {
      const result = addDecimalStrings(sum, value as DecimalString);
      if (!result.ok) throw new Error("QUALITY_SCORE_ARITHMETIC_FAILED");
      return result.value;
    },
    "0" as DecimalString,
  );
  const atLeast = (threshold: DecimalString) => {
    const result = subtractDecimalStrings(total, threshold);
    return result.ok && !result.value.startsWith("-");
  };
  const score = atLeast("4.5" as DecimalString)
    ? "1"
    : atLeast("3.5" as DecimalString)
      ? "0.75"
      : atLeast("2.5" as DecimalString)
        ? "0.5"
        : "0";
  const grade: QualityGrade =
    score === "1" ? "A" : score === "0.75" ? "B" : score === "0.5" ? "C" : "F";
  return Object.freeze({
    policyVersion: input.policyVersion,
    asOf: input.asOf,
    grade,
    score,
    components,
    reasonCodes,
  });
}

export function decideRecommendation(
  input: Readonly<{
    quality: DataQualityAssessment;
    lineup: QualityInput["lineup"];
    edgeAvailable: boolean;
    edgePresent: boolean;
  }>,
): RecommendationStatus {
  if (
    !input.edgeAvailable ||
    input.quality.reasonCodes.includes("MISSING_PRICE")
  )
    return "INSUFFICIENT_DATA";
  if (input.quality.reasonCodes.includes("STALE_DATA")) return "WAIT";
  if (input.lineup === "MISSING" || input.lineup === "CHANGED")
    return "WAIT_FOR_LINEUP";
  if (!input.edgePresent) return "EDGE_DISAPPEARED";
  if (input.quality.grade === "F" || input.quality.grade === "C")
    return "NO_BET";
  return "NO_BET";
}
