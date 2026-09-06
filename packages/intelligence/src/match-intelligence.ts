import { buildEvidenceTimeline, type Evidence } from "./evidence.js";
import {
  diffDecisionSnapshots,
  MATERIALITY_POLICY_VERSION,
  type DecisionSnapshot,
  type DecisionSnapshotChange,
} from "./history.js";
import { DECISION_POLICY_VERSION } from "./lifecycle.js";
import { QUALITY_POLICY_VERSION } from "./quality.js";

export type MatchIntelligenceInput = Readonly<{
  readonly snapshot: DecisionSnapshot;
  readonly evidence: readonly Evidence[];
  readonly previousSnapshot: DecisionSnapshot | null;
}>;

export type MatchIntelligence = Readonly<{
  readonly snapshot: DecisionSnapshot;
  readonly evidenceTimeline: readonly Evidence[];
  readonly changes: readonly DecisionSnapshotChange[];
  readonly policyVersions: Readonly<{
    readonly quality: typeof QUALITY_POLICY_VERSION;
    readonly decision: typeof DECISION_POLICY_VERSION;
    readonly materiality: typeof MATERIALITY_POLICY_VERSION;
  }>;
}>;

function freezeSnapshot(snapshot: DecisionSnapshot): DecisionSnapshot {
  return Object.freeze({
    ...snapshot,
    quality: Object.freeze({
      ...snapshot.quality,
      reasonCodes: Object.freeze([...snapshot.quality.reasonCodes]),
      riskFlags: Object.freeze([...snapshot.quality.riskFlags]),
      invalidationConditions: Object.freeze([
        ...snapshot.quality.invalidationConditions,
      ]),
    }),
    decision: Object.freeze({
      ...snapshot.decision,
      reasonCodes: Object.freeze([...snapshot.decision.reasonCodes]),
    }),
    reasonCodes: Object.freeze([...snapshot.reasonCodes]),
    traceability: Object.freeze({
      evidenceIds: Object.freeze([...snapshot.traceability.evidenceIds]),
    }),
  });
}

/** Builds a serializable audit view without reaching into provider or persistence layers. */
export function buildMatchIntelligence(
  input: MatchIntelligenceInput,
): MatchIntelligence {
  return Object.freeze({
    snapshot: freezeSnapshot(input.snapshot),
    evidenceTimeline: buildEvidenceTimeline(input.evidence),
    changes: input.previousSnapshot
      ? diffDecisionSnapshots(input.previousSnapshot, input.snapshot)
      : Object.freeze([]),
    policyVersions: Object.freeze({
      quality: QUALITY_POLICY_VERSION,
      decision: DECISION_POLICY_VERSION,
      materiality: MATERIALITY_POLICY_VERSION,
    }),
  });
}
