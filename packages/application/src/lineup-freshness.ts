import { isTerminalLineupStatus, type LineupStatus } from "@velyq/domain";

export const LINEUP_SCHEDULING_POLICY_VERSION = "lineup-scheduling-policy-v1";

/**
 * How long before kickoff a lineup becomes worth asking for.
 *
 * Confirmed sheets appear roughly an hour before kickoff -- SportMonks is the
 * only provider that documents this, and states about sixty minutes; observed
 * API-Sports behaviour is similar or slightly later. Ninety minutes gives the
 * window a margin on the early side without spending requests through the
 * whole afternoon: at a fifteen-minute cadence it is at most six opportunities
 * per fixture, and the retry interval below cuts that further.
 */
export const MINUTES_BEFORE_KICKOFF_TO_START_ASKING = 90;

/**
 * How long after kickoff to keep asking.
 *
 * A few minutes, not zero. The sheet is occasionally published only at
 * kickoff, and a fixture whose lineup arrives at minute two is still worth
 * recording -- the decision it feeds is already closed, but the evidence
 * timeline and the post-match autopsy both read it. Beyond that the lineup has
 * no decision left to inform.
 */
export const MINUTES_AFTER_KICKOFF_TO_STOP_ASKING = 15;

/**
 * How long to wait before asking again.
 *
 * The gap between a fixture becoming due and its sheet being published is the
 * whole cost here. Twenty minutes bounds one fixture to about five requests
 * across the window even in the worst case, against a fifteen-request daily
 * budget -- so a single fixture cannot consume the day.
 */
export const RETRY_MINUTES_WHILE_NOT_OFFICIAL = 20;

export type LineupDueInput = Readonly<{
  kickoffAt: Date;
  asOf: Date;
  /**
   * The best lineup status already persisted for this fixture, if any.
   *
   * OFFICIAL is terminal: the sheet is confirmed and will not change, so
   * asking again buys nothing. EXPECTED is not -- a provisional sheet is
   * exactly the state that must be replaced by the confirmed one, and it is
   * also the state in which `WAIT_FOR_LINEUP` stays closed.
   */
  knownStatus: LineupStatus | null;
  /**
   * Whether the model can price this fixture at all.
   *
   * A lineup for a competition outside the model corpus cannot change any
   * decision, because there is no decision. Spending a request on it takes
   * budget from a fixture that has one -- the same reasoning that
   * deprioritises unmapped competitions in the odds pass, applied harder here
   * because the lineup budget is a quarter of the size.
   */
  competitionSupported: boolean;
  /** When we last spent a request on this fixture's lineup. */
  lastRequestedAt: Date | null;
}>;

export type LineupDueVerdict = Readonly<{
  due: boolean;
  reason:
    | "TOO_EARLY"
    | "WINDOW_CLOSED"
    | "ALREADY_OFFICIAL"
    | "COMPETITION_UNSUPPORTED"
    | "NEVER_REQUESTED"
    | "RETRY_INTERVAL_NOT_ELAPSED"
    | "RETRY_INTERVAL_ELAPSED";
}>;

/**
 * Whether a fixture's lineup is worth a provider request.
 *
 * Returns the reason as well as the verdict so the ingestion funnel can answer
 * "why is this match still waiting on a lineup?" without a database session --
 * `WAIT_FOR_LINEUP` is the single most common reason a fixture produces no
 * actionable decision, and "we are not asking, because the window has not
 * opened" is a different answer from "we asked and the provider had nothing".
 */
export function lineupRequestDue(input: LineupDueInput): LineupDueVerdict {
  const { kickoffAt, asOf, knownStatus, lastRequestedAt } = input;

  if (knownStatus !== null && isTerminalLineupStatus(knownStatus)) {
    return { due: false, reason: "ALREADY_OFFICIAL" };
  }
  if (!input.competitionSupported) {
    return { due: false, reason: "COMPETITION_UNSUPPORTED" };
  }

  const minutesToKickoff = (kickoffAt.getTime() - asOf.getTime()) / 60_000;
  if (minutesToKickoff > MINUTES_BEFORE_KICKOFF_TO_START_ASKING) {
    return { due: false, reason: "TOO_EARLY" };
  }
  if (-minutesToKickoff > MINUTES_AFTER_KICKOFF_TO_STOP_ASKING) {
    return { due: false, reason: "WINDOW_CLOSED" };
  }

  if (lastRequestedAt === null) {
    return { due: true, reason: "NEVER_REQUESTED" };
  }

  const minutesSinceWeAsked = Math.max(
    0,
    (asOf.getTime() - lastRequestedAt.getTime()) / 60_000,
  );
  return minutesSinceWeAsked >= RETRY_MINUTES_WHILE_NOT_OFFICIAL
    ? { due: true, reason: "RETRY_INTERVAL_ELAPSED" }
    : { due: false, reason: "RETRY_INTERVAL_NOT_ELAPSED" };
}

/**
 * Ordering for lineup candidates when the budget is smaller than the queue.
 *
 * Nearest kickoff first, which is the opposite of the result pass and for the
 * opposite reason: a lineup's value expires at kickoff, so the fixture closest
 * to starting is the one whose sheet is both most likely to be published and
 * most nearly out of time to be useful.
 */
export function prioritizeLineupCandidates<T extends { kickoffAt: Date }>(
  candidates: readonly T[],
): readonly T[] {
  return [...candidates].sort(
    (a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime(),
  );
}
