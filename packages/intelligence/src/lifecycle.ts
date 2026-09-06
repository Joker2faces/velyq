import type { DecisionState } from "./decision.js";

export const DECISION_POLICY_VERSION = "decision.v1" as const;

export type OpportunityTransition = Readonly<{
  readonly from: DecisionState;
  readonly to: DecisionState;
}>;

export type OpportunityTransitionResult =
  | Readonly<{
      readonly ok: true;
      readonly value: OpportunityTransition &
        Readonly<{ readonly policyVersion: typeof DECISION_POLICY_VERSION }>;
    }>
  | Readonly<{
      readonly ok: false;
      readonly error: Readonly<{
        readonly code: "INVALID_DECISION_TRANSITION";
        readonly from: DecisionState;
        readonly to: DecisionState;
        readonly policyVersion: typeof DECISION_POLICY_VERSION;
      }>;
    }>;

function transitions(
  states: readonly DecisionState[],
): readonly DecisionState[] {
  return Object.freeze([...states]);
}

const transitionGraph: Readonly<
  Record<DecisionState, readonly DecisionState[]>
> = Object.freeze({
  STRONG_EDGE: transitions([
    "STRONG_EDGE",
    "EDGE",
    "WATCH",
    "WAIT",
    "WAIT_FOR_LINEUP",
    "NO_BET",
    "INSUFFICIENT_DATA",
    "EDGE_DISAPPEARED",
  ]),
  EDGE: transitions([
    "STRONG_EDGE",
    "EDGE",
    "WATCH",
    "WAIT",
    "WAIT_FOR_LINEUP",
    "NO_BET",
    "INSUFFICIENT_DATA",
    "EDGE_DISAPPEARED",
  ]),
  WATCH: transitions([
    "STRONG_EDGE",
    "EDGE",
    "WATCH",
    "WAIT",
    "WAIT_FOR_LINEUP",
    "NO_BET",
    "INSUFFICIENT_DATA",
    "EDGE_DISAPPEARED",
  ]),
  WAIT: transitions([
    "STRONG_EDGE",
    "EDGE",
    "WATCH",
    "WAIT",
    "WAIT_FOR_LINEUP",
    "NO_BET",
    "INSUFFICIENT_DATA",
  ]),
  WAIT_FOR_LINEUP: transitions([
    "STRONG_EDGE",
    "EDGE",
    "WATCH",
    "WAIT",
    "WAIT_FOR_LINEUP",
    "NO_BET",
    "INSUFFICIENT_DATA",
  ]),
  NO_BET: transitions([
    "STRONG_EDGE",
    "EDGE",
    "WATCH",
    "WAIT",
    "WAIT_FOR_LINEUP",
    "NO_BET",
    "INSUFFICIENT_DATA",
  ]),
  INSUFFICIENT_DATA: transitions([
    "STRONG_EDGE",
    "EDGE",
    "WATCH",
    "WAIT",
    "WAIT_FOR_LINEUP",
    "NO_BET",
    "INSUFFICIENT_DATA",
  ]),
  EDGE_DISAPPEARED: transitions([
    "STRONG_EDGE",
    "EDGE",
    "WATCH",
    "WAIT",
    "WAIT_FOR_LINEUP",
    "NO_BET",
    "INSUFFICIENT_DATA",
    "EDGE_DISAPPEARED",
  ]),
});

/** Validates a state change without mutating or persisting opportunity state. */
export function transitionOpportunity(
  from: DecisionState,
  to: DecisionState,
): OpportunityTransitionResult {
  if (transitionGraph[from].includes(to)) {
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        from,
        to,
        policyVersion: DECISION_POLICY_VERSION,
      }),
    });
  }

  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code: "INVALID_DECISION_TRANSITION",
      from,
      to,
      policyVersion: DECISION_POLICY_VERSION,
    }),
  });
}
