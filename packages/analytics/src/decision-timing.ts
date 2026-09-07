/**
 * The timing-aware decision lifecycle.
 *
 * The previous policy treated a missing lineup as globally disqualifying, and
 * that is too coarse to be honest. Official XIs are published about an hour
 * before kickoff, so at T-24h *every* market has a missing lineup — and
 * reporting those as failed quality checks told the owner that a working
 * pipeline was broken, dozens of times a day.
 *
 * The fix is to separate two questions the old policy answered together:
 *
 * - **Is this a final decision?** Only near kickoff, with the evidence a
 *   final decision needs. Nothing here relaxes that.
 * - **Is this worth watching?** Answerable much earlier, from the market
 *   coverage and the model estimate that genuinely do exist at T-24h.
 *
 * So a market a day out with good coverage, a fresh price and a model estimate
 * becomes EARLY_RESEARCH or WATCH — a real state with real content — instead of
 * a Grade F. It is emphatically *not* a recommendation: FORTRESS still requires
 * lineup confirmation wherever the competition supports lineups, and that
 * requirement is untouched by anything in this module.
 */

export type LineupAvailabilityState =
  "LINEUP_AVAILABLE" | "LINEUP_NOT_PUBLISHED_YET" | "LINEUP_NOT_COVERED";

/**
 * Where a market sits in its own lifecycle.
 *
 * The first four are pre-decision states — they describe how far the evidence
 * has got, not what to do. Only the last four are decisions, and they are
 * produced by the existing gates rather than by this module.
 */
export type DecisionLifecycleState =
  | "EARLY_RESEARCH"
  | "WATCH"
  | "WAIT_FOR_LINEUP"
  | "READY_FOR_FINAL_EVALUATION"
  | "NO_BET"
  | "EDGE"
  | "STRONG_EDGE"
  | "FORTRESS";

/** Minutes before kickoff at which a market becomes a final-evaluation candidate. */
export const FINAL_EVALUATION_WINDOW_MINUTES = 120;

/**
 * Minutes before kickoff after which a covered-but-absent lineup stops being
 * normal.
 *
 * Before this, "no lineup yet" is simply the truth about the world. After it,
 * a competition whose coverage promises lineups and has not delivered one is
 * a fixture an operator may want to look at.
 */
export const LINEUP_EXPECTED_WITHIN_MINUTES = 75;

export type TimingInput = Readonly<{
  /** Negative once the match has started. */
  minutesToKickoff: number;
  lineup: LineupAvailabilityState;
  /** Whether the market has enough bookmakers for a consensus. */
  marketCoverageSufficient: boolean;
  /** Whether the newest price is inside the freshness policy. */
  priceFresh: boolean;
  /** Whether the model produced a probability for this market at all. */
  modelEstimateAvailable: boolean;
  /** Whether a measured uncertainty band exists for it. */
  uncertaintyAvailable: boolean;
}>;

export type TimingAssessment = Readonly<{
  state: DecisionLifecycleState;
  /**
   * Whether the final decision gates should run at all. False means the
   * market is still gathering evidence and no EDGE/FORTRESS answer is due.
   */
  finalEvaluationDue: boolean;
  /**
   * Whether a missing lineup should count against quality *right now*. False
   * at T-24h, because there is nothing to be missing yet.
   */
  lineupCountsAgainstQuality: boolean;
  /** Whether this competition can ever satisfy a lineup requirement. */
  lineupObtainable: boolean;
  reasonCodes: readonly string[];
  /** Minutes until the pipeline should look at this market again. */
  nextReviewInMinutes: number | null;
}>;

/**
 * Where in its lifecycle a market currently sits.
 *
 * Deliberately says nothing about edge or expected value. Mixing "is the
 * evidence complete" with "is the price good" is what produced a policy that
 * could neither explain an early market nor refuse a late one.
 */
export function assessTiming(input: TimingInput): TimingAssessment {
  const reasonCodes: string[] = [];
  const lineupObtainable = input.lineup !== "LINEUP_NOT_COVERED";

  if (input.minutesToKickoff <= 0)
    return {
      state: "NO_BET",
      finalEvaluationDue: false,
      lineupCountsAgainstQuality: false,
      lineupObtainable,
      reasonCodes: ["EVENT_STARTED"],
      nextReviewInMinutes: null,
    };

  /*
   * Evidence that has nothing to do with timing. A market with two
   * bookmakers or a stale price is not "early", it is inadequate, and saying
   * so plainly is more useful than a lifecycle state.
   */
  if (!input.marketCoverageSufficient)
    reasonCodes.push("INSUFFICIENT_BOOKMAKER_COVERAGE");
  if (!input.priceFresh) reasonCodes.push("STALE_MARKET");
  if (!input.modelEstimateAvailable) reasonCodes.push("NO_MODEL_ESTIMATE");
  if (!input.uncertaintyAvailable) reasonCodes.push("UNCERTAINTY_UNAVAILABLE");

  const evidenceUsable =
    input.marketCoverageSufficient &&
    input.priceFresh &&
    input.modelEstimateAvailable;

  const beforeFinalWindow =
    input.minutesToKickoff > FINAL_EVALUATION_WINDOW_MINUTES;

  if (input.lineup === "LINEUP_AVAILABLE") {
    reasonCodes.push("LINEUP_CONFIRMED");
    return {
      state: evidenceUsable ? "READY_FOR_FINAL_EVALUATION" : "WATCH",
      finalEvaluationDue: evidenceUsable,
      /* Confirmed: the lineup can only help from here. */
      lineupCountsAgainstQuality: false,
      lineupObtainable,
      reasonCodes,
      nextReviewInMinutes: evidenceUsable ? null : 15,
    };
  }

  if (input.lineup === "LINEUP_NOT_COVERED") {
    /*
     * A separate policy on purpose. This competition will never produce a
     * lineup, so holding its markets at WAIT_FOR_LINEUP forever would be a
     * quiet permanent block dressed up as a temporary one. They may reach a
     * final evaluation near kickoff — and FORTRESS still refuses them, since
     * FORTRESS requires final pre-match evidence this competition cannot
     * supply.
     */
    reasonCodes.push("LINEUP_NOT_COVERED");
    return {
      state: beforeFinalWindow
        ? evidenceUsable
          ? "WATCH"
          : "EARLY_RESEARCH"
        : evidenceUsable
          ? "READY_FOR_FINAL_EVALUATION"
          : "NO_BET",
      finalEvaluationDue: !beforeFinalWindow && evidenceUsable,
      lineupCountsAgainstQuality: false,
      lineupObtainable,
      reasonCodes,
      nextReviewInMinutes: beforeFinalWindow
        ? Math.max(
            15,
            Math.ceil(input.minutesToKickoff - FINAL_EVALUATION_WINDOW_MINUTES),
          )
        : null,
    };
  }

  /* LINEUP_NOT_PUBLISHED_YET from here on. */
  const lineupOverdue =
    input.minutesToKickoff <= LINEUP_EXPECTED_WITHIN_MINUTES;

  if (lineupOverdue) {
    /*
     * The one case that genuinely warrants WAIT_FOR_LINEUP: coverage says the
     * lineup exists, kickoff is close enough that it should have appeared,
     * and it has not.
     */
    reasonCodes.push("LINEUP_EXPECTED_BUT_ABSENT");
    return {
      state: "WAIT_FOR_LINEUP",
      finalEvaluationDue: false,
      lineupCountsAgainstQuality: true,
      lineupObtainable,
      reasonCodes,
      nextReviewInMinutes: 8,
    };
  }

  reasonCodes.push("LINEUP_PENDING_NOT_YET_DUE");
  return {
    state: evidenceUsable
      ? beforeFinalWindow
        ? "WATCH"
        : "WATCH"
      : "EARLY_RESEARCH",
    finalEvaluationDue: false,
    /*
     * The heart of the change. Before the lineup is due, its absence is a
     * fact about the calendar and must not be scored as a data-quality
     * failure — that is what turned every early market into a Grade F.
     */
    lineupCountsAgainstQuality: false,
    lineupObtainable,
    reasonCodes,
    nextReviewInMinutes: Math.max(
      8,
      Math.ceil(input.minutesToKickoff - LINEUP_EXPECTED_WITHIN_MINUTES),
    ),
  };
}

/**
 * Whether FORTRESS may be considered at all for this market.
 *
 * Separate from `assessTiming` and deliberately strict: FORTRESS requires
 * final pre-match evidence, so where a competition supports lineups it
 * requires a confirmed one, and where it does not it is refused outright
 * rather than waved through on the grounds that nothing better is available.
 * This is the conservative reading and it is not relaxed by the timing
 * lifecycle.
 */
export function fortressEvidenceSatisfied(
  input: Readonly<{
    lineup: LineupAvailabilityState;
    minutesToKickoff: number;
  }>,
): Readonly<{ satisfied: boolean; reasonCodes: readonly string[] }> {
  if (input.minutesToKickoff <= 0)
    return { satisfied: false, reasonCodes: ["EVENT_STARTED"] };
  if (input.lineup === "LINEUP_AVAILABLE")
    return { satisfied: true, reasonCodes: ["LINEUP_CONFIRMED"] };
  if (input.lineup === "LINEUP_NOT_COVERED")
    return {
      satisfied: false,
      reasonCodes: ["FORTRESS_REQUIRES_LINEUP", "LINEUP_NOT_COVERED"],
    };
  return {
    satisfied: false,
    reasonCodes: ["FORTRESS_REQUIRES_LINEUP", "LINEUP_NOT_PUBLISHED_YET"],
  };
}

/**
 * Maps a lifecycle state onto what a customer surface may claim.
 *
 * `PRELIMINARY` exists so an early market can be shown with its real evidence
 * and no implication of a recommendation. Only a state the final gates
 * produced may be presented as a recommendation, which is why this returns
 * `RECOMMENDATION` for exactly three states and nothing else.
 */
export type CustomerPresentation =
  | "HIDDEN"
  | "PRELIMINARY"
  | "AWAITING_FINAL_EVIDENCE"
  | "RECOMMENDATION"
  | "NO_BET";

export function customerPresentation(
  state: DecisionLifecycleState,
): CustomerPresentation {
  switch (state) {
    case "EARLY_RESEARCH":
      /* Not enough usable evidence to say anything a customer can act on. */
      return "HIDDEN";
    case "WATCH":
      return "PRELIMINARY";
    case "WAIT_FOR_LINEUP":
    case "READY_FOR_FINAL_EVALUATION":
      return "AWAITING_FINAL_EVIDENCE";
    case "EDGE":
    case "STRONG_EDGE":
    case "FORTRESS":
      return "RECOMMENDATION";
    case "NO_BET":
      return "NO_BET";
  }
}
