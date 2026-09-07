import {
  addDecimalStrings,
  divideDecimalStrings,
  multiplyDecimalStrings,
  probability,
  subtractDecimalStrings,
  type DecimalString,
} from "@velyq/decimal";

export type AuditRecord = Readonly<{
  readonly probability: string;
  readonly outcome: 0 | 1;
}>;

export type CalibrationBin = Readonly<{
  readonly range: string;
  readonly count: number;
  readonly averageProbability: DecimalString;
  readonly observedRate: DecimalString;
}>;

export type ModelAuditInput = Readonly<{
  readonly records: readonly AuditRecord[];
  readonly baselineProbability: string | null;
  readonly binCount: number;
}>;

export type ModelAudit = Readonly<{
  readonly brierScore: DecimalString;
  readonly logLoss: number;
  readonly calibration: readonly CalibrationBin[];
  readonly coverage: Readonly<{
    readonly evaluated: number;
    readonly total: number;
  }>;
  readonly baselineComparison: Readonly<{
    readonly brierScore: DecimalString;
    readonly brierImprovement: DecimalString;
  }> | null;
}>;

export type ModelAuditResult =
  | Readonly<{ readonly ok: true; readonly value: ModelAudit }>
  | Readonly<{
      readonly ok: false;
      readonly error: Readonly<{
        readonly code:
          | "INVALID_AUDIT_RECORD"
          | "INVALID_BASELINE_PROBABILITY"
          | "INVALID_BIN_COUNT";
      }>;
    }>;

const ZERO = "0" as DecimalString;

function sum(values: readonly DecimalString[]): DecimalString | null {
  let total = ZERO;
  for (const value of values) {
    const next = addDecimalStrings(total, value);
    if (!next.ok) return null;
    total = next.value;
  }
  return total;
}

function mean(values: readonly DecimalString[]): DecimalString | null {
  const total = sum(values);
  if (!total || values.length === 0) return null;
  const result = divideDecimalStrings(
    total,
    String(values.length) as DecimalString,
  );
  return result.ok ? result.value : null;
}

function brier(
  probabilities: readonly DecimalString[],
  outcomes: readonly (0 | 1)[],
): DecimalString | null {
  const errors: DecimalString[] = [];
  for (let index = 0; index < probabilities.length; index += 1) {
    const difference = subtractDecimalStrings(
      probabilities[index]!,
      String(outcomes[index]!) as DecimalString,
    );
    if (!difference.ok) return null;
    const squared = multiplyDecimalStrings(difference.value, difference.value);
    if (!squared.ok) return null;
    errors.push(squared.value);
  }
  return mean(errors);
}

function binRange(index: number, count: number): string {
  const start = (index / count).toString();
  const end = ((index + 1) / count).toString();
  return index === count - 1 ? `[${start},${end}]` : `[${start},${end})`;
}

function calibration(
  probabilities: readonly DecimalString[],
  outcomes: readonly (0 | 1)[],
  binCount: number,
): readonly CalibrationBin[] {
  const bins = Array.from({ length: binCount }, () => [] as number[]);
  probabilities.forEach((value, index) => {
    const bucket = Math.min(binCount - 1, Math.floor(Number(value) * binCount));
    bins[bucket]!.push(index);
  });
  return Object.freeze(
    bins.flatMap((indices, index) => {
      if (indices.length === 0) return [];
      const values = indices.map((item) => probabilities[item]!);
      const outcomesInBin = indices.map(
        (item) => String(outcomes[item]!) as DecimalString,
      );
      const averageProbability = mean(values);
      const observedRate = mean(outcomesInBin);
      if (!averageProbability || !observedRate) return [];
      return [
        Object.freeze({
          range: binRange(index, binCount),
          count: indices.length,
          averageProbability,
          observedRate,
        }),
      ];
    }),
  );
}

/** Audits observed predictions only; invalid rows are rejected rather than excluded. */
export function evaluateModelAudit(input: ModelAuditInput): ModelAuditResult {
  if (
    !Number.isInteger(input.binCount) ||
    input.binCount < 1 ||
    input.binCount > 100
  )
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code: "INVALID_BIN_COUNT" }),
    });
  const probabilities: DecimalString[] = [];
  const outcomes: (0 | 1)[] = [];
  for (const record of input.records) {
    const parsed = probability(record.probability);
    if (
      !parsed.ok ||
      parsed.value.value === ZERO ||
      parsed.value.value === ("1" as DecimalString) ||
      (record.outcome !== 0 && record.outcome !== 1)
    )
      return Object.freeze({
        ok: false,
        error: Object.freeze({ code: "INVALID_AUDIT_RECORD" }),
      });
    probabilities.push(parsed.value.value);
    outcomes.push(record.outcome);
  }
  if (probabilities.length === 0)
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code: "INVALID_AUDIT_RECORD" }),
    });
  const brierScore = brier(probabilities, outcomes);
  if (!brierScore)
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code: "INVALID_AUDIT_RECORD" }),
    });
  const logLoss =
    probabilities.reduce((total, value, index) => {
      const numericProbability = Number(value);
      return (
        total -
        (outcomes[index] === 1
          ? Math.log(numericProbability)
          : Math.log(1 - numericProbability))
      );
    }, 0) / probabilities.length;

  let baselineComparison: ModelAudit["baselineComparison"] = null;
  if (input.baselineProbability !== null) {
    const baseline = probability(input.baselineProbability);
    if (!baseline.ok)
      return Object.freeze({
        ok: false,
        error: Object.freeze({ code: "INVALID_BASELINE_PROBABILITY" }),
      });
    const baselineScore = brier(
      probabilities.map(() => baseline.value.value),
      outcomes,
    );
    if (!baselineScore)
      return Object.freeze({
        ok: false,
        error: Object.freeze({ code: "INVALID_BASELINE_PROBABILITY" }),
      });
    const improvement = subtractDecimalStrings(baselineScore, brierScore);
    if (!improvement.ok)
      return Object.freeze({
        ok: false,
        error: Object.freeze({ code: "INVALID_BASELINE_PROBABILITY" }),
      });
    baselineComparison = Object.freeze({
      brierScore: baselineScore,
      brierImprovement: improvement.value,
    });
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      brierScore,
      logLoss,
      calibration: calibration(probabilities, outcomes, input.binCount),
      coverage: Object.freeze({
        evaluated: probabilities.length,
        total: input.records.length,
      }),
      baselineComparison,
    }),
  });
}
