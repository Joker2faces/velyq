import { decimalOdds, type DecimalString } from "@velyq/decimal";

import type { DecisionQuality } from "./quality.js";

export type EventOutcome = Readonly<{
  readonly status: "WIN" | "LOSS" | "VOID" | "UNAVAILABLE";
  readonly resultReference: string | null;
}>;

export type PostMatchAutopsyInput = Readonly<{
  readonly decisionId: string;
  readonly quality: DecisionQuality;
  readonly outcome: EventOutcome;
  readonly closingOdds: string | null;
}>;

export type ClosingLine = Readonly<{
  readonly status: "AVAILABLE" | "UNAVAILABLE";
  readonly odds: DecimalString | null;
}>;

export type PostMatchAutopsy = Readonly<{
  readonly decisionId: string;
  readonly decisionQuality: DecisionQuality;
  readonly eventOutcome: EventOutcome;
  readonly closingLine: ClosingLine;
}>;

function freezeQuality(quality: DecisionQuality): DecisionQuality {
  return Object.freeze({
    ...quality,
    reasonCodes: Object.freeze([...quality.reasonCodes]),
    riskFlags: Object.freeze([...quality.riskFlags]),
    invalidationConditions: Object.freeze([...quality.invalidationConditions]),
  });
}

/** Records observed outcome and optional closing line without deriving performance claims. */
export function createPostMatchAutopsy(
  input: PostMatchAutopsyInput,
): PostMatchAutopsy {
  const parsedClosing =
    input.closingOdds === null ? null : decimalOdds(input.closingOdds);
  const closingLine = parsedClosing?.ok
    ? Object.freeze({
        status: "AVAILABLE" as const,
        odds: parsedClosing.value.value,
      })
    : Object.freeze({ status: "UNAVAILABLE" as const, odds: null });
  return Object.freeze({
    decisionId: input.decisionId,
    decisionQuality: freezeQuality(input.quality),
    eventOutcome: Object.freeze({ ...input.outcome }),
    closingLine,
  });
}
