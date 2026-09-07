import type { DecisionState } from "./decision.js";
import { DECISION_POLICY_VERSION } from "./lifecycle.js";
import { QUALITY_POLICY_VERSION } from "./quality.js";

export type InvalidationKind =
  | "PRICE_THRESHOLD"
  | "LINEUP"
  | "STALE_DATA"
  | "QUALITY_DOWNGRADE"
  | "DATA_MISMATCH";

export type InvalidationCondition = Readonly<{
  readonly kind: InvalidationKind;
  readonly code: string;
  readonly threshold: string | null;
}>;

export type VersionedRiskFlag = Readonly<{
  readonly policyVersion: typeof QUALITY_POLICY_VERSION;
  readonly code: string;
}>;

export type DecisionExplanationInput = Readonly<{
  readonly state: Extract<
    DecisionState,
    | "NO_BET"
    | "WAIT"
    | "WAIT_FOR_LINEUP"
    | "INSUFFICIENT_DATA"
    | "EDGE_DISAPPEARED"
  >;
  readonly reasonCodes: readonly string[];
  readonly priceThreshold: string | null;
  readonly observedOdds: string | null;
  readonly lineup: "OFFICIAL" | "EXPECTED" | "MISSING" | "CHANGED";
  readonly freshness: "FRESH" | "STALE" | "MISSING";
  readonly qualityDowngraded: boolean;
  readonly dataMismatch: boolean;
}>;

export type DecisionExplanation = Readonly<{
  readonly policyVersion: typeof DECISION_POLICY_VERSION;
  readonly riskPolicyVersion: typeof QUALITY_POLICY_VERSION;
  readonly state: DecisionExplanationInput["state"];
  readonly reasonCodes: readonly string[];
  readonly invalidationConditions: readonly InvalidationCondition[];
  readonly riskFlags: readonly VersionedRiskFlag[];
}>;

function condition(
  kind: InvalidationKind,
  code: string,
  threshold: string | null,
): InvalidationCondition {
  return Object.freeze({ kind, code, threshold });
}

/** Produces codes and conditions only from explicitly supplied evidence state. */
export function createDecisionExplanation(
  input: DecisionExplanationInput,
): DecisionExplanation {
  const conditions: InvalidationCondition[] = [];
  const risks: VersionedRiskFlag[] = [];
  if (input.priceThreshold !== null && input.observedOdds !== null) {
    conditions.push(
      condition("PRICE_THRESHOLD", "PRICE_BELOW_MINIMUM", input.priceThreshold),
    );
  }
  if (input.lineup !== "OFFICIAL") {
    conditions.push(condition("LINEUP", "LINEUP_REQUIRES_REASSESSMENT", null));
    risks.push(
      Object.freeze({
        policyVersion: QUALITY_POLICY_VERSION,
        code: "LINEUP_UNCERTAIN",
      }),
    );
  }
  if (input.freshness !== "FRESH") {
    conditions.push(condition("STALE_DATA", "REFRESH_EVIDENCE", null));
    risks.push(
      Object.freeze({
        policyVersion: QUALITY_POLICY_VERSION,
        code: "STALE_OR_MISSING_DATA",
      }),
    );
  }
  if (input.qualityDowngraded) {
    conditions.push(condition("QUALITY_DOWNGRADE", "REASSESS_QUALITY", null));
    risks.push(
      Object.freeze({
        policyVersion: QUALITY_POLICY_VERSION,
        code: "QUALITY_DOWNGRADED",
      }),
    );
  }
  if (input.dataMismatch) {
    conditions.push(condition("DATA_MISMATCH", "RECONCILE_SOURCE_DATA", null));
    risks.push(
      Object.freeze({
        policyVersion: QUALITY_POLICY_VERSION,
        code: "DATA_MISMATCH",
      }),
    );
  }
  return Object.freeze({
    policyVersion: DECISION_POLICY_VERSION,
    riskPolicyVersion: QUALITY_POLICY_VERSION,
    state: input.state,
    reasonCodes: Object.freeze([...input.reasonCodes]),
    invalidationConditions: Object.freeze(conditions),
    riskFlags: Object.freeze(risks),
  });
}

export type DecisionTimelineEventType =
  | "EDGE_FOUND"
  | "PRICE_MOVED"
  | "WAITING"
  | "OFFICIAL_LINEUP"
  | "MODEL_UPDATED"
  | "EDGE_CONFIRMED"
  | "EDGE_DISAPPEARED";

export type DecisionTimelineEvent = Readonly<{
  readonly type: DecisionTimelineEventType;
  readonly occurredAt: string;
  readonly evidenceIds: readonly string[];
}>;

/** Sorts supplied audit events by instant without creating unobserved events. */
export function buildDecisionTimeline(
  events: readonly DecisionTimelineEvent[],
): readonly DecisionTimelineEvent[] {
  return Object.freeze(
    events
      .map((event) =>
        Object.freeze({
          ...event,
          evidenceIds: Object.freeze([...event.evidenceIds]),
        }),
      )
      .sort(
        (left, right) =>
          Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
          left.type.localeCompare(right.type),
      ),
  );
}
