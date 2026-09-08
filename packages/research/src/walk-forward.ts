/**
 * Walk-forward evaluation, and the guard that makes it trustworthy.
 *
 * A random train/test split is meaningless for football. Team strength drifts,
 * squads change, and a random split lets the model learn from April to predict
 * the previous October — an advantage it will never have in production. So
 * every window trains strictly before its own prediction period and the
 * cutoff advances forward in time, exactly as the live pipeline does.
 *
 * The final holdout is separated once, before any hyperparameter is chosen,
 * and nothing in the tuning path is allowed to see it.
 */

export type DatedRecord = Readonly<{ kickoffDate: string }>;

export type WalkForwardWindow = Readonly<{
  index: number;
  /** Exclusive upper bound on training data, `YYYY-MM-DD`. */
  trainingCutoff: string;
  /** Inclusive lower bound on the prediction period. */
  predictFrom: string;
  /** Exclusive upper bound on the prediction period. */
  predictUntil: string;
}>;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export type WalkForwardPlan = Readonly<{
  windows: readonly WalkForwardWindow[];
  /** Where the untouched holdout begins. */
  holdoutFrom: string;
  trainingRecords: number;
  validationRecords: number;
  holdoutRecords: number;
}>;

/**
 * Splits a corpus into rolling validation windows plus one untouched holdout.
 *
 * `holdoutFraction` is taken from the *end* of the timeline, not sampled, so
 * the holdout is the most recent stretch of matches — the closest thing
 * available to "what happens next", which is the only question that matters.
 */
export function planWalkForward<T extends DatedRecord>(
  records: readonly T[],
  options: Readonly<{
    /** How much history the first window trains on, in days. */
    initialTrainingDays: number;
    /** How far each window predicts, in days. */
    stepDays: number;
    holdoutFraction: number;
  }>,
): WalkForwardPlan {
  const sorted = [...records].sort((left, right) =>
    left.kickoffDate.localeCompare(right.kickoffDate),
  );
  if (sorted.length === 0)
    return {
      windows: [],
      holdoutFrom: "9999-12-31",
      trainingRecords: 0,
      validationRecords: 0,
      holdoutRecords: 0,
    };

  const holdoutIndex = Math.max(
    0,
    Math.floor(sorted.length * (1 - options.holdoutFraction)),
  );
  const holdoutFrom = sorted[holdoutIndex]?.kickoffDate ?? "9999-12-31";
  const first = sorted[0]!.kickoffDate;

  const windows: WalkForwardWindow[] = [];
  let cutoff = addDays(first, options.initialTrainingDays);
  let index = 0;
  while (cutoff < holdoutFrom) {
    const predictUntil = addDays(cutoff, options.stepDays);
    windows.push({
      index,
      trainingCutoff: cutoff,
      predictFrom: cutoff,
      predictUntil: predictUntil < holdoutFrom ? predictUntil : holdoutFrom,
    });
    cutoff = predictUntil;
    index += 1;
  }

  const validationFrom = windows[0]?.predictFrom ?? holdoutFrom;
  return {
    windows,
    holdoutFrom,
    trainingRecords: sorted.filter(
      (record) => record.kickoffDate < validationFrom,
    ).length,
    validationRecords: sorted.filter(
      (record) =>
        record.kickoffDate >= validationFrom &&
        record.kickoffDate < holdoutFrom,
    ).length,
    holdoutRecords: sorted.filter((record) => record.kickoffDate >= holdoutFrom)
      .length,
  };
}

export type LeakageReport = Readonly<{
  ok: boolean;
  violations: readonly Readonly<{
    windowIndex: number;
    kind:
      | "TRAINING_ON_OR_AFTER_CUTOFF"
      | "PREDICTION_BEFORE_CUTOFF"
      | "WINDOW_OVERLAPS_HOLDOUT"
      | "WINDOWS_NOT_MONOTONIC";
    detail: string;
  }>[];
}>;

/**
 * Checks a plan and its realised splits for the four ways this can go wrong.
 *
 * Written as an assertion over the *actual* record sets rather than over the
 * window bounds alone. Bounds that look right and a filter that used `<=`
 * where it needed `<` produce a leak that no amount of reading the window
 * definition would reveal.
 */
export function auditWalkForward<T extends DatedRecord>(
  plan: WalkForwardPlan,
  realised: readonly Readonly<{
    windowIndex: number;
    training: readonly T[];
    predicted: readonly T[];
  }>[],
): LeakageReport {
  const violations: Array<{
    windowIndex: number;
    kind:
      | "TRAINING_ON_OR_AFTER_CUTOFF"
      | "PREDICTION_BEFORE_CUTOFF"
      | "WINDOW_OVERLAPS_HOLDOUT"
      | "WINDOWS_NOT_MONOTONIC";
    detail: string;
  }> = [];

  plan.windows.forEach((window, position) => {
    const previous = plan.windows[position - 1];
    if (previous && window.trainingCutoff <= previous.trainingCutoff)
      violations.push({
        windowIndex: window.index,
        kind: "WINDOWS_NOT_MONOTONIC",
        detail: `${previous.trainingCutoff} then ${window.trainingCutoff}`,
      });
    if (window.predictUntil > plan.holdoutFrom)
      violations.push({
        windowIndex: window.index,
        kind: "WINDOW_OVERLAPS_HOLDOUT",
        detail: `${window.predictUntil} > ${plan.holdoutFrom}`,
      });
  });

  for (const entry of realised) {
    const window = plan.windows.find(
      (item) => item.index === entry.windowIndex,
    );
    if (!window) continue;
    const late = entry.training.find(
      (record) => record.kickoffDate >= window.trainingCutoff,
    );
    if (late)
      violations.push({
        windowIndex: window.index,
        kind: "TRAINING_ON_OR_AFTER_CUTOFF",
        detail: `${late.kickoffDate} >= ${window.trainingCutoff}`,
      });
    const early = entry.predicted.find(
      (record) => record.kickoffDate < window.predictFrom,
    );
    if (early)
      violations.push({
        windowIndex: window.index,
        kind: "PREDICTION_BEFORE_CUTOFF",
        detail: `${early.kickoffDate} < ${window.predictFrom}`,
      });
  }

  return { ok: violations.length === 0, violations };
}
