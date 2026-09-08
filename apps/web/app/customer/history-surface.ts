export type DecisionHistoryItem = Readonly<{
  id: string;
  decidedAt: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  selection: string;
  decisionState: "STRONG_EDGE" | "EDGE" | "WATCH" | "EDGE_DISAPPEARED";
  modelProbability: string;
  oddsAtDecision: string;
  fairOdds: string;
  expectedValue: string;
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
  period: string;
  modelVersion: string;
  decisions: readonly DecisionHistoryItem[];
}>;
