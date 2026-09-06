import {
  divideDecimalStrings,
  parseDecimalString,
  subtractDecimalStrings,
  type DecimalString,
} from "@velyq/decimal";

import type { DecisionVerdict } from "./decision.js";
import { DECISION_POLICY_VERSION } from "./lifecycle.js";
import type { DecisionQuality } from "./quality.js";

export const MATERIALITY_POLICY_VERSION = "materiality.v1" as const;

export type DecisionSnapshot = Readonly<{
  readonly price: string | null;
  readonly modelProbability: string | null;
  readonly expectedValue: string | null;
  readonly edge: string | null;
  readonly lineup: "OFFICIAL" | "EXPECTED" | "MISSING" | "CHANGED";
  readonly quality: DecisionQuality;
  readonly decision: DecisionVerdict;
  readonly reasonCodes: readonly string[];
  readonly timestamp: string;
  readonly modelVersion: string;
  readonly cutoff: string;
  readonly traceability: Readonly<{ readonly evidenceIds: readonly string[] }>;
}>;

export type DecisionChangeType =
  "PRICE" | "MODEL" | "LINEUP" | "QUALITY" | "DECISION" | "EDGE" | "EV";

export type DecisionSnapshotChange = Readonly<{
  readonly type: DecisionChangeType;
  readonly policyVersion: typeof MATERIALITY_POLICY_VERSION;
  readonly previous: string | DecisionQuality | DecisionVerdict | null;
  readonly current: string | DecisionQuality | DecisionVerdict | null;
}>;

const ABSOLUTE_DECIMAL_CHANGE = "0.02" as DecimalString;
const RELATIVE_PRICE_CHANGE = "0.02" as DecimalString;

function absolute(value: DecimalString): DecimalString {
  return (value.startsWith("-") ? value.slice(1) : value) as DecimalString;
}

function atLeast(value: DecimalString, threshold: DecimalString): boolean {
  const difference = subtractDecimalStrings(value, threshold);
  return difference.ok && !difference.value.startsWith("-");
}

function parse(value: string | null): DecimalString | null {
  if (value === null) return null;
  const result = parseDecimalString(value);
  return result.ok ? result.value : null;
}

function materiallyDifferent(
  previous: string | null,
  current: string | null,
  threshold: DecimalString,
): boolean {
  if (previous === current) return false;
  const left = parse(previous);
  const right = parse(current);
  if (!left || !right) return true;
  const difference = subtractDecimalStrings(left, right);
  return difference.ok && atLeast(absolute(difference.value), threshold);
}

function materiallyDifferentPrice(
  previous: string | null,
  current: string | null,
): boolean {
  if (previous === current) return false;
  const left = parse(previous);
  const right = parse(current);
  if (!left || !right || left === ("0" as DecimalString)) return true;
  const difference = subtractDecimalStrings(left, right);
  if (!difference.ok) return true;
  const relative = divideDecimalStrings(
    absolute(difference.value),
    absolute(left),
  );
  return relative.ok && atLeast(relative.value, RELATIVE_PRICE_CHANGE);
}

function materiallyDifferentQuality(
  previous: DecisionQuality,
  current: DecisionQuality,
): boolean {
  return (
    previous.grade !== current.grade ||
    Math.abs(previous.score - current.score) >= 15
  );
}

function change(
  type: DecisionChangeType,
  previous: string | DecisionQuality | DecisionVerdict | null,
  current: string | DecisionQuality | DecisionVerdict | null,
): DecisionSnapshotChange {
  return Object.freeze({
    type,
    policyVersion: MATERIALITY_POLICY_VERSION,
    previous,
    current,
  });
}

/** Diffs two stored decision snapshots, omitting changes below materiality thresholds. */
export function diffDecisionSnapshots(
  previous: DecisionSnapshot,
  current: DecisionSnapshot,
): readonly DecisionSnapshotChange[] {
  const changes: DecisionSnapshotChange[] = [];

  if (materiallyDifferentPrice(previous.price, current.price))
    changes.push(change("PRICE", previous.price, current.price));
  if (
    materiallyDifferent(
      previous.modelProbability,
      current.modelProbability,
      ABSOLUTE_DECIMAL_CHANGE,
    )
  )
    changes.push(
      change("MODEL", previous.modelProbability, current.modelProbability),
    );
  if (previous.lineup !== current.lineup)
    changes.push(change("LINEUP", previous.lineup, current.lineup));
  if (materiallyDifferentQuality(previous.quality, current.quality))
    changes.push(change("QUALITY", previous.quality, current.quality));
  if (previous.decision.state !== current.decision.state)
    changes.push(change("DECISION", previous.decision, current.decision));
  if (materiallyDifferent(previous.edge, current.edge, ABSOLUTE_DECIMAL_CHANGE))
    changes.push(change("EDGE", previous.edge, current.edge));
  if (
    materiallyDifferent(
      previous.expectedValue,
      current.expectedValue,
      ABSOLUTE_DECIMAL_CHANGE,
    )
  )
    changes.push(change("EV", previous.expectedValue, current.expectedValue));

  return Object.freeze(changes);
}

export const HISTORY_POLICY_VERSIONS = Object.freeze({
  decision: DECISION_POLICY_VERSION,
  materiality: MATERIALITY_POLICY_VERSION,
});
