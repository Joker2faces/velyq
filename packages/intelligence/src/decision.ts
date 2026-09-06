import { subtractDecimalStrings, type DecimalString } from "@velyq/decimal";

import { MODEL_MATURITY, type PriceValidity } from "./price.js";

export type DecisionState =
  | "STRONG_EDGE"
  | "EDGE"
  | "WATCH"
  | "WAIT"
  | "WAIT_FOR_LINEUP"
  | "NO_BET"
  | "INSUFFICIENT_DATA"
  | "EDGE_DISAPPEARED";

export type DecisionInput = Readonly<{
  readonly price: PriceValidity;
  readonly freshness: "FRESH" | "STALE" | "MISSING";
  readonly lineup: "OFFICIAL" | "EXPECTED" | "MISSING" | "CHANGED";
  readonly coverage: "SUFFICIENT" | "LOW" | "MISSING";
  readonly edgePreviouslyPresent: boolean;
}>;

export type DecisionVerdict = Readonly<{
  readonly state: DecisionState;
  readonly modelMaturity: typeof MODEL_MATURITY;
  readonly reasonCodes: readonly string[];
}>;

const STRONG_EDGE_MINIMUM = "0.1" as DecimalString;
const EDGE_MINIMUM = "0.02" as DecimalString;

function verdict(
  state: DecisionState,
  reasonCodes: readonly string[],
): DecisionVerdict {
  return Object.freeze({
    state,
    modelMaturity: MODEL_MATURITY,
    reasonCodes: Object.freeze([...reasonCodes]),
  });
}

function isAtLeast(value: DecimalString, minimum: DecimalString): boolean {
  const difference = subtractDecimalStrings(value, minimum);
  return difference.ok && !difference.value.startsWith("-");
}

export function evaluateDecision(input: DecisionInput): DecisionVerdict {
  if (input.price.status === "INVALID_PRICE")
    return verdict("INSUFFICIENT_DATA", ["INVALID_PRICE"]);
  if (input.freshness === "STALE") return verdict("WAIT", ["STALE_PRICE"]);
  if (input.freshness === "MISSING")
    return verdict("INSUFFICIENT_DATA", ["MISSING_PRICE_FRESHNESS"]);
  if (input.lineup === "MISSING" || input.lineup === "CHANGED")
    return verdict("WAIT_FOR_LINEUP", ["LINEUP_UNAVAILABLE"]);
  if (input.coverage === "LOW" || input.coverage === "MISSING")
    return verdict("INSUFFICIENT_DATA", ["INSUFFICIENT_PRICE_COVERAGE"]);

  if (
    input.edgePreviouslyPresent &&
    (input.price.status === "FAIR" || input.price.status === "UNATTRACTIVE")
  )
    return verdict("EDGE_DISAPPEARED", ["EDGE_NO_LONGER_PRESENT"]);
  if (input.price.status === "FAIR")
    return verdict("NO_BET", ["ZERO_EXPECTED_VALUE"]);
  if (input.price.status === "UNATTRACTIVE")
    return verdict("NO_BET", ["NEGATIVE_EXPECTED_VALUE"]);

  const expectedValue = input.price.expectedValue;
  if (!expectedValue)
    return verdict("INSUFFICIENT_DATA", ["MISSING_EXPECTED_VALUE"]);
  if (isAtLeast(expectedValue, STRONG_EDGE_MINIMUM))
    return verdict("STRONG_EDGE", ["MATERIAL_POSITIVE_EXPECTED_VALUE"]);
  if (isAtLeast(expectedValue, EDGE_MINIMUM))
    return verdict("EDGE", ["POSITIVE_EXPECTED_VALUE"]);
  return verdict("WATCH", ["MARGINAL_POSITIVE_EXPECTED_VALUE"]);
}
