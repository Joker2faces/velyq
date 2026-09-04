import {
  addDecimalStrings,
  decimalOdds,
  divideDecimalStrings,
  edge,
  expectedValue,
  impliedProbability,
  multiplyDecimalStrings,
  parseDecimalString,
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
export type HeuristicFormula = Readonly<{
  weights?: Readonly<Record<string, DecimalString>>;
  capsPenalties?: Readonly<Record<string, DecimalString>>;
}>;
export function calculateEdge(
  input: Readonly<{
    probabilityEdge: DecimalString;
    expectedValue: DecimalString;
    qualityScore: DecimalString;
    scoreVersion: string;
    formula?: HeuristicFormula;
  }>,
): DecimalResult<EdgeHeuristic> {
  const score = edge(input.probabilityEdge);
  if (!score.ok) return score;
  const quality = probability(input.qualityScore);
  if (!quality.ok) return quality;
  const value = expectedValue(input.expectedValue);
  if (!value.ok) return value;
  const components = {
    probabilityEdge: score.value.value,
    expectedValue: value.value.value,
    quality: quality.value.value,
  } as const;
  const weights = input.formula?.weights ?? {};
  const capsPenalties = input.formula?.capsPenalties ?? {};
  const boundedComponents = Object.fromEntries(
    Object.entries(components).map(([key, component]) => {
      const penalty = capsPenalties[`${key}Penalty`];
      const cap = capsPenalties[`${key}Cap`];
      const reduced = penalty
        ? subtractDecimalStrings(component, penalty)
        : ({ ok: true, value: component } as const);
      if (!reduced.ok || !cap)
        return [key, reduced.ok ? reduced.value : component];
      const overCap = subtractDecimalStrings(
        reduced.value,
        cap as DecimalString,
      );
      return [
        key,
        overCap.ok && overCap.value.startsWith("-") ? reduced.value : cap,
      ];
    }),
  ) as Record<string, DecimalString>;
  const weighted = Object.entries(components).reduce<
    DecimalResult<DecimalString>
  >(
    (sum, [key]) => {
      const weight = weights[key] ?? ("1" as DecimalString);
      if (!sum.ok) return sum;
      const term = multiplyDecimalStrings(
        boundedComponents[key] ?? components[key as keyof typeof components],
        weight,
      );
      if (!term.ok) return term;
      return addDecimalStrings(sum.value, term.value);
    },
    { ok: true, value: "0" as DecimalString },
  );
  if (!weighted.ok) return weighted;
  const denominator = Object.keys(components).reduce<
    DecimalResult<DecimalString>
  >(
    (sum, key) => {
      if (!sum.ok) return sum;
      return addDecimalStrings(
        sum.value,
        weights[key] ?? ("1" as DecimalString),
      );
    },
    { ok: true, value: "0" as DecimalString },
  );
  if (!denominator.ok) return denominator;
  const aggregate = divideDecimalStrings(weighted.value, denominator.value);
  if (!aggregate.ok) return aggregate;
  return {
    ok: true,
    value: {
      validationStatus: "DEVELOPMENT_HEURISTIC",
      scoreVersion: input.scoreVersion,
      score: aggregate.value,
      components,
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
  score: DecimalString;
  reasonCodes: readonly string[];
  components: Readonly<Record<string, DecimalString>>;
}>;
export function calculateRadar(
  input: Readonly<{
    openingOdds: DecimalString;
    currentOdds: DecimalString;
    bookmakerCoverage: number;
    observedAt: string;
    asOf: string;
    scoreVersion: string;
    movementWindowSeconds?: number;
    bookmakersMoving?: number;
    consensus?: DecimalString;
    divergence?: DecimalString;
    formula?: HeuristicFormula;
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
  const coverage = input.bookmakerCoverage > 0 ? "AVAILABLE" : "MISSING";
  const velocity =
    input.movementWindowSeconds && input.movementWindowSeconds > 0
      ? divideDecimalStrings(
          movement.value,
          String(input.movementWindowSeconds) as DecimalString,
        )
      : ({ ok: true, value: movement.value } as const);
  if (!velocity.ok) return velocity;
  const reasonCodes = [
    ...(movement.value === "0"
      ? ["NO_MOVEMENT"]
      : ["MARKET_MOVEMENT_DETECTED"]),
    ...(stale ? ["STALE_EVIDENCE"] : []),
    ...(coverage === "MISSING" ? ["INSUFFICIENT_COVERAGE"] : []),
  ];
  const radarComponents = {
    movement: movement.value.startsWith("-")
      ? (movement.value.slice(1) as DecimalString)
      : movement.value,
    velocity: velocity.value.startsWith("-")
      ? (velocity.value.slice(1) as DecimalString)
      : velocity.value,
    coverage: String(input.bookmakerCoverage) as DecimalString,
    consensus:
      input.consensus ??
      ((input.bookmakerCoverage > 0 ? "1" : "0") as DecimalString),
    divergence:
      input.divergence ??
      (String(input.bookmakersMoving ?? 0) as DecimalString),
  } as const;
  const weights = input.formula?.weights ?? {};
  const capsPenalties = input.formula?.capsPenalties ?? {};
  const boundedComponents = Object.fromEntries(
    Object.entries(radarComponents).map(([key, component]) => {
      const penalty = capsPenalties[`${key}Penalty`];
      const cap = capsPenalties[`${key}Cap`];
      const reduced = penalty
        ? subtractDecimalStrings(component, penalty)
        : ({ ok: true, value: component } as const);
      if (!reduced.ok || !cap)
        return [key, reduced.ok ? reduced.value : component];
      const overCap = subtractDecimalStrings(
        reduced.value,
        cap as DecimalString,
      );
      return [
        key,
        overCap.ok && overCap.value.startsWith("-") ? reduced.value : cap,
      ];
    }),
  ) as Record<string, DecimalString>;
  const weighted = Object.entries(radarComponents).reduce<
    DecimalResult<DecimalString>
  >(
    (sum, [key, component]) => {
      if (!sum.ok) return sum;
      const term = multiplyDecimalStrings(
        stale || input.bookmakerCoverage === 0
          ? ("0" as DecimalString)
          : (boundedComponents[key] ?? component),
        weights[key] ?? ("1" as DecimalString),
      );
      return term.ok ? addDecimalStrings(sum.value, term.value) : term;
    },
    { ok: true, value: "0" as DecimalString },
  );
  if (!weighted.ok) return weighted;
  const denominator = Object.keys(radarComponents).reduce<
    DecimalResult<DecimalString>
  >(
    (sum, key) =>
      sum.ok
        ? addDecimalStrings(sum.value, weights[key] ?? ("1" as DecimalString))
        : sum,
    { ok: true, value: "0" as DecimalString },
  );
  if (!denominator.ok) return denominator;
  const heuristicScore = divideDecimalStrings(
    weighted.value,
    denominator.value,
  );
  if (!heuristicScore.ok) return heuristicScore;
  return {
    ok: true,
    value: {
      validationStatus: "DEVELOPMENT_HEURISTIC",
      scoreVersion: input.scoreVersion,
      openingOdds: opening.value.value,
      currentOdds: current.value.value,
      movement: movement.value,
      coverage,
      freshness: stale ? "STALE" : "FRESH",
      reasonCodes,
      components: radarComponents,
      score: heuristicScore.value,
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
export type QualityComponentName =
  | "freshness"
  | "priceCoverage"
  | "bookmakerCoverage"
  | "lineupCertainty"
  | "mappingConfidence"
  | "sourceAuthority"
  | "consistency";
export type QualitySourceAuthority =
  "PRIMARY" | "SECONDARY" | "UNKNOWN" | "HIGH" | "LOW";
export type QualityConsistency =
  "CONSISTENT" | "INCONSISTENT" | "CONFLICTING" | "UNKNOWN";
export type QualityPolicyDefinition = Readonly<{
  freshnessSeconds?: number;
  minimumBookmakers?: number;
  requiresLineup?: boolean;
  weights?: Readonly<Partial<Record<QualityComponentName, DecimalString>>>;
  thresholds?: Readonly<{
    readonly gradeA: DecimalString;
    readonly gradeB: DecimalString;
    readonly gradeC: DecimalString;
  }>;
}>;
export type DataQualityPolicy = Readonly<{
  policyVersion: string;
  validationStatus?: "DEVELOPMENT_HEURISTIC";
  definition: QualityPolicyDefinition;
}>;

/** The default policy mirrors the Phase 1 synthetic policy and is overridable by version. */
export const DEFAULT_DATA_QUALITY_POLICY: DataQualityPolicy = Object.freeze({
  policyVersion: "phase-1-quality.v1",
  validationStatus: "DEVELOPMENT_HEURISTIC",
  definition: Object.freeze({
    freshnessSeconds: 15 * 60,
    minimumBookmakers: 1,
    requiresLineup: true,
    weights: Object.freeze({
      freshness: "1" as DecimalString,
      priceCoverage: "1" as DecimalString,
      bookmakerCoverage: "1" as DecimalString,
      lineupCertainty: "1" as DecimalString,
      mappingConfidence: "1" as DecimalString,
      sourceAuthority: "1" as DecimalString,
      consistency: "1" as DecimalString,
    }),
    thresholds: Object.freeze({
      gradeA: "6.5" as DecimalString,
      gradeB: "5.5" as DecimalString,
      gradeC: "4.5" as DecimalString,
    }),
  }),
});
export type DataQualityAssessment = Readonly<{
  policyVersion: string;
  asOf: string;
  grade: QualityGrade;
  score: DecimalString;
  components: Readonly<Record<QualityComponentName, DecimalString>>;
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
  /** Optional keeps the pre-policy payload contract readable by older workers. */
  sourceAuthority?: QualitySourceAuthority;
  /** Optional keeps the pre-policy payload contract readable by older workers. */
  consistency?: QualityConsistency;
}>;

function policyForInput(input: QualityInput): DataQualityPolicy {
  return input.policyVersion === DEFAULT_DATA_QUALITY_POLICY.policyVersion
    ? DEFAULT_DATA_QUALITY_POLICY
    : Object.freeze({
        ...DEFAULT_DATA_QUALITY_POLICY,
        policyVersion: input.policyVersion,
      });
}

function qualityDecimal(value: string, context: string): DecimalString {
  const parsed = parseQualityDecimal(value);
  if (!parsed.ok || parsed.value.startsWith("-"))
    throw new Error(`INVALID_QUALITY_POLICY_${context}`);
  return parsed.value;
}

function parseQualityDecimal(value: string): DecimalResult<DecimalString> {
  return parseDecimalString(value);
}

function sourceAuthorityScore(
  authority: QualitySourceAuthority | undefined,
): DecimalString {
  switch (authority) {
    case "PRIMARY":
    case "HIGH":
      return "1" as DecimalString;
    case "SECONDARY":
      return "0.75" as DecimalString;
    case "LOW":
      return "0.5" as DecimalString;
    case "UNKNOWN":
      return "0" as DecimalString;
    default:
      // Legacy synthetic callers predate these fields; retain their prior score.
      return "1" as DecimalString;
  }
}

function consistencyScore(
  consistency: QualityConsistency | undefined,
): DecimalString {
  switch (consistency) {
    case "CONSISTENT":
      return "1" as DecimalString;
    case "INCONSISTENT":
    case "CONFLICTING":
      return "0" as DecimalString;
    case "UNKNOWN":
      return "0" as DecimalString;
    default:
      // Legacy synthetic callers predate this field; retain their prior score.
      return "1" as DecimalString;
  }
}

export function assessDataQuality(
  input: QualityInput,
  policy: DataQualityPolicy = policyForInput(input),
): DataQualityAssessment {
  if (policy.policyVersion !== input.policyVersion)
    throw new Error("QUALITY_POLICY_VERSION_MISMATCH");
  const definition = policy.definition;
  const freshnessSeconds =
    definition.freshnessSeconds ??
    DEFAULT_DATA_QUALITY_POLICY.definition.freshnessSeconds!;
  if (!Number.isFinite(freshnessSeconds) || freshnessSeconds < 0)
    throw new Error("INVALID_QUALITY_POLICY_FRESHNESS");
  const minimumBookmakers =
    definition.minimumBookmakers ??
    DEFAULT_DATA_QUALITY_POLICY.definition.minimumBookmakers!;
  if (!Number.isSafeInteger(minimumBookmakers) || minimumBookmakers < 0)
    throw new Error("INVALID_QUALITY_POLICY_BOOKMAKERS");
  const requiresLineup = definition.requiresLineup ?? true;
  const ageMs = Date.parse(input.asOf) - Date.parse(input.receivedAt);
  const stale = !Number.isFinite(ageMs) || ageMs > freshnessSeconds * 1000;
  const components: Readonly<Record<QualityComponentName, DecimalString>> = {
    freshness: (stale ? "0" : "1") as DecimalString,
    priceCoverage: (input.priceCount > 0 ? "1" : "0") as DecimalString,
    bookmakerCoverage: (input.bookmakerCount >= minimumBookmakers
      ? "1"
      : "0") as DecimalString,
    lineupCertainty:
      !requiresLineup && input.lineup === "MISSING"
        ? ("1" as DecimalString)
        : input.lineup === "OFFICIAL"
          ? ("1" as DecimalString)
          : input.lineup === "EXPECTED"
            ? ("0.75" as DecimalString)
            : ("0" as DecimalString),
    mappingConfidence: (input.mappingConfidence === "HIGH"
      ? "1"
      : "0.5") as DecimalString,
    sourceAuthority: sourceAuthorityScore(input.sourceAuthority),
    consistency: consistencyScore(input.consistency),
  };
  const reasonCodes = [
    ...(stale ? ["STALE_DATA"] : []),
    ...(input.priceCount === 0 ? ["MISSING_PRICE"] : []),
    ...(input.bookmakerCount < minimumBookmakers
      ? ["NO_BOOKMAKER_COVERAGE"]
      : []),
    ...(requiresLineup && input.lineup === "MISSING" ? ["MISSING_LINEUP"] : []),
    ...(input.mappingConfidence === "LOW" ? ["LOW_MAPPING_CONFIDENCE"] : []),
    ...(input.sourceAuthority !== undefined &&
    (input.sourceAuthority === "UNKNOWN" || input.sourceAuthority === "LOW")
      ? ["LOW_SOURCE_AUTHORITY"]
      : []),
    ...(input.consistency !== undefined &&
    (input.consistency === "UNKNOWN" ||
      input.consistency === "INCONSISTENT" ||
      input.consistency === "CONFLICTING")
      ? ["INCONSISTENT_DATA"]
      : []),
  ];
  const weights = definition.weights ?? {};
  const weightedTotal = Object.entries(components).reduce<
    DecimalResult<DecimalString>
  >(
    (sum, [name, value]) => {
      if (!sum.ok) return sum;
      const weight =
        weights[name as QualityComponentName] ?? ("1" as DecimalString);
      const validatedWeight = qualityDecimal(weight, `${name}_WEIGHT`);
      const term = multiplyDecimalStrings(value, validatedWeight);
      return term.ok ? addDecimalStrings(sum.value, term.value) : term;
    },
    { ok: true, value: "0" as DecimalString },
  );
  if (!weightedTotal.ok) throw new Error("QUALITY_SCORE_ARITHMETIC_FAILED");
  const thresholds =
    definition.thresholds ?? DEFAULT_DATA_QUALITY_POLICY.definition.thresholds!;
  const gradeA = qualityDecimal(thresholds.gradeA, "GRADE_A_THRESHOLD");
  const gradeB = qualityDecimal(thresholds.gradeB, "GRADE_B_THRESHOLD");
  const gradeC = qualityDecimal(thresholds.gradeC, "GRADE_C_THRESHOLD");
  const orderedThresholds = subtractDecimalStrings(gradeA, gradeB);
  const orderedLowerThresholds = subtractDecimalStrings(gradeB, gradeC);
  if (
    !orderedThresholds.ok ||
    orderedThresholds.value.startsWith("-") ||
    !orderedLowerThresholds.ok ||
    orderedLowerThresholds.value.startsWith("-")
  )
    throw new Error("INVALID_QUALITY_POLICY_THRESHOLDS");
  const atLeast = (threshold: DecimalString) => {
    const result = subtractDecimalStrings(weightedTotal.value, threshold);
    if (!result.ok) throw new Error("QUALITY_POLICY_INVALID");
    return !result.value.startsWith("-");
  };
  const score = atLeast(gradeA)
    ? ("1" as DecimalString)
    : atLeast(gradeB)
      ? ("0.75" as DecimalString)
      : atLeast(gradeC)
        ? ("0.5" as DecimalString)
        : ("0" as DecimalString);
  const grade: QualityGrade =
    score === "1" ? "A" : score === "0.75" ? "B" : score === "0.5" ? "C" : "F";
  return Object.freeze({
    policyVersion: policy.policyVersion,
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
