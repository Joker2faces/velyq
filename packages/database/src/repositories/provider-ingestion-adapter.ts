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
  normalizeOdds,
  type ApiSportsClient,
  type NormalizedEvent,
  type NormalizedOdds,
} from "@velyq/providers/apisports";
import { teamAliasLookupFor } from "@velyq/providers/team-aliases";
import {
  PROVIDER_QUOTA_POLICY_VERSION,
  providerQuotaState,
  utcQuotaDay,
  type IngestionPurpose,
  type ProviderQuotaSnapshot,
} from "@velyq/application/provider-quota";
import { oddsRefreshDue } from "@velyq/application/odds-freshness";
import type {
  DiscoveredFixture,
  ObservedQuota,
  OddsCandidate,
  ProviderCallOutcome,
  ProviderIngestionDeps,
  ProviderIngestionResult,
} from "@velyq/application/provider-ingestion";

import type { PrivilegedVelyqDatabase } from "../client.js";
import {
  ingestFootballFixture,
  loadCompetitionBridge,
} from "./fixture-ingestion.js";
import {
  WIRED_ODDS_MARKET,
  ensureFootballReferenceData,
  ingestFootballOdds,
} from "./odds-ingestion.js";
import { competitionIdentities, events } from "../schema/catalog.js";
import {
  eventMarketOutcomes,
  eventMarkets,
  oddsObservations,
} from "../schema/market.js";
import {
  providerIngestionRuns,
  providerOddsRequests,
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
 * How many bookmakers per fixture are followed.
 *
 * Consensus, best price and dispersion need several bookmakers, not every
 * bookmaker the provider lists, and persisting the full panel does not fit
 * the executor's wall-clock limit (see `persistOdds`). Six keeps a real
 * spread while bounding one fixture to roughly eighteen observations.
 *
 * Raise this once odds persistence writes in batches rather than per
 * observation, or if the executor gains a longer limit -- the provider
 * response already contains the rest, so nothing extra needs to be bought.
 */
const MAX_BOOKMAKERS_PER_FIXTURE = 6;

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

function observedQuotaFrom(
  quota: Readonly<{ requestsRemaining: number | null }>,
  dailyLimit: number | null,
  at: Date,
): ObservedQuota {
  return { remaining: quota.requestsRemaining, dailyLimit, observedAt: at };
}

export type ProviderIngestionAdapter = Readonly<{
  deps: ProviderIngestionDeps<NormalizedEvent, NormalizedOdds>;
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

  const deps: ProviderIngestionDeps<NormalizedEvent, NormalizedOdds> = {
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

    async discoverFixtures(
      date: string,
    ): Promise<
      ProviderCallOutcome<readonly DiscoveredFixture<NormalizedEvent>[]>
    > {
      try {
        const response = await client.get("/fixtures", { date });
        const quota = observedQuotaFrom(response.quota, null, clock());
        const errors = response.body.errors;
        if (
          errors !== null &&
          typeof errors === "object" &&
          Object.keys(errors).length > 0
        ) {
          /*
           * A rejected request still consumed quota, so the observation is
           * reported even though the payload is unusable.
           */
          return { ok: false, reason: "REJECTED", quota };
        }
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
        const value = (response.body.response ?? []).flatMap((record) =>
          normalizeOdds(record, "FOOTBALL", observedAt.toISOString()),
        );
        return { ok: true, value, quota };
      } catch (error) {
        await markRequested().catch(() => {});
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
        return {
          ok: true,
          value: null,
          quota: observedQuotaFrom(response.quota, dailyLimit, clock()),
        };
      } catch (error) {
        return { ok: false, reason: classifyProviderError(error), quota: null };
      }
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
      const wired = observations.filter(
        (observation) => observation.canonicalMarket === WIRED_ODDS_MARKET,
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
        skippedByReason: result.skippedByReason,
        errorsByReason: result.errorsByReason,
      });
    },
  };
}
