/**
 * Provider quota as a first-class, versioned resource.
 *
 * API-Sports allows roughly 100 requests per UTC day on the current plan.
 * That is small enough that "just call the provider and see" is not a
 * strategy: a single careless polling loop can spend a whole day's budget
 * before the fixtures anybody cares about are priced. So the budget is
 * divided by purpose up front, and every decision to spend is taken against
 * persisted state rather than against a fresh probe -- checking quota must
 * never itself cost quota.
 *
 * Everything here is pure. The orchestrator supplies observed state and asks
 * what it may do; nothing in this module performs I/O, so the policy can be
 * exercised across its whole state space in unit tests rather than against a
 * live budget we cannot replay.
 */

/**
 * Bumped whenever the allocation or the thresholds below change, and recorded
 * on every ingestion run. Without it a run's behaviour cannot be explained
 * after the fact: "why did this poll make no odds requests" is only
 * answerable if the policy in force at the time is known.
 */
export const PROVIDER_QUOTA_POLICY_VERSION = "provider-quota-policy-v1";

/** What a provider request is being spent on. */
export type IngestionPurpose = "DISCOVERY" | "ODDS" | "LINEUP" | "RESULT";

export type ProviderQuotaState =
  "HEALTHY" | "CONSERVE" | "CRITICAL" | "EXHAUSTED" | "UNKNOWN";

/**
 * The daily allocation, derived from the real 100-request constraint rather
 * than chosen for convenience.
 *
 * - `DISCOVERY` 8: one fixture-list request covers an entire date, so two
 *   dates (today and tomorrow, to populate the customer horizon before
 *   kickoff) across four polls a day is eight requests. Discovery is cheap
 *   per unit of value and everything downstream depends on it, so it is
 *   funded first.
 * - `ODDS` 60: the only per-fixture cost, and the one that decides whether
 *   EDGE/RADAR can exist at all. With 23 reviewed competitions the eligible
 *   set on a normal day is single digits, so 60 buys several refreshes each
 *   rather than one thin pass.
 * - `LINEUP` 15: only requested inside the publication window for fixtures
 *   that are already model-relevant, so this is a small, bursty need.
 * - `RESULT` 10: one request settles several fixtures, so settlement is
 *   inexpensive.
 * - `RECOVERY_RESERVE` 7: never allocated to a purpose. It exists so a bad
 *   day -- a provider outage, a retry storm, a fixture list that arrives
 *   late -- still leaves room to recover rather than discovering the budget
 *   is gone.
 */
export const DAILY_PURPOSE_BUDGET: Readonly<Record<IngestionPurpose, number>> =
  {
    DISCOVERY: 8,
    ODDS: 60,
    LINEUP: 15,
    RESULT: 10,
  };

/** Held back from every purpose, for recovery only. */
export const RECOVERY_RESERVE = 7;

/**
 * The plan's documented daily allowance. Used only when the provider has not
 * yet told us the real number: the observed limit always wins, because a plan
 * change should not need a code change to take effect.
 */
export const ASSUMED_DAILY_LIMIT = 100;

/**
 * Below this many remaining requests, only recovery matters -- the reserve is
 * being eaten, so ordinary polling stops entirely.
 */
const CRITICAL_REMAINING = RECOVERY_RESERVE;

/**
 * Below this fraction of the daily limit, spend more slowly. Chosen so a
 * normal day never reaches it (discovery plus a healthy odds pass leaves far
 * more than 30% unspent) while an abnormal one throttles well before the
 * reserve is in danger.
 */
const CONSERVE_FRACTION = 0.3;

/** The UTC day a quota observation belongs to; quota resets at UTC midnight. */
export function utcQuotaDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export type ProviderQuotaSnapshot = Readonly<{
  /** The provider's own reported daily allowance, when it has reported one. */
  dailyLimit: number | null;
  /** Requests left in the current quota day, or null if never observed. */
  remaining: number | null;
  /** UTC day the figures above describe. */
  quotaDay: string;
  observedAt: Date | null;
}>;

/**
 * Classifies remaining quota.
 *
 * `UNKNOWN` is deliberately distinct from `EXHAUSTED`. Never having observed
 * the quota is not the same as knowing it is gone, and conflating them would
 * either freeze a healthy pipeline or spend freely on an empty budget. An
 * unknown quota is allowed a small, bounded amount of work -- enough to
 * observe a real figure from the response headers and become known.
 */
export function providerQuotaState(
  snapshot: ProviderQuotaSnapshot,
  now: Date,
): ProviderQuotaState {
  /* A snapshot from a previous UTC day says nothing about today's budget. */
  if (snapshot.quotaDay !== utcQuotaDay(now)) return "UNKNOWN";
  if (snapshot.remaining === null) return "UNKNOWN";
  if (snapshot.remaining <= 0) return "EXHAUSTED";
  if (snapshot.remaining <= CRITICAL_REMAINING) return "CRITICAL";

  const limit = snapshot.dailyLimit ?? ASSUMED_DAILY_LIMIT;
  if (snapshot.remaining < limit * CONSERVE_FRACTION) return "CONSERVE";
  return "HEALTHY";
}

export type PurposeBudgetInput = Readonly<{
  purpose: IngestionPurpose;
  snapshot: ProviderQuotaSnapshot;
  /** Requests already spent on this purpose during the current quota day. */
  spentToday: number;
  /** How many requests this purpose could usefully make right now. */
  candidates: number;
  now: Date;
}>;

export type PurposeBudget = Readonly<{
  allowed: number;
  state: ProviderQuotaState;
  /** Present when `allowed` is lower than `candidates`. */
  limitedBy:
    | "QUOTA_EXHAUSTED"
    | "QUOTA_CRITICAL"
    | "PURPOSE_BUDGET_SPENT"
    | "CONSERVE_THROTTLE"
    | "UNKNOWN_QUOTA_PROBE_ONLY"
    | "RECOVERY_RESERVE"
    | null;
}>;

/**
 * How many provider requests this purpose may make right now.
 *
 * Four independent ceilings apply, and the smallest wins: the purpose's own
 * daily allocation, what the provider says is left minus the recovery
 * reserve, a throttle while conserving, and the number of requests that would
 * actually be useful. Independent ceilings matter -- the per-purpose
 * allocation still holds when the provider reports no remaining count at all,
 * which is exactly the situation where a single ceiling based on the
 * provider's own figure would degrade to unbounded.
 */
export function purposeRequestBudget(input: PurposeBudgetInput): PurposeBudget {
  const state = providerQuotaState(input.snapshot, input.now);
  const candidates = Math.max(0, input.candidates);

  if (state === "EXHAUSTED")
    return { allowed: 0, state, limitedBy: "QUOTA_EXHAUSTED" };
  if (state === "CRITICAL")
    return { allowed: 0, state, limitedBy: "QUOTA_CRITICAL" };

  const purposeRemaining = Math.max(
    0,
    DAILY_PURPOSE_BUDGET[input.purpose] - Math.max(0, input.spentToday),
  );
  if (purposeRemaining === 0)
    return { allowed: 0, state, limitedBy: "PURPOSE_BUDGET_SPENT" };

  /*
   * An unknown quota gets one request. That is enough for the response
   * headers to establish a real figure, after which the ordinary ceilings
   * apply -- and it means a pipeline whose quota state has gone stale
   * recovers by doing useful work, never by spending a request purely to
   * inspect the budget.
   */
  if (state === "UNKNOWN") {
    const allowed = Math.min(1, purposeRemaining, candidates);
    return {
      allowed,
      state,
      limitedBy: allowed < candidates ? "UNKNOWN_QUOTA_PROBE_ONLY" : null,
    };
  }

  const remaining = input.snapshot.remaining ?? 0;
  const spendable = Math.max(0, remaining - RECOVERY_RESERVE);
  const throttled =
    state === "CONSERVE" ? Math.ceil(purposeRemaining / 2) : purposeRemaining;

  const allowed = Math.min(candidates, purposeRemaining, spendable, throttled);
  if (allowed >= candidates) return { allowed, state, limitedBy: null };

  /* Report the ceiling that actually bound, so a thin run is explainable. */
  const limitedBy =
    spendable === allowed
      ? "RECOVERY_RESERVE"
      : throttled === allowed && state === "CONSERVE"
        ? "CONSERVE_THROTTLE"
        : "PURPOSE_BUDGET_SPENT";
  return { allowed, state, limitedBy };
}

/**
 * Whether the provider's own `/status` endpoint should be called.
 *
 * Only when the quota is genuinely unknowable any other way. Every ordinary
 * request already carries the remaining count in its response headers, so
 * once any request has been made today the state is known for free -- calling
 * `/status` on every scheduler wake-up would spend the budget on inspecting
 * the budget, which on a 100-request day is a meaningful fraction of it.
 */
export function shouldProbeQuotaStatus(
  snapshot: ProviderQuotaSnapshot,
  now: Date,
  plannedRequests: number,
): boolean {
  if (plannedRequests > 0) return false;
  return providerQuotaState(snapshot, now) === "UNKNOWN";
}
