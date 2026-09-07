import {
  addDecimalStrings,
  decimalOdds,
  divideDecimalStrings,
  edge,
  expectedValue,
  multiplyDecimalStrings,
  probability,
  subtractDecimalStrings,
  type DecimalResult,
  type DecimalString,
} from "@velyq/decimal";

function bounded(value: DecimalString): DecimalResult<DecimalString> {
  const [whole, fraction] = value.split(".");
  const normalized =
    fraction === undefined
      ? value
      : `${whole}.${fraction.slice(0, 12)}`
          .replace(/0+$/, "")
          .replace(/\.$/, "");
  return { ok: true, value: normalized as DecimalString };
}

export type PriceState =
  "ATTRACTIVE" | "MARGINAL" | "AT_FAIR" | "BELOW_FAIR" | "UNAVAILABLE";
export type DecisionState =
  | "STRONG_EDGE"
  | "EDGE"
  | "WATCH"
  | "WAIT"
  | "WAIT_FOR_LINEUP"
  | "NO_BET"
  | "INSUFFICIENT_DATA"
  | "EDGE_DISAPPEARED";
export type RiskFlag =
  | "LINEUP_RISK"
  | "PRICE_RISK"
  | "STALE_DATA_RISK"
  | "LOW_COVERAGE_RISK"
  | "MAPPING_RISK"
  | "MODEL_MATURITY_RISK";

export type PriceValidity = Readonly<{
  currentOdds: DecimalString;
  fairOdds: DecimalString;
  minimumViableOdds: DecimalString;
  priceMargin: DecimalString;
  priceState: PriceState;
}>;

export function priceValidity(
  modelProbability: DecimalString,
  currentOdds: DecimalString,
  margin: DecimalString = "0.02" as DecimalString,
): DecimalResult<PriceValidity> {
  const p = probability(modelProbability);
  const odds = decimalOdds(currentOdds);
  if (!p.ok) return p;
  if (!odds.ok) return odds;
  const fair = divideDecimalStrings("1" as DecimalString, modelProbability);
  if (!fair.ok) return fair;
  const onePlus = addDecimalStrings("1" as DecimalString, margin);
  if (!onePlus.ok) return onePlus;
  const minimum = multiplyDecimalStrings(fair.value, onePlus.value);
  if (!minimum.ok) return minimum;
  const priceMargin = subtractDecimalStrings(currentOdds, fair.value);
  if (!priceMargin.ok) return priceMargin;
  const marginFromMinimum = subtractDecimalStrings(currentOdds, minimum.value);
  if (!marginFromMinimum.ok) return marginFromMinimum;
  const state: PriceState = marginFromMinimum.value.startsWith("-")
    ? priceMargin.value.startsWith("-")
      ? "BELOW_FAIR"
      : "AT_FAIR"
    : "ATTRACTIVE";
  return {
    ok: true,
    value: {
      currentOdds,
      fairOdds: fair.value,
      minimumViableOdds: minimum.value,
      priceMargin: priceMargin.value,
      priceState: state,
    },
  };
}

export type PriceSensitivityPoint = Readonly<{
  odds: DecimalString;
  impliedProbability: DecimalString;
  probabilityEdge: DecimalString;
  expectedValue: DecimalString;
  priceState: PriceState;
}>;

export function priceSensitivity(
  modelProbability: DecimalString,
  candidates: readonly DecimalString[],
): DecimalResult<readonly PriceSensitivityPoint[]> {
  const points: PriceSensitivityPoint[] = [];
  for (const odds of candidates) {
    const metrics = priceValidity(modelProbability, odds);
    if (!metrics.ok) return metrics;
    const implied = divideDecimalStrings("1" as DecimalString, odds);
    if (!implied.ok) return implied;
    const product = multiplyDecimalStrings(modelProbability, odds);
    if (!product.ok) return product;
    const ev = subtractDecimalStrings(product.value, "1" as DecimalString);
    if (!ev.ok) return ev;
    const probabilityEdge = subtractDecimalStrings(
      modelProbability,
      implied.value,
    );
    if (!probabilityEdge.ok) return probabilityEdge;
    const boundedEv = bounded(ev.value);
    const boundedProbabilityEdge = bounded(probabilityEdge.value);
    if (!boundedEv.ok) return boundedEv;
    if (!boundedProbabilityEdge.ok) return boundedProbabilityEdge;
    const checkedEv = expectedValue(boundedEv.value);
    const checkedEdge = edge(boundedProbabilityEdge.value);
    if (!checkedEv.ok) return checkedEv;
    if (!checkedEdge.ok) return checkedEdge;
    points.push({
      odds,
      impliedProbability: implied.value,
      probabilityEdge: checkedEdge.value.value,
      expectedValue: checkedEv.value.value,
      priceState: metrics.value.priceState,
    });
  }
  return { ok: true, value: points };
}

export type DecisionInput = Readonly<{
  modelProbability?: DecimalString;
  currentOdds?: DecimalString;
  qualityScore: DecimalString;
  lineup: "EXPECTED" | "OFFICIAL" | "MISSING" | "CHANGED";
  stale: boolean;
  coverage: number;
  mappingConfidence: "HIGH" | "LOW";
  modelMaturity: "EXPERIMENTAL" | "BACKTESTED" | "VALIDATED" | "PRODUCTION";
  observationCount: number;
}>;
export type DecisionResult = Readonly<{
  decision: DecisionState;
  reasonCodes: readonly string[];
  warnings: readonly string[];
  riskFlags: readonly RiskFlag[];
  quality: DecimalString;
  price: PriceValidity | null;
  invalidationConditions: readonly string[];
  policyVersion: string;
  updatedAt: string;
}>;

export function decide(
  input: DecisionInput,
  updatedAt: string,
  policyVersion = "decision.v1",
): DecimalResult<DecisionResult> {
  const reasons: string[] = [];
  const risks: RiskFlag[] = [];
  const warnings: string[] = [];
  if (input.stale) {
    reasons.push("STALE_PRICE");
    risks.push("STALE_DATA_RISK");
  }
  if (input.coverage < 1) {
    reasons.push("INSUFFICIENT_COVERAGE");
    risks.push("LOW_COVERAGE_RISK");
  }
  if (input.mappingConfidence === "LOW") {
    reasons.push("LOW_MAPPING_CONFIDENCE");
    risks.push("MAPPING_RISK");
  }
  if (input.modelMaturity === "EXPERIMENTAL") risks.push("MODEL_MATURITY_RISK");
  if (input.lineup === "MISSING" || input.lineup === "CHANGED") {
    reasons.push("LINEUP_NOT_CONFIRMED");
    risks.push("LINEUP_RISK");
  }
  const price =
    input.modelProbability && input.currentOdds
      ? priceValidity(input.modelProbability, input.currentOdds)
      : null;
  if (price && !price.ok) return price;
  if (
    !input.modelProbability ||
    !input.currentOdds ||
    input.observationCount < 1
  )
    return {
      ok: true,
      value: {
        decision: "INSUFFICIENT_DATA",
        reasonCodes: [...reasons, "MISSING_PRICE"],
        warnings,
        riskFlags: risks,
        quality: input.qualityScore,
        price: null,
        invalidationConditions: ["PRICE_OBSERVED", "MODEL_AVAILABLE"],
        policyVersion,
        updatedAt,
      },
    };
  const metrics = price!.value;
  const value = priceSensitivity(input.modelProbability, [input.currentOdds]);
  if (!value.ok) return value;
  const point = value.value[0]!;
  const negative = point.expectedValue.startsWith("-");
  const decision: DecisionState = input.stale
    ? "WAIT"
    : input.lineup === "MISSING" || input.lineup === "CHANGED"
      ? "WAIT_FOR_LINEUP"
      : negative
        ? "NO_BET"
        : metrics.priceState === "ATTRACTIVE"
          ? "EDGE"
          : "WATCH";
  if (negative) reasons.push("PRICE_TOO_SHORT");
  if (decision === "WATCH") risks.push("PRICE_RISK");
  return {
    ok: true,
    value: {
      decision,
      reasonCodes: reasons,
      warnings:
        input.modelMaturity === "EXPERIMENTAL"
          ? ["DEVELOPMENT_HEURISTIC"]
          : warnings,
      riskFlags: risks,
      quality: input.qualityScore,
      price: metrics,
      invalidationConditions: [
        "PRICE_BELOW_FAIR_THRESHOLD",
        "STALE_PRICE",
        "LINEUP_CHANGED",
        "QUALITY_DOWNGRADED",
      ],
      policyVersion,
      updatedAt,
    },
  };
}

export type Scenario = Readonly<{
  name: string;
  before: DecisionInput;
  after: DecisionInput;
  at: string;
}>;
export function runScenario(
  scenario: Scenario,
): DecimalResult<Readonly<{ before: DecisionResult; after: DecisionResult }>> {
  const before = decide(scenario.before, scenario.at);
  if (!before.ok) return before;
  const after = decide(scenario.after, scenario.at);
  if (!after.ok) return after;
  return { ok: true, value: { before: before.value, after: after.value } };
}

export type DecisionSnapshot = Readonly<{
  id: string;
  decision: DecisionState;
  price: DecimalString | null;
  modelProbability: DecimalString | null;
  expectedValue: DecimalString | null;
  edge: DecimalString | null;
  quality: DecimalString;
  riskFlags: readonly RiskFlag[];
  reasonCodes: readonly string[];
  timestamp: string;
  modelVersion: string;
  policyVersions: Readonly<Record<string, string>>;
  dataCutoff: string;
}>;
export type DecisionChange = Readonly<{
  kind:
    | "PRICE_CHANGED"
    | "MODEL_CHANGED"
    | "DECISION_CHANGED"
    | "EDGE_CHANGED"
    | "EV_CHANGED"
    | "QUALITY_CHANGED"
    | "RISK_CHANGED";
  before: string | null;
  after: string | null;
}>;
export function diffDecisions(
  before: DecisionSnapshot,
  after: DecisionSnapshot,
): readonly DecisionChange[] {
  const changes: DecisionChange[] = [];
  const compare = (
    kind: DecisionChange["kind"],
    a: string | null,
    b: string | null,
  ) => {
    if (a !== b) changes.push({ kind, before: a, after: b });
  };
  compare("PRICE_CHANGED", before.price, after.price);
  compare("MODEL_CHANGED", before.modelProbability, after.modelProbability);
  compare("DECISION_CHANGED", before.decision, after.decision);
  compare("EDGE_CHANGED", before.edge, after.edge);
  compare("EV_CHANGED", before.expectedValue, after.expectedValue);
  compare("QUALITY_CHANGED", before.quality, after.quality);
  if (before.riskFlags.join(",") !== after.riskFlags.join(","))
    changes.push({
      kind: "RISK_CHANGED",
      before: before.riskFlags.join(","),
      after: after.riskFlags.join(","),
    });
  return changes;
}

export type LifecycleTransition = Readonly<{
  from: DecisionState;
  to: DecisionState;
}>;
const allowedTransitions: readonly LifecycleTransition[] = [
  { from: "WATCH", to: "EDGE" },
  { from: "EDGE", to: "WAIT_FOR_LINEUP" },
  { from: "WAIT_FOR_LINEUP", to: "EDGE" },
  { from: "EDGE", to: "EDGE_DISAPPEARED" },
  { from: "EDGE_DISAPPEARED", to: "WATCH" },
  { from: "WATCH", to: "WAIT" },
  { from: "WAIT", to: "EDGE" },
];
export function validateLifecycleTransition(
  transition: LifecycleTransition,
): boolean {
  return allowedTransitions.some(
    (candidate) =>
      candidate.from === transition.from && candidate.to === transition.to,
  );
}

export type MarketObservation = Readonly<{
  bookmaker: string;
  odds: DecimalString;
  observedAt: string;
  ingestedAt: string;
  providerReference: string;
}>;
export type MarketSummary = Readonly<{
  bestOdds: DecimalString;
  medianOdds: DecimalString;
  minOdds: DecimalString;
  maxOdds: DecimalString;
  bookmakerCount: number;
  dispersion: DecimalString;
  normalizedProbability: DecimalString;
  outlierCandidates: readonly string[];
}>;
export function summarizeMarket(
  observations: readonly MarketObservation[],
): DecimalResult<MarketSummary> {
  if (observations.length === 0)
    return {
      ok: false,
      error: {
        code: "INVALID_DECIMAL",
        message: "At least one market observation is required.",
      },
    };
  const ordered = [...observations].sort(
    (a, b) => Number(a.odds) - Number(b.odds),
  );
  const min = ordered[0]!.odds;
  const max = ordered[ordered.length - 1]!.odds;
  const median = ordered[Math.floor((ordered.length - 1) / 2)]!.odds;
  const dispersion = subtractDecimalStrings(max, min);
  if (!dispersion.ok) return dispersion;
  const implied = ordered.map((item) =>
    divideDecimalStrings("1" as DecimalString, item.odds),
  );
  if (implied.some((item) => !item.ok))
    return implied.find((item) => !item.ok)! as DecimalResult<MarketSummary>;
  let total = "0" as DecimalString;
  for (const item of implied) {
    const result = addDecimalStrings(
      total,
      item.ok ? item.value : ("0" as DecimalString),
    );
    if (!result.ok) return result;
    total = result.value;
  }
  const first = implied[0];
  if (!first?.ok) return first as DecimalResult<MarketSummary>;
  const normalized = divideDecimalStrings(first.value, total);
  if (!normalized.ok) return normalized;
  return {
    ok: true,
    value: {
      bestOdds: max,
      medianOdds: median,
      minOdds: min,
      maxOdds: max,
      bookmakerCount: new Set(observations.map((item) => item.bookmaker)).size,
      dispersion: dispersion.value,
      normalizedProbability: normalized.value,
      outlierCandidates: [],
    },
  };
}

export type EvaluationSample = Readonly<{
  probability: DecimalString;
  result: boolean;
}>;
export function brierScore(
  samples: readonly EvaluationSample[],
): DecimalResult<DecimalString> {
  let total = "0" as DecimalString;
  for (const sample of samples) {
    const p = probability(sample.probability);
    if (!p.ok) return p;
    const target = sample.result ? "1" : "0";
    const diff = subtractDecimalStrings(
      sample.probability,
      target as DecimalString,
    );
    if (!diff.ok) return diff;
    const square = multiplyDecimalStrings(diff.value, diff.value);
    if (!square.ok) return square;
    const sum = addDecimalStrings(total, square.value);
    if (!sum.ok) return sum;
    total = sum.value;
  }
  return samples.length === 0
    ? {
        ok: false,
        error: { code: "INVALID_DECIMAL", message: "Samples are required." },
      }
    : divideDecimalStrings(total, String(samples.length) as DecimalString);
}

export type HistoricalObservation = Readonly<{
  observedAt: string;
  featureCutoff: string;
  marketObservationCutoff: string;
}>;
export function isTemporallyValid(observation: HistoricalObservation): boolean {
  return (
    Date.parse(observation.observedAt) <=
      Date.parse(observation.featureCutoff) &&
    Date.parse(observation.observedAt) <=
      Date.parse(observation.marketObservationCutoff)
  );
}

export type PostMatchAutopsy = Readonly<{
  decisionQuality: "POSITIVE_EV" | "NEGATIVE_EV" | "UNKNOWN";
  matchResult: "WIN" | "LOSS" | "VOID" | "UNKNOWN";
  closingLineValue: DecimalString | null;
}>;
export function postMatchAutopsy(
  input: Readonly<{
    expectedValue: DecimalString | null;
    result: PostMatchAutopsy["matchResult"];
    decisionOdds: DecimalString;
    closingOdds?: DecimalString;
  }>,
): DecimalResult<PostMatchAutopsy> {
  const quality =
    input.expectedValue === null
      ? "UNKNOWN"
      : input.expectedValue.startsWith("-")
        ? "NEGATIVE_EV"
        : "POSITIVE_EV";
  if (!input.closingOdds)
    return {
      ok: true,
      value: {
        decisionQuality: quality,
        matchResult: input.result,
        closingLineValue: null,
      },
    };
  const clv = subtractDecimalStrings(input.closingOdds, input.decisionOdds);
  if (!clv.ok) return clv;
  return {
    ok: true,
    value: {
      decisionQuality: quality,
      matchResult: input.result,
      closingLineValue: clv.value,
    },
  };
}

export type AiAnalystProvider = Readonly<{
  enabled: false;
  explainMatch: never;
  explainEdge: never;
  explainMovement: never;
}>;
export const AI_ANALYST_ENABLED = false as const;
