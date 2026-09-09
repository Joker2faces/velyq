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
    options.client ?? createApiSportsClient("football", { retries: 1 });
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

    async recordQuotaObservation(observed: ObservedQuota): Promise<void> {
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
       * Derived from the run log rather than kept in extra counters, so the
       * spend figures can never disagree with the runs that produced them.
       */
      const [row] = await database
        .select({
          discovery: sql<number>`coalesce(sum(coalesce(array_length(${providerIngestionRuns.discoveryDatesRequested}, 1), 0)), 0)`,
          odds: sql<number>`coalesce(sum(${providerIngestionRuns.oddsRequestsAttempted}), 0)`,
        })
        .from(providerIngestionRuns)
        .where(
          and(
            eq(providerIngestionRuns.providerId, providerId),
            eq(providerIngestionRuns.quotaDay, utcQuotaDay(clock())),
          ),
        );
      return {
        DISCOVERY: Number(row?.discovery ?? 0),
        ODDS: Number(row?.odds ?? 0),
        /* Not yet requested by this pipeline; see the lineup/result notes. */
        LINEUP: 0,
        RESULT: 0,
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
      const rows = await database
        .select({
          providerFixtureId: sql<string>`identity.provider_fixture_id`,
          kickoffAt: events.startsAt,
          providerCompetitionId: sql<
            string | null
          >`identity_competition.provider_competition_id`,
          latestObservedAt: sql<Date | null>`(
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

      return rows
        .filter((row) =>
          oddsRefreshDue(row.latestObservedAt, now, row.kickoffAt),
        )
        .map((row) => ({
          providerFixtureId: row.providerFixtureId,
          kickoffAt: row.kickoffAt,
          competitionMapped:
            row.providerCompetitionId !== null &&
            mappedProviderCompetitionIds.has(row.providerCompetitionId),
        }));
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
      try {
        const response = await client.get("/odds", {
          fixture: providerFixtureId,
        });
        const observedAt = clock();
        const quota = observedQuotaFrom(response.quota, null, observedAt);
        const value = (response.body.response ?? []).flatMap((record) =>
          normalizeOdds(record, "FOOTBALL", observedAt.toISOString()),
        );
        return { ok: true, value, quota };
      } catch (error) {
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

      for (const fixture of fixtures) {
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
      const outcomes = await ingestFootballOdds(
        database,
        observations,
        reference,
      );
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

      return {
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
