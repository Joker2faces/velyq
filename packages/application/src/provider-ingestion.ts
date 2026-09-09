import {
  PROVIDER_QUOTA_POLICY_VERSION,
  providerQuotaState,
  purposeRequestBudget,
  shouldProbeQuotaStatus,
  utcQuotaDay,
  type IngestionPurpose,
  type ProviderQuotaSnapshot,
  type ProviderQuotaState,
} from "./provider-quota.js";

/**
 * Orchestrates one real provider ingestion pass.
 *
 * The scheduler wakes this frequently; a wake-up is explicitly *not* a
 * decision to call the provider. On a ~100-request daily budget the
 * expensive mistake is polling on a timer, so every provider request here has
 * to be justified twice: by database state saying the work is due, and by the
 * quota policy saying it may be afforded. A pass with nothing due makes zero
 * provider calls and is the normal, healthy outcome.
 *
 * Port-based for the same reason `forecast-cycle.ts` is: the sequencing,
 * quota arithmetic and abort conditions are the part that must be exercised
 * across their whole state space, and none of that should need a live
 * provider or a database to test. Provider payloads stay opaque -- the
 * orchestrator reads only the three fields it needs to order work and hands
 * the payload back untouched for persistence -- so provider DTOs never reach
 * the decision engine or the customer surfaces.
 */

/** The provider-shaped facts this orchestrator needs, and nothing more. */
export type DiscoveredFixture<TPayload> = Readonly<{
  providerEventId: string;
  /** The provider's own league id. Never a display name -- see §13. */
  competitionProviderId: string | null;
  scheduledAt: string;
  payload: TPayload;
}>;

export type OddsCandidate = Readonly<{
  providerFixtureId: string;
  /** Used only to break ties by decision urgency. */
  kickoffAt: Date;
  /** Whether a reviewed competition identity covers this fixture. */
  competitionMapped: boolean;
}>;

export type ProviderCallOutcome<T> =
  | Readonly<{ ok: true; value: T; quota: ObservedQuota }>
  | Readonly<{
      ok: false;
      /* RETRYABLE covers 5xx and network faults; RATE_LIMITED is a 429 and
         must change quota policy immediately rather than be retried. */
      reason: "RATE_LIMITED" | "RETRYABLE" | "REJECTED";
      quota: ObservedQuota | null;
    }>;

export type ObservedQuota = Readonly<{
  remaining: number | null;
  dailyLimit: number | null;
  observedAt: Date;
}>;

export type FixturePersistSummary = Readonly<{
  received: number;
  written: number;
  skippedByReason: Readonly<Record<string, number>>;
}>;

export type OddsPersistSummary = Readonly<{
  received: number;
  written: number;
  duplicate: number;
  skippedByReason: Readonly<Record<string, number>>;
}>;

export type ProviderIngestionDeps<TFixture, TOdds> = Readonly<{
  clock: () => Date;

  loadQuotaSnapshot: () => Promise<ProviderQuotaSnapshot>;
  recordQuotaObservation: (observed: ObservedQuota) => Promise<void>;
  /** Requests already spent per purpose during the current quota day. */
  spentToday: () => Promise<Readonly<Record<IngestionPurpose, number>>>;

  /**
   * Which dates genuinely need a fixture list, decided from stored catalog
   * state -- not from a timer. A date already discovered recently is not due.
   */
  discoveryDueDates: () => Promise<readonly string[]>;
  /** Fixtures whose prices are missing or old enough to be worth refreshing. */
  oddsCandidates: () => Promise<readonly OddsCandidate[]>;

  discoverFixtures: (
    date: string,
  ) => Promise<ProviderCallOutcome<readonly DiscoveredFixture<TFixture>[]>>;
  fetchOdds: (
    providerFixtureId: string,
  ) => Promise<ProviderCallOutcome<readonly TOdds[]>>;
  /** The provider's own quota endpoint. Called at most once, and only when
      no useful work is planned and the quota is genuinely unknown. */
  probeQuotaStatus: () => Promise<ProviderCallOutcome<null>>;

  persistFixtures: (
    fixtures: readonly DiscoveredFixture<TFixture>[],
  ) => Promise<FixturePersistSummary>;
  persistOdds: (observations: readonly TOdds[]) => Promise<OddsPersistSummary>;
}>;

export type ProviderIngestionTrigger = "SCHEDULER" | "MANUAL";

export type ProviderIngestionResult = Readonly<{
  trigger: ProviderIngestionTrigger;
  quotaPolicyVersion: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  quotaDay: string;
  quotaStateAtStart: ProviderQuotaState;
  quotaStateAtEnd: ProviderQuotaState;
  quotaRemainingAtEnd: number | null;
  quotaDailyLimit: number | null;
  providerCallsUsed: number;
  quotaProbed: boolean;
  discoveryDatesDue: readonly string[];
  discoveryDatesRequested: readonly string[];
  fixturesReceived: number;
  fixturesWritten: number;
  oddsCandidates: number;
  oddsRequestsAttempted: number;
  oddsObservationsReceived: number;
  oddsObservationsWritten: number;
  oddsDuplicates: number;
  skippedByReason: Readonly<Record<string, number>>;
  errorsByReason: Readonly<Record<string, number>>;
}>;

function bump(counter: Record<string, number>, key: string, by = 1): void {
  counter[key] = (counter[key] ?? 0) + by;
}

function mergeSkips(
  target: Record<string, number>,
  source: Readonly<Record<string, number>>,
): void {
  for (const [key, value] of Object.entries(source)) bump(target, key, value);
}

/**
 * Orders odds candidates: reviewed competitions first, then by decision
 * urgency.
 *
 * Ordering by kickoff alone spends the day's odds budget on whichever
 * fixtures start soonest, and on a busy matchday those are reserve and minor
 * leagues nobody has mapped -- buying prices for competitions the model
 * cannot price while the handful of eligible fixtures get none and stop at
 * NO_ODDS_AT_CUTOFF. Unmapped competitions are deprioritised, never
 * excluded: their prices are still worth having once the mapped universe is
 * funded.
 *
 * Within a tier, nearest kickoff in absolute terms -- a fixture that has
 * already started still needs its closing price observed.
 */
export function prioritizeOddsCandidates(
  candidates: readonly OddsCandidate[],
  now: Date,
): readonly OddsCandidate[] {
  const reference = now.getTime();
  return [...candidates].sort((a, b) => {
    const byTier =
      (a.competitionMapped ? 0 : 1) - (b.competitionMapped ? 0 : 1);
    if (byTier !== 0) return byTier;
    const distance =
      Math.abs(a.kickoffAt.getTime() - reference) -
      Math.abs(b.kickoffAt.getTime() - reference);
    return distance || a.providerFixtureId.localeCompare(b.providerFixtureId);
  });
}

/**
 * Ceiling on odds requests within a single invocation, independent of the
 * daily allocation.
 *
 * The daily budget stops a *day* overspending; this stops one *run* taking so
 * long it is killed. The executor is a serverless function with a wall-clock
 * limit, and each odds request is a sequential network round trip with its
 * own retry, so an unbounded run would be truncated mid-flight -- spending
 * quota on responses that were never persisted. Four per run against a
 * 15-minute cadence is 384 requests of daily capacity, far above the 60 the
 * quota policy will actually allow, so this ceiling costs no throughput and
 * only bounds latency.
 */
const DEFAULT_MAX_ODDS_REQUESTS_PER_RUN = 4;

export async function runProviderIngestion<TFixture, TOdds>(
  deps: ProviderIngestionDeps<TFixture, TOdds>,
  input: Readonly<{
    trigger: ProviderIngestionTrigger;
    maxOddsRequestsPerRun?: number;
  }>,
): Promise<ProviderIngestionResult> {
  const maxOddsRequestsPerRun =
    input.maxOddsRequestsPerRun ?? DEFAULT_MAX_ODDS_REQUESTS_PER_RUN;
  const startedAt = deps.clock();
  const skippedByReason: Record<string, number> = {};
  const errorsByReason: Record<string, number> = {};

  let snapshot = await deps.loadQuotaSnapshot();
  const spent = await deps.spentToday();
  const quotaStateAtStart = providerQuotaState(snapshot, startedAt);

  let providerCallsUsed = 0;
  let quotaProbed = false;

  /*
   * Applied after every provider response. The remaining count arrives in the
   * response headers of ordinary requests, so the snapshot improves as a side
   * effect of doing real work -- which is what makes a dedicated quota probe
   * almost always unnecessary.
   */
  const absorb = async (observed: ObservedQuota | null): Promise<void> => {
    if (!observed) return;
    await deps.recordQuotaObservation(observed);
    snapshot = {
      remaining: observed.remaining,
      dailyLimit: observed.dailyLimit ?? snapshot.dailyLimit,
      quotaDay: utcQuotaDay(observed.observedAt),
      observedAt: observed.observedAt,
    };
  };

  /* ---------------------------------------------------------------- discovery */

  const discoveryDatesDue = await deps.discoveryDueDates();
  const discoveryBudget = purposeRequestBudget({
    purpose: "DISCOVERY",
    snapshot,
    spentToday: spent.DISCOVERY,
    candidates: discoveryDatesDue.length,
    now: startedAt,
  });
  if (discoveryBudget.limitedBy)
    bump(skippedByReason, `DISCOVERY_${discoveryBudget.limitedBy}`);

  const discoveryDatesRequested: string[] = [];
  const discovered: DiscoveredFixture<TFixture>[] = [];

  for (const date of discoveryDatesDue.slice(0, discoveryBudget.allowed)) {
    const outcome = await deps.discoverFixtures(date);
    providerCallsUsed += 1;
    discoveryDatesRequested.push(date);
    await absorb(outcome.quota);

    if (!outcome.ok) {
      bump(errorsByReason, `DISCOVERY_${outcome.reason}`);
      /*
       * A 429 means the budget is gone regardless of what the last snapshot
       * said, so the pass stops rather than continuing to ask.
       */
      if (outcome.reason === "RATE_LIMITED") break;
      continue;
    }
    discovered.push(...outcome.value);
  }

  const fixtures =
    discovered.length > 0
      ? await deps.persistFixtures(discovered)
      : { received: 0, written: 0, skippedByReason: {} };
  mergeSkips(skippedByReason, fixtures.skippedByReason);

  /* -------------------------------------------------------------------- odds */

  const candidates = await deps.oddsCandidates();
  const oddsBudget = purposeRequestBudget({
    purpose: "ODDS",
    snapshot,
    spentToday: spent.ODDS,
    candidates: candidates.length,
    now: startedAt,
  });
  if (oddsBudget.limitedBy)
    bump(skippedByReason, `ODDS_${oddsBudget.limitedBy}`);

  /*
   * The per-run ceiling is applied alongside the daily one, smallest wins:
   * the daily budget protects the quota, this one protects the run from
   * being killed mid-request.
   */
  const oddsAllowedThisRun = Math.min(
    oddsBudget.allowed,
    maxOddsRequestsPerRun,
  );
  if (
    oddsAllowedThisRun < oddsBudget.allowed ||
    (oddsAllowedThisRun < candidates.length && !oddsBudget.limitedBy)
  ) {
    bump(skippedByReason, "ODDS_RUN_CEILING");
  }

  const prioritized = prioritizeOddsCandidates(candidates, startedAt);
  const collected: TOdds[] = [];
  let oddsRequestsAttempted = 0;

  /*
   * Sequential, not concurrent. Firing every odds request at once is faster
   * but cannot react: a 429 on the third request would still leave the other
   * twenty in flight, spending quota the provider has already refused. One at
   * a time means the very next request can be abandoned.
   */
  for (const candidate of prioritized.slice(0, oddsAllowedThisRun)) {
    const state = providerQuotaState(snapshot, deps.clock());
    if (state === "EXHAUSTED" || state === "CRITICAL") {
      bump(skippedByReason, `ODDS_QUOTA_${state}`);
      break;
    }

    const outcome = await deps.fetchOdds(candidate.providerFixtureId);
    providerCallsUsed += 1;
    oddsRequestsAttempted += 1;
    await absorb(outcome.quota);

    if (!outcome.ok) {
      bump(errorsByReason, `ODDS_${outcome.reason}`);
      if (outcome.reason === "RATE_LIMITED") {
        /*
         * Treat the budget as spent for the rest of the day even if the
         * provider did not send a remaining count with the refusal -- a
         * refusal is itself the most reliable signal we have.
         */
        await absorb({
          remaining: 0,
          dailyLimit: snapshot.dailyLimit,
          observedAt: deps.clock(),
        });
        break;
      }
      continue;
    }
    collected.push(...outcome.value);
  }

  const odds =
    collected.length > 0
      ? await deps.persistOdds(collected)
      : { received: 0, written: 0, duplicate: 0, skippedByReason: {} };
  mergeSkips(skippedByReason, odds.skippedByReason);

  /* ------------------------------------------------------------- quota probe */

  /*
   * Only reached when the pass had nothing to do and the quota is genuinely
   * unknown -- typically the first run of a UTC day after a quiet night. One
   * request buys a known budget for every later pass that day.
   */
  if (shouldProbeQuotaStatus(snapshot, deps.clock(), providerCallsUsed)) {
    const outcome = await deps.probeQuotaStatus();
    providerCallsUsed += 1;
    quotaProbed = true;
    await absorb(outcome.quota);
    if (!outcome.ok) bump(errorsByReason, `STATUS_${outcome.reason}`);
  }

  const finishedAt = deps.clock();
  return {
    trigger: input.trigger,
    quotaPolicyVersion: PROVIDER_QUOTA_POLICY_VERSION,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    quotaDay: utcQuotaDay(startedAt),
    quotaStateAtStart,
    quotaStateAtEnd: providerQuotaState(snapshot, finishedAt),
    quotaRemainingAtEnd: snapshot.remaining,
    quotaDailyLimit: snapshot.dailyLimit,
    providerCallsUsed,
    quotaProbed,
    discoveryDatesDue,
    discoveryDatesRequested,
    fixturesReceived: fixtures.received,
    fixturesWritten: fixtures.written,
    oddsCandidates: candidates.length,
    oddsRequestsAttempted,
    oddsObservationsReceived: odds.received,
    oddsObservationsWritten: odds.written,
    oddsDuplicates: odds.duplicate,
    skippedByReason,
    errorsByReason,
  };
}
