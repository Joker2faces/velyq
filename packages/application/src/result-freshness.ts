import {
  isTerminalEventLifecycleStatus,
  type EventLifecycleStatus,
} from "@velyq/domain";

export const RESULT_SCHEDULING_POLICY_VERSION = "result-scheduling-policy-v1";

/**
 * A match is not asked about until it has plausibly finished.
 *
 * Ninety minutes of football plus half-time plus stoppage is comfortably
 * inside two hours; extra time and penalties push a cup tie past that. Asking
 * at 115 minutes would spend a request on a match still in its second half,
 * get IN_PROGRESS back, and then have to ask again -- two requests where one
 * would do. The RESULT budget is 10 requests a day, so the cost of asking
 * early is not marginal.
 */
export const MINUTES_AFTER_KICKOFF_BEFORE_ASKING = 135;

/**
 * How long to wait before asking again about a match that has not finished.
 *
 * A fixture in extra time, interrupted or suspended will finish eventually,
 * and the product has no deadline for settling it -- History is not a live
 * scoreboard. Thirty minutes bounds the number of follow-up requests for a
 * single fixture to a handful even in the worst case.
 */
export const RETRY_MINUTES_WHILE_UNFINISHED = 30;

/**
 * How long a fixture stays worth asking about at all.
 *
 * After three days a missing result is a data problem, not a timing problem,
 * and continuing to ask converts one broken fixture into a standing daily
 * charge against a 10-request budget. The fixture is not deleted and no
 * decision is settled: it simply stops consuming quota, and the ingestion
 * funnel reports it.
 */
export const GIVE_UP_AFTER_HOURS = 72;

export type ResultDueInput = Readonly<{
  /** Scheduled kickoff. Results are never asked for before a match starts. */
  kickoffAt: Date;
  asOf: Date;
  /**
   * The lifecycle state already persisted for this fixture, if any.
   *
   * A terminal state means the fixture is answered and must never be asked
   * about again -- that is the difference between a result pass that costs 10
   * requests a day and one that costs 10 per fixture forever.
   */
  knownStatus: EventLifecycleStatus | null;
  /**
   * When *we* last spent a request on this fixture.
   *
   * As with odds, this is the only timestamp that advances when we act, so it
   * is the only correct basis for deciding whether to act again. Scheduling on
   * the provider's own observation instant instead is what made the odds pass
   * re-buy identical prices on four consecutive runs.
   */
  lastRequestedAt: Date | null;
}>;

/**
 * Why a fixture is or is not worth a result request.
 *
 * Returned rather than a bare boolean so the ingestion funnel can answer "why
 * is this match still unsettled?" without a database session. A `false` with
 * no reason would be indistinguishable from a bug.
 */
export type ResultDueVerdict = Readonly<{
  due: boolean;
  reason:
    | "NOT_KICKED_OFF"
    | "TOO_SOON_AFTER_KICKOFF"
    | "ALREADY_TERMINAL"
    | "ABANDONED_AFTER_GRACE_PERIOD"
    | "NEVER_REQUESTED"
    | "RETRY_INTERVAL_NOT_ELAPSED"
    | "RETRY_INTERVAL_ELAPSED";
}>;

/**
 * POSTPONED is deliberately not terminal.
 *
 * A postponed match is usually replayed, and the provider reports the replay
 * under the same fixture id with a new kickoff. Treating POSTPONED as final
 * would leave every decision on that fixture permanently unsettled. It is
 * bounded by the give-up window instead.
 */
export function resultRequestDue(input: ResultDueInput): ResultDueVerdict {
  const { kickoffAt, asOf, knownStatus, lastRequestedAt } = input;

  if (knownStatus !== null && isTerminalEventLifecycleStatus(knownStatus)) {
    return { due: false, reason: "ALREADY_TERMINAL" };
  }

  const minutesSinceKickoff = (asOf.getTime() - kickoffAt.getTime()) / 60_000;
  if (minutesSinceKickoff < 0) {
    return { due: false, reason: "NOT_KICKED_OFF" };
  }
  if (minutesSinceKickoff < MINUTES_AFTER_KICKOFF_BEFORE_ASKING) {
    return { due: false, reason: "TOO_SOON_AFTER_KICKOFF" };
  }
  if (minutesSinceKickoff > GIVE_UP_AFTER_HOURS * 60) {
    return { due: false, reason: "ABANDONED_AFTER_GRACE_PERIOD" };
  }

  if (lastRequestedAt === null) {
    return { due: true, reason: "NEVER_REQUESTED" };
  }

  const minutesSinceWeAsked = Math.max(
    0,
    (asOf.getTime() - lastRequestedAt.getTime()) / 60_000,
  );
  return minutesSinceWeAsked >= RETRY_MINUTES_WHILE_UNFINISHED
    ? { due: true, reason: "RETRY_INTERVAL_ELAPSED" }
    : { due: false, reason: "RETRY_INTERVAL_NOT_ELAPSED" };
}

/**
 * Ordering for result candidates when the budget is smaller than the queue.
 *
 * Oldest kickoff first. A fixture that finished three hours ago is more
 * likely to have a settled result available than one that finished twenty
 * minutes ago, so spending the budget on the oldest first maximises the
 * number of requests that come back FINAL rather than IN_PROGRESS.
 */
export function prioritizeResultCandidates<T extends { kickoffAt: Date }>(
  candidates: readonly T[],
): readonly T[] {
  return [...candidates].sort(
    (a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime(),
  );
}
