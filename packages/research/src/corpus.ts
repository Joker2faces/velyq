/** The shape the rest of the research pipeline consumes. */

export type ResearchMarketCode =
  | "FOOTBALL_FULL_TIME_1X2"
  | "FOOTBALL_FULL_TIME_TOTAL"
  | "FOOTBALL_FULL_TIME_BTTS";

export type ResearchOutcomeCode =
  "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER" | "YES" | "NO";

/**
 * When the price was observed relative to kickoff.
 *
 * This distinction is the whole reason a backtest can be trusted.
 * Football-Data collects its non-closing prices "Friday afternoons" for
 * weekend games and "Tuesday afternoons" for midweek games — genuinely before
 * kickoff, so they are legitimate decision inputs. The closing prices are by
 * definition the last thing the market knew, so using them to *make* a
 * historical decision would be looking at the answer. They are kept for
 * closing-line comparison and nothing else.
 */
export type PricePhase = "PRE_CLOSING" | "CLOSING";

/**
 * Whose price it is. Football-Data publishes a market average and a market
 * maximum across its bookmaker panel, plus individual bookmakers. The average
 * is the consensus input; the maximum is the best available price and belongs
 * to execution research, not to probability estimation.
 */
export type PriceScope = "AVERAGE" | "MAXIMUM" | "BOOKMAKER";

export type HistoricalQuote = Readonly<{
  marketCode: ResearchMarketCode;
  outcomeCode: ResearchOutcomeCode;
  /** Null for markets whose line is fixed by the definition (1X2, BTTS). */
  line: string | null;
  phase: PricePhase;
  scope: PriceScope;
  /** Null for AVERAGE/MAXIMUM, which are panel aggregates. */
  bookmakerCode: string | null;
  decimalOdds: string;
}>;

export type HistoricalMatch = Readonly<{
  /** The publisher's own division code, e.g. "E0". Never interpreted here. */
  sourceDivision: string;
  /** The publisher's season directory, e.g. "2425". */
  sourceSeason: string;
  /** Canonical season label, e.g. "2024/2025". */
  seasonLabel: string;
  /** UTC date of kickoff, `YYYY-MM-DD`. */
  kickoffDate: string;
  /** `HH:MM` where the file carries it; absent for pre-2019/20 files. */
  kickoffTime: string | null;
  sourceHomeName: string;
  sourceAwayName: string;
  homeGoals: number;
  awayGoals: number;
  halfTimeHomeGoals: number | null;
  halfTimeAwayGoals: number | null;
  quotes: readonly HistoricalQuote[];
}>;

export type RejectionReason =
  | "BLANK_ROW"
  | "MISSING_DIVISION"
  | "MISSING_TEAM"
  | "MISSING_DATE"
  | "INVALID_DATE"
  | "MISSING_SCORE"
  | "INVALID_SCORE"
  | "RESULT_DISAGREES_WITH_SCORE";

export type RejectedRow = Readonly<{
  lineNumber: number;
  reason: RejectionReason;
  /** Enough to find the row in the file, without copying the whole row. */
  detail: string;
}>;

/**
 * Derives both goals-market outcomes from the final score.
 *
 * Football-Data publishes no BTTS market at all and its over/under columns
 * cover only the 2.5 line, so the *outcomes* for those markets have to come
 * from the score rather than from a settled market column. Doing it here, from
 * one source of truth, is what keeps 1X2, totals and BTTS from disagreeing
 * about the same match.
 */
export function derivedOutcomes(
  homeGoals: number,
  awayGoals: number,
): Readonly<{
  result: "HOME" | "DRAW" | "AWAY";
  totalGoals: number;
  over2_5: boolean;
  bttsYes: boolean;
}> {
  return {
    result:
      homeGoals > awayGoals ? "HOME" : homeGoals < awayGoals ? "AWAY" : "DRAW",
    totalGoals: homeGoals + awayGoals,
    over2_5: homeGoals + awayGoals > 2.5,
    bttsYes: homeGoals > 0 && awayGoals > 0,
  };
}
