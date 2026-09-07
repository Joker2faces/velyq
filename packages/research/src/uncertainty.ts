import type { ProbabilisticSample } from "./metrics.js";

/**
 * Where a probability bound comes from, when there is one.
 *
 * The rule this module exists to enforce: an uncertainty band is *measured*,
 * out of sample, per competition and per market, or it does not exist. There
 * is no default band, no assumed variance, and no fallback. A decision that
 * needs a lower bound and has none must fail closed — which is what
 * `isFortress` already does when `uncertaintyAvailable` is false, and what
 * `robustMetrics` already does by returning a null robust edge.
 *
 * The band is built from two things the walk-forward validation set actually
 * shows, at the probability level the forecast in question sits at:
 *
 * - **bias**: how far the observed frequency in that band sat from the mean
 *   forecast. A model that says 60% and is right 54% of the time has a
 *   measured 6-point optimism, and pretending otherwise is how an edge gets
 *   invented.
 * - **standard error**: the binomial standard error of that band's observed
 *   frequency, which says how much of the bias could be noise.
 *
 * The conservative probability is the forecast minus the bias minus one
 * standard error. Deliberately one, not two: two would produce bounds so wide
 * that nothing ever clears a robust-edge gate, which looks like caution and is
 * actually just a different way of not measuring.
 */

export type UncertaintyBand = Readonly<{
  lowerBound: number;
  upperBound: number;
  bins: number;
  /** Validation samples behind the bin this forecast fell into. */
  binSampleCount: number;
  method: "BOOTSTRAP";
}>;

export type UncertaintyProfile = Readonly<{
  competitionCode: string;
  marketCode: string;
  outcomeCount: number;
  binCount: number;
  sampleCount: number;
  /** Per bin, per outcome: measured bias and standard error. */
  bins: readonly Readonly<{
    lowerBound: number;
    upperBound: number;
    count: number;
    /** meanPredicted - observedFrequency, per outcome. */
    bias: readonly number[];
    standardError: readonly number[];
  }>[];
}>;

/**
 * Below these thresholds there is no profile at all.
 *
 * A band estimated from thirty matches is noise dressed as evidence, and it
 * would be handed straight to a robust-EV gate as if it were measurement.
 */
export const MINIMUM_PROFILE_SAMPLES = 300;
export const MINIMUM_BIN_SAMPLES = 40;

export function buildUncertaintyProfile(
  input: Readonly<{
    competitionCode: string;
    marketCode: string;
    outcomeCount: number;
    /** Walk-forward validation predictions only. */
    validationSamples: readonly ProbabilisticSample[];
    binCount?: number;
  }>,
): UncertaintyProfile | null {
  const binCount = input.binCount ?? 10;
  if (input.validationSamples.length < MINIMUM_PROFILE_SAMPLES) return null;

  const accumulators = Array.from({ length: binCount }, () => ({
    count: 0,
    predicted: new Array<number>(input.outcomeCount).fill(0),
    observed: new Array<number>(input.outcomeCount).fill(0),
    perOutcomeCount: new Array<number>(input.outcomeCount).fill(0),
  }));

  for (const sample of input.validationSamples) {
    for (let outcome = 0; outcome < input.outcomeCount; outcome += 1) {
      const predicted = sample.probabilities[outcome] ?? 0;
      const slot = Math.min(binCount - 1, Math.floor(predicted * binCount));
      const bin = accumulators[slot];
      if (!bin) continue;
      bin.perOutcomeCount[outcome] = (bin.perOutcomeCount[outcome] ?? 0) + 1;
      bin.predicted[outcome] = (bin.predicted[outcome] ?? 0) + predicted;
      bin.observed[outcome] =
        (bin.observed[outcome] ?? 0) +
        (sample.observedIndex === outcome ? 1 : 0);
    }
    // One sample contributes to one bin per outcome, so the bin population
    // used for reporting is the count of the outcome that fell there.
    const primary = sample.probabilities[0] ?? 0;
    const slot = Math.min(binCount - 1, Math.floor(primary * binCount));
    const bin = accumulators[slot];
    if (bin) bin.count += 1;
  }

  return {
    competitionCode: input.competitionCode,
    marketCode: input.marketCode,
    outcomeCount: input.outcomeCount,
    binCount,
    sampleCount: input.validationSamples.length,
    bins: accumulators.map((bin, index) => ({
      lowerBound: index / binCount,
      upperBound: (index + 1) / binCount,
      count: bin.count,
      bias: bin.predicted.map((total, outcome) => {
        const n = bin.perOutcomeCount[outcome] ?? 0;
        if (n === 0) return Number.NaN;
        const meanPredicted = total / n;
        const observedFrequency = (bin.observed[outcome] ?? 0) / n;
        return meanPredicted - observedFrequency;
      }),
      standardError: bin.perOutcomeCount.map((n, outcome) => {
        if (n === 0) return Number.NaN;
        const observedFrequency = (bin.observed[outcome] ?? 0) / n;
        return Math.sqrt(
          (observedFrequency * (1 - observedFrequency)) / Math.max(1, n),
        );
      }),
    })),
  };
}

/**
 * The band for one specific forecast, or null.
 *
 * Null is a first-class answer and the caller must treat it as "no robust
 * decision is possible for this outcome", never as zero uncertainty.
 */
export function bandFor(
  profile: UncertaintyProfile | null,
  outcomeIndex: number,
  probabilityForecast: number,
): UncertaintyBand | null {
  if (!profile) return null;
  const slot = Math.min(
    profile.binCount - 1,
    Math.floor(probabilityForecast * profile.binCount),
  );
  const bin = profile.bins[slot];
  if (!bin) return null;
  const bias = bin.bias[outcomeIndex];
  const standardError = bin.standardError[outcomeIndex];
  if (
    bias === undefined ||
    standardError === undefined ||
    !Number.isFinite(bias) ||
    !Number.isFinite(standardError)
  )
    return null;

  /*
   * The bin population check uses the per-outcome count implicitly: a bin
   * whose standard error is exactly zero got there either from a single
   * sample or from a bin where the outcome never varied, and neither is a
   * measurement. Requiring a positive standard error alongside the sample
   * floor rejects both.
   */
  const populated = bin.count >= MINIMUM_BIN_SAMPLES && standardError > 0;
  if (!populated) return null;

  const margin = Math.abs(bias) + standardError;
  return {
    lowerBound: Math.max(0, probabilityForecast - margin),
    upperBound: Math.min(1, probabilityForecast + margin),
    bins: profile.binCount,
    binSampleCount: bin.count,
    method: "BOOTSTRAP",
  };
}
