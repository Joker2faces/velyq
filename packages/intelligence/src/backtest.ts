import { decimalOdds, probability, type DecimalString } from "@velyq/decimal";

import type { DecisionQuality } from "./quality.js";
import { validateModelProvenance, type ModelProvenance } from "./provenance.js";

export type BacktestInputKind = "ODDS" | "LINEUP" | "FEATURE";

export type BacktestRecord = Readonly<{
  readonly event: Readonly<{
    readonly id: string;
    readonly startsAt: string;
    readonly completedAt: string;
  }>;
  readonly predictionGeneratedAt: string;
  readonly featureCutoff: string;
  readonly marketObservationCutoff: string;
  readonly modelVersion: string;
  readonly probability: string;
  readonly price: string;
  readonly result: Readonly<{
    readonly outcome: 0 | 1;
    readonly observedAt: string;
  }>;
  readonly quality: DecisionQuality;
  readonly traceability: ModelProvenance;
  readonly inputs: readonly Readonly<{
    readonly kind: BacktestInputKind;
    readonly observedAt: string;
  }>[];
}>;

export type ValidatedBacktestRecord = Omit<
  BacktestRecord,
  "probability" | "price"
> &
  Readonly<{
    readonly probability: DecimalString;
    readonly price: DecimalString;
  }>;

export type BacktestValidation =
  | Readonly<{ readonly ok: true; readonly value: ValidatedBacktestRecord }>
  | Readonly<{
      readonly ok: false;
      readonly error: Readonly<{
        readonly code:
          | "INVALID_BACKTEST_RECORD"
          | "INVALID_PROVENANCE"
          | "FUTURE_ODDS"
          | "FUTURE_LINEUP"
          | "INPUT_BEYOND_CUTOFF"
          | "POST_MATCH_RESULT";
      }>;
    }>;

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function freezeQuality(quality: DecisionQuality): DecisionQuality {
  return Object.freeze({
    ...quality,
    reasonCodes: Object.freeze([...quality.reasonCodes]),
    riskFlags: Object.freeze([...quality.riskFlags]),
    invalidationConditions: Object.freeze([...quality.invalidationConditions]),
  });
}

function freezeRecord(
  input: BacktestRecord,
  probabilityValue: DecimalString,
  priceValue: DecimalString,
): ValidatedBacktestRecord {
  return Object.freeze({
    ...input,
    probability: probabilityValue,
    price: priceValue,
    event: Object.freeze({ ...input.event }),
    result: Object.freeze({ ...input.result }),
    quality: freezeQuality(input.quality),
    traceability: input.traceability,
    inputs: Object.freeze(
      input.inputs.map((item) => Object.freeze({ ...item })),
    ),
  });
}

/** Rejects historical records whose inputs or outcomes could leak future event information. */
export function validateBacktestRecord(
  input: BacktestRecord,
): BacktestValidation {
  const generatedAt = timestamp(input.predictionGeneratedAt);
  const featureCutoff = timestamp(input.featureCutoff);
  const marketCutoff = timestamp(input.marketObservationCutoff);
  const completedAt = timestamp(input.event.completedAt);
  const resultAt = timestamp(input.result.observedAt);
  const parsedProbability = probability(input.probability);
  const parsedPrice = decimalOdds(input.price);
  if (
    !input.event.id ||
    !input.modelVersion ||
    generatedAt === null ||
    featureCutoff === null ||
    marketCutoff === null ||
    completedAt === null ||
    resultAt === null ||
    !parsedProbability.ok ||
    !parsedPrice.ok ||
    (input.result.outcome !== 0 && input.result.outcome !== 1) ||
    featureCutoff > generatedAt ||
    marketCutoff > generatedAt
  )
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code: "INVALID_BACKTEST_RECORD" }),
    });
  const provenance = validateModelProvenance(input.traceability);
  if (!provenance.ok)
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code: "INVALID_PROVENANCE" }),
    });
  const provenanceCutoff = timestamp(provenance.value.dataCutoff);
  if (
    provenance.value.modelVersion !== input.modelVersion ||
    provenanceCutoff === null ||
    provenanceCutoff > generatedAt
  )
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code: "INVALID_PROVENANCE" }),
    });
  if (resultAt <= completedAt)
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code: "POST_MATCH_RESULT" }),
    });
  for (const item of input.inputs) {
    const observedAt = timestamp(item.observedAt);
    if (observedAt === null)
      return Object.freeze({
        ok: false,
        error: Object.freeze({ code: "INVALID_BACKTEST_RECORD" }),
      });
    if (item.kind === "ODDS" && observedAt > marketCutoff)
      return Object.freeze({
        ok: false,
        error: Object.freeze({ code: "FUTURE_ODDS" }),
      });
    if (item.kind === "LINEUP" && observedAt > featureCutoff)
      return Object.freeze({
        ok: false,
        error: Object.freeze({ code: "FUTURE_LINEUP" }),
      });
    if (observedAt > featureCutoff)
      return Object.freeze({
        ok: false,
        error: Object.freeze({ code: "INPUT_BEYOND_CUTOFF" }),
      });
  }
  return Object.freeze({
    ok: true,
    value: freezeRecord(
      input,
      parsedProbability.value.value,
      parsedPrice.value.value,
    ),
  });
}
