import type { DecimalString } from "@velyq/decimal";

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

/** Positive means the available closing price was shorter than the taken price. */
export function closingLineValue(
  offeredOdds: DecimalString,
  closingOdds: DecimalString,
): DecimalString {
  return (Number(offeredOdds) / Number(closingOdds) - 1)
    .toFixed(12)
    .replace(/0+$/, "")
    .replace(/\.$/, "") as DecimalString;
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
  const values = prices.map(Number).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)]!;
  const dispersion = (values.at(-1)! - values[0]!) / median;
  return {
    bookmakerCount: values.length,
    medianOdds: String(median) as DecimalString,
    dispersion: String(dispersion) as DecimalString,
    stability:
      values.length < 2
        ? "UNAVAILABLE"
        : dispersion > 0.12
          ? "FRAGMENTED"
          : dispersion > 0.035
            ? "MOVING"
            : "STABLE",
  };
}
