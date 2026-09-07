/**
 * Scoring rules and calibration diagnostics.
 *
 * All of these take *out-of-sample* predictions. Nothing in this module knows
 * or cares whether that is true, which is why the walk-forward harness is the
 * only thing allowed to produce the samples they consume.
 */

export type ProbabilisticSample = Readonly<{
  /** One probability per outcome; expected to sum to 1. */
  probabilities: readonly number[];
  /** Index of the outcome that actually happened. */
  observedIndex: number;
}>;

/**
 * Multi-class Brier score: the mean squared distance between the forecast
 * vector and the one-hot truth.
 *
 * Lower is better. For a three-outcome market, always predicting the base
 * rates lands around 0.60 and a perfect forecast is 0. Reported per market
 * rather than pooled, because a 1X2 Brier and a two-outcome Brier are not on
 * the same scale and averaging them means nothing.
 */
export function brierScore(samples: readonly ProbabilisticSample[]): number {
  if (samples.length === 0) return Number.NaN;
  let total = 0;
  for (const sample of samples) {
    let squared = 0;
    sample.probabilities.forEach((probability, index) => {
      const truth = index === sample.observedIndex ? 1 : 0;
      squared += (probability - truth) ** 2;
    });
    total += squared;
  }
  return total / samples.length;
}

/**
 * Mean negative log-likelihood of the observed outcomes.
 *
 * Clamped away from zero because a single confident miss would otherwise send
 * the whole metric to infinity and destroy any comparison. The clamp is at
 * 1e-12, far below any probability the model produces in practice, so it
 * changes nothing except the pathological case.
 */
export function logLoss(samples: readonly ProbabilisticSample[]): number {
  if (samples.length === 0) return Number.NaN;
  let total = 0;
  for (const sample of samples) {
    const probability = sample.probabilities[sample.observedIndex] ?? 0;
    total -= Math.log(Math.min(1, Math.max(1e-12, probability)));
  }
  return total / samples.length;
}

export type ReliabilityBin = Readonly<{
  lowerBound: number;
  upperBound: number;
  count: number;
  meanPredicted: number;
  observedFrequency: number;
}>;

/**
 * Reliability of one outcome's probabilities, bucketed.
 *
 * A well-calibrated forecast has `observedFrequency` tracking `meanPredicted`
 * in every populated bin. This is the diagnostic that catches the failure a
 * Brier score hides: a model can be sharp and consistently overconfident, and
 * only the bins show it.
 */
export function reliabilityBins(
  samples: readonly ProbabilisticSample[],
  outcomeIndex: number,
  binCount = 10,
): readonly ReliabilityBin[] {
  const bins = Array.from({ length: binCount }, (_, index) => ({
    lowerBound: index / binCount,
    upperBound: (index + 1) / binCount,
    count: 0,
    predictedTotal: 0,
    observedTotal: 0,
  }));
  for (const sample of samples) {
    const predicted = sample.probabilities[outcomeIndex] ?? 0;
    const slot = Math.min(binCount - 1, Math.floor(predicted * binCount));
    const bin = bins[slot];
    if (!bin) continue;
    bin.count += 1;
    bin.predictedTotal += predicted;
    bin.observedTotal += sample.observedIndex === outcomeIndex ? 1 : 0;
  }
  return bins.map((bin) => ({
    lowerBound: bin.lowerBound,
    upperBound: bin.upperBound,
    count: bin.count,
    meanPredicted:
      bin.count === 0 ? Number.NaN : bin.predictedTotal / bin.count,
    observedFrequency:
      bin.count === 0 ? Number.NaN : bin.observedTotal / bin.count,
  }));
}

/**
 * Expected calibration error, averaged over outcomes and weighted by bin
 * population.
 *
 * Zero means every bin's observed frequency matched its mean forecast. Unlike
 * Brier or log loss it says nothing about sharpness, so it is only meaningful
 * alongside them: a model that always predicts the base rate has near-zero
 * calibration error and no value.
 */
export function expectedCalibrationError(
  samples: readonly ProbabilisticSample[],
  outcomeCount: number,
  binCount = 10,
): number {
  if (samples.length === 0) return Number.NaN;
  let weighted = 0;
  for (let outcome = 0; outcome < outcomeCount; outcome += 1) {
    for (const bin of reliabilityBins(samples, outcome, binCount)) {
      if (bin.count === 0) continue;
      weighted +=
        (bin.count / samples.length) *
        Math.abs(bin.observedFrequency - bin.meanPredicted);
    }
  }
  return weighted / outcomeCount;
}

/**
 * The frequency each outcome actually occurred.
 *
 * This is the first baseline any model has to beat (§40): a forecast that
 * cannot outperform "how often does the home team win, historically" has
 * learned nothing about the specific match.
 */
export function empiricalFrequencies(
  samples: readonly ProbabilisticSample[],
  outcomeCount: number,
): readonly number[] {
  const counts = new Array<number>(outcomeCount).fill(0);
  for (const sample of samples) {
    const index = sample.observedIndex;
    if (index >= 0 && index < outcomeCount)
      counts[index] = (counts[index] ?? 0) + 1;
  }
  const total = samples.length || 1;
  return counts.map((count) => count / total);
}

export type MetricSet = Readonly<{
  sampleCount: number;
  brier: number;
  logLoss: number;
  calibrationError: number;
}>;

export function metricSet(
  samples: readonly ProbabilisticSample[],
  outcomeCount: number,
): MetricSet {
  return {
    sampleCount: samples.length,
    brier: brierScore(samples),
    logLoss: logLoss(samples),
    calibrationError: expectedCalibrationError(samples, outcomeCount),
  };
}
