import { and, eq, gte, lt, sql } from "drizzle-orm";
/*
 * Imported from the module rather than the package index on purpose. The
 * index re-exports the synthetic replay harness, which resolves its recorded
 * fixtures through a directory path that a bundler cannot follow -- pulling
 * the whole index in here made the admin build fail on
 * `Can't resolve './mock/fixtures/v1/'`. The deep imports also keep the
 * replay corpus out of the production ingestion bundle entirely, which is
 * where it belongs: nothing on this path should be able to reach synthetic
 * data.
 */
import {
  createApiSportsClient,
  normalizeFootballFixture,
  normalizeFootballLineup,
  normalizeFootballResult,
  normalizeOdds,
  sanitizeProviderError,
  type ApiSportsClient,
  type NormalizedEvent,
  type NormalizedOdds,
  type NormalizedLineup,
  type NormalizedResult,
} from "@velyq/providers/apisports";
import type { EventLifecycleStatus, LineupStatus } from "@velyq/domain";
import { teamAliasLookupFor } from "@velyq/providers/team-aliases";
import {
  PROVIDER_QUOTA_POLICY_VERSION,
  providerQuotaState,
  utcQuotaDay,
  type IngestionPurpose,
  type ProviderQuotaSnapshot,
} from "@velyq/application/provider-quota";
import { oddsRefreshDue } from "@velyq/application/odds-freshness";
import { lineupRequestDue } from "@velyq/application/lineup-freshness";
import { resultRequestDue } from "@velyq/application/result-freshness";
import type {
  DiscoveredFixture,
  ObservedQuota,
  OddsCandidate,
  ProviderCallOutcome,
  ProviderIngestionDeps,
  ProviderIngestionResult,
  LineupCandidate,
  ResultCandidate,
} from "@velyq/application/provider-ingestion";

import type { PrivilegedVelyqDatabase } from "../client.js";
import {
  ingestFootballFixture,
  loadCompetitionBridge,
} from "./fixture-ingestion.js";
import {
  ensureFootballReferenceData,
  ingestFootballOdds,
  isWiredOddsMarket,
} from "./odds-ingestion.js";
import { ingestFootballLineups } from "./lineup-ingestion.js";
import { ingestFootballResults } from "./result-ingestion.js";
import { competitionIdentities, events } from "../schema/catalog.js";
import {
  eventMarketOutcomes,
  eventMarkets,
  oddsObservations,
} from "../schema/market.js";
import {
  providerIngestionRuns,
  providerOddsRequests,
  providerLineupRequests,
  providerResultRequests,
  providerQuotaState as quotaStateTable,
} from "../schema/operations.js";

/**
 * Wires the real provider client, the tested persistence writers and the
 * remembered quota state into the ports `runProviderIngestion` expects.
 *
 * The persistence half is deliberately *not* the raw-SQL implementation that
 * exists on `codex/intelligence-completion-v2`. That version writes catalog
 * rows with hand-built INSERT statements, which bypasses
 * `resolveCompetitionIdentity` -- the provider-league-id resolver that exists
 * because a display-name match once mapped Brazil's Série A onto Italy's --
 * and bypasses the reviewed team-alias resolver, turning a spelling
 * difference into a false TEAM_NOT_IN_MODEL. Everything here goes through
 * `ingestFootballFixture` and `ingestFootballOdds`, which are covered by the
 * Postgres integration suite and carry those resolvers, the provenance
 * trigger and the idempotency rules with them.
 */

const PROVIDER_CODE = "API_SPORTS";

/**
 * How long a date's fixture list stays fresh.
 *
 * Fixture lists change slowly -- kickoffs and postponements, not prices -- so
 * re-requesting one every few minutes buys nothing and costs the same as an
 * odds request. Six hours gives two discoveries per date per day, which for
 * the two dates in the customer horizon is four requests against an
 * eight-request discovery allocation.
 */
const DISCOVERY_FRESH_FOR_MINUTES = 360;

/**
 * How far ahead fixtures are discovered.
 *
 * Today, because that is what the customer's Today surface shows, and
 * tomorrow, so a fixture is in the catalog with prices attached before the
 * morning of its own kickoff rather than appearing minutes beforehand.
 */
const HORIZON_DAYS = 2;

/** Only fixtures this close to kickoff are worth spending an odds request on. */
const ODDS_INTEREST_WINDOW_HOURS = 36;

/**
 * How far back to look for fixtures whose result is still missing.
 *
 * Matches the give-up window in `result-freshness.ts`: after three days an
 * absent result is a data problem rather than a timing one, and a query that
 * kept returning the fixture would turn one broken row into a standing daily
 * charge against a ten-request budget.
 */
const RESULT_INTEREST_WINDOW_HOURS = 72;

/**
 * How far ahead to look for fixtures whose lineup might be publishable.
 *
 * Slightly wider than the policy's own ninety-minute window so the query does
 * not sit exactly on the boundary it is about to evaluate; `lineupRequestDue`
 * makes the actual decision.
 */
const LINEUP_INTEREST_WINDOW_HOURS = 3;

/**
 * How many bookmakers per fixture are followed.
 *
 * Was six, because persisting the panel cost seven to ten database round
 * trips per observation and one fixture took about twelve seconds -- the
 * binding constraint on an invocation with a hard wall-clock limit. The
 * writer now batches: measured against real PostgreSQL, eighteen observations
 * fell from 208 round trips and 168 ms to 24 and 25 ms, and the cost is now
 * bounded by distinct bookmakers and markets rather than by observations
 * (`test-benchmark/odds-writer-batching.test.ts` holds the measurement).
 *
 * Raised to sixteen, which is above the ten to thirteen bookmakers the
 * provider actually returns for a football fixture -- so in practice the cap
 * no longer discards anything, and a bookmaker appearing or disappearing does
 * not silently change which panel the consensus is computed over. It remains
 * a cap rather than being removed: an unexpectedly large response should be
 * bounded rather than trusted.
 *
 * This costs no additional provider quota. The full panel is already in the
 * response we have paid for; the cap only ever governed how much of it was
 * written.
 */
const MAX_BOOKMAKERS_PER_FIXTURE = 16;

function utcDate(at: Date, dayOffset = 0): string {
  const shifted = new Date(at);
  shifted.setUTCDate(shifted.getUTCDate() + dayOffset);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Maps a provider failure onto the orchestrator's outcome vocabulary.
 *
 * A 429 is singled out because it must change quota policy immediately
 * rather than be retried: the provider has already refused, so asking again
 * spends budget to be refused again.
 */
function classifyProviderError(error: unknown): "RATE_LIMITED" | "RETRYABLE" {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") ? "RATE_LIMITED" : "RETRYABLE";
}

/**
 * Classifies a response the provider actually returned.
 *
 * `classifyProviderError` can only inspect a *thrown* error, and the
 * ingestion client is deliberately built with `retries: 0` -- so a 429
 * returns normally and never throws. That made the RATE_LIMITED branch that
 * stops the pass unreachable in production: discovery reported a rate limit
 * as `REJECTED`, and odds reported it as a successful pass with no prices at
 * all. A 429 has to change quota policy immediately, so it is classified
 * from the status code rather than from an error string.
 *
 * Returns null when the response is genuinely usable.
 */
function classifyProviderResponse(
  status: number,
  errors: unknown,
): "RATE_LIMITED" | "RETRYABLE" | "REJECTED" | null {
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "RETRYABLE";
  if (
    errors !== null &&
    typeof errors === "object" &&
    Object.keys(errors as Record<string, unknown>).length > 0
  )
    return "REJECTED";
  return status >= 400 ? "REJECTED" : null;
}

function logRejectedProviderResponse(
  endpoint: "odds" | "lineups",
  status: number,
  errors: unknown,
): void {
  const serialized =
    typeof errors === "string" ? errors : JSON.stringify(errors ?? {});
  console.warn("provider response rejected", {
    endpoint,
    status,
    errors: sanitizeProviderError(serialized).slice(0, 500),
  });
}

function observedQuotaFrom(
  quota: Readonly<{ requestsRemaining: number | null }>,
  dailyLimit: number | null,
  at: Date,
): ObservedQuota {
  return { remaining: quota.requestsRemaining, dailyLimit, observedAt: at };
}

export type ProviderIngestionAdapter = Readonly<{
  deps: ProviderIngestionDeps<
    NormalizedEvent,
    NormalizedOdds,
    NormalizedResult,
    NormalizedLineup
  >;
  /** Records the completed run for §18 observability. */
  recordRun: (result: ProviderIngestionResult) => Promise<void>;
  providerId: string;
}>;

export async function createProviderIngestionAdapter(
  database: PrivilegedVelyqDatabase,
  options: Readonly<{
    clock?: () => Date;
    client?: ApiSportsClient;
  }> = {},
): Promise<ProviderIngestionAdapter> {
  const clock = options.clock ?? (() => new Date());
  const client =
    options.client ??
    createApiSportsClient("football", {
      /*
       * Tighter than the client's 8s default, and with no in-invocation
       * retry.
       *
       * The client's retry is a real second HTTP request, so the provider
       * decrements quota for it -- which is how a pass capped at two odds
       * requests spent six. It also multiplies the wall-clock cost of the
       * slowest possible response inside an invocation that has a hard
       * limit, and losing the invocation loses the run record.
       *
       * Retrying by rescheduling is strictly better here: the scheduler
       * wakes every fifteen minutes, and every unit of work is due-based, so
       * a failed discovery or a failed price is simply still due on the next
       * pass. The failure is recorded in `errorsByReason` either way, so a
       * persistent fault is visible rather than hidden behind silent
       * retries.
       */
      timeoutMs: 6_000,
      retries: 0,
    });
  const reference = await ensureFootballReferenceData(database, PROVIDER_CODE);
  const providerId = reference.providerId;

  /*
   * Read once per adapter rather than per fixture: this is the same table the
   * canonical-code resolution uses, so "worth spending quota on" and
   * "eligible to become customer intelligence" cannot drift into two
   * different definitions.
   */
  const mappedProviderCompetitionIds = new Set(
    (
      await database
        .select({ id: competitionIdentities.providerCompetitionId })
        .from(competitionIdentities)
        .where(
          and(
            eq(competitionIdentities.providerId, providerId),
            eq(competitionIdentities.mappingStatus, "CONFIRMED"),
          ),
        )
    ).map((row) => row.id),
  );

  const deps: ProviderIngestionDeps<
    NormalizedEvent,
    NormalizedOdds,
    NormalizedResult,
    NormalizedLineup
  > = {
    clock,

    async loadQuotaSnapshot(): Promise<ProviderQuotaSnapshot> {
      const now = clock();
      const [row] = await database
        .select()
        .from(quotaStateTable)
        .where(
          and(
            eq(quotaStateTable.providerId, providerId),
            eq(quotaStateTable.quotaDay, utcQuotaDay(now)),
          ),
        )
        .limit(1);
      /*
       * No row for today means the quota is unknown, not exhausted -- the
       * policy draws that distinction and the absence of a row must not be
       * read as an empty budget.
       */
      return {
        dailyLimit: row?.dailyLimit ?? null,
        remaining: row?.remaining ?? null,
        quotaDay: utcQuotaDay(now),
        observedAt: row?.lastObservedAt ?? null,
      };
    },

    async recordQuotaObservation(
      observed: ObservedQuota,
      purpose: IngestionPurpose,
    ): Promise<void> {
      const quotaDay = utcQuotaDay(observed.observedAt);
      const snapshot: ProviderQuotaSnapshot = {
        dailyLimit: observed.dailyLimit,
        remaining: observed.remaining,
        quotaDay,
        observedAt: observed.observedAt,
      };
      await database
        .insert(quotaStateTable)
        .values({
          providerId,
          quotaDay,
          dailyLimit: observed.dailyLimit,
          remaining: observed.remaining,
          requestsUsed: 1,
          discoveryRequests: purpose === "DISCOVERY" ? 1 : 0,
          oddsRequests: purpose === "ODDS" ? 1 : 0,
          lineupRequests: purpose === "LINEUP" ? 1 : 0,
          resultRequests: purpose === "RESULT" ? 1 : 0,
          lastObservedAt: observed.observedAt,
          lastProviderCallAt: observed.observedAt,
          policyState: providerQuotaState(snapshot, observed.observedAt),
          policyVersion: PROVIDER_QUOTA_POLICY_VERSION,
          updatedAt: observed.observedAt,
        })
        .onConflictDoUpdate({
          target: [quotaStateTable.providerId, quotaStateTable.quotaDay],
          set: {
            dailyLimit: sql`coalesce(excluded.daily_limit, ${quotaStateTable.dailyLimit})`,
            remaining: sql`excluded.remaining`,
            /* Counts calls, so a day's spend is visible even when the
               provider stops reporting a remaining figure. */
            requestsUsed: sql`${quotaStateTable.requestsUsed} + 1`,
            discoveryRequests: sql`${quotaStateTable.discoveryRequests} + excluded.discovery_requests`,
            oddsRequests: sql`${quotaStateTable.oddsRequests} + excluded.odds_requests`,
            lineupRequests: sql`${quotaStateTable.lineupRequests} + excluded.lineup_requests`,
            resultRequests: sql`${quotaStateTable.resultRequests} + excluded.result_requests`,
            lastObservedAt: sql`excluded.last_observed_at`,
            lastProviderCallAt: sql`excluded.last_provider_call_at`,
            policyState: sql`excluded.policy_state`,
            policyVersion: sql`excluded.policy_version`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    },

    /*
     * Charges a request whose response never arrived.
     *
     * Deliberately not `recordQuotaObservation` with a null observation:
     * that statement overwrites `remaining` unconditionally, so reusing it
     * here would erase a known-good figure and drop the day back to
     * UNKNOWN -- the very state that makes the pipeline probe again. So the
     * counters advance, `daily_limit` is preserved, and `remaining` decays
     * by the request we must assume was spent, floored at zero. It is left
     * null when it was already null, because guessing a remaining figure we
     * have never observed would be worse than admitting we do not know.
     */
    async recordRequestAttempt(
      purpose: IngestionPurpose,
      at: Date,
    ): Promise<void> {
      const quotaDay = utcQuotaDay(at);
      await database
        .insert(quotaStateTable)
        .values({
          providerId,
          quotaDay,
          dailyLimit: null,
          remaining: null,
          requestsUsed: 1,
          discoveryRequests: purpose === "DISCOVERY" ? 1 : 0,
          oddsRequests: purpose === "ODDS" ? 1 : 0,
          lineupRequests: purpose === "LINEUP" ? 1 : 0,
          resultRequests: purpose === "RESULT" ? 1 : 0,
          /* No observation was made, so `last_observed_at` must not move --
             only the fact that we called the provider. */
          lastProviderCallAt: at,
          /* Never observed, which is exactly what UNKNOWN means. On conflict
             it is left alone: an unobserved attempt is no basis for
             reclassifying a day. `policyState` is observability only --
             `providerQuotaState` recomputes the authoritative state from
             `remaining` at read time. */
          policyState: providerQuotaState(
            { dailyLimit: null, remaining: null, quotaDay, observedAt: null },
            at,
          ),
          policyVersion: PROVIDER_QUOTA_POLICY_VERSION,
          updatedAt: at,
        })
        .onConflictDoUpdate({
          target: [quotaStateTable.providerId, quotaStateTable.quotaDay],
          set: {
            requestsUsed: sql`${quotaStateTable.requestsUsed} + 1`,
            discoveryRequests: sql`${quotaStateTable.discoveryRequests} + excluded.discovery_requests`,
            oddsRequests: sql`${quotaStateTable.oddsRequests} + excluded.odds_requests`,
            lineupRequests: sql`${quotaStateTable.lineupRequests} + excluded.lineup_requests`,
            resultRequests: sql`${quotaStateTable.resultRequests} + excluded.result_requests`,
            remaining: sql`case when ${quotaStateTable.remaining} is null then null else greatest(${quotaStateTable.remaining} - 1, 0) end`,
            lastProviderCallAt: sql`excluded.last_provider_call_at`,
            policyVersion: sql`excluded.policy_version`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    },

    async spentToday(): Promise<Readonly<Record<IngestionPurpose, number>>> {
      /*
       * Read from the quota-state counters, not from the run log. A run can
       * be killed after its requests have been made -- the first live pass
       * was -- and spend that left no trace would let the next pass believe
       * the budget untouched.
       */
      const [row] = await database
        .select({
          discovery: quotaStateTable.discoveryRequests,
          odds: quotaStateTable.oddsRequests,
          lineup: quotaStateTable.lineupRequests,
          result: quotaStateTable.resultRequests,
        })
        .from(quotaStateTable)
        .where(
          and(
            eq(quotaStateTable.providerId, providerId),
            eq(quotaStateTable.quotaDay, utcQuotaDay(clock())),
          ),
        )
        .limit(1);
      return {
        DISCOVERY: row?.discovery ?? 0,
        ODDS: row?.odds ?? 0,
        LINEUP: row?.lineup ?? 0,
        RESULT: row?.result ?? 0,
      };
    },

    async discoveryDueDates(): Promise<readonly string[]> {
      const now = clock();
      const horizon = Array.from({ length: HORIZON_DAYS }, (_, offset) =>
        utcDate(now, offset),
      );
      const freshSince = new Date(
        now.getTime() - DISCOVERY_FRESH_FOR_MINUTES * 60_000,
      );
      const recent = await database
        .select({ dates: providerIngestionRuns.discoveryDatesRequested })
        .from(providerIngestionRuns)
        .where(
          and(
            eq(providerIngestionRuns.providerId, providerId),
            gte(providerIngestionRuns.startedAt, freshSince),
          ),
        );
      const alreadyFresh = new Set(recent.flatMap((row) => row.dates ?? []));
      return horizon.filter((date) => !alreadyFresh.has(date));
    },

    async oddsCandidates(): Promise<readonly OddsCandidate[]> {
      const now = clock();
      const until = new Date(
        now.getTime() + ODDS_INTEREST_WINDOW_HOURS * 3_600_000,
      );

      /*
       * Only LIVE fixtures, and only ones the provider can still be asked
       * about (an event with no provider identity cannot be looked up).
       * `latest` is the newest price for the fixture across all its outcomes,
       * which is what the freshness policy is defined over.
       */
      /*
       * Loaded as a plain keyed read rather than a correlated subquery.
       *
       * The marker is what stops the scheduler re-buying the same fixture
       * every pass, so it must be unambiguous: expressed as a subquery
       * alongside raw `sql` joins it came back empty in the application while
       * returning correctly in psql, and a silently-null guard is worse than
       * no guard. There are only ever a few dozen fixtures in the horizon, so
       * one small read and a map lookup is both cheaper to reason about and
       * cheap to run.
       */
      const requestLog = new Map(
        (
          await database
            .select({
              providerFixtureId: providerOddsRequests.providerFixtureId,
              lastRequestedAt: providerOddsRequests.lastRequestedAt,
            })
            .from(providerOddsRequests)
            .where(eq(providerOddsRequests.providerId, providerId))
        ).map((row) => [row.providerFixtureId, row.lastRequestedAt]),
      );

      const rows = await database
        .select({
          providerFixtureId: sql<string>`identity.provider_fixture_id`,
          kickoffAt: sql<Date | string>`${events.startsAt}`,
          providerCompetitionId: sql<
            string | null
          >`identity_competition.provider_competition_id`,
          latestObservedAt: sql<Date | string | null>`(
            select max(${oddsObservations.providerObservedAt})
            from ${oddsObservations}
            join ${eventMarketOutcomes}
              on ${eventMarketOutcomes.id} = ${oddsObservations.eventMarketOutcomeId}
            join ${eventMarkets}
              on ${eventMarkets.id} = ${eventMarketOutcomes.eventMarketId}
            where ${eventMarkets.eventId} = ${events.id}
          )`,
        })
        .from(events)
        .innerJoin(
          sql`catalog.event_identities as identity`,
          sql`identity.event_id = ${events.id} and identity.provider_id = ${providerId}`,
        )
        .leftJoin(
          sql`catalog.competition_identities as identity_competition`,
          sql`identity_competition.competition_id = ${events.competitionId}
              and identity_competition.provider_id = ${providerId}
              and identity_competition.mapping_status = 'CONFIRMED'`,
        )
        .where(
          and(
            eq(events.synthetic, false),
            gte(events.startsAt, now),
            lt(events.startsAt, until),
          ),
        );

      /*
       * Coerced explicitly rather than trusted to arrive as Dates. The raw
       * `sql` joins above sidestep Drizzle's column mapping, so a timestamp
       * comes back as the driver's own representation -- a string, in
       * practice -- and the first live run failed with
       * `a.getTime is not a function` once those values reached the
       * kickoff comparison. Converting at this boundary keeps the timestamp
       * handling in one place instead of scattering guards through the
       * policy functions that consume it.
       */
      const asDate = (value: Date | string | null): Date | null =>
        value === null ? null : value instanceof Date ? value : new Date(value);

      return rows.flatMap((row) => {
        const kickoffAt = asDate(row.kickoffAt);
        if (!kickoffAt) return [];
        if (
          !oddsRefreshDue(
            asDate(row.latestObservedAt),
            now,
            kickoffAt,
            requestLog.get(row.providerFixtureId) ?? null,
          )
        )
          return [];
        return [
          {
            providerFixtureId: row.providerFixtureId,
            kickoffAt,
            competitionMapped:
              row.providerCompetitionId !== null &&
              mappedProviderCompetitionIds.has(row.providerCompetitionId),
          },
        ];
      });
    },

    /**
     * Fixtures that have plausibly finished and are not yet answered.
     *
     * Bounded by `resultRequestDue`, whose contract is that a terminal
     * fixture is never returned again -- which is what makes the cost of the
     * result pass per fixture rather than per wake-up.
     */
    async resultCandidates(): Promise<readonly ResultCandidate[]> {
      const now = clock();

      /*
       * Loaded as a plain keyed read and joined in memory, for the same
       * reason `oddsCandidates` does it that way: expressed as a correlated
       * subquery alongside the raw `sql` identity joins, the marker came back
       * empty in the application while returning correctly in psql, and a
       * silently null guard is worse than no guard. The give-up window bounds
       * this to three days of fixtures.
       */
      const requestLog = new Map(
        (
          await database
            .select({
              providerFixtureId: providerResultRequests.providerFixtureId,
              lastRequestedAt: providerResultRequests.lastRequestedAt,
              lastKnownStatus: providerResultRequests.lastKnownStatus,
            })
            .from(providerResultRequests)
            .where(eq(providerResultRequests.providerId, providerId))
        ).map((row) => [row.providerFixtureId, row] as const),
      );

      const earliest = new Date(
        now.getTime() - RESULT_INTEREST_WINDOW_HOURS * 3_600_000,
      );

      const rows = await database
        .select({
          providerFixtureId: sql<string>`identity.provider_fixture_id`,
          kickoffAt: sql<Date | string>`${events.startsAt}`,
        })
        .from(events)
        .innerJoin(
          sql`catalog.event_identities as identity`,
          sql`identity.event_id = ${events.id} and identity.provider_id = ${providerId}`,
        )
        .where(
          and(
            eq(events.synthetic, false),
            gte(events.startsAt, earliest),
            lt(events.startsAt, now),
          ),
        );

      /* Same coercion as the odds path: the raw `sql` joins sidestep
         Drizzle's column mapping, so a timestamp arrives as the driver's own
         representation -- a string, in practice. */
      const asDate = (value: Date | string | null): Date | null =>
        value === null ? null : value instanceof Date ? value : new Date(value);

      return rows.flatMap((row) => {
        const kickoffAt = asDate(row.kickoffAt);
        if (!kickoffAt) return [];
        const marker = requestLog.get(row.providerFixtureId);
        const verdict = resultRequestDue({
          kickoffAt,
          asOf: now,
          knownStatus:
            (marker?.lastKnownStatus as EventLifecycleStatus | null) ?? null,
          lastRequestedAt: asDate(marker?.lastRequestedAt ?? null),
        });
        if (!verdict.due) return [];
        return [{ providerFixtureId: row.providerFixtureId, kickoffAt }];
      });
    },

    /**
     * Fixtures whose lineup is worth asking for.
     *
     * Unlike the odds and result queues this one also needs to know whether
     * the model can price the fixture at all: a lineup for an unmapped
     * competition cannot change any decision, because there is no decision,
     * and the lineup budget is a quarter of the odds budget.
     */
    async lineupCandidates(): Promise<readonly LineupCandidate[]> {
      const now = clock();
      const until = new Date(
        now.getTime() + LINEUP_INTEREST_WINDOW_HOURS * 3_600_000,
      );
      const from = new Date(now.getTime() - 60 * 60_000);

      const requestLog = new Map(
        (
          await database
            .select({
              providerFixtureId: providerLineupRequests.providerFixtureId,
              lastRequestedAt: providerLineupRequests.lastRequestedAt,
              lastKnownStatus: providerLineupRequests.lastKnownStatus,
            })
            .from(providerLineupRequests)
            .where(eq(providerLineupRequests.providerId, providerId))
        ).map((row) => [row.providerFixtureId, row] as const),
      );

      const rows = await database
        .select({
          providerFixtureId: sql<string>`identity.provider_fixture_id`,
          kickoffAt: sql<Date | string>`${events.startsAt}`,
          providerCompetitionId: sql<
            string | null
          >`identity_competition.provider_competition_id`,
        })
        .from(events)
        .innerJoin(
          sql`catalog.event_identities as identity`,
          sql`identity.event_id = ${events.id} and identity.provider_id = ${providerId}`,
        )
        .leftJoin(
          sql`catalog.competition_identities as identity_competition`,
          sql`identity_competition.competition_id = ${events.competitionId}
              and identity_competition.provider_id = ${providerId}
              and identity_competition.mapping_status = 'CONFIRMED'`,
        )
        .where(
          and(
            eq(events.synthetic, false),
            gte(events.startsAt, from),
            lt(events.startsAt, until),
          ),
        );

      const asDate = (value: Date | string | null): Date | null =>
        value === null ? null : value instanceof Date ? value : new Date(value);

      return rows.flatMap((row) => {
        const kickoffAt = asDate(row.kickoffAt);
        if (!kickoffAt) return [];
        const marker = requestLog.get(row.providerFixtureId);
        const verdict = lineupRequestDue({
          kickoffAt,
          asOf: now,
          knownStatus: (marker?.lastKnownStatus as LineupStatus | null) ?? null,
          competitionSupported:
            row.providerCompetitionId !== null &&
            mappedProviderCompetitionIds.has(row.providerCompetitionId),
          lastRequestedAt: asDate(marker?.lastRequestedAt ?? null),
        });
        if (!verdict.due) return [];
        return [{ providerFixtureId: row.providerFixtureId, kickoffAt }];
      });
    },

    async discoverFixtures(
      date: string,
    ): Promise<
      ProviderCallOutcome<readonly DiscoveredFixture<NormalizedEvent>[]>
    > {
      try {
        const response = await client.get("/fixtures", { date });
        const quota = observedQuotaFrom(response.quota, null, clock());
        /*
         * A rejected request still consumed quota, so the observation is
         * reported even though the payload is unusable.
         */
        const rejection = classifyProviderResponse(
          response.status,
          response.body.errors,
        );
        if (rejection) return { ok: false, reason: rejection, quota };
        const value = (response.body.response ?? []).map((record) => {
          const event = normalizeFootballFixture(record);
          return {
            providerEventId: event.providerEventId,
            competitionProviderId: event.competitionProviderId,
            scheduledAt: event.scheduledAt,
            payload: event,
          };
        });
        return { ok: true, value, quota };
      } catch (error) {
        return { ok: false, reason: classifyProviderError(error), quota: null };
      }
    },

    async fetchOdds(
      providerFixtureId: string,
    ): Promise<ProviderCallOutcome<readonly NormalizedOdds[]>> {
      /*
       * Recorded before the response is even inspected. The point of the
       * marker is that we spent a request, which is true regardless of what
       * came back -- including a failure, where re-asking immediately would
       * be the worst possible response to a provider that is unwell.
       */
      const markRequested = async (): Promise<void> => {
        await database
          .insert(providerOddsRequests)
          .values({
            providerId,
            providerFixtureId,
            lastRequestedAt: clock(),
            requestCount: 1,
          })
          .onConflictDoUpdate({
            target: [
              providerOddsRequests.providerId,
              providerOddsRequests.providerFixtureId,
            ],
            set: {
              lastRequestedAt: sql`excluded.last_requested_at`,
              requestCount: sql`${providerOddsRequests.requestCount} + 1`,
            },
          });
      };

      try {
        const response = await client.get("/odds", {
          fixture: providerFixtureId,
        });
        await markRequested();
        const observedAt = clock();
        const quota = observedQuotaFrom(response.quota, null, observedAt);
        /*
         * Discovery guarded on this and odds did not, so a refused odds
         * request -- rate limit, plan limit, bad parameter -- was recorded
         * as a successful pass that simply found no prices. The funnel then
         * told an operator "we priced it, the provider had nothing", which
         * is the opposite of what happened.
         */
        const rejection = classifyProviderResponse(
          response.status,
          response.body.errors,
        );
        if (rejection) {
          logRejectedProviderResponse(
            "odds",
            response.status,
            response.body.errors,
          );
          return { ok: false, reason: rejection, quota };
        }
        const value = (response.body.response ?? []).flatMap((record) =>
          normalizeOdds(record, "FOOTBALL", observedAt.toISOString()),
        );
        return { ok: true, value, quota };
      } catch (error) {
        await markRequested().catch(() => {});
        return { ok: false, reason: classifyProviderError(error), quota: null };
      }
    },

    /**
     * One provider request covering a batch of fixtures.
     *
     * `/fixtures?ids=` is the endpoint that makes the whole pass affordable.
     * Unlike odds -- where each fixture needs its own request because each
     * returns a different bookmaker cross-section -- a single call answers up
     * to twenty matches, which is why a ten-request daily budget is generous.
     */
    async fetchResults(
      providerFixtureIds: readonly string[],
    ): Promise<ProviderCallOutcome<readonly NormalizedResult[]>> {
      /*
       * Advanced before the response is inspected, as with odds. The marker
       * records that we spent a request, which is true regardless of what
       * came back -- and re-asking immediately is the worst possible response
       * to a provider that is unwell.
       */
      const markRequested = async (
        statusByFixtureId: Readonly<Record<string, string>> = {},
      ): Promise<void> => {
        const at = clock();
        for (const providerFixtureId of providerFixtureIds) {
          await database
            .insert(providerResultRequests)
            .values({
              providerId,
              providerFixtureId,
              lastRequestedAt: at,
              requestCount: 1,
              lastKnownStatus: statusByFixtureId[providerFixtureId] ?? null,
            })
            .onConflictDoUpdate({
              target: [
                providerResultRequests.providerId,
                providerResultRequests.providerFixtureId,
              ],
              set: {
                lastRequestedAt: sql`excluded.last_requested_at`,
                requestCount: sql`${providerResultRequests.requestCount} + 1`,
                /* A response that said nothing about this fixture must not
                   erase what an earlier one did say. */
                lastKnownStatus: sql`coalesce(excluded.last_known_status, ${providerResultRequests.lastKnownStatus})`,
              },
            });
        }
      };

      try {
        const response = await client.get("/fixtures", {
          ids: providerFixtureIds.join("-"),
        });
        const receivedAt = clock();
        const quota = observedQuotaFrom(response.quota, null, receivedAt);
        const rejection = classifyProviderResponse(
          response.status,
          response.body.errors,
        );
        if (rejection) {
          await markRequested();
          return { ok: false, reason: rejection, quota };
        }
        const value: NormalizedResult[] = [];
        const statusByFixtureId: Record<string, string> = {};
        for (const record of response.body.response ?? []) {
          /*
           * Normalized one record at a time, guarded individually. A single
           * fixture carrying a status code we have not mapped must not
           * discard the other nineteen results in the batch -- and that
           * fixture still gets its marker advanced below, so it does not
           * become a permanent re-ask.
           */
          try {
            const normalized = normalizeFootballResult(record, receivedAt);
            value.push(normalized);
            statusByFixtureId[normalized.providerEventId] = normalized.status;
          } catch {
            continue;
          }
        }
        await markRequested(statusByFixtureId);
        return { ok: true, value, quota };
      } catch (error) {
        await markRequested().catch(() => {});
        return { ok: false, reason: classifyProviderError(error), quota: null };
      }
    },

    async fetchLineups(
      providerFixtureId: string,
    ): Promise<ProviderCallOutcome<readonly NormalizedLineup[]>> {
      /* Advanced before the response is inspected, as with odds and results. */
      const markRequested = async (status: string | null): Promise<void> => {
        await database
          .insert(providerLineupRequests)
          .values({
            providerId,
            providerFixtureId,
            lastRequestedAt: clock(),
            requestCount: 1,
            lastKnownStatus: status,
          })
          .onConflictDoUpdate({
            target: [
              providerLineupRequests.providerId,
              providerLineupRequests.providerFixtureId,
            ],
            set: {
              lastRequestedAt: sql`excluded.last_requested_at`,
              requestCount: sql`${providerLineupRequests.requestCount} + 1`,
              lastKnownStatus: sql`coalesce(excluded.last_known_status, ${providerLineupRequests.lastKnownStatus})`,
            },
          });
      };

      try {
        const observedAt = clock();
        const response = await client.get("/fixtures/lineups", {
          fixture: providerFixtureId,
        });
        const quota = observedQuotaFrom(response.quota, null, observedAt);
        const rejection = classifyProviderResponse(
          response.status,
          response.body.errors,
        );
        if (rejection) {
          logRejectedProviderResponse(
            "lineups",
            response.status,
            response.body.errors,
          );
          await markRequested(null);
          return { ok: false, reason: rejection, quota };
        }
        const value: NormalizedLineup[] = [];
        for (const record of response.body.response ?? []) {
          /*
           * Per-record guard: one team's malformed entry must not discard the
           * other's sheet, and the marker still advances either way so the
           * fixture does not become a permanent re-ask.
           */
          try {
            value.push(
              normalizeFootballLineup(
                record,
                providerFixtureId,
                observedAt.toISOString(),
              ),
            );
          } catch {
            continue;
          }
        }
        /*
         * The fixture's status is its WEAKEST sheet, not its best. With one
         * team confirmed and the other provisional the fixture is not
         * answered, and recording OFFICIAL would stop us asking for the half
         * that is still missing.
         *
         * An empty response is UNAVAILABLE, which is the normal state before
         * the sheet is published and is deliberately not terminal.
         */
        const status =
          value.length === 0
            ? "UNAVAILABLE"
            : value.every((lineup) => lineup.status === "OFFICIAL")
              ? "OFFICIAL"
              : value.some((lineup) => lineup.status === "EXPECTED")
                ? "EXPECTED"
                : "UNAVAILABLE";
        await markRequested(status);
        return { ok: true, value, quota };
      } catch (error) {
        await markRequested(null).catch(() => {});
        return { ok: false, reason: classifyProviderError(error), quota: null };
      }
    },

    async probeQuotaStatus(): Promise<ProviderCallOutcome<null>> {
      try {
        const response = await client.get("/status", {});
        /*
         * `/status` is the one endpoint that reports the plan's own limit, so
         * it is the only place the daily allowance can be learned rather
         * than assumed.
         */
        const body = response.body as unknown as {
          response?: { requests?: { limit_day?: number } };
        };
        const dailyLimit = body.response?.requests?.limit_day ?? null;
        const quota = observedQuotaFrom(response.quota, dailyLimit, clock());
        const rejection = classifyProviderResponse(
          response.status,
          response.body.errors,
        );
        if (rejection) return { ok: false, reason: rejection, quota };
        return { ok: true, value: null, quota };
      } catch (error) {
        return { ok: false, reason: classifyProviderError(error), quota: null };
      }
    },

    async persistResults(results) {
      const summary = await ingestFootballResults(database, {
        providerId,
        results,
        policyVersionId: reference.policyVersionId,
        clock,
      });

      /*
       * The lifecycle state the provider reported is written back to the ask
       * marker here rather than in `fetchResults`, because only now is it
       * known whether the result could be attributed to an event at all. A
       * fixture whose identity we cannot resolve keeps its reported status
       * anyway -- it is still the answer to "has this match finished", and
       * without it the fixture would be re-asked every fifteen minutes for
       * three days.
       */
      for (const [providerFixtureId, status] of Object.entries(
        summary.statusByProviderFixtureId,
      )) {
        await database
          .update(providerResultRequests)
          .set({ lastKnownStatus: status })
          .where(
            and(
              eq(providerResultRequests.providerId, providerId),
              eq(providerResultRequests.providerFixtureId, providerFixtureId),
            ),
          );
      }

      return {
        received: summary.received,
        written: summary.written,
        duplicate: summary.duplicate,
        settlementsWritten: summary.settlementsWritten,
        skippedByReason: summary.skippedByReason,
      };
    },

    async persistLineups(lineups) {
      const summary = await ingestFootballLineups(database, {
        providerId,
        lineups,
        policyVersionId: reference.policyVersionId,
      });

      /*
       * The marker is corrected from what was actually WRITTEN, not from what
       * was received. A sheet whose team could not be matched to the fixture
       * has not answered anything, and leaving the marker on the optimistic
       * status read at fetch time would stop us asking again.
       */
      for (const [providerFixtureId, status] of Object.entries(
        summary.statusByProviderFixtureId,
      )) {
        await database
          .update(providerLineupRequests)
          .set({ lastKnownStatus: status })
          .where(
            and(
              eq(providerLineupRequests.providerId, providerId),
              eq(providerLineupRequests.providerFixtureId, providerFixtureId),
            ),
          );
      }

      return {
        received: summary.received,
        written: summary.written,
        duplicate: summary.duplicate,
        official: summary.official,
        skippedByReason: summary.skippedByReason,
        eventIdsWithNewObservations: summary.eventIdsWithNewObservations,
      };
    },

    async persistFixtures(fixtures) {
      /*
       * Reloaded per batch: discovery may itself have introduced a
       * competition whose identity an operator has since confirmed, and a
       * bridge captured before the batch would miss it.
       */
      const competitionBridge = await loadCompetitionBridge(
        database,
        providerId,
      );
      const skippedByReason: Record<string, number> = {};
      let written = 0;

      /*
       * Filtered before persistence, not during it.
       *
       * A single date's fixture list is hundreds of fixtures across every
       * competition the provider covers, and `ingestFootballFixture` refuses
       * every one whose competition identity is not CONFIRMED -- but it
       * refuses them *after* several database round trips each. On a remote
       * database that cost the first live run its wall-clock budget: the
       * provider calls and the eight fixtures that mattered all succeeded,
       * then the invocation was killed grinding through fixtures it was
       * always going to reject, losing the run record.
       *
       * Deciding it here from the already-loaded identity set turns hundreds
       * of doomed round trips into one set lookup, and the rejection is
       * still counted so the funnel stays honest about how much of the
       * provider's universe the product actually covers.
       */
      const relevant: DiscoveredFixture<NormalizedEvent>[] = [];
      for (const fixture of fixtures) {
        if (
          fixture.competitionProviderId !== null &&
          mappedProviderCompetitionIds.has(fixture.competitionProviderId)
        ) {
          relevant.push(fixture);
          continue;
        }
        skippedByReason["FIXTURE_COMPETITION_NOT_MAPPED"] =
          (skippedByReason["FIXTURE_COMPETITION_NOT_MAPPED"] ?? 0) + 1;
      }

      for (const fixture of relevant) {
        const outcome = await ingestFootballFixture(database, {
          providerId,
          providerCode: PROVIDER_CODE,
          sportId: reference.sportId,
          event: fixture.payload,
          competitionBridge,
          teamAliasLookup: teamAliasLookupFor,
        });
        if (outcome.ok) {
          written += 1;
          continue;
        }
        /*
         * A skip is normal and informative, not an error: most of a day's
         * provider fixtures are in competitions nobody has mapped, and the
         * reason codes are what make the funnel explainable.
         */
        skippedByReason[`FIXTURE_${outcome.reason}`] =
          (skippedByReason[`FIXTURE_${outcome.reason}`] ?? 0) + 1;
      }

      return { received: fixtures.length, written, skippedByReason };
    },

    async persistOdds(observations) {
      /*
       * Bounded to a fixed set of bookmakers per fixture before persistence.
       *
       * One fixture's `/odds` response is 59-103 observations across 10-13
       * bookmakers (measured in production), and `ingestFootballOdds` does
       * several round trips per observation -- identity lookup, market and
       * outcome upserts, the content-hash provenance row, the observation
       * itself. Against a remote database that is roughly 12 seconds for a
       * single fixture, which is what kept ending the invocation after the
       * provider call had already been paid for.
       *
       * A cap on the bookmaker count is the honest way to bound it: market
       * consensus, best price and dispersion need *several* bookmakers, not
       * all of them, so this keeps the product's actual requirement and drops
       * the long tail. The selection is by sorted bookmaker key rather than
       * response order, so the same bookmakers are followed from one pass to
       * the next -- movement history is only meaningful if it compares like
       * with like, and a set that shifted per response would manufacture
       * apparent movement out of a changing panel.
       */
      /*
       * Restricted to the wired market before anything touches the database.
       *
       * `ingestFootballOdds` performs its event-identity lookup per row and
       * only then rejects a row whose market is not wired -- so a batch
       * containing every market the provider quotes pays a round trip for
       * each of the several hundred rows it was always going to discard.
       * That, not the volume of prices actually kept, is what exhausted the
       * invocation: roughly twenty useful observations arrived wrapped in
       * seven hundred doomed ones.
       */
      const wired = observations.filter((observation) =>
        isWiredOddsMarket(observation.canonicalMarket),
      );
      const notWired = observations.length - wired.length;

      const byBookmaker = new Map<string, typeof wired>();
      for (const observation of wired) {
        const existing = byBookmaker.get(observation.bookmaker) ?? [];
        byBookmaker.set(observation.bookmaker, [...existing, observation]);
      }
      const keptBookmakers = [...byBookmaker.keys()]
        .sort((a, b) => a.localeCompare(b))
        .slice(0, MAX_BOOKMAKERS_PER_FIXTURE);
      const kept = keptBookmakers.flatMap(
        (bookmaker) => byBookmaker.get(bookmaker) ?? [],
      );
      const droppedBookmakers = byBookmaker.size - keptBookmakers.length;

      const outcomes = await ingestFootballOdds(database, kept, reference);
      const skippedByReason: Record<string, number> = {};
      let written = 0;
      let duplicate = 0;

      for (const outcome of outcomes) {
        if (outcome.ok) {
          if (outcome.duplicate) duplicate += 1;
          else written += 1;
          continue;
        }
        skippedByReason[`ODDS_${outcome.reason}`] =
          (skippedByReason[`ODDS_${outcome.reason}`] ?? 0) + 1;
      }

      if (notWired > 0) {
        skippedByReason["ODDS_MARKET_NOT_WIRED"] = notWired;
      }
      if (droppedBookmakers > 0) {
        skippedByReason["ODDS_BOOKMAKER_PANEL_CAP"] = droppedBookmakers;
      }

      return {
        /* What the provider actually offered, so the cap stays visible. */
        received: observations.length,
        written,
        duplicate,
        skippedByReason,
      };
    },
  };

  return {
    deps,
    providerId,
    async recordRun(result: ProviderIngestionResult): Promise<void> {
      await database.insert(providerIngestionRuns).values({
        providerId,
        trigger: result.trigger,
        quotaDay: result.quotaDay,
        quotaPolicyVersion: result.quotaPolicyVersion,
        startedAt: new Date(result.startedAt),
        finishedAt: new Date(result.finishedAt),
        status: "COMPLETED",
        providerCallsUsed: result.providerCallsUsed,
        quotaStateAtStart: result.quotaStateAtStart,
        quotaStateAtEnd: result.quotaStateAtEnd,
        quotaRemainingAtEnd: result.quotaRemainingAtEnd,
        discoveryDatesRequested: [...result.discoveryDatesRequested],
        fixturesReceived: result.fixturesReceived,
        fixturesWritten: result.fixturesWritten,
        oddsCandidates: result.oddsCandidates,
        oddsRequestsAttempted: result.oddsRequestsAttempted,
        oddsObservationsReceived: result.oddsObservationsReceived,
        oddsObservationsWritten: result.oddsObservationsWritten,
        oddsDuplicates: result.oddsDuplicates,
        lineupCandidates: result.lineupCandidates,
        lineupRequestsAttempted: result.lineupRequestsAttempted,
        lineupsReceived: result.lineupsReceived,
        lineupsWritten: result.lineupsWritten,
        lineupDuplicates: result.lineupDuplicates,
        lineupsOfficial: result.lineupsOfficial,
        resultCandidates: result.resultCandidates,
        resultRequestsAttempted: result.resultRequestsAttempted,
        resultsReceived: result.resultsReceived,
        resultsWritten: result.resultsWritten,
        resultDuplicates: result.resultDuplicates,
        settlementsWritten: result.settlementsWritten,
        skippedByReason: result.skippedByReason,
        errorsByReason: result.errorsByReason,
      });
    },
  };
}
