import { logLoss, type ProbabilisticSample } from "./metrics.js";

/**
 * Temperature scaling, fitted on validation predictions only.
 *
 * A Dixon-Coles fit produces coherent probabilities, not necessarily
 * well-calibrated ones — the τ correction and the L2 shrinkage both push the
 * distribution around, and truncating the goal matrix sharpens it slightly.
 * Temperature scaling is the smallest honest correction available: one
 * parameter, applied to the log-probabilities, which cannot reorder outcomes
 * and therefore cannot manufacture an edge that the model did not already see.
 *
 *   p_i' ∝ p_i ^ (1 / T)
 *
 * T > 1 softens an overconfident forecast; T < 1 sharpens an underconfident
 * one; T = 1 is the identity. Fitted by minimising log loss on the walk-forward
 * validation predictions and *never* on the rows the model is later scored on.
 */

export type Calibrator = Readonly<{
  method: "TEMPERATURE_SCALING";
  temperature: number;
  /** How many validation samples it was fitted on. */
  fittedOn: number;
  /** Log loss before and after, on the fitting set. */
  logLossBefore: number;
  logLossAfter: number;
}>;

export const IDENTITY_CALIBRATOR: Calibrator = Object.freeze({
  method: "TEMPERATURE_SCALING",
  temperature: 1,
  fittedOn: 0,
  logLossBefore: Number.NaN,
  logLossAfter: Number.NaN,
});

export function applyTemperature(
  probabilities: readonly number[],
  temperature: number,
): readonly number[] {
  if (!Number.isFinite(temperature) || temperature <= 0)
    return [...probabilities];
  const powered = probabilities.map((probability) =>
    Math.pow(Math.max(1e-12, probability), 1 / temperature),
  );
  const total = powered.reduce((sum, value) => sum + value, 0);
  return total > 0 ? powered.map((value) => value / total) : [...probabilities];
}

export function calibrate(
  samples: readonly ProbabilisticSample[],
  calibrator: Calibrator,
): readonly ProbabilisticSample[] {
  return samples.map((sample) => ({
    probabilities: applyTemperature(
      sample.probabilities,
      calibrator.temperature,
    ),
    observedIndex: sample.observedIndex,
  }));
}

/**
 * Fits the temperature by golden-section search on log loss.
 *
 * A one-dimensional search rather than a gradient step because the objective
 * is cheap, the interval is known, and a deterministic search means the fitted
 * temperature goes into the model artifact's fingerprint reproducibly.
 *
 * Returns the identity calibrator when the search finds no improvement, so
 * "calibration did not help" is represented as T = 1 rather than as a
 * marginally-different number that implies it did.
 */
export function fitTemperature(
  validationSamples: readonly ProbabilisticSample[],
  options: Readonly<{
    lower?: number;
    upper?: number;
    iterations?: number;
    /** Minimum log-loss improvement to accept a non-identity temperature. */
    minimumImprovement?: number;
  }> = {},
): Calibrator {
  const lower = options.lower ?? 0.5;
  const upper = options.upper ?? 2.5;
  const iterations = options.iterations ?? 60;
  const minimumImprovement = options.minimumImprovement ?? 1e-5;
  if (validationSamples.length === 0) return IDENTITY_CALIBRATOR;

  const objective = (temperature: number) =>
    logLoss(
      validationSamples.map((sample) => ({
        probabilities: applyTemperature(sample.probabilities, temperature),
        observedIndex: sample.observedIndex,
      })),
    );

  const inverseGolden = (Math.sqrt(5) - 1) / 2;
  let a = lower;
  let b = upper;
  let c = b - inverseGolden * (b - a);
  let d = a + inverseGolden * (b - a);
  let fc = objective(c);
  let fd = objective(d);
  for (let step = 0; step < iterations && b - a > 1e-6; step += 1) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - inverseGolden * (b - a);
      fc = objective(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + inverseGolden * (b - a);
      fd = objective(d);
    }
  }
  const temperature = (a + b) / 2;
  const logLossBefore = objective(1);
  const logLossAfter = objective(temperature);
  if (logLossBefore - logLossAfter < minimumImprovement)
    return {
      ...IDENTITY_CALIBRATOR,
      fittedOn: validationSamples.length,
      logLossBefore,
      logLossAfter: logLossBefore,
    };
  return {
    method: "TEMPERATURE_SCALING",
    // Rounded so the artifact fingerprint does not churn on the last bits of
    // a floating-point search that has already converged well past precision.
    temperature: Number(temperature.toFixed(6)),
    fittedOn: validationSamples.length,
    logLossBefore,
    logLossAfter,
  };
}
