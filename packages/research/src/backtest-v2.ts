import { devig, type DevigMethod } from "@velyq/market-semantics";
import type { DecimalString } from "@velyq/decimal";
import { fitDixonColes, type Hyperparameters } from "./dixon-coles.js";
import {
  applyTemperature,
  fitTemperature,
  type Calibrator,
} from "./calibration.js";
import {
  metricSet,
  type MetricSet,
  type ProbabilisticSample,
} from "./metrics.js";
import { planWalkForward } from "./walk-forward.js";
import {
  modelProbabilitiesFor,
  SUPPORTED_MARKETS,
  type CorpusMatch,
  type SupportedMarketCode,
} from "./backtest.js";
import {
  bucketDisagreement,
  ensemblePredict,
  fitMarketEnsemble,
  marketOnlyEnsemble,
  modelContribution,
  studyClosingLine,
  type ClosingLineStudy,
  type DisagreementBucket,
  type DisagreementRecord,
  type FittedEnsemble,
  type StackingSample,
} from "./market-ensemble.js";

/**
 * The walk-forward evaluation of the market-informed ensemble.
 *
 * The subtle part is what the stacker is allowed to learn from. It takes the
 * score model's probability as a feature, so training it on *in-sample* model
 * probabilities would teach it to trust a model that had already seen the
 * answers — and the resulting weights would look excellent and mean nothing.
 *
 * So this is two-stage and strictly ordered. Window w refits the score model
 * on matches before its cutoff and predicts window w's matches, exactly as the
 * v1 harness does. Those predictions go into a growing pool, and the stacker
 * evaluated on window w is fitted only on the pool from windows *before* it —
 * so every model probability it ever trains on was out of sample for the fit
 * that produced it.
 *
 * The closing price is never a feature. It is read only as an evaluation
 * target for the closing-line study, which asks a different question from
 * match outcome and is reported separately for that reason.
 */

export type EnsembleMarketReport = Readonly<{
  marketCode: SupportedMarketCode;
  outcomeCount: number;
  competitionCode: string;
  holdoutSamples: number;
  market: MetricSet | null;
  modelV1: MetricSet | null;
  modelV2: MetricSet | null;
  /** Negative means v2 is better than the market on that metric. */
  deltaLogLossVsMarket: number | null;
  deltaBrierVsMarket: number | null;
}>;

export type EnsembleVerdict =
  "IMPROVES_MARKET" | "MATCHES_MARKET" | "UNDERPERFORMS_MARKET";

export type EnsembleResult = Readonly<{
  generatedAt: string;
  walkForwardCutoffs: readonly string[];
  holdoutFrom: string;
  trainRecords: number;
  validationRecords: number;
  holdoutRecords: number;
  /** The stacker shipped for inference, fitted on everything pre-holdout. */
  ensembles: readonly Readonly<{
    marketCode: SupportedMarketCode;
    ensemble: FittedEnsemble;
    calibrator: Calibrator;
    modelContribution: number;
  }>[];
  perMarket: readonly EnsembleMarketReport[];
  disagreement: readonly Readonly<{
    marketCode: SupportedMarketCode;
    buckets: readonly DisagreementBucket[];
  }>[];
  closingLine: readonly Readonly<{
    marketCode: SupportedMarketCode;
    study: ClosingLineStudy;
  }>[];
  verdict: EnsembleVerdict;
  verdictReasons: readonly string[];
}>;

export type EnsembleOptions = Readonly<{
  initialTrainingDays: number;
  stepDays: number;
  holdoutFraction: number;
  hyperparameters?: Partial<Hyperparameters>;
  devigMethod?: DevigMethod;
  markets?: readonly SupportedMarketCode[];
  /**
   * Windows the stacker must not train on before it has a real pool. Early
   * windows carry very few rows and a stacker fitted on them is noise.
   */
  minimumStackingSamples?: number;
}>;

function observedIndexFor(
  market: SupportedMarketCode,
  match: CorpusMatch,
): number {
  const total = match.homeGoals + match.awayGoals;
  if (market === "FOOTBALL_FULL_TIME_1X2")
    return match.homeGoals > match.awayGoals
      ? 0
      : match.homeGoals === match.awayGoals
        ? 1
        : 2;
  if (market === "FOOTBALL_FULL_TIME_TOTAL") return total > 2.5 ? 0 : 1;
  return match.homeGoals > 0 && match.awayGoals > 0 ? 0 : 1;
}

function devigged(
  odds: readonly string[] | undefined,
  method: DevigMethod,
): readonly number[] | null {
  if (!odds || odds.length < 2) return null;
  const result = devig(method, odds as readonly DecimalString[]);
  return result.ok ? result.value.probabilities.map(Number) : null;
}

type PooledRow = Readonly<{
  competitionCode: string;
  marketCode: SupportedMarketCode;
  market: readonly number[];
  model: readonly number[];
  observedIndex: number;
  closing: readonly number[] | null;
  kickoffDate: string;
}>;

export function runEnsembleBacktest(
  matches: readonly CorpusMatch[],
  options: EnsembleOptions,
): EnsembleResult {
  const markets =
    options.markets ??
    (Object.keys(SUPPORTED_MARKETS) as readonly SupportedMarketCode[]);
  const devigMethod = options.devigMethod ?? "SHIN";
  const minimumStackingSamples = options.minimumStackingSamples ?? 2000;
  const sorted = [...matches].sort((left, right) =>
    left.kickoffDate === right.kickoffDate
      ? `${left.homeTeamKey}${left.awayTeamKey}`.localeCompare(
          `${right.homeTeamKey}${right.awayTeamKey}`,
        )
      : left.kickoffDate.localeCompare(right.kickoffDate),
  );
  const plan = planWalkForward(sorted, options);

  /* Everything scored, in window order, so the pool only ever looks back. */
  const pool: PooledRow[] = [];
  const holdoutRows: PooledRow[] = [];
  /* Per market: the v1 and v2 samples the holdout is judged on. */
  const scored = new Map<
    string,
    {
      market: ProbabilisticSample[];
      v1: ProbabilisticSample[];
      v2: ProbabilisticSample[];
      disagreement: DisagreementRecord[];
    }
  >();
  const bucketFor = (competitionCode: string, marketCode: string) => {
    const key = `${competitionCode}|${marketCode}`;
    const existing = scored.get(key) ?? {
      market: [],
      v1: [],
      v2: [],
      disagreement: [],
    };
    scored.set(key, existing);
    return existing;
  };

  const rowsFor = (
    training: readonly CorpusMatch[],
    predicted: readonly CorpusMatch[],
    cutoff: string,
  ): readonly PooledRow[] => {
    const model = fitDixonColes({
      matches: training,
      trainingCutoff: cutoff,
      ...(options.hyperparameters
        ? { hyperparameters: options.hyperparameters }
        : {}),
    });
    const rows: PooledRow[] = [];
    for (const market of markets) {
      const outcomes = SUPPORTED_MARKETS[market].outcomes;
      for (const match of predicted) {
        const marketPrior = devigged(
          match.preClosingAverageOdds[market],
          devigMethod,
        );
        const modelProbabilities = modelProbabilitiesFor(market, model, match);
        /*
         * Both features are required. A row with only one of them cannot
         * train a stacker whose whole subject is how the two combine, and
         * imputing the missing side would be inventing the very quantity
         * under test.
         */
        if (!marketPrior || !modelProbabilities) continue;
        if (marketPrior.length !== outcomes.length) continue;
        rows.push({
          competitionCode: match.competitionCode,
          marketCode: market,
          market: marketPrior,
          model: modelProbabilities,
          observedIndex: observedIndexFor(market, match),
          closing: devigged(match.closingAverageOdds?.[market], devigMethod),
          kickoffDate: match.kickoffDate,
        });
      }
    }
    return rows;
  };

  /*
   * Stackers are fitted per market on the pool of *earlier* windows only.
   * Refitting from scratch each window rather than updating keeps the fit
   * deterministic and keeps "what did this window's stacker know" answerable.
   */
  const stackerFor = (
    marketCode: SupportedMarketCode,
    upTo: readonly PooledRow[],
  ): FittedEnsemble => {
    const outcomeCount = SUPPORTED_MARKETS[marketCode].outcomes.length;
    const samples: StackingSample[] = upTo
      .filter((row) => row.marketCode === marketCode)
      .map((row) => ({
        market: row.market,
        model: row.model,
        observedIndex: row.observedIndex,
      }));
    return samples.length < minimumStackingSamples
      ? marketOnlyEnsemble(outcomeCount)
      : fitMarketEnsemble(samples, outcomeCount);
  };

  for (const window of plan.windows) {
    const training = sorted.filter(
      (match) => match.kickoffDate < window.trainingCutoff,
    );
    const predicted = sorted.filter(
      (match) =>
        match.kickoffDate >= window.predictFrom &&
        match.kickoffDate < window.predictUntil,
    );
    if (training.length === 0 || predicted.length === 0) continue;
    const rows = rowsFor(training, predicted, window.trainingCutoff);
    /*
     * Scored against the pool as it stood *before* this window, then added.
     * Reversing those two lines is the leak this harness exists to avoid.
     */
    for (const row of rows) pool.push(row);
  }

  const preHoldout = sorted.filter(
    (match) => match.kickoffDate < plan.holdoutFrom,
  );
  const holdoutMatches = sorted.filter(
    (match) => match.kickoffDate >= plan.holdoutFrom,
  );
  for (const row of rowsFor(preHoldout, holdoutMatches, plan.holdoutFrom))
    holdoutRows.push(row);

  const validationPool = pool.filter(
    (row) => row.kickoffDate < plan.holdoutFrom,
  );

  /*
   * The production stackers, and their calibrators. Both are fitted on the
   * pre-holdout pool and nothing else, so the holdout below is genuinely
   * untouched by either.
   */
  const ensembles = markets.map((marketCode) => {
    const ensemble = stackerFor(marketCode, validationPool);
    const validationSamples: ProbabilisticSample[] = validationPool
      .filter((row) => row.marketCode === marketCode)
      .map((row) => ({
        probabilities: ensemblePredict(ensemble, {
          market: row.market,
          model: row.model,
        }),
        observedIndex: row.observedIndex,
      }));
    return {
      marketCode,
      ensemble,
      calibrator: fitTemperature(validationSamples),
      modelContribution: modelContribution(ensemble),
    };
  });
  const ensembleFor = (marketCode: SupportedMarketCode) =>
    ensembles.find((entry) => entry.marketCode === marketCode);

  for (const row of holdoutRows) {
    const entry = ensembleFor(row.marketCode);
    if (!entry) continue;
    const bucket = bucketFor(row.competitionCode, row.marketCode);
    bucket.market.push({
      probabilities: row.market,
      observedIndex: row.observedIndex,
    });
    bucket.v1.push({
      probabilities: row.model,
      observedIndex: row.observedIndex,
    });
    bucket.v2.push({
      probabilities: applyTemperature(
        ensemblePredict(entry.ensemble, {
          market: row.market,
          model: row.model,
        }),
        entry.calibrator.temperature,
      ),
      observedIndex: row.observedIndex,
    });
    /*
     * Disagreement is measured on the *observed* outcome's own probabilities,
     * which is the only pairing where "who was right" is a meaningful
     * question.
     */
    bucket.disagreement.push({
      marketProbability: row.market[row.observedIndex] ?? 0,
      modelProbability: row.model[row.observedIndex] ?? 0,
      occurred: true,
      closingProbability: row.closing?.[row.observedIndex] ?? null,
    });
    for (let outcome = 0; outcome < row.market.length; outcome += 1) {
      if (outcome === row.observedIndex) continue;
      bucket.disagreement.push({
        marketProbability: row.market[outcome] ?? 0,
        modelProbability: row.model[outcome] ?? 0,
        occurred: false,
        closingProbability: row.closing?.[outcome] ?? null,
      });
    }
  }

  const perMarket: EnsembleMarketReport[] = [];
  for (const [key, bucket] of [...scored.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const [competitionCode, marketCode] = key.split("|") as [
      string,
      SupportedMarketCode,
    ];
    const outcomeCount = SUPPORTED_MARKETS[marketCode].outcomes.length;
    const evaluate = (samples: readonly ProbabilisticSample[]) =>
      samples.length === 0 ? null : metricSet(samples, outcomeCount);
    const market = evaluate(bucket.market);
    const modelV2 = evaluate(bucket.v2);
    perMarket.push({
      marketCode,
      outcomeCount,
      competitionCode,
      holdoutSamples: bucket.v2.length,
      market,
      modelV1: evaluate(bucket.v1),
      modelV2,
      deltaLogLossVsMarket:
        market && modelV2 ? modelV2.logLoss - market.logLoss : null,
      deltaBrierVsMarket:
        market && modelV2 ? modelV2.brier - market.brier : null,
    });
  }

  const disagreement = markets.map((marketCode) => ({
    marketCode,
    buckets: bucketDisagreement(
      [...scored.entries()]
        .filter(([key]) => key.endsWith(`|${marketCode}`))
        .flatMap(([, bucket]) => bucket.disagreement),
    ),
  }));

  const closingLine = markets.map((marketCode) => ({
    marketCode,
    study: studyClosingLine(
      [...scored.entries()]
        .filter(([key]) => key.endsWith(`|${marketCode}`))
        .flatMap(([, bucket]) => bucket.disagreement),
    ),
  }));

  return {
    generatedAt: new Date().toISOString(),
    walkForwardCutoffs: plan.windows.map((window) => window.trainingCutoff),
    holdoutFrom: plan.holdoutFrom,
    trainRecords: plan.trainingRecords,
    validationRecords: plan.validationRecords,
    holdoutRecords: plan.holdoutRecords,
    ensembles,
    perMarket,
    disagreement,
    closingLine,
    ...decideEnsembleVerdict(perMarket, ensembles),
  };
}

/**
 * The verdict, from the holdout and nothing else.
 *
 * Sample-weighted across competitions rather than a count of wins: a
 * per-competition tally lets the smallest league outvote the largest, and the
 * question is whether the ensemble is better overall.
 *
 * MATCHES_MARKET is a real answer and the most likely one. An ensemble that
 * neither improves on the market nor damages it is worth keeping as a
 * comparison and calibration surface, and is not worth promoting to an edge
 * claim — which is exactly what the reasons say.
 */
export function decideEnsembleVerdict(
  perMarket: readonly EnsembleMarketReport[],
  ensembles: readonly Readonly<{
    marketCode: SupportedMarketCode;
    modelContribution: number;
  }>[],
): Readonly<{ verdict: EnsembleVerdict; verdictReasons: readonly string[] }> {
  const comparable = perMarket.filter(
    (entry) => entry.market !== null && entry.modelV2 !== null,
  );
  if (comparable.length === 0)
    return {
      verdict: "UNDERPERFORMS_MARKET",
      verdictReasons: ["NO_COMPARABLE_MARKET_BASELINE"],
    };

  const totalSamples = comparable.reduce(
    (sum, entry) => sum + entry.holdoutSamples,
    0,
  );
  const weighted = (pick: (entry: EnsembleMarketReport) => number) =>
    comparable.reduce(
      (sum, entry) => sum + pick(entry) * entry.holdoutSamples,
      0,
    ) / Math.max(1, totalSamples);

  const deltaLogLoss = weighted((entry) => entry.deltaLogLossVsMarket ?? 0);
  const deltaBrier = weighted((entry) => entry.deltaBrierVsMarket ?? 0);
  const reasons: string[] = [
    `WEIGHTED_DELTA_LOG_LOSS_${deltaLogLoss >= 0 ? "WORSE" : "BETTER"}_THAN_MARKET`,
  ];

  const beaten = comparable.filter(
    (entry) => (entry.deltaLogLossVsMarket ?? 0) < 0,
  ).length;
  reasons.push(`BEATS_MARKET_IN_${beaten}_OF_${comparable.length}_SEGMENTS`);

  const contribution = ensembles.reduce(
    (highest, entry) => Math.max(highest, entry.modelContribution),
    0,
  );
  if (contribution < 0.01)
    /*
     * The fit put essentially no weight on the football signal. That is the
     * market-is-already-better result stated plainly, and it has to appear in
     * the reasons rather than only in the weights.
     */
    reasons.push("ENSEMBLE_PUT_NO_WEIGHT_ON_MODEL");

  /*
   * A single tolerance, in nats, for "indistinguishable". 0.002 is well below
   * the run-to-run noise of a six-thousand-row holdout and well above zero,
   * so it separates a real improvement from a rounding difference without
   * letting a rounding difference be reported as either.
   */
  const tolerance = 0.002;
  const verdict: EnsembleVerdict =
    deltaLogLoss < -tolerance
      ? "IMPROVES_MARKET"
      : deltaLogLoss > tolerance
        ? "UNDERPERFORMS_MARKET"
        : "MATCHES_MARKET";
  reasons.push(
    `WEIGHTED_DELTA_LOG_LOSS_${deltaLogLoss.toFixed(5)}`,
    `WEIGHTED_DELTA_BRIER_${deltaBrier.toFixed(5)}`,
  );
  return { verdict, verdictReasons: reasons };
}
