import { NO_VIG_NORMALIZATION_VERSION } from "./consensus.js";
import { QUALITY_POLICY_VERSION } from "./quality.js";
import { RANK_POLICY_VERSION } from "./ranking.js";

export type SourceObservation = Readonly<{
  readonly provider: string;
  readonly externalId: string;
  readonly observedAt: string;
  readonly receivedAt: string;
  readonly normalizedAt: string;
  readonly normalizationVersion: typeof NO_VIG_NORMALIZATION_VERSION;
}>;

export type ModelProvenance = Readonly<{
  readonly modelVersion: string;
  readonly dataCutoff: string;
  readonly normalizationVersion: typeof NO_VIG_NORMALIZATION_VERSION;
  readonly qualityPolicyVersion: typeof QUALITY_POLICY_VERSION;
  readonly rankingPolicyVersion: typeof RANK_POLICY_VERSION;
  readonly sourceObservations: readonly SourceObservation[];
}>;

export type ProvenanceValidation =
  | Readonly<{ readonly ok: true; readonly value: ModelProvenance }>
  | Readonly<{
      readonly ok: false;
      readonly error: Readonly<{
        readonly code: "INVALID_PROVENANCE" | "PROVENANCE_AFTER_CUTOFF";
      }>;
    }>;

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function freezeProvenance(value: ModelProvenance): ModelProvenance {
  return Object.freeze({
    ...value,
    sourceObservations: Object.freeze(
      value.sourceObservations.map((observation) =>
        Object.freeze({ ...observation }),
      ),
    ),
  });
}

/** Validates source-level provenance required to reproduce a model prediction. */
export function validateModelProvenance(
  input: ModelProvenance,
): ProvenanceValidation {
  const cutoff = timestamp(input.dataCutoff);
  if (
    !input.modelVersion ||
    cutoff === null ||
    input.sourceObservations.length === 0
  )
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code: "INVALID_PROVENANCE" }),
    });
  for (const observation of input.sourceObservations) {
    const observedAt = timestamp(observation.observedAt);
    const receivedAt = timestamp(observation.receivedAt);
    const normalizedAt = timestamp(observation.normalizedAt);
    if (
      !observation.provider ||
      !observation.externalId ||
      observedAt === null ||
      receivedAt === null ||
      normalizedAt === null ||
      observedAt > receivedAt ||
      receivedAt > normalizedAt
    )
      return Object.freeze({
        ok: false,
        error: Object.freeze({ code: "INVALID_PROVENANCE" }),
      });
    if (normalizedAt > cutoff)
      return Object.freeze({
        ok: false,
        error: Object.freeze({ code: "PROVENANCE_AFTER_CUTOFF" }),
      });
  }
  return Object.freeze({ ok: true, value: freezeProvenance(input) });
}
