import {
  compareDecimalStrings,
  divideDecimalStrings,
  roundToScale,
  subtractDecimalStrings,
  type DecimalString,
} from "@velyq/decimal";

/** Matches `market_settlements.clv`'s storage scale (numeric(18,12)). */
const CLV_SCALE = 12;

export type ForecastSnapshot = Readonly<{
  kind: "FORECAST";
  probability: DecimalString;
  confidence: DecimalString | null;
  modelVersion: string;
  featureCutoff: string;
}>;

export type DecisionSnapshot = Readonly<{
  kind: "DECISION";
  status:
    | "STRONG_EDGE"
    | "NO_BET"
    | "WAIT"
    | "WAIT_FOR_LINEUP"
    | "INSUFFICIENT_DATA"
    | "EDGE_DISAPPEARED";
  selection: string;
  offeredOdds: DecimalString | null;
  fairOdds: DecimalString | null;
  expectedValue: DecimalString | null;
  whyNotCodes: readonly string[];
  createdAt: string;
}>;

export type SettlementOutcome = "WIN" | "LOSS" | "VOID" | "UNSETTLED";

/** Pure settlement boundary for the initially supported full-time markets. */
export function settleDecision(
  input: Readonly<{
    market: "1X2" | "OVER_UNDER_2_5";
    selection: "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER";
    status: "FINAL" | "IN_PROGRESS" | "CANCELLED" | "ABANDONED";
    homeScore?: number;
    awayScore?: number;
  }>,
): SettlementOutcome {
  if (input.status === "CANCELLED" || input.status === "ABANDONED")
    return "VOID";
  if (
    input.status !== "FINAL" ||
    input.homeScore === undefined ||
    input.awayScore === undefined
  )
    return "UNSETTLED";
  if (input.market === "1X2") {
    const winner =
      input.homeScore === input.awayScore
        ? "DRAW"
        : input.homeScore > input.awayScore
          ? "HOME"
          : "AWAY";
    return input.selection === winner ? "WIN" : "LOSS";
  }
  const total = input.homeScore + input.awayScore;
  return (input.selection === "OVER" ? total > 2.5 : total < 2.5)
    ? "WIN"
    : "LOSS";
}

/**
 * Positive means the available closing price was shorter than the taken
 * price. Computed with exact decimal arithmetic (`@velyq/decimal`), never a
 * float cast -- this is the headline customer-facing CLV number, not a
 * statistical aggregate where sub-epsilon float error would be immaterial.
 */
export function closingLineValue(
  offeredOdds: DecimalString,
  closingOdds: DecimalString,
): DecimalString {
  const ratio = divideDecimalStrings(offeredOdds, closingOdds);
  /*
   * Both inputs are already-validated decimal odds (> 1) by the time a real
   * caller reaches here (see `eligibleClv`'s guards) -- a decimal-operation
   * failure here means an invariant upstream broke, not a real "no CLV"
   * case, so this throws rather than fabricating 0, which is itself a
   * plausible real CLV value (exact breakeven) and would silently pass as
   * one.
   */
  if (!ratio.ok)
    throw new Error(`closingLineValue: invalid odds (${ratio.error.code})`);
  const clv = subtractDecimalStrings(ratio.value, "1" as DecimalString);
  if (!clv.ok)
    throw new Error(`closingLineValue: invalid odds (${clv.error.code})`);
  const scaled = roundToScale(clv.value, CLV_SCALE);
  if (!scaled.ok)
    throw new Error(`closingLineValue: invalid odds (${scaled.error.code})`);
  return scaled.value;
}

export type MarketConsensus = Readonly<{
  bookmakerCount: number;
  medianOdds: DecimalString | null;
  dispersion: DecimalString | null;
  stability: "STABLE" | "MOVING" | "FRAGMENTED" | "UNAVAILABLE";
}>;

export function summarizeMarketConsensus(
  prices: readonly DecimalString[],
): MarketConsensus {
  if (prices.length === 0)
    return {
      bookmakerCount: 0,
      medianOdds: null,
      dispersion: null,
      stability: "UNAVAILABLE",
    };
  const values = [...prices].sort((a, b) => {
    const comparison = compareDecimalStrings(a, b);
    return comparison.ok ? comparison.value : 0;
  });
  const median = values[Math.floor(values.length / 2)]!;
  const spread = subtractDecimalStrings(values.at(-1)!, values[0]!);
  const dispersionResult = spread.ok
    ? divideDecimalStrings(spread.value, median)
    : spread;
  const dispersion = dispersionResult.ok
    ? dispersionResult.value
    : ("0" as DecimalString);
  const dispersionExceeds = (threshold: string) => {
    const comparison = compareDecimalStrings(
      dispersion,
      threshold as DecimalString,
    );
    return comparison.ok && comparison.value > 0;
  };
  return {
    bookmakerCount: values.length,
    medianOdds: median,
    dispersion,
    stability:
      values.length < 2
        ? "UNAVAILABLE"
        : dispersionExceeds("0.12")
          ? "FRAGMENTED"
          : dispersionExceeds("0.035")
            ? "MOVING"
            : "STABLE",
  };
}
