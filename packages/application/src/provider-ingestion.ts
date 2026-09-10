import { prioritizeLineupCandidates } from "./lineup-freshness.js";
import { prioritizeResultCandidates } from "./result-freshness.js";
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

export type LineupCandidate = Readonly<{
  providerFixtureId: string;
  /** Scheduled kickoff. The window opens 90 minutes before it. */
  kickoffAt: Date;
}>;

export type LineupPersistSummary = Readonly<{
  received: number;
  /** Lineup rows written to `intelligence.lineup_observations`. */
  written: number;
  /** Sheets the provider had already reported identically. */
  duplicate: number;
  /** Fixtures whose sheet is now complete, so the gate can clear. */
  official: number;
  skippedByReason: Readonly<Record<string, number>>;
}>;

export type ResultCandidate = Readonly<{
  providerFixtureId: string;
  /** Scheduled kickoff. Results are never asked for before a match starts. */
  kickoffAt: Date;
}>;

export type ResultPersistSummary = Readonly<{
  received: number;
  /** Result rows written to `intelligence.event_results`. */
  written: number;
  /** Results the provider had already reported identically. */
  duplicate: number;
  /** `intelligence.market_settlements` rows written as a consequence. */
  settlementsWritten: number;
  skippedByReason: Readonly<Record<string, number>>;
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

export type ProviderIngestionDeps<TFixture, TOdds, TResult, TLineup> =
  Readonly<{
    clock: () => Date;

    loadQuotaSnapshot: () => Promise<ProviderQuotaSnapshot>;
    /**
     * Persists an observation immediately after the call that produced it, and
     * counts it against `purpose`.
     *
     * Purpose-tagged and written per call rather than summarised per run,
     * because a run can be killed after its requests have been made: the first
     * live pass was, and five spent requests left no trace in the per-purpose
     * budgets. A request that was made must be a request that is counted.
     */
    recordQuotaObservation: (
      observed: ObservedQuota,
      purpose: IngestionPurpose,
    ) => Promise<void>;
    /**
     * Counts a provider request whose response never arrived.
     *
     * A timeout or a network fault is not evidence the provider declined to
     * serve the request -- only evidence we did not read the answer. It was
     * very likely charged to the plan, so it has to be charged to ours too.
     * Without this, a failing provider left every budget untouched and the
     * only remaining bound was the scheduler cadence.
     *
     * Distinct from `recordQuotaObservation` because there is no observation
     * to record: the last known remaining figure must be preserved (decayed
     * by the assumed spend), never overwritten with "unknown".
     */
    recordRequestAttempt: (
      purpose: IngestionPurpose,
      at: Date,
    ) => Promise<void>;
    /** Requests already spent per purpose during the current quota day. */
    spentToday: () => Promise<Readonly<Record<IngestionPurpose, number>>>;

    /**
     * Which dates genuinely need a fixture list, decided from stored catalog
     * state -- not from a timer. A date already discovered recently is not due.
     */
    discoveryDueDates: () => Promise<readonly string[]>;
    /** Fixtures whose prices are missing or old enough to be worth refreshing. */
    oddsCandidates: () => Promise<readonly OddsCandidate[]>;
    /**
     * Fixtures that have plausibly finished and whose lifecycle is not yet
     * terminal. Bounded by `resultRequestDue`, so an answered fixture never
     * reappears.
     */
    resultCandidates: () => Promise<readonly ResultCandidate[]>;
    /**
     * Fixtures inside the lineup window whose sheet is not yet confirmed, and
     * whose competition the model can actually price.
     */
    lineupCandidates: () => Promise<readonly LineupCandidate[]>;

    discoverFixtures: (
      date: string,
    ) => Promise<ProviderCallOutcome<readonly DiscoveredFixture<TFixture>[]>>;
    fetchOdds: (
      providerFixtureId: string,
    ) => Promise<ProviderCallOutcome<readonly TOdds[]>>;
    /** The provider's own quota endpoint. Called at most once, and only when
      no useful work is planned and the quota is genuinely unknown. */
    probeQuotaStatus: () => Promise<ProviderCallOutcome<null>>;
    /**
     * Fetches results for several fixtures in ONE provider request.
     *
     * Unlike odds -- where a request is per fixture because each returns a
     * different bookmaker cross-section -- the provider's fixture endpoint
     * accepts a list of ids. That is what makes a 10-request daily budget
     * sufficient: one request settles a whole afternoon's card.
     */
    fetchResults: (
      providerFixtureIds: readonly string[],
    ) => Promise<ProviderCallOutcome<readonly TResult[]>>;
    /**
     * Fetches one fixture's lineups.
     *
     * Per fixture, unlike results: the provider's lineup endpoint takes a single
     * fixture id, so there is no batch to exploit here.
     */
    fetchLineups: (
      providerFixtureId: string,
    ) => Promise<ProviderCallOutcome<readonly TLineup[]>>;

    persistFixtures: (
      fixtures: readonly DiscoveredFixture<TFixture>[],
    ) => Promise<FixturePersistSummary>;
    persistOdds: (
      observations: readonly TOdds[],
    ) => Promise<OddsPersistSummary>;
    /**
     * Writes results and settles the decisions they answer.
     *
     * One port rather than two because a result row and the settlements it
     * implies belong in one transaction: a result written without its
     * settlements leaves decisions permanently unsettled with nothing to
     * re-trigger them, since the fixture is now terminal and will never be
     * asked about again.
     */
    persistResults: (
      results: readonly TResult[],
    ) => Promise<ResultPersistSummary>;
    persistLineups: (
      lineups: readonly TLineup[],
    ) => Promise<LineupPersistSummary>;
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
  lineupCandidates: number;
  lineupRequestsAttempted: number;
  lineupsReceived: number;
  lineupsWritten: number;
  lineupDuplicates: number;
  /** Fixtures whose sheet became complete on this pass. */
  lineupsOfficial: number;
  resultCandidates: number;
  resultRequestsAttempted: number;
  resultFixturesRequested: readonly string[];
  resultsReceived: number;
  resultsWritten: number;
  resultDuplicates: number;
  settlementsWritten: number;
  skippedByReason: Readonly<Record<string, number>>;
  errorsByReason: Readonly<Record<string, number>>;
  /**
   * Wall-clock cost of each phase.
   *
   * The executor kills a run at a hard limit, and a killed run reports
   * nothing -- so "which phase was slow" is unanswerable exactly when it
   * matters most. Recording it per phase turns that into a number an
   * operator can read off a successful run instead of inferring it from
   * failures.
   */
  timings: Readonly<{
    discoveryMs: number;
    fixturePersistMs: number;
    candidatesMs: number;
    oddsFetchMs: number;
    oddsPersistMs: number;
    lineupCandidatesMs: number;
    lineupFetchMs: number;
    lineupPersistMs: number;
    resultCandidatesMs: number;
    resultFetchMs: number;
    resultPersistMs: number;
  }>;
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
 * quota on responses that were never persisted. One per run against a
 * 15-minute cadence is 96 requests of daily capacity, still above the 60 the
 * quota policy will actually allow, so this ceiling costs no throughput and
 * only bounds latency -- and it keeps a single slow provider response from
 * being able to end the invocation.
 */
const DEFAULT_MAX_ODDS_REQUESTS_PER_RUN = 1;

/**
 * At most one fixture list per invocation.
 *
 * A date's fixture list is the single most expensive response the provider
 * returns -- several hundred fixtures to normalise -- and the horizon needs
 * two of them. Doing both in one pass, then also pricing fixtures, is what
 * exceeded the executor's wall-clock limit twice: the provider calls
 * succeeded and the invocation was killed before it could record what it had
 * done.
 *
 * One per pass is enough. Fixture lists stay fresh for six hours and the
 * scheduler wakes every fifteen minutes, so the horizon is fully covered
 * within half an hour of a cold start and stays covered thereafter.
 */
const MAX_DISCOVERY_REQUESTS_PER_RUN = 1;

/**
 * At most one result request per invocation.
 *
 * Same reasoning as the other two ceilings -- bound the run, not the day --
 * but here it costs nothing at all, because a single request covers a batch
 * of fixtures.
 */
const MAX_RESULT_REQUESTS_PER_RUN = 1;

/**
 * At most one lineup request per invocation.
 *
 * The same bound-the-run reasoning as the other phases. It does cost
 * throughput here, unlike the result ceiling: on a busy evening several
 * fixtures are inside the lineup window at once and only one is served per
 * wake-up. That is acceptable because the window is ninety minutes wide
 * against a fifteen-minute cadence, so a fixture has roughly six chances, and
 * nearest kickoff is served first.
 */
const MAX_LINEUP_REQUESTS_PER_RUN = 1;

/**
 * Fixtures per result request.
 *
 * The provider's fixture endpoint accepts a list of ids. Twenty is its
 * documented ceiling for that parameter, and it is also roughly a full
 * European matchday evening -- so in practice one request per evening
 * settles it. This is what makes a 10-request daily RESULT budget generous
 * rather than tight.
 */
export const MAX_FIXTURES_PER_RESULT_REQUEST = 20;

export async function runProviderIngestion<TFixture, TOdds, TResult, TLineup>(
  deps: ProviderIngestionDeps<TFixture, TOdds, TResult, TLineup>,
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
  const timings = {
    discoveryMs: 0,
    fixturePersistMs: 0,
    candidatesMs: 0,
    oddsFetchMs: 0,
    oddsPersistMs: 0,
    lineupCandidatesMs: 0,
    lineupFetchMs: 0,
    lineupPersistMs: 0,
    resultCandidatesMs: 0,
    resultFetchMs: 0,
    resultPersistMs: 0,
  };
  const since = (start: number) => deps.clock().getTime() - start;

  /*
   * Applied after every provider response. The remaining count arrives in the
   * response headers of ordinary requests, so the snapshot improves as a side
   * effect of doing real work -- which is what makes a dedicated quota probe
   * almost always unnecessary.
   */
  const absorb = async (
    observed: ObservedQuota | null,
    purpose: IngestionPurpose,
  ): Promise<void> => {
    /*
     * No observation means the call threw -- a timeout, a network fault, a
     * body that would not parse. The request itself still happened, so it
     * is charged here rather than dropped; dropping it was what let a
     * persistently slow provider make the daily budgets inoperative.
     */
    if (!observed) {
      await deps.recordRequestAttempt(purpose, deps.clock());
      return;
    }
    await deps.recordQuotaObservation(observed, purpose);
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

  /*
   * Dates whose fixture list we actually obtained. Reported in the run
   * record and read back by the adapter as its freshness marker, so only a
   * success belongs here.
   */
  const discoveryDatesRequested: string[] = [];
  /*
   * Provider calls the discovery phase made, successful or not. Kept
   * separately because the run ceiling and the local spend accounting are
   * about requests issued, while freshness is about lists obtained --
   * conflating them either suppressed re-discovery after a failure or let a
   * failed pass go on to price, spending a second call in one invocation.
   */
  let discoveryRequestsAttempted = 0;
  const discovered: DiscoveredFixture<TFixture>[] = [];

  const discoveryAllowedThisRun = Math.min(
    discoveryBudget.allowed,
    MAX_DISCOVERY_REQUESTS_PER_RUN,
  );
  if (discoveryAllowedThisRun < discoveryDatesDue.length)
    bump(skippedByReason, "DISCOVERY_RUN_CEILING");

  const discoveryStartedAt = deps.clock().getTime();
  for (const date of discoveryDatesDue.slice(0, discoveryAllowedThisRun)) {
    const outcome = await deps.discoverFixtures(date);
    providerCallsUsed += 1;
    discoveryRequestsAttempted += 1;
    await absorb(outcome.quota, "DISCOVERY");

    if (!outcome.ok) {
      bump(errorsByReason, `DISCOVERY_${outcome.reason}`);
      /*
       * A 429 means the budget is gone regardless of what the last snapshot
       * said, so the pass stops rather than continuing to ask.
       */
      if (outcome.reason === "RATE_LIMITED") break;
      continue;
    }
    /*
     * Recorded only once the fixture list is actually in hand.
     *
     * The adapter reads these dates back as a six-hour freshness marker, and
     * this used to push before the outcome was checked -- so a single
     * rejected or timed-out fixture-list request suppressed re-discovery of
     * that date for six hours, and a transient provider blip could hide a
     * day's fixtures from the customer surface for the rest of the morning.
     *
     * Marking attempts was previously the only thing bounding repeated
     * discovery spend. It no longer has to be: a call that returns nothing
     * usable is now charged durably through `recordRequestAttempt`, so the
     * DISCOVERY purpose budget stops a failing provider after its daily
     * allocation while each wake-up still retries promptly.
     */
    discoveryDatesRequested.push(date);
    discovered.push(...outcome.value);
  }

  timings.discoveryMs = since(discoveryStartedAt);

  const fixturePersistStartedAt = deps.clock().getTime();
  const fixtures =
    discovered.length > 0
      ? await deps.persistFixtures(discovered)
      : { received: 0, written: 0, skippedByReason: {} };
  timings.fixturePersistMs = since(fixturePersistStartedAt);
  mergeSkips(skippedByReason, fixtures.skippedByReason);

  /* ----------------------------------------------------------------- lineups */

  /*
   * Lineups run before odds, and that ordering is the opposite of what the
   * budgets alone would suggest.
   *
   * Both are time-critical, but they expire differently. A lineup is
   * publishable only in the ninety minutes before kickoff and is worthless
   * afterwards -- the window closes permanently. A price stays useful and can
   * be re-fetched on the next pass, and its own cadence bands already tolerate
   * being late.
   *
   * If lineups yielded to odds they would starve exactly when they matter: the
   * odds refresh band tightens to fifteen minutes near kickoff, so on a busy
   * evening odds is due on every wake-up and would take every one of them --
   * during precisely the window in which lineups are publishable. Since
   * `WAIT_FOR_LINEUP` cannot clear without a confirmed sheet, that would leave
   * the gate shut on every fixture the pass exists to unblock.
   *
   * The cost is bounded and small: the LINEUP budget is 15 requests a day
   * against ODDS's 60, so lineups can displace at most 15 odds opportunities.
   */
  const discoveryRan = discoveryRequestsAttempted > 0;
  if (discoveryRan) {
    bump(skippedByReason, "LINEUPS_DEFERRED_AFTER_DISCOVERY");
  }

  const lineupCandidatesStartedAt = deps.clock().getTime();
  const lineupQueue = discoveryRan ? [] : await deps.lineupCandidates();
  timings.lineupCandidatesMs = since(lineupCandidatesStartedAt);

  const lineupBudget = purposeRequestBudget({
    purpose: "LINEUP",
    snapshot,
    spentToday: spent.LINEUP,
    candidates: lineupQueue.length,
    now: startedAt,
  });
  if (lineupBudget.limitedBy)
    bump(skippedByReason, `LINEUP_${lineupBudget.limitedBy}`);

  const lineupAllowedThisRun = Math.min(
    lineupBudget.allowed,
    MAX_LINEUP_REQUESTS_PER_RUN,
  );
  if (
    lineupAllowedThisRun < lineupBudget.allowed ||
    (lineupAllowedThisRun < lineupQueue.length && !lineupBudget.limitedBy)
  ) {
    bump(skippedByReason, "LINEUP_RUN_CEILING");
  }

  /* Nearest kickoff first: a lineup's value expires at kickoff, so the match
     closest to starting is both likeliest to have a sheet published and
     nearest to running out of time for it to matter. */
  const lineupPrioritized = prioritizeLineupCandidates(lineupQueue);
  const collectedLineups: TLineup[] = [];
  let lineupRequestsAttempted = 0;
  const lineupFetchStartedAt = deps.clock().getTime();
  for (const candidate of lineupPrioritized.slice(0, lineupAllowedThisRun)) {
    const state = providerQuotaState(snapshot, deps.clock());
    if (state === "EXHAUSTED" || state === "CRITICAL") {
      bump(skippedByReason, `LINEUP_QUOTA_${state}`);
      break;
    }
    const outcome = await deps.fetchLineups(candidate.providerFixtureId);
    providerCallsUsed += 1;
    lineupRequestsAttempted += 1;
    await absorb(outcome.quota, "LINEUP");
    if (!outcome.ok) {
      bump(errorsByReason, `LINEUP_${outcome.reason}`);
      if (outcome.reason === "RATE_LIMITED") {
        await absorb(
          {
            remaining: 0,
            dailyLimit: snapshot.dailyLimit,
            observedAt: deps.clock(),
          },
          "LINEUP",
        );
        break;
      }
      continue;
    }
    collectedLineups.push(...outcome.value);
  }
  timings.lineupFetchMs = since(lineupFetchStartedAt);

  const lineupPersistStartedAt = deps.clock().getTime();
  const lineups =
    collectedLineups.length > 0
      ? await deps.persistLineups(collectedLineups)
      : {
          received: 0,
          written: 0,
          duplicate: 0,
          official: 0,
          skippedByReason: {},
        };
  timings.lineupPersistMs = since(lineupPersistStartedAt);
  mergeSkips(skippedByReason, lineups.skippedByReason);

  /* -------------------------------------------------------------------- odds */

  /*
   * A pass that spent its budget discovering does not also price.
   *
   * Both phases in one invocation is what the wall-clock limit refused, and
   * splitting them costs nothing: the next wake-up is fifteen minutes away,
   * well inside every refresh band except the final one, and newly
   * discovered fixtures are hours from kickoff by definition. Keeping each
   * invocation to a single purpose is also what makes a killed run cheap --
   * there is only ever one kind of work in flight to lose.
   */
  const lineupRan = lineupRequestsAttempted > 0;
  if (discoveryRan || lineupRan) {
    bump(
      skippedByReason,
      discoveryRan
        ? "ODDS_DEFERRED_AFTER_DISCOVERY"
        : "ODDS_DEFERRED_AFTER_LINEUP",
    );
  }

  const candidatesStartedAt = deps.clock().getTime();
  const candidates =
    discoveryRan || lineupRan ? [] : await deps.oddsCandidates();
  timings.candidatesMs = since(candidatesStartedAt);
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
  const oddsFetchStartedAt = deps.clock().getTime();
  for (const candidate of prioritized.slice(0, oddsAllowedThisRun)) {
    const state = providerQuotaState(snapshot, deps.clock());
    if (state === "EXHAUSTED" || state === "CRITICAL") {
      bump(skippedByReason, `ODDS_QUOTA_${state}`);
      break;
    }

    const outcome = await deps.fetchOdds(candidate.providerFixtureId);
    providerCallsUsed += 1;
    oddsRequestsAttempted += 1;
    await absorb(outcome.quota, "ODDS");

    if (!outcome.ok) {
      bump(errorsByReason, `ODDS_${outcome.reason}`);
      if (outcome.reason === "RATE_LIMITED") {
        /*
         * Treat the budget as spent for the rest of the day even if the
         * provider did not send a remaining count with the refusal -- a
         * refusal is itself the most reliable signal we have.
         */
        await absorb(
          {
            remaining: 0,
            dailyLimit: snapshot.dailyLimit,
            observedAt: deps.clock(),
          },
          "ODDS",
        );
        break;
      }
      continue;
    }
    collected.push(...outcome.value);
  }

  timings.oddsFetchMs = since(oddsFetchStartedAt);

  const oddsPersistStartedAt = deps.clock().getTime();
  const odds =
    collected.length > 0
      ? await deps.persistOdds(collected)
      : { received: 0, written: 0, duplicate: 0, skippedByReason: {} };
  timings.oddsPersistMs = since(oddsPersistStartedAt);
  mergeSkips(skippedByReason, odds.skippedByReason);

  /* ----------------------------------------------------------------- results */

  /*
   * Results yield to both other phases, and that ordering is deliberate.
   *
   * A price is only actionable for 45 minutes, so odds work has a deadline
   * that results do not: History is not a live scoreboard, and a match that
   * finished this evening is just as settleable tomorrow morning. So the
   * priority is discovery, then odds, then results.
   *
   * Results cannot starve under that ordering. The quota policy caps
   * discovery at 8 requests a day and odds at 60; a fifteen-minute cadence gives 96
   * wake-ups, leaving at least 28 on which neither phase spends anything.
   * The RESULT budget is 10, and one request covers up to twenty fixtures.
   */
  const oddsRan = oddsRequestsAttempted > 0;
  if (discoveryRan || lineupRan || oddsRan) {
    bump(
      skippedByReason,
      discoveryRan
        ? "RESULTS_DEFERRED_AFTER_DISCOVERY"
        : lineupRan
          ? "RESULTS_DEFERRED_AFTER_LINEUP"
          : "RESULTS_DEFERRED_AFTER_ODDS",
    );
  }

  const resultCandidatesStartedAt = deps.clock().getTime();
  const resultQueue =
    discoveryRan || lineupRan || oddsRan ? [] : await deps.resultCandidates();
  timings.resultCandidatesMs = since(resultCandidatesStartedAt);

  const resultBudget = purposeRequestBudget({
    purpose: "RESULT",
    snapshot,
    spentToday: spent.RESULT,
    candidates: resultQueue.length,
    now: startedAt,
  });
  if (resultBudget.limitedBy)
    bump(skippedByReason, `RESULT_${resultBudget.limitedBy}`);

  const resultAllowedThisRun = Math.min(
    resultBudget.allowed,
    MAX_RESULT_REQUESTS_PER_RUN,
  );

  /*
   * Oldest kickoff first, then take a batch. A fixture that finished three
   * hours ago is likelier to come back FINAL than one that finished twenty
   * minutes ago, so this maximises the share of one request that produces a
   * settlement rather than another IN_PROGRESS to re-ask about.
   */
  const resultFixturesRequested =
    resultAllowedThisRun > 0
      ? prioritizeResultCandidates(resultQueue)
          .slice(0, MAX_FIXTURES_PER_RESULT_REQUEST)
          .map((candidate) => candidate.providerFixtureId)
      : [];
  if (
    resultQueue.length > resultFixturesRequested.length &&
    resultAllowedThisRun > 0
  ) {
    bump(skippedByReason, "RESULT_BATCH_CEILING");
  }

  const collectedResults: TResult[] = [];
  let resultRequestsAttempted = 0;
  const resultFetchStartedAt = deps.clock().getTime();
  if (resultFixturesRequested.length > 0) {
    const state = providerQuotaState(snapshot, deps.clock());
    if (state === "EXHAUSTED" || state === "CRITICAL") {
      bump(skippedByReason, `RESULT_QUOTA_${state}`);
    } else {
      const outcome = await deps.fetchResults(resultFixturesRequested);
      providerCallsUsed += 1;
      resultRequestsAttempted += 1;
      await absorb(outcome.quota, "RESULT");
      if (outcome.ok) {
        collectedResults.push(...outcome.value);
      } else {
        bump(errorsByReason, `RESULT_${outcome.reason}`);
        if (outcome.reason === "RATE_LIMITED") {
          await absorb(
            {
              remaining: 0,
              dailyLimit: snapshot.dailyLimit,
              observedAt: deps.clock(),
            },
            "RESULT",
          );
        }
      }
    }
  }
  timings.resultFetchMs = since(resultFetchStartedAt);

  const resultPersistStartedAt = deps.clock().getTime();
  const results =
    collectedResults.length > 0
      ? await deps.persistResults(collectedResults)
      : {
          received: 0,
          written: 0,
          duplicate: 0,
          settlementsWritten: 0,
          skippedByReason: {},
        };
  timings.resultPersistMs = since(resultPersistStartedAt);
  mergeSkips(skippedByReason, results.skippedByReason);

  /* ------------------------------------------------------------- quota probe */

  /*
   * Only reached when the pass had nothing to do and the quota is genuinely
   * unknown -- typically the first run of a UTC day after a quiet night. One
   * request buys a known budget for every later pass that day.
   */
  if (shouldProbeQuotaStatus(snapshot, deps.clock(), providerCallsUsed)) {
    /*
     * Every other provider call passes `purposeRequestBudget`; this one did
     * not, which made it the one unbounded call in the pass. That matters
     * because a probe is reached exactly when the quota is UNKNOWN, and a
     * probe that fails -- or a provider that stops sending the remaining
     * header -- leaves it UNKNOWN, so the next wake-up probed again. On a
     * 15-minute cadence that is 96 status calls a day against a ~100-call
     * plan, spent entirely on inspecting the budget.
     */
    const probeBudget = purposeRequestBudget({
      purpose: "DISCOVERY",
      snapshot,
      spentToday: spent.DISCOVERY + discoveryRequestsAttempted,
      candidates: 1,
      now: deps.clock(),
    });
    if (probeBudget.allowed > 0) {
      const outcome = await deps.probeQuotaStatus();
      providerCallsUsed += 1;
      quotaProbed = true;
      /* Charged to discovery: it is the purpose whose budget funds finding
         out what the day's budget actually is. */
      await absorb(outcome.quota, "DISCOVERY");
      if (!outcome.ok) bump(errorsByReason, `STATUS_${outcome.reason}`);
    } else {
      bump(
        skippedByReason,
        `STATUS_PROBE_${probeBudget.limitedBy ?? "PURPOSE_BUDGET_SPENT"}`,
      );
    }
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
    lineupCandidates: lineupQueue.length,
    lineupRequestsAttempted,
    lineupsReceived: lineups.received,
    lineupsWritten: lineups.written,
    lineupDuplicates: lineups.duplicate,
    lineupsOfficial: lineups.official,
    resultCandidates: resultQueue.length,
    resultRequestsAttempted,
    resultFixturesRequested,
    resultsReceived: results.received,
    resultsWritten: results.written,
    resultDuplicates: results.duplicate,
    settlementsWritten: results.settlementsWritten,
    skippedByReason,
    errorsByReason,
    timings,
  };
}
