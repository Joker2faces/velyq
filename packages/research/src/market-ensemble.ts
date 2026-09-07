/**
 * The market-informed model: multinomial logistic stacking of the market's own
 * de-vigged consensus against the Dixon-Coles score model.
 *
 * The Phase-3 result was that the score model beats naive base rates
 * everywhere and beats the de-vigged market almost nowhere. The honest reading
 * of that is not "tune the thresholds" — it is that the market is a much
 * better prior than an independent model, and should be treated as one rather
 * than ignored until the final edge calculation.
 *
 * So the market probability is a *feature*, and the question this module
 * answers is narrow and falsifiable: given what the market already says, does
 * the football-strength signal add anything? The null hypothesis is that it
 * does not.
 *
 *   score_k = intercept_k + marketWeight · log(p_market_k)
 *                         + modelWeight  · log(p_model_k)
 *   p_k     = softmax(score)_k
 *
 * Four free parameters for a three-outcome market — two shared weights plus
 * two identified intercepts. That parsimony is the point: it is the simplest
 * thing that can express "trust the market", "trust the model", or any blend,
 * and with this few parameters a fitted `modelWeight` near zero is strong
 * evidence rather than a shrinkage artifact.
 *
 * A fitted `modelWeight` at or near zero is a valid and expected outcome. It
 * means MARKET_BASELINE_BETTER, and this module reports that rather than
 * hiding it behind a blend that looks like it did something.
 */

export type StackingFeatures = Readonly<{
  /** De-vigged market probability per outcome, in canonical order. */
  market: readonly number[];
  /** Calibrated score-model probability per outcome, same order. */
  model: readonly number[];
}>;

export type StackingSample = StackingFeatures &
  Readonly<{
    observedIndex: number;
  }>;

export type EnsembleHyperparameters = Readonly<{
  /** L2 shrinkage on the two weights and the intercepts. */
  penalty: number;
  maxIterations: number;
  learningRate: number;
  tolerance: number;
}>;

export const DEFAULT_ENSEMBLE_HYPERPARAMETERS: EnsembleHyperparameters =
  Object.freeze({
    penalty: 0.001,
    maxIterations: 600,
    learningRate: 0.05,
    tolerance: 1e-11,
  });

export type FittedEnsemble = Readonly<{
  outcomeCount: number;
  /** One per outcome; the last is pinned to zero for identifiability. */
  intercepts: readonly number[];
  marketWeight: number;
  modelWeight: number;
  hyperparameters: EnsembleHyperparameters;
  iterations: number;
  converged: boolean;
  /** Mean negative log-likelihood on the fitting set. */
  fittedLogLoss: number;
  sampleCount: number;
}>;

const LOG_FLOOR = 1e-12;

function safeLog(value: number): number {
  return Math.log(Math.max(LOG_FLOOR, value));
}

/**
 * The identity ensemble: pass the market through untouched.
 *
 * Returned whenever there is nothing to fit, so "no ensemble" and "an ensemble
 * that decided to trust the market completely" are the same object rather than
 * two code paths. `marketWeight` of 1 with `modelWeight` of 0 reproduces the
 * market's own probabilities exactly, which is the correct default when the
 * evidence for doing anything else is absent.
 */
export function marketOnlyEnsemble(outcomeCount: number): FittedEnsemble {
  return {
    outcomeCount,
    intercepts: new Array<number>(outcomeCount).fill(0),
    marketWeight: 1,
    modelWeight: 0,
    hyperparameters: DEFAULT_ENSEMBLE_HYPERPARAMETERS,
    iterations: 0,
    converged: true,
    fittedLogLoss: Number.NaN,
    sampleCount: 0,
  };
}

export function ensemblePredict(
  ensemble: FittedEnsemble,
  features: StackingFeatures,
): readonly number[] {
  const scores: number[] = [];
  for (let outcome = 0; outcome < ensemble.outcomeCount; outcome += 1) {
    scores.push(
      (ensemble.intercepts[outcome] ?? 0) +
        ensemble.marketWeight * safeLog(features.market[outcome] ?? 0) +
        ensemble.modelWeight * safeLog(features.model[outcome] ?? 0),
    );
  }
  const highest = Math.max(...scores);
  const exponentiated = scores.map((score) => Math.exp(score - highest));
  const total = exponentiated.reduce((sum, value) => sum + value, 0);
  return total > 0
    ? exponentiated.map((value) => value / total)
    : new Array<number>(ensemble.outcomeCount).fill(1 / ensemble.outcomeCount);
}

/**
 * Fits the stacker by Adam on the exact multinomial log-likelihood.
 *
 * Full-batch and seedless, like the score model, so the same training pool
 * produces bit-identical weights and the artifact stays fingerprintable.
 *
 * The last intercept is pinned to zero throughout. Softmax is invariant to a
 * constant added to every score, so without pinning one the intercepts drift
 * along that flat direction and the L2 penalty fights it for no benefit.
 */
export function fitMarketEnsemble(
  samples: readonly StackingSample[],
  outcomeCount: number,
  overrides: Partial<EnsembleHyperparameters> = {},
): FittedEnsemble {
  const hyperparameters: EnsembleHyperparameters = {
    ...DEFAULT_ENSEMBLE_HYPERPARAMETERS,
    ...overrides,
  };
  const usable = samples.filter(
    (sample) =>
      sample.market.length === outcomeCount &&
      sample.model.length === outcomeCount &&
      sample.observedIndex >= 0 &&
      sample.observedIndex < outcomeCount,
  );
  if (usable.length === 0) return marketOnlyEnsemble(outcomeCount);

  /*
   * Started at the market-only solution rather than at zero. If the fit
   * improves on it, the improvement is what the football signal contributed;
   * if it does not move, the answer is that the market was already right and
   * that reads directly off the weights.
   */
  const intercepts = new Float64Array(outcomeCount);
  let marketWeight = 1;
  let modelWeight = 0;

  const parameterCount = outcomeCount + 2;
  const moment1 = new Float64Array(parameterCount);
  const moment2 = new Float64Array(parameterCount);
  const gradient = new Float64Array(parameterCount);
  const MARKET = outcomeCount;
  const MODEL = outcomeCount + 1;
  const beta1 = 0.9;
  const beta2 = 0.999;
  const epsilon = 1e-8;

  let previous = Number.NEGATIVE_INFINITY;
  let objective = Number.NEGATIVE_INFINITY;
  let iterations = 0;
  let converged = false;

  const logMarket = usable.map((sample) => sample.market.map(safeLog));
  const logModel = usable.map((sample) => sample.model.map(safeLog));

  for (let step = 1; step <= hyperparameters.maxIterations; step += 1) {
    gradient.fill(0);
    let logLikelihood = 0;

    usable.forEach((sample, index) => {
      const marketLogs = logMarket[index]!;
      const modelLogs = logModel[index]!;
      const scores: number[] = [];
      for (let outcome = 0; outcome < outcomeCount; outcome += 1)
        scores.push(
          (intercepts[outcome] ?? 0) +
            marketWeight * (marketLogs[outcome] ?? 0) +
            modelWeight * (modelLogs[outcome] ?? 0),
        );
      const highest = Math.max(...scores);
      const exponentiated = scores.map((score) => Math.exp(score - highest));
      const total = exponentiated.reduce((sum, value) => sum + value, 0);
      const probabilities = exponentiated.map((value) => value / total);
      logLikelihood += safeLog(probabilities[sample.observedIndex] ?? 0);

      /* d(log-likelihood)/d(score_k) = 1[k = observed] - p_k. */
      for (let outcome = 0; outcome < outcomeCount; outcome += 1) {
        const residual =
          (outcome === sample.observedIndex ? 1 : 0) -
          (probabilities[outcome] ?? 0);
        gradient[outcome] = (gradient[outcome] ?? 0) + residual;
        gradient[MARKET] =
          (gradient[MARKET] ?? 0) + residual * (marketLogs[outcome] ?? 0);
        gradient[MODEL] =
          (gradient[MODEL] ?? 0) + residual * (modelLogs[outcome] ?? 0);
      }
    });

    let penalty = 0;
    for (let outcome = 0; outcome < outcomeCount; outcome += 1) {
      const value = intercepts[outcome] ?? 0;
      penalty += hyperparameters.penalty * value * value;
      gradient[outcome] =
        (gradient[outcome] ?? 0) - 2 * hyperparameters.penalty * value;
    }
    /*
     * The weights are shrunk toward the market-only solution, not toward
     * zero: shrinking `marketWeight` to zero would pull the ensemble away
     * from the one thing already known to work.
     */
    penalty += hyperparameters.penalty * (marketWeight - 1) ** 2;
    penalty += hyperparameters.penalty * modelWeight ** 2;
    gradient[MARKET] =
      (gradient[MARKET] ?? 0) -
      2 * hyperparameters.penalty * (marketWeight - 1);
    gradient[MODEL] =
      (gradient[MODEL] ?? 0) - 2 * hyperparameters.penalty * modelWeight;
    objective = logLikelihood - penalty;

    for (let index = 0; index < parameterCount; index += 1) {
      /* Softmax is shift-invariant, so the last intercept stays pinned. */
      if (index === outcomeCount - 1) continue;
      const g = gradient[index] ?? 0;
      const m1 = beta1 * (moment1[index] ?? 0) + (1 - beta1) * g;
      const m2 = beta2 * (moment2[index] ?? 0) + (1 - beta2) * g * g;
      moment1[index] = m1;
      moment2[index] = m2;
      const update =
        (hyperparameters.learningRate * (m1 / (1 - Math.pow(beta1, step)))) /
        (Math.sqrt(m2 / (1 - Math.pow(beta2, step))) + epsilon);
      if (index < outcomeCount)
        intercepts[index] = (intercepts[index] ?? 0) + update;
      else if (index === MARKET) marketWeight += update;
      else modelWeight += update;
    }

    iterations = step;
    if (
      Number.isFinite(previous) &&
      Math.abs(objective - previous) <=
        hyperparameters.tolerance * Math.max(1, Math.abs(objective))
    ) {
      converged = true;
      break;
    }
    previous = objective;
  }

  return {
    outcomeCount,
    intercepts: [...intercepts],
    marketWeight: Number(marketWeight.toFixed(8)),
    modelWeight: Number(modelWeight.toFixed(8)),
    hyperparameters,
    iterations,
    converged,
    fittedLogLoss: -(objective + 0) / usable.length,
    sampleCount: usable.length,
  };
}

/**
 * How much of the ensemble's opinion came from the football model.
 *
 * A single readable number for the question the phase actually asks. Near zero
 * means the fit concluded the market was already right, which is a result and
 * not a failure.
 */
export function modelContribution(ensemble: FittedEnsemble): number {
  const total =
    Math.abs(ensemble.marketWeight) + Math.abs(ensemble.modelWeight);
  return total === 0 ? 0 : Math.abs(ensemble.modelWeight) / total;
}

export type DisagreementBucket = Readonly<{
  lowerBound: number;
  upperBound: number;
  samples: number;
  /** Mean of (model probability − market probability) in this bucket. */
  meanDisagreement: number;
  /** How often the outcome actually happened. */
  observedFrequency: number;
  /** What the market said would happen, on average. */
  marketExpectedFrequency: number;
  /** What the model said would happen, on average. */
  modelExpectedFrequency: number;
  /**
   * Mean change in de-vigged probability between the decision price and the
   * closing price. Positive means the market moved toward this outcome.
   */
  meanClosingMovement: number | null;
  closingSamples: number;
}>;

export type DisagreementRecord = Readonly<{
  marketProbability: number;
  modelProbability: number;
  occurred: boolean;
  /** De-vigged closing probability, where the source carried one. */
  closingProbability: number | null;
}>;

/**
 * Buckets outcomes by how far the model disagreed with the market, and reports
 * who was right.
 *
 * Every populated bucket is reported. Selecting the flattering ones after the
 * fact is how a backtest manufactures an edge, so the bucket boundaries are
 * fixed in advance and the empty ones are reported as empty.
 *
 * `marketExpectedFrequency` next to `observedFrequency` is the whole test: if
 * the model's disagreement carries information, buckets where it was more
 * bullish than the market should show outcomes occurring more often than the
 * market expected. If they do not, the disagreement is noise.
 */
export function bucketDisagreement(
  records: readonly DisagreementRecord[],
  edges: readonly number[] = [-1, -0.1, -0.05, -0.02, 0.02, 0.05, 0.1, 1],
): readonly DisagreementBucket[] {
  const buckets = edges.slice(0, -1).map((lowerBound, index) => ({
    lowerBound,
    upperBound: edges[index + 1]!,
    samples: 0,
    disagreementTotal: 0,
    observedTotal: 0,
    marketTotal: 0,
    modelTotal: 0,
    movementTotal: 0,
    closingSamples: 0,
  }));

  for (const record of records) {
    const disagreement = record.modelProbability - record.marketProbability;
    const bucket = buckets.find(
      (candidate) =>
        disagreement >= candidate.lowerBound &&
        disagreement < candidate.upperBound,
    );
    if (!bucket) continue;
    bucket.samples += 1;
    bucket.disagreementTotal += disagreement;
    bucket.observedTotal += record.occurred ? 1 : 0;
    bucket.marketTotal += record.marketProbability;
    bucket.modelTotal += record.modelProbability;
    if (record.closingProbability !== null) {
      bucket.movementTotal +=
        record.closingProbability - record.marketProbability;
      bucket.closingSamples += 1;
    }
  }

  return buckets.map((bucket) => ({
    lowerBound: bucket.lowerBound,
    upperBound: bucket.upperBound,
    samples: bucket.samples,
    meanDisagreement:
      bucket.samples === 0
        ? Number.NaN
        : bucket.disagreementTotal / bucket.samples,
    observedFrequency:
      bucket.samples === 0 ? Number.NaN : bucket.observedTotal / bucket.samples,
    marketExpectedFrequency:
      bucket.samples === 0 ? Number.NaN : bucket.marketTotal / bucket.samples,
    modelExpectedFrequency:
      bucket.samples === 0 ? Number.NaN : bucket.modelTotal / bucket.samples,
    meanClosingMovement:
      bucket.closingSamples === 0
        ? null
        : bucket.movementTotal / bucket.closingSamples,
    closingSamples: bucket.closingSamples,
  }));
}

export type ClosingLineStudy = Readonly<{
  samples: number;
  /**
   * Correlation between model-market disagreement and subsequent movement in
   * the de-vigged market probability.
   *
   * This is a different target from match outcome and must not be confused
   * with one: it asks whether VELYQ spots prices the market later moves
   * toward, which can be true even where outcome prediction does not beat the
   * closing market — and can be false even where it does.
   */
  disagreementMovementCorrelation: number;
  /** Share of positive-disagreement outcomes whose price shortened. */
  shortenedWhenModelBullish: number;
  /** Same share among the rest, as the comparison it needs. */
  shortenedWhenModelBearish: number;
  meanAbsoluteMovement: number;
}>;

/**
 * Whether model-market disagreement predicts where the price goes next.
 *
 * Explicitly not an outcome model. A signal that identifies prices which
 * later shorten is useful market intelligence on its own, and conflating it
 * with a probability forecast is how a CLV result gets mis-sold as predictive
 * edge.
 */
export function studyClosingLine(
  records: readonly DisagreementRecord[],
): ClosingLineStudy {
  const usable = records.filter((record) => record.closingProbability !== null);
  if (usable.length < 2)
    return {
      samples: usable.length,
      disagreementMovementCorrelation: Number.NaN,
      shortenedWhenModelBullish: Number.NaN,
      shortenedWhenModelBearish: Number.NaN,
      meanAbsoluteMovement: Number.NaN,
    };

  const disagreement = usable.map(
    (record) => record.modelProbability - record.marketProbability,
  );
  const movement = usable.map(
    (record) => record.closingProbability! - record.marketProbability,
  );
  const mean = (values: readonly number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const meanDisagreement = mean(disagreement);
  const meanMovement = mean(movement);
  let covariance = 0;
  let varianceDisagreement = 0;
  let varianceMovement = 0;
  for (let index = 0; index < usable.length; index += 1) {
    const a = (disagreement[index] ?? 0) - meanDisagreement;
    const b = (movement[index] ?? 0) - meanMovement;
    covariance += a * b;
    varianceDisagreement += a * a;
    varianceMovement += b * b;
  }
  const denominator = Math.sqrt(varianceDisagreement * varianceMovement);

  const bullish = usable.filter(
    (record) => record.modelProbability > record.marketProbability,
  );
  const bearish = usable.filter(
    (record) => record.modelProbability <= record.marketProbability,
  );
  /*
   * "Shortened" means the market moved toward the outcome, i.e. its de-vigged
   * probability rose. Reported for both groups because the bullish share
   * alone says nothing — a market that drifts toward everything would give a
   * high number with no signal in it.
   */
  const shortenedShare = (group: readonly DisagreementRecord[]) =>
    group.length === 0
      ? Number.NaN
      : group.filter(
          (record) => record.closingProbability! > record.marketProbability,
        ).length / group.length;

  return {
    samples: usable.length,
    disagreementMovementCorrelation:
      denominator === 0 ? Number.NaN : covariance / denominator,
    shortenedWhenModelBullish: shortenedShare(bullish),
    shortenedWhenModelBearish: shortenedShare(bearish),
    meanAbsoluteMovement: mean(movement.map(Math.abs)),
  };
}

/**
 * How a feature may be used, which is not the same as whether it is available.
 *
 * The trap this prevents: current injuries are easy to fetch from the
 * provider, and injecting them into a model trained without historical injury
 * features would produce inference nothing validated. So availability and
 * admissibility are tracked separately and a feature has to declare which it
 * is.
 */
export type FeatureClass =
  /** Present in the historical corpus, reconstructible at any past cutoff, and trained on. */
  | "MODELLED_FEATURE"
  /** Available now but not historically reconstructible: shown as evidence, never trained on. */
  | "EVIDENCE_ONLY_FEATURE"
  /** Someone else's model output, kept for comparison and never blended in. */
  | "EXTERNAL_BENCHMARK";

export type FeatureDeclaration = Readonly<{
  code: string;
  featureClass: FeatureClass;
  source: string;
  /** Why it is in this class — the reasoning, not a restatement. */
  rationale: string;
}>;

export const FEATURE_REGISTRY: readonly FeatureDeclaration[] = Object.freeze([
  {
    code: "MARKET_CONSENSUS_PRE_CLOSING",
    featureClass: "MODELLED_FEATURE",
    source: "FOOTBALL_DATA_UK / API_SPORTS",
    rationale:
      "The historical corpus carries panel-average prices collected days before kickoff, so the same quantity is reconstructible at any past decision cutoff without touching the closing line.",
  },
  {
    code: "DIXON_COLES_SCORE_MODEL",
    featureClass: "MODELLED_FEATURE",
    source: "@velyq/research",
    rationale:
      "Derived entirely from results strictly before the cutoff, and the walk-forward harness refits it per window so its historical values are genuinely out of sample.",
  },
  {
    code: "CLOSING_PRICE",
    featureClass: "EVIDENCE_ONLY_FEATURE",
    source: "FOOTBALL_DATA_UK",
    rationale:
      "Known only after the decision it would inform. Legitimate as an evaluation target for closing-line research and never as a model input — using it as a feature is the leak every other guard here exists to prevent.",
  },
  {
    code: "CURRENT_INJURIES",
    featureClass: "EVIDENCE_ONLY_FEATURE",
    source: "API_SPORTS",
    rationale:
      "The provider exposes today's injuries but not a point-in-time history, so a backtest cannot reconstruct what was known at a past cutoff. Usable as displayed evidence; training on it would produce inference nothing validated.",
  },
  {
    code: "CONFIRMED_LINEUP",
    featureClass: "EVIDENCE_ONLY_FEATURE",
    source: "API_SPORTS",
    rationale:
      "Available about an hour before kickoff and not present in the historical corpus at all, so it gates decisions as evidence rather than entering the trained model.",
  },
  {
    code: "API_SPORTS_PREDICTIONS",
    featureClass: "EXTERNAL_BENCHMARK",
    source: "API_SPORTS",
    rationale:
      "Another vendor's model output. Kept with its provenance for comparison against VELYQ v1, v2 and the market; blending it in would make VELYQ's own validation meaningless.",
  },
]);

export function featureClassOf(code: string): FeatureClass | null {
  return (
    FEATURE_REGISTRY.find((entry) => entry.code === code)?.featureClass ?? null
  );
}

/**
 * Whether a set of features may be used to train a model.
 *
 * Refuses on the first non-modelled feature and names it, rather than
 * filtering silently: a training run that quietly dropped a feature someone
 * believed was included is worse than one that refuses to start.
 */
export function assertTrainableFeatures(
  codes: readonly string[],
): Readonly<{ ok: boolean; offending: readonly string[] }> {
  const offending = codes.filter(
    (code) => featureClassOf(code) !== "MODELLED_FEATURE",
  );
  return { ok: offending.length === 0, offending };
}
