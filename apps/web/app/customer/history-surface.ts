export type DecisionHistoryItem = Readonly<{
  id: string;
  decidedAt: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  selection: string;
  decisionState:
    | "STRONG_EDGE"
    | "EDGE"
    | "WATCH"
    | "NO_BET"
    | "WAIT"
    | "WAIT_FOR_LINEUP"
    | "INSUFFICIENT_DATA"
    | "EDGE_DISAPPEARED";
  modelProbability: string;
  oddsAtDecision: string | null;
  fairOdds: string | null;
  expectedValue: string | null;
  finalScore: string;
  settlement: "WIN" | "LOSS" | "VOID" | "UNSETTLED";
  closingOdds: string | null;
  clv: string | null;
  modelVersion: string;
  priceQuality: "POSITIVE_CLV" | "NEGATIVE_CLV" | "UNAVAILABLE";
}>;

export type HistorySurfaceDto = Readonly<{
  syntheticLabel: "Synthetic data" | "Live data";
  asOf: string;
  period: "DEMO_SAMPLE" | "ALL_PERSISTED";
  modelVersion: string;
  decisions: readonly DecisionHistoryItem[];
  /** Whether an older page exists beyond this one. */
  hasMore: boolean;
  /** Opaque keyset cursor for the next page; null when `hasMore` is false. */
  nextCursor: string | null;
}>;
