import type { ProviderQuota } from "./apisports.js";

/**
 * When to spend a request asking for a lineup, and when not to.
 *
 * Lineups appear roughly an hour before kickoff and not before, so polling
 * them all day is pure waste — and on a plan with 100 requests a day, waste is
 * not a rounding error: one fixture polled every five minutes from midnight
 * would exhaust the entire daily budget before the first kickoff and leave
 * nothing for odds.
 *
 * So this is a state machine over time-to-kickoff, coverage and remaining
 * quota, and it says no far more often than it says yes.
 */

export type LineupWindow =
  "OUTSIDE_WINDOW" | "OCCASIONAL" | "POLLING" | "PRIORITY" | "KICKED_OFF";

/**
 * The polling windows, in minutes before kickoff.
 *
 * Chosen to match when the data actually appears rather than to be tidy.
 * Official XIs are published about an hour out; the 120-minute boundary is
 * where an occasional speculative check starts being worth one request, and
 * 45 is where a fixture that still has no lineup becomes something an
 * operator needs to know about.
 */
export const LINEUP_WINDOWS = Object.freeze({
  outsideBeyondMinutes: 120,
  pollingWithinMinutes: 90,
  priorityWithinMinutes: 45,
});

export function lineupWindow(minutesToKickoff: number): LineupWindow {
  if (minutesToKickoff <= 0) return "KICKED_OFF";
  if (minutesToKickoff > LINEUP_WINDOWS.outsideBeyondMinutes)
    return "OUTSIDE_WINDOW";
  if (minutesToKickoff > LINEUP_WINDOWS.pollingWithinMinutes)
    return "OCCASIONAL";
  if (minutesToKickoff > LINEUP_WINDOWS.priorityWithinMinutes) return "POLLING";
  return "PRIORITY";
}

export type LineupRequestDecision =
  | "REQUEST"
  | "SKIP_NOT_COVERED"
  | "SKIP_OUTSIDE_WINDOW"
  | "SKIP_ALREADY_AVAILABLE"
  | "SKIP_RECENTLY_CHECKED"
  | "SKIP_KICKED_OFF"
  | "SKIP_QUOTA";

export type LineupCandidate = Readonly<{
  eventId: string;
  providerFixtureId: string;
  kickoffAt: string;
  /** From the provider's own league coverage flags. Null means unknown. */
  lineupsCovered: boolean | null;
  /** Whether a complete lineup is already stored for this fixture. */
  lineupAvailable: boolean;
  /** When this fixture's lineup was last requested, if ever. */
  lastCheckedAt: string | null;
}>;

export type LineupPlanEntry = Readonly<{
  eventId: string;
  providerFixtureId: string;
  minutesToKickoff: number;
  window: LineupWindow;
  decision: LineupRequestDecision;
  /** Lower sorts first. Only meaningful for REQUEST. */
  priority: number;
}>;

export type LineupPlan = Readonly<{
  entries: readonly LineupPlanEntry[];
  requests: readonly LineupPlanEntry[];
  budget: number;
  skippedForQuota: number;
}>;

/**
 * Minimum gap between two requests for the same fixture, per window.
 *
 * Re-asking every minute inside the priority window would spend twenty
 * requests on one fixture to learn the same thing twenty times. These
 * intervals are deliberately coarse: the question "has the XI been published"
 * only has a new answer every few minutes at best.
 */
export const RECHECK_MINUTES: Readonly<Record<LineupWindow, number>> =
  Object.freeze({
    OUTSIDE_WINDOW: Number.POSITIVE_INFINITY,
    OCCASIONAL: 30,
    POLLING: 15,
    PRIORITY: 8,
    KICKED_OFF: Number.POSITIVE_INFINITY,
  });

/**
 * How many lineup requests this invocation may spend.
 *
 * The reserve is the point: lineups must never be able to consume the budget
 * odds collection needs, because a lineup with no price to compare against
 * decides nothing. A CRITICAL or EXHAUSTED quota stops lineup polling
 * entirely — it is the most deferrable of the provider calls, since the
 * decision it unlocks is one that stays refused without it anyway.
 */
export function lineupRequestBudget(
  quota: ProviderQuota,
  options: Readonly<{
    maxRequests?: number;
    /** Fraction of the remaining daily budget lineups may not touch. */
    reserveFraction?: number;
  }> = {},
): number {
  const maxRequests = options.maxRequests ?? 8;
  const reserveFraction = options.reserveFraction ?? 0.5;
  if (quota.state === "EXHAUSTED" || quota.state === "CRITICAL") return 0;
  const reserved =
    quota.requestsRemaining === null
      ? maxRequests
      : Math.floor(quota.requestsRemaining * (1 - reserveFraction));
  const stateCeiling =
    quota.state === "CONSERVE" ? Math.ceil(maxRequests / 2) : maxRequests;
  return Math.max(0, Math.min(stateCeiling, reserved));
}

/**
 * Decides, per fixture, whether to spend a request on its lineup.
 *
 * Every skip has its own reason rather than a shared "not now", because the
 * reasons mean different things downstream: NOT_COVERED is permanent and
 * feeds a different decision policy, OUTSIDE_WINDOW is expected and will
 * resolve on its own, and QUOTA is an operational problem the owner may want
 * to act on.
 */
export function planLineupRequests(
  candidates: readonly LineupCandidate[],
  quota: ProviderQuota,
  asOf: Date,
  options: Readonly<{ maxRequests?: number; reserveFraction?: number }> = {},
): LineupPlan {
  const budget = lineupRequestBudget(quota, options);
  const evaluated = candidates.map((candidate): LineupPlanEntry => {
    const minutesToKickoff =
      (Date.parse(candidate.kickoffAt) - asOf.getTime()) / 60_000;
    const window = lineupWindow(minutesToKickoff);
    const decide = (): LineupRequestDecision => {
      if (candidate.lineupsCovered === false) return "SKIP_NOT_COVERED";
      if (window === "KICKED_OFF") return "SKIP_KICKED_OFF";
      /*
       * An available lineup stops discovery. Re-checking a published XI is a
       * correction problem, not a discovery one, and belongs to an explicit
       * correction pass rather than to the polling loop.
       */
      if (candidate.lineupAvailable) return "SKIP_ALREADY_AVAILABLE";
      if (window === "OUTSIDE_WINDOW") return "SKIP_OUTSIDE_WINDOW";
      if (candidate.lastCheckedAt !== null) {
        const sinceMinutes =
          (asOf.getTime() - Date.parse(candidate.lastCheckedAt)) / 60_000;
        if (sinceMinutes < RECHECK_MINUTES[window])
          return "SKIP_RECENTLY_CHECKED";
      }
      return "REQUEST";
    };
    return {
      eventId: candidate.eventId,
      providerFixtureId: candidate.providerFixtureId,
      minutesToKickoff,
      window,
      decision: decide(),
      /* Soonest kickoff first: it is the one whose answer expires first. */
      priority: minutesToKickoff,
    };
  });

  const wanted = evaluated
    .filter((entry) => entry.decision === "REQUEST")
    .sort((left, right) => left.priority - right.priority);
  const requests = wanted.slice(0, budget);
  const denied = new Set(wanted.slice(budget).map((entry) => entry.eventId));

  return {
    entries: evaluated.map((entry) =>
      denied.has(entry.eventId) ? { ...entry, decision: "SKIP_QUOTA" } : entry,
    ),
    requests,
    budget,
    skippedForQuota: denied.size,
  };
}
