import {
  addDecimalStrings,
  divideDecimalStrings,
  multiplyDecimalStrings,
  probability,
  subtractDecimalStrings,
  type DecimalResult,
  type DecimalString,
} from "@velyq/decimal";

export type Sport = "FOOTBALL" | "BASKETBALL";
export type CanonicalMarket =
  | "MATCH_WINNER_1X2"
  | "DOUBLE_CHANCE"
  | "DRAW_NO_BET"
  | "ASIAN_HANDICAP"
  | "TOTAL_GOALS"
  | "BTTS"
  | "TEAM_TOTAL"
  | "MONEYLINE"
  | "SPREAD"
  | "TOTAL_POINTS";
export type OddsObservationV3 = Readonly<{
  sport: Sport;
  eventId: string;
  competitionId: string;
  bookmakerId: string;
  market: CanonicalMarket | "UNMAPPED";
  providerMarket: string;
  selection: string;
  line?: string;
  decimalOdds: DecimalString;
  providerObservedAt: string;
  ingestedAt: string;
  provider: string;
  sourceReference: string;
}>;
export function orderObservations(
  observations: readonly OddsObservationV3[],
): readonly OddsObservationV3[] {
  return [...observations].sort(
    (a, b) =>
      Date.parse(a.providerObservedAt) - Date.parse(b.providerObservedAt) ||
      a.sourceReference.localeCompare(b.sourceReference),
  );
}
export function deduplicateObservations(
  observations: readonly OddsObservationV3[],
): readonly OddsObservationV3[] {
  const seen = new Set<string>();
  return orderObservations(observations).filter((item) => {
    const key = [
      item.sport,
      item.eventId,
      item.bookmakerId,
      item.providerMarket,
      item.selection,
      item.line ?? "",
      item.providerObservedAt,
      item.decimalOdds,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type DeVigMethod = "MULTIPLICATIVE" | "POWER" | "SHIN";
export type MarketProbabilityRange = Readonly<{
  low: DecimalString;
  central: DecimalString;
  high: DecimalString;
  method: DeVigMethod;
}>;
function sum(values: readonly DecimalString[]): DecimalResult<DecimalString> {
  let result = "0" as DecimalString;
  for (const value of values) {
    const next = addDecimalStrings(result, value);
    if (!next.ok) return next;
    result = next.value;
  }
  return { ok: true, value: result };
}
/**
 * De-vigs a set of already-implied probabilities (`1/odds`, not the odds
 * themselves — see `@velyq/market-semantics`'s `devig` module for the
 * odds-based equivalent used elsewhere).
 *
 * The POWER and SHIN branches here previously did not solve for anything:
 * POWER halved every input and SHIN multiplied every input by a fixed 0.99,
 * then both divided by `total` — the sum of the *original, untransformed*
 * inputs. Since neither transform preserves the sum, the results summed to
 * 0.5 (POWER) or 0.99 (SHIN), not 1: every "de-vigged" probability this
 * function ever returned for those two methods understated every outcome by
 * a fixed, market-independent factor, silently. Nothing in this codebase
 * called this function outside its own (nonexistent) tests, so nothing live
 * was ever affected — but the function was wrong on its own terms.
 *
 * Both methods now actually solve for the parameter that makes the outputs
 * sum to 1, matching `@velyq/market-semantics`'s odds-based implementations
 * exactly (POWER: `sum(p_i^k) = 1`; SHIN: the standard closed-form-per-`z`
 * relation), just operating on implied probabilities directly instead of
 * odds.
 */
export function deVig(
  rawImplied: readonly DecimalString[],
  method: DeVigMethod = "MULTIPLICATIVE",
): DecimalResult<readonly DecimalString[]> {
  if (rawImplied.length === 0)
    return {
      ok: false,
      error: {
        code: "INVALID_DECIMAL",
        message: "Probabilities are required.",
      },
    };
  const total = sum(rawImplied);
  if (!total.ok) return total;
  const implied = rawImplied.map(Number);
  const rawSum = implied.reduce((a, b) => a + b, 0);
  if (method === "MULTIPLICATIVE") {
    const output: DecimalString[] = [];
    for (const raw of rawImplied) {
      const normalized = divideDecimalStrings(raw, total.value);
      if (!normalized.ok) return normalized;
      output.push(normalized.value);
    }
    return { ok: true, value: output };
  }
  if (rawSum <= 1) {
    return {
      ok: false,
      error: {
        code: "OUT_OF_RANGE",
        message:
          "Probabilities imply zero or negative overround; not a de-vig-able book.",
      },
    };
  }
  const fair =
    method === "POWER" ? powerDevig(implied) : shinDevig(implied, rawSum);
  return toDecimalOutput(fair);
}

function toDecimalOutput(
  values: readonly number[],
): DecimalResult<readonly DecimalString[]> {
  const output = values.map((value) => {
    const fixed = value.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
    return (fixed === "" ? "0" : fixed) as DecimalString;
  });
  return { ok: true, value: output };
}

/** Solves `sum(implied_i ^ k) = 1` for `k` via bisection; see
    `@velyq/market-semantics`'s `devigPower` for the full reasoning. */
function powerDevig(implied: readonly number[]): number[] {
  const sumAtK = (k: number) => implied.reduce((s, p) => s + p ** k, 0);
  let low = 1;
  let high = 64;
  for (let i = 0; i < 200 && sumAtK(high) > 1; i += 1) high *= 2;
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (sumAtK(mid) > 1) low = mid;
    else high = mid;
  }
  const k = (low + high) / 2;
  return implied.map((p) => p ** k);
}

/** Solves for the Shin insider-fraction `z`; see `@velyq/market-semantics`'s
    `devigShin` for the full reasoning. */
function shinDevig(implied: readonly number[], rawSum: number): number[] {
  const probabilitiesAtZ = (z: number) =>
    implied.map((p) => {
      const radicand = z * z + (4 * (1 - z) * (p * p)) / rawSum;
      return (Math.sqrt(Math.max(radicand, 0)) - z) / (2 * (1 - z));
    });
  const sumAtZ = (z: number) => probabilitiesAtZ(z).reduce((a, b) => a + b, 0);
  let low = 0;
  let high = 0.999999;
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (sumAtZ(mid) > 1) low = mid;
    else high = mid;
  }
  return probabilitiesAtZ((low + high) / 2);
}
export function probabilityRange(
  rawImplied: readonly DecimalString[],
): DecimalResult<MarketProbabilityRange> {
  const low = deVig(rawImplied, "POWER");
  const central = deVig(rawImplied, "MULTIPLICATIVE");
  const high = deVig(rawImplied, "SHIN");
  if (!low.ok) return low;
  if (!central.ok) return central;
  if (!high.ok) return high;
  return {
    ok: true,
    value: {
      low: low.value[0]!,
      central: central.value[0]!,
      high: high.value[0]!,
      method: "MULTIPLICATIVE",
    },
  };
}

export type MarketPrior = Readonly<{
  sport: Sport;
  market: CanonicalMarket;
  probability: DecimalString;
  method: "MARKET_ONLY" | "MODEL_ONLY" | "MARKET_PLUS_MODEL";
  policyVersion: string;
}>;
export type ProbabilityUncertainty = Readonly<{
  pointProbability: DecimalString;
  lowerProbabilityBound: DecimalString | null;
  upperProbabilityBound: DecimalString | null;
  uncertaintyMethod:
    | "UNCERTAINTY_UNAVAILABLE"
    | "POSTERIOR"
    | "ENSEMBLE_DISPERSION"
    | "BOOTSTRAP";
}>;
export function robustMetrics(
  input: Readonly<{
    model: ProbabilityUncertainty;
    marketHigh: DecimalString;
    odds: DecimalString;
  }>,
): DecimalResult<
  Readonly<{
    robustProbabilityEdge: DecimalString | null;
    pointEV: DecimalString;
    robustEV: DecimalString | null;
    fairOddsPoint: DecimalString;
    fairOddsConservative: DecimalString | null;
  }>
> {
  const p = probability(input.model.pointProbability);
  if (!p.ok) return p;
  const pointEV = multiplyDecimalStrings(
    input.model.pointProbability,
    input.odds,
  );
  if (!pointEV.ok) return pointEV;
  const ev = subtractDecimalStrings(pointEV.value, "1" as DecimalString);
  if (!ev.ok) return ev;
  const fair = divideDecimalStrings(
    "1" as DecimalString,
    input.model.pointProbability,
  );
  if (!fair.ok) return fair;
  if (!input.model.lowerProbabilityBound)
    return {
      ok: true,
      value: {
        robustProbabilityEdge: null,
        pointEV: ev.value,
        robustEV: null,
        fairOddsPoint: fair.value,
        fairOddsConservative: null,
      },
    };
  const lower = probability(input.model.lowerProbabilityBound);
  if (!lower.ok) return lower;
  const robustEdge = subtractDecimalStrings(
    input.model.lowerProbabilityBound,
    input.marketHigh,
  );
  if (!robustEdge.ok) return robustEdge;
  const robustProduct = multiplyDecimalStrings(
    input.model.lowerProbabilityBound,
    input.odds,
  );
  if (!robustProduct.ok) return robustProduct;
  const robustEV = subtractDecimalStrings(
    robustProduct.value,
    "1" as DecimalString,
  );
  if (!robustEV.ok) return robustEV;
  const conservativeFair = divideDecimalStrings(
    "1" as DecimalString,
    input.model.lowerProbabilityBound,
  );
  if (!conservativeFair.ok) return conservativeFair;
  return {
    ok: true,
    value: {
      robustProbabilityEdge: robustEdge.value,
      pointEV: ev.value,
      robustEV: robustEV.value,
      fairOddsPoint: fair.value,
      fairOddsConservative: conservativeFair.value,
    },
  };
}

export type FortressPolicy = Readonly<{
  version: "fortress.v1";
  minimumRobustEdge: DecimalString;
  minimumRobustEV: DecimalString;
  minimumCoverage: number;
}>;
export const FORTRESS_POLICY: FortressPolicy = {
  version: "fortress.v1",
  minimumRobustEdge: "0" as DecimalString,
  minimumRobustEV: "0" as DecimalString,
  minimumCoverage: 2,
};
export type FortressInput = Readonly<{
  robustEdge: DecimalString | null;
  robustEV: DecimalString | null;
  fresh: boolean;
  bookmakerCoverage: number;
  uncertaintyAvailable: boolean;
  evidenceAvailable: boolean;
  mappingConfidence: "HIGH" | "LOW";
  modelMaturity:
    "EXPERIMENTAL" | "SHADOW" | "VALIDATED" | "PILOT" | "PRODUCTION";
  criticalRisk: boolean;
  priceValid: boolean;
  /**
   * Whether a confirmed starting eleven backs this selection.
   *
   * FORTRESS is the grade that claims the evidence is as complete as it will
   * ever get before kickoff, and before the XI is published it demonstrably
   * is not: a keeper rested or a striker benched moves a 1X2 price further
   * than most of what the model measures. A competition the provider does not
   * cover for lineups therefore cannot reach FORTRESS at all — that is the
   * intended consequence, not an oversight, and the honest alternative to
   * awarding the top grade on evidence nobody has.
   */
  lineupConfirmed: boolean;
}>;
export function isFortress(
  input: FortressInput,
  policy = FORTRESS_POLICY,
): boolean {
  return (
    input.robustEdge !== null &&
    input.robustEV !== null &&
    !input.robustEdge.startsWith("-") &&
    !input.robustEV.startsWith("-") &&
    input.fresh &&
    input.bookmakerCoverage >= policy.minimumCoverage &&
    input.uncertaintyAvailable &&
    input.evidenceAvailable &&
    input.mappingConfidence === "HIGH" &&
    input.modelMaturity !== "EXPERIMENTAL" &&
    !input.criticalRisk &&
    input.priceValid &&
    input.lineupConfirmed
  );
}

export type EnsembleMember = Readonly<{
  sport: Sport;
  market: CanonicalMarket;
  modelName: string;
  modelVersion: string;
  trainingCutoff: string;
  probability: DecimalString;
  calibrationState: "UNCALIBRATED" | "CALIBRATED";
  sampleSize: number;
}>;
export function ensembleDisagreement(
  members: readonly EnsembleMember[],
): DecimalResult<DecimalString> {
  if (members.length < 2)
    return {
      ok: false,
      error: {
        code: "INVALID_DECIMAL",
        message: "At least two ensemble members are required.",
      },
    };
  const values = members.map((member) => member.probability);
  const max = values.reduce((a, b) => (Number(a) > Number(b) ? a : b));
  const min = values.reduce((a, b) => (Number(a) < Number(b) ? a : b));
  return subtractDecimalStrings(max, min);
}
export type ModelMaturity = Readonly<{
  sport: Sport;
  competition: string;
  market: CanonicalMarket;
  model: string;
  state: "EXPERIMENTAL" | "SHADOW" | "VALIDATED" | "PILOT" | "PRODUCTION";
}>;
export type FootballModelFoundation =
  "DIXON_COLES" | "DYNAMIC_POISSON" | "ELO" | "MARKET_PRIOR";
export type BasketballModelFoundation =
  | "OFFENSIVE_STRENGTH"
  | "DEFENSIVE_STRENGTH"
  | "PACE"
  | "REST"
  | "MARKET_PRIOR";

export type MarketPressure = Readonly<{
  breadth: DecimalString;
  magnitude: DecimalString;
  velocity: DecimalString;
  persistence: DecimalString;
  dispersion: DecimalString;
  leadLag: DecimalString;
  reversal: DecimalString;
  freshness: "FRESH" | "STALE";
  interaction:
    | "MARKET_CONFIRMING_MODEL"
    | "MARKET_MOVING_AGAINST_MODEL"
    | "PRICE_ESCAPING"
    | "PRICE_STILL_VALID"
    | "EDGE_DISAPPEARED"
    | "MIXED";
}>;
export function marketPressure(
  input: Readonly<{
    opening: DecimalString;
    current: DecimalString;
    windowSeconds: number;
    bookmakersMoving: number;
    bookmakersTotal: number;
    fresh: boolean;
    modelLikesDirection: boolean;
    robustThreshold: DecimalString;
  }>,
): DecimalResult<MarketPressure> {
  const movement = subtractDecimalStrings(input.current, input.opening);
  if (!movement.ok) return movement;
  const absolute = movement.value.startsWith("-")
    ? (movement.value.slice(1) as DecimalString)
    : movement.value;
  const velocity = divideDecimalStrings(
    absolute,
    String(input.windowSeconds) as DecimalString,
  );
  if (!velocity.ok) return velocity;
  const breadth = divideDecimalStrings(
    String(input.bookmakersMoving) as DecimalString,
    String(input.bookmakersTotal) as DecimalString,
  );
  if (!breadth.ok) return breadth;
  const currentVsThreshold = subtractDecimalStrings(
    input.current,
    input.robustThreshold,
  );
  if (!currentVsThreshold.ok) return currentVsThreshold;
  const escaped = currentVsThreshold.value.startsWith("-");
  const interaction = escaped
    ? "PRICE_ESCAPING"
    : input.modelLikesDirection
      ? "MARKET_CONFIRMING_MODEL"
      : "MARKET_MOVING_AGAINST_MODEL";
  return {
    ok: true,
    value: {
      breadth: breadth.value,
      magnitude: absolute,
      velocity: velocity.value,
      persistence: breadth.value,
      dispersion: "0" as DecimalString,
      leadLag: "0" as DecimalString,
      reversal: "0" as DecimalString,
      freshness: input.fresh ? "FRESH" : "STALE",
      interaction,
    },
  };
}

export type CoherenceResidual = Readonly<{
  market: CanonicalMarket;
  marketObservedProbability: DecimalString;
  coherentImpliedProbability: DecimalString;
  residual: DecimalString;
  status: "CONSISTENT" | "COHERENCE_ANOMALY_CANDIDATE";
}>;
export function coherenceResidual(
  input: Readonly<{
    market: CanonicalMarket;
    observed: DecimalString;
    coherent: DecimalString;
    threshold?: DecimalString;
  }>,
): DecimalResult<CoherenceResidual> {
  const residual = subtractDecimalStrings(input.observed, input.coherent);
  if (!residual.ok) return residual;
  const absolute = residual.value.startsWith("-")
    ? (residual.value.slice(1) as DecimalString)
    : residual.value;
  const over = subtractDecimalStrings(
    absolute,
    input.threshold ?? ("0.05" as DecimalString),
  );
  if (!over.ok) return over;
  return {
    ok: true,
    value: {
      market: input.market,
      marketObservedProbability: input.observed,
      coherentImpliedProbability: input.coherent,
      residual: residual.value,
      status: over.value.startsWith("-")
        ? "CONSISTENT"
        : "COHERENCE_ANOMALY_CANDIDATE",
    },
  };
}

export type ArbResult = Readonly<{
  status: "ARB_THEORETICAL" | "ARB_EXECUTION_RISK" | "ARB_INVALID";
  impliedSum: DecimalString;
  reasons: readonly string[];
}>;
export function detectArbitrage(
  bestOdds: readonly DecimalString[],
  semanticsMatch: boolean,
  fresh: boolean,
): DecimalResult<ArbResult> {
  if (bestOdds.length < 2 || !semanticsMatch)
    return {
      ok: true,
      value: {
        status: "ARB_INVALID",
        impliedSum: "0" as DecimalString,
        reasons: ["MARKET_SEMANTICS_MISMATCH"],
      },
    };
  const implied: DecimalString[] = [];
  for (const odds of bestOdds) {
    const value = divideDecimalStrings("1" as DecimalString, odds);
    if (!value.ok) return value;
    implied.push(value.value);
  }
  const total = sum(implied);
  if (!total.ok) return total;
  const under = subtractDecimalStrings(total.value, "1" as DecimalString);
  if (!under.ok) return under;
  return {
    ok: true,
    value: {
      status: under.value.startsWith("-")
        ? fresh
          ? "ARB_THEORETICAL"
          : "ARB_EXECUTION_RISK"
        : "ARB_INVALID",
      impliedSum: total.value,
      reasons: fresh ? [] : ["STALE_PRICE"],
    },
  };
}

export type WalkForwardWindow = Readonly<{
  trainStart: string;
  trainEnd: string;
  validationStart: string;
  validationEnd: string;
  holdoutStart: string;
  holdoutEnd: string;
  embargoSeconds: number;
}>;
export type ResearchExperiment = Readonly<{
  hypothesisId: string;
  registeredAt: string;
  trainWindow: WalkForwardWindow;
  marketsTested: readonly CanonicalMarket[];
  parametersTested: readonly string[];
  result: "UNRUN" | "PASSED" | "FAILED";
}>;
export function isWalkForwardValid(window: WalkForwardWindow): boolean {
  return (
    Date.parse(window.trainEnd) <= Date.parse(window.validationStart) &&
    Date.parse(window.validationEnd) <= Date.parse(window.holdoutStart)
  );
}
export function benjaminiHochberg(
  pValues: readonly DecimalString[],
  falseDiscoveryRate: DecimalString,
): readonly DecimalString[] {
  return [...pValues]
    .sort((a, b) => Number(a) - Number(b))
    .filter(
      (p, index) =>
        Number(p) <=
        (Number(falseDiscoveryRate) * (index + 1)) / pValues.length,
    );
}
export type BettingFlowProvider = Readonly<{
  status: "UNAVAILABLE";
  getFlow: never;
}>;
export type ExchangeMarketProvider = Readonly<{
  status: "UNAVAILABLE";
  getMarket: never;
}>;
export type ProviderQuotaState =
  "HEALTHY" | "CONSERVE" | "CRITICAL" | "EXHAUSTED";
export function quotaState(
  remaining: number,
  limit: number,
): ProviderQuotaState {
  if (remaining <= 0) return "EXHAUSTED";
  if (remaining / limit < 0.1) return "CRITICAL";
  if (remaining / limit < 0.3) return "CONSERVE";
  return "HEALTHY";
}
export type PriceTimingObservation = Readonly<{
  observedAt: string;
  secondsToEvent: number;
  odds: DecimalString;
  decision: "BET_NOW" | "WAIT" | "PASS";
  validated: false;
}>;
export type ForecastIntegrityLedgerEntry = Readonly<{
  predictionId: string;
  generatedAt: string;
  featureCutoff: string;
  marketCutoff: string;
  modelVersion: string;
  frozen: true;
}>;
export type ExposureGroup = Readonly<{
  eventId: string;
  marketFamily: string;
  selection: string;
  correlatedPredictionIds: readonly string[];
}>;
