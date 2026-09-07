import { devig, type DevigMethod } from "@velyq/market-semantics";
import type { DecimalString } from "@velyq/decimal";
import {
  fitDixonColes,
  type FittedModel,
  type Hyperparameters,
  type TrainingMatch,
} from "./dixon-coles.js";
import {
  bothTeamsToScoreProbabilities,
  matchResultProbabilities,
  resolveExpectedGoals,
  scoreDistribution,
  totalGoalsProbabilities,
} from "./markets.js";
import {
  empiricalFrequencies,
  metricSet,
  type MetricSet,
  type ProbabilisticSample,
} from "./metrics.js";
import { calibrate, fitTemperature, type Calibrator } from "./calibration.js";
import {
  buildUncertaintyProfile,
  type UncertaintyProfile,
} from "./uncertainty.js";
import {
  auditWalkForward,
  planWalkForward,
  type WalkForwardWindow,
} from "./walk-forward.js";
import type {
  CompetitionEvaluation,
  MarketEvaluation,
  ValidationReport,
} from "./artifact.js";

/**
 * The walk-forward backtest.
 *
 * Every number the model is judged on comes from here, and everything here is
 * out of sample by construction: window w trains strictly before its own
 * cutoff, predicts only the matches after it, and the final holdout is carved
 * off before any hyperparameter is touched.
 *
 * Three baselines are scored on exactly the same rows (§40). A complex model
 * that cannot beat "how often does the home team win" or a ratio-Poisson
 * built from training-window averages has not learned anything, and one that
 * cannot match the bookmakers' own de-vigged consensus has not learned
 * anything *useful*. Reporting ROI instead of these would hide all three.
 */

export const SUPPORTED_MARKETS = Object.freeze({
  FOOTBALL_FULL_TIME_1X2: { outcomes: ["HOME", "DRAW", "AWAY"] },
  FOOTBALL_FULL_TIME_TOTAL: { outcomes: ["OVER", "UNDER"] },
  FOOTBALL_FULL_TIME_BTTS: { outcomes: ["YES", "NO"] },
} as const);

export type SupportedMarketCode = keyof typeof SUPPORTED_MARKETS;

/** Shared so the empirical baseline's counting pass allocates nothing extra. */
const EMPTY_PROBABILITIES: readonly number[] = Object.freeze([]);

export type CorpusMatch = TrainingMatch &
  Readonly<{
    /**
     * The market's own pre-closing panel-average prices, per market, in the
     * market's canonical outcome order. Present only where the source file
     * carried them, which is why the market baseline is scored on its own
     * subset and reported with its own sample count rather than pooled.
     */
    preClosingAverageOdds: Readonly<
      Partial<Record<SupportedMarketCode, readonly string[]>>
    >;
  }>;

export type BacktestOptions = Readonly<{
  initialTrainingDays: number;
  stepDays: number;
  holdoutFraction: number;
  hyperparameters?: Partial<Hyperparameters>;
  devigMethod?: DevigMethod;
  /** Markets to evaluate; defaults to all three supported ones. */
  markets?: readonly SupportedMarketCode[];
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

export function modelProbabilitiesFor(
  market: SupportedMarketCode,
  model: FittedModel,
  match: Readonly<{
    competitionCode: string;
    homeTeamKey: string;
    awayTeamKey: string;
  }>,
): readonly number[] | null {
  const expected = resolveExpectedGoals(model, {
    competitionCode: match.competitionCode,
    homeTeamKey: match.homeTeamKey,
    awayTeamKey: match.awayTeamKey,
  });
  if (!expected.ok) return null;
  const distribution = scoreDistribution(expected.value, model.rho);
  if (market === "FOOTBALL_FULL_TIME_1X2") {
    const result = matchResultProbabilities(distribution);
    return [result.home, result.draw, result.away];
  }
  if (market === "FOOTBALL_FULL_TIME_TOTAL") {
    const totals = totalGoalsProbabilities(distribution, 2.5);
    return totals ? [totals.over, totals.under] : null;
  }
  const btts = bothTeamsToScoreProbabilities(distribution);
  return [btts.yes, btts.no];
}

/**
 * A ratio-Poisson baseline built only from the training window.
 *
 * The classic simple model: scale the competition's mean home and away goals
 * by each team's own scoring and conceding ratio, then assume independence. It
 * uses the same information as the Dixon-Coles fit and none of its machinery,
 * which is exactly what makes it the right thing to be beaten by.
 */
export type RatioPoissonBaseline = Readonly<{
  competitions: ReadonlyMap<
    string,
    Readonly<{ homeMean: number; awayMean: number }>
  >;
  teams: ReadonlyMap<
    string,
    Readonly<{
      attackRatio: number;
      defenceRatio: number;
    }>
  >;
}>;

export function fitRatioPoisson(
  matches: readonly TrainingMatch[],
): RatioPoissonBaseline {
  const competitionTotals = new Map<
    string,
    { home: number; away: number; count: number }
  >();
  for (const match of matches) {
    const entry = competitionTotals.get(match.competitionCode) ?? {
      home: 0,
      away: 0,
      count: 0,
    };
    entry.home += match.homeGoals;
    entry.away += match.awayGoals;
    entry.count += 1;
    competitionTotals.set(match.competitionCode, entry);
  }
  const competitions = new Map<
    string,
    Readonly<{ homeMean: number; awayMean: number }>
  >();
  for (const [code, totals] of competitionTotals)
    competitions.set(code, {
      homeMean: totals.count > 0 ? totals.home / totals.count : 1.4,
      awayMean: totals.count > 0 ? totals.away / totals.count : 1.1,
    });

  const teamTotals = new Map<
    string,
    { scored: number; conceded: number; matches: number; competition: string }
  >();
  const bump = (
    competitionCode: string,
    teamKey: string,
    scored: number,
    conceded: number,
  ) => {
    const key = `${competitionCode}|${teamKey}`;
    const entry = teamTotals.get(key) ?? {
      scored: 0,
      conceded: 0,
      matches: 0,
      competition: competitionCode,
    };
    entry.scored += scored;
    entry.conceded += conceded;
    entry.matches += 1;
    teamTotals.set(key, entry);
  };
  for (const match of matches) {
    bump(
      match.competitionCode,
      match.homeTeamKey,
      match.homeGoals,
      match.awayGoals,
    );
    bump(
      match.competitionCode,
      match.awayTeamKey,
      match.awayGoals,
      match.homeGoals,
    );
  }
  const teams = new Map<
    string,
    Readonly<{ attackRatio: number; defenceRatio: number }>
  >();
  for (const [key, entry] of teamTotals) {
    const competition = competitions.get(entry.competition);
    const overallMean = competition
      ? (competition.homeMean + competition.awayMean) / 2
      : 1.25;
    const perMatch = entry.matches > 0 ? entry.matches : 1;
    teams.set(key, {
      attackRatio: overallMean > 0 ? entry.scored / perMatch / overallMean : 1,
      defenceRatio:
        overallMean > 0 ? entry.conceded / perMatch / overallMean : 1,
    });
  }
  return { competitions, teams };
}

function poissonPmf(count: number, rate: number): number {
  let logPmf = -rate + count * Math.log(Math.max(1e-9, rate));
  for (let index = 2; index <= count; index += 1) logPmf -= Math.log(index);
  return Math.exp(logPmf);
}

export function ratioPoissonProbabilities(
  market: SupportedMarketCode,
  baseline: RatioPoissonBaseline,
  match: Readonly<{
    competitionCode: string;
    homeTeamKey: string;
    awayTeamKey: string;
  }>,
): readonly number[] | null {
  const competition = baseline.competitions.get(match.competitionCode);
  const home = baseline.teams.get(
    `${match.competitionCode}|${match.homeTeamKey}`,
  );
  const away = baseline.teams.get(
    `${match.competitionCode}|${match.awayTeamKey}`,
  );
  if (!competition || !home || !away) return null;
  const lambda = competition.homeMean * home.attackRatio * away.defenceRatio;
  const mu = competition.awayMean * away.attackRatio * home.defenceRatio;

  const maxGoals = 10;
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over = 0;
  let under = 0;
  let bttsYes = 0;
  let bttsNo = 0;
  let total = 0;
  for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals += 1) {
    const homeMass = poissonPmf(homeGoals, lambda);
    for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals += 1) {
      const cell = homeMass * poissonPmf(awayGoals, mu);
      total += cell;
      if (homeGoals > awayGoals) homeWin += cell;
      else if (homeGoals === awayGoals) draw += cell;
      else awayWin += cell;
      if (homeGoals + awayGoals > 2.5) over += cell;
      else under += cell;
      if (homeGoals > 0 && awayGoals > 0) bttsYes += cell;
      else bttsNo += cell;
    }
  }
  if (total <= 0) return null;
  const scale = 1 / total;
  if (market === "FOOTBALL_FULL_TIME_1X2")
    return [homeWin * scale, draw * scale, awayWin * scale];
  if (market === "FOOTBALL_FULL_TIME_TOTAL")
    return [over * scale, under * scale];
  return [bttsYes * scale, bttsNo * scale];
}

/**
 * The market's own opinion, with the bookmaker margin removed.
 *
 * Never averages raw prices: each price set is de-vigged first, because the
 * overround is the book's charge and not part of what the market believes.
 * Returns null when the source carried no pre-closing prices for that market,
 * which is normal — Football-Data publishes no both-teams-to-score column at
 * all, and only the 2.5 line for totals.
 */
export function marketBaselineProbabilities(
  market: SupportedMarketCode,
  match: CorpusMatch,
  method: DevigMethod,
): readonly number[] | null {
  const odds = match.preClosingAverageOdds[market];
  if (!odds || odds.length !== SUPPORTED_MARKETS[market].outcomes.length)
    return null;
  const result = devig(method, odds as readonly DecimalString[]);
  return result.ok ? result.value.probabilities.map(Number) : null;
}

type Collected = Readonly<{
  model: ProbabilisticSample[];
  empirical: ProbabilisticSample[];
  ratioPoisson: ProbabilisticSample[];
  market: ProbabilisticSample[];
}>;

function emptyCollected(): Collected {
  return { model: [], empirical: [], ratioPoisson: [], market: [] };
}

export type BacktestResult = Readonly<{
  report: ValidationReport;
  calibrators: readonly Readonly<{
    marketCode: SupportedMarketCode;
    calibrator: Calibrator;
  }>[];
  uncertaintyProfiles: readonly UncertaintyProfile[];
  /** Fitted on everything before the holdout; the artifact ships this one. */
  productionModel: FittedModel;
}>;

export function runBacktest(
  matches: readonly CorpusMatch[],
  options: BacktestOptions,
): BacktestResult {
  const markets =
    options.markets ??
    (Object.keys(SUPPORTED_MARKETS) as readonly SupportedMarketCode[]);
  const devigMethod = options.devigMethod ?? "SHIN";
  const sorted = [...matches].sort((left, right) =>
    left.kickoffDate === right.kickoffDate
      ? `${left.homeTeamKey}${left.awayTeamKey}`.localeCompare(
          `${right.homeTeamKey}${right.awayTeamKey}`,
        )
      : left.kickoffDate.localeCompare(right.kickoffDate),
  );
  const plan = planWalkForward(sorted, options);

  /* competition -> market -> collected samples, validation and holdout apart. */
  const validation = new Map<string, Map<SupportedMarketCode, Collected>>();
  const holdout = new Map<string, Map<SupportedMarketCode, Collected>>();
  const realised: {
    windowIndex: number;
    training: readonly CorpusMatch[];
    predicted: readonly CorpusMatch[];
  }[] = [];

  const bucket = (
    store: Map<string, Map<SupportedMarketCode, Collected>>,
    competitionCode: string,
    market: SupportedMarketCode,
  ) => {
    const byMarket =
      store.get(competitionCode) ?? new Map<SupportedMarketCode, Collected>();
    store.set(competitionCode, byMarket);
    const existing = byMarket.get(market) ?? emptyCollected();
    byMarket.set(market, existing);
    return existing;
  };

  const scoreWindow = (
    window: WalkForwardWindow | null,
    training: readonly CorpusMatch[],
    predicted: readonly CorpusMatch[],
    store: Map<string, Map<SupportedMarketCode, Collected>>,
  ): FittedModel => {
    const model = fitDixonColes({
      matches: training,
      trainingCutoff: window ? window.trainingCutoff : plan.holdoutFrom,
      ...(options.hyperparameters
        ? { hyperparameters: options.hyperparameters }
        : {}),
    });
    const ratio = fitRatioPoisson(training);

    for (const market of markets) {
      const outcomeCount = SUPPORTED_MARKETS[market].outcomes.length;
      /*
       * The empirical baseline's rates come from the training window only.
       * Taking them from the whole corpus would hand the simplest baseline a
       * peek at the future and then flatter the model for beating it.
       */
      const frequencies = empiricalFrequencies(
        training.map((match) => ({
          probabilities: EMPTY_PROBABILITIES,
          observedIndex: observedIndexFor(market, match),
        })),
        outcomeCount,
      );

      for (const match of predicted) {
        const observedIndex = observedIndexFor(market, match);
        const collected = bucket(store, match.competitionCode, market);
        const modelProbabilities = modelProbabilitiesFor(market, model, match);
        if (modelProbabilities)
          collected.model.push({
            probabilities: modelProbabilities,
            observedIndex,
          });
        collected.empirical.push({
          probabilities: frequencies,
          observedIndex,
        });
        const ratioProbabilities = ratioPoissonProbabilities(
          market,
          ratio,
          match,
        );
        if (ratioProbabilities)
          collected.ratioPoisson.push({
            probabilities: ratioProbabilities,
            observedIndex,
          });
        const marketProbabilities = marketBaselineProbabilities(
          market,
          match,
          devigMethod,
        );
        if (marketProbabilities)
          collected.market.push({
            probabilities: marketProbabilities,
            observedIndex,
          });
      }
    }
    return model;
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
    realised.push({ windowIndex: window.index, training, predicted });
    scoreWindow(window, training, predicted, validation);
  }

  const preHoldout = sorted.filter(
    (match) => match.kickoffDate < plan.holdoutFrom,
  );
  const holdoutMatches = sorted.filter(
    (match) => match.kickoffDate >= plan.holdoutFrom,
  );
  const productionModel = scoreWindow(
    null,
    preHoldout,
    holdoutMatches,
    holdout,
  );

  /*
   * Calibration is fitted on the pooled walk-forward validation predictions
   * and on nothing else. Fitting it per competition would give some of them a
   * few dozen rows, which is how a "calibrator" becomes a memoriser.
   */
  const calibrators = markets.map((market) => {
    const pooled: ProbabilisticSample[] = [];
    for (const byMarket of validation.values()) {
      const collected = byMarket.get(market);
      if (collected) pooled.push(...collected.model);
    }
    return { marketCode: market, calibrator: fitTemperature(pooled) };
  });
  const calibratorFor = (market: SupportedMarketCode) =>
    calibrators.find((entry) => entry.marketCode === market)?.calibrator;

  const evaluate = (
    samples: readonly ProbabilisticSample[],
    outcomeCount: number,
  ): MetricSet | null =>
    samples.length === 0 ? null : metricSet(samples, outcomeCount);

  const preHoldoutByCompetition = new Map<string, number>();
  for (const match of preHoldout)
    preHoldoutByCompetition.set(
      match.competitionCode,
      (preHoldoutByCompetition.get(match.competitionCode) ?? 0) + 1,
    );

  const competitionCodes = [
    ...new Set([...validation.keys(), ...holdout.keys()]),
  ].sort();

  const competitions: CompetitionEvaluation[] = competitionCodes.map(
    (competitionCode) => {
      const marketEvaluations: MarketEvaluation[] = markets.flatMap(
        (market): MarketEvaluation[] => {
          const outcomeCount = SUPPORTED_MARKETS[market].outcomes.length;
          const validationCollected =
            validation.get(competitionCode)?.get(market) ?? emptyCollected();
          const holdoutCollected =
            holdout.get(competitionCode)?.get(market) ?? emptyCollected();
          if (
            validationCollected.model.length === 0 &&
            holdoutCollected.model.length === 0
          )
            return [];
          const calibrator = calibratorFor(market);
          const calibratedValidation = calibrator
            ? calibrate(validationCollected.model, calibrator)
            : validationCollected.model;
          const calibratedHoldout = calibrator
            ? calibrate(holdoutCollected.model, calibrator)
            : holdoutCollected.model;

          const modelHoldout = evaluate(calibratedHoldout, outcomeCount);
          const baseline = (
            code:
              | "EMPIRICAL_FREQUENCY"
              | "INDEPENDENT_POISSON"
              | "MARKET_CONSENSUS",
            validationSamples: readonly ProbabilisticSample[],
            holdoutSamples: readonly ProbabilisticSample[],
          ) => {
            const validationMetrics = evaluate(validationSamples, outcomeCount);
            const holdoutMetrics = evaluate(holdoutSamples, outcomeCount);
            return {
              code,
              validation: validationMetrics ?? metricSet([], outcomeCount),
              holdout: holdoutMetrics,
              /*
               * Null rather than false when there is nothing to compare. A
               * baseline the corpus could not supply must not read as a
               * baseline the model beat, and must not read as one it lost to
               * either — the promotion policy treats only an explicit false
               * as a blocker.
               */
              modelBeatsOnHoldout:
                modelHoldout && holdoutMetrics
                  ? modelHoldout.logLoss < holdoutMetrics.logLoss
                  : null,
            };
          };

          return [
            {
              marketCode: market,
              outcomeCount,
              /*
               * The production model's training count for this competition:
               * every pre-holdout match. Summing each walk-forward window's
               * training set instead would count the same match once per
               * window and report a number several times the corpus size.
               */
              trainSampleCount:
                preHoldoutByCompetition.get(competitionCode) ?? 0,
              validation:
                evaluate(calibratedValidation, outcomeCount) ??
                metricSet([], outcomeCount),
              holdout: modelHoldout,
              baselines: [
                baseline(
                  "EMPIRICAL_FREQUENCY",
                  validationCollected.empirical,
                  holdoutCollected.empirical,
                ),
                baseline(
                  "INDEPENDENT_POISSON",
                  validationCollected.ratioPoisson,
                  holdoutCollected.ratioPoisson,
                ),
                baseline(
                  "MARKET_CONSENSUS",
                  validationCollected.market,
                  holdoutCollected.market,
                ),
              ],
            },
          ];
        },
      );
      return {
        competitionCode,
        matchesInCorpus: sorted.filter(
          (match) => match.competitionCode === competitionCode,
        ).length,
        markets: marketEvaluations,
      };
    },
  );

  const audit = auditWalkForward(plan, realised);

  const uncertaintyProfiles = competitionCodes.flatMap((competitionCode) =>
    markets.flatMap((market) => {
      const collected = validation.get(competitionCode)?.get(market);
      if (!collected) return [];
      const calibrator = calibratorFor(market);
      const samples = calibrator
        ? calibrate(collected.model, calibrator)
        : collected.model;
      const profile = buildUncertaintyProfile({
        competitionCode,
        marketCode: market,
        outcomeCount: SUPPORTED_MARKETS[market].outcomes.length,
        validationSamples: samples,
      });
      return profile ? [profile] : [];
    }),
  );

  return {
    report: {
      generatedAt: new Date().toISOString(),
      corpusSourceCodes: ["FOOTBALL_DATA_UK"],
      walkForwardCutoffs: plan.windows.map((window) => window.trainingCutoff),
      holdoutFrom: plan.holdoutFrom,
      trainRecords: plan.trainingRecords,
      validationRecords: plan.validationRecords,
      holdoutRecords: plan.holdoutRecords,
      leakageAudit: { ok: audit.ok, violations: audit.violations.length },
      competitions,
    },
    calibrators,
    uncertaintyProfiles,
    productionModel,
  };
}
