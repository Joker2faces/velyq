import { createHash } from "node:crypto";

import {
  bookmakers,
  competitions,
  eventMarketOutcomes,
  eventMarkets,
  eventParticipants,
  events,
  marketDefinitions,
  oddsObservations,
  outcomeDefinitions,
  participants,
  providerSyncRuns,
  sourceObservations,
  type PrivilegedVelyqDatabase,
} from "@velyq/database";
import { eq } from "drizzle-orm";
import {
  FOOTBALL_DATA_DIVISIONS,
  fixtureInstant,
  parseFootballDataFixtures,
  resolveCanonicalCode,
  unitedKingdomOffsetMinutes,
  type UpcomingFixture,
} from "@velyq/research";

/**
 * Ingests Football-Data.co.uk's upcoming-fixtures feed into the operational
 * catalog and market tables.
 *
 * This is what gives the prediction pipeline real, pre-kickoff events with
 * real bookmaker prices attached, without an API key or a request quota. The
 * events it writes are real (`synthetic = false`) and carry explicit
 * provenance: a `FOOTBALL_DATA_UK` provider row, its own policy version, and a
 * `provider_sync_runs` row per invocation.
 *
 * Only individual bookmaker prices become `odds_observations`. The publisher's
 * panel average and maximum are *derived* quantities, not observations by any
 * bookmaker, and storing them beside real quotes would let a consensus be
 * computed from an average of an average. The de-vigged consensus is built
 * from the individual prices at decision time instead, which is also what
 * makes `bookmakerCoverage` a count of something real.
 *
 * Only fixtures that have not kicked off are written. A prediction has to be
 * timestamped before kickoff to mean anything, so an event already under way
 * is not a candidate and is reported rather than stored.
 */

const PROVIDER_ID = "30000000-0000-4000-8000-000000000003";
const PROVIDER_POLICY_VERSION_ID = "31000000-0000-4000-8000-000000000003";
const FOOTBALL_SPORT_ID = "20000000-0000-4000-8000-000000000001";
const MAPPING_VERSION = "football-data.v1";

/** Deterministic v4-shaped id, so re-ingesting the same fixture is a no-op. */
function stableId(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type FixtureIngestionResult = Readonly<{
  provider: "FOOTBALL_DATA_UK";
  runId: string;
  asOf: string;
  feedFixtures: number;
  feedRejected: number;
  inUniverse: number;
  alreadyStarted: number;
  eventsWritten: number;
  marketsWritten: number;
  outcomesWritten: number;
  observationsWritten: number;
  divisionsSkipped: readonly string[];
  persisted: boolean;
}>;

type MarketPlan = Readonly<{
  marketCode: string;
  line: string | null;
  outcomes: readonly string[];
}>;

const MARKET_PLANS: readonly MarketPlan[] = Object.freeze([
  {
    marketCode: "FOOTBALL_FULL_TIME_1X2",
    line: null,
    outcomes: ["HOME", "DRAW", "AWAY"],
  },
  {
    marketCode: "FOOTBALL_FULL_TIME_TOTAL",
    line: "2.5",
    outcomes: ["OVER", "UNDER"],
  },
]);

export type FixtureCandidate = Readonly<{
  fixture: UpcomingFixture;
  canonicalCompetitionCode: string;
  startsAt: string;
}>;

/**
 * Selects the fixtures worth writing: mapped competition, not yet started.
 *
 * Kickoff times in the feed are UK local with no zone, so they are converted
 * through the UK offset for the instant in question. Treating them as UTC
 * would place every fixture an hour late during British Summer Time — which
 * for a "has this started" test is the wrong direction, letting a match
 * already under way still look upcoming.
 */
export function selectCandidates(
  fixtures: readonly UpcomingFixture[],
  asOf: Date,
): Readonly<{
  candidates: readonly FixtureCandidate[];
  alreadyStarted: number;
  divisionsSkipped: readonly string[];
}> {
  const offsetMinutes = unitedKingdomOffsetMinutes(asOf);
  const candidates: FixtureCandidate[] = [];
  const skipped = new Set<string>();
  let alreadyStarted = 0;
  for (const fixture of fixtures) {
    const resolution = resolveCanonicalCode({
      sourceCode: "FOOTBALL_DATA_UK",
      sourceKey: fixture.sourceDivision,
      countryCode: null,
    });
    if (!resolution.ok) {
      skipped.add(fixture.sourceDivision);
      continue;
    }
    const startsAt = fixtureInstant(fixture, offsetMinutes);
    if (Date.parse(startsAt) <= asOf.getTime()) {
      alreadyStarted += 1;
      continue;
    }
    candidates.push({
      fixture,
      canonicalCompetitionCode: resolution.canonicalCode,
      startsAt,
    });
  }
  return {
    candidates,
    alreadyStarted,
    divisionsSkipped: [...skipped].sort(),
  };
}

async function marketDefinitionIds(database: PrivilegedVelyqDatabase) {
  const rows = await database
    .select({
      code: marketDefinitions.code,
      id: marketDefinitions.id,
      outcomeCode: outcomeDefinitions.code,
      outcomeId: outcomeDefinitions.id,
    })
    .from(marketDefinitions)
    .innerJoin(
      outcomeDefinitions,
      eq(outcomeDefinitions.marketDefinitionId, marketDefinitions.id),
    );
  const byMarket = new Map<
    string,
    { id: string; outcomes: Map<string, string> }
  >();
  for (const row of rows) {
    const entry = byMarket.get(row.code) ?? {
      id: row.id,
      outcomes: new Map<string, string>(),
    };
    entry.outcomes.set(row.outcomeCode, row.outcomeId);
    byMarket.set(row.code, entry);
  }
  return byMarket;
}

export async function ingestFootballDataFixtures(
  options: Readonly<{
    database: PrivilegedVelyqDatabase;
    csv: string;
    asOf: Date;
  }>,
): Promise<FixtureIngestionResult> {
  const feed = parseFootballDataFixtures(options.csv);
  const selection = selectCandidates(feed.fixtures, options.asOf);
  const asOfIso = options.asOf.toISOString();
  const runId = stableId(`football-data:fixtures:${asOfIso}`);
  const contentHash = `sha256:${createHash("sha256").update(options.csv).digest("hex")}`;

  const definitions = await marketDefinitionIds(options.database);
  let eventsWritten = 0;
  let marketsWritten = 0;
  let outcomesWritten = 0;
  let observationsWritten = 0;

  await options.database.transaction(async (transaction) => {
    await transaction
      .insert(providerSyncRuns)
      .values({
        id: runId,
        providerId: PROVIDER_ID,
        capability: "FOOTBALL_FIXTURES_ODDS",
        status: "RUNNING",
        replaySequence: `fixtures:${asOfIso}`,
        fixturePath: "football-data:fixtures.csv",
        contentHash,
        providerSchemaVersion: MAPPING_VERSION,
        normalizationVersion: MAPPING_VERSION,
        mappingVersion: MAPPING_VERSION,
        policyVersionId: PROVIDER_POLICY_VERSION_ID,
        startedAt: options.asOf,
      })
      .onConflictDoNothing();

    for (const candidate of selection.candidates) {
      const { fixture, canonicalCompetitionCode } = candidate;
      const competitionId = stableId(
        `football-data:competition:${canonicalCompetitionCode}`,
      );
      const eventId = stableId(
        `football-data:event:${canonicalCompetitionCode}:${fixture.kickoffDate}:${slug(fixture.sourceHomeName)}:${slug(fixture.sourceAwayName)}`,
      );
      const homeId = stableId(
        `football-data:team:${canonicalCompetitionCode}:${slug(fixture.sourceHomeName)}`,
      );
      const awayId = stableId(
        `football-data:team:${canonicalCompetitionCode}:${slug(fixture.sourceAwayName)}`,
      );

      /*
       * `canonical_code` is set here rather than inferred later. It is what
       * the competition eligibility policy joins on, and an event whose
       * competition carries no canonical code is treated as having no policy
       * — ineligible, rather than guessed at.
       */
      await transaction
        .insert(competitions)
        .values({
          id: competitionId,
          sportId: FOOTBALL_SPORT_ID,
          code: slug(canonicalCompetitionCode),
          nameKey: `competition.${slug(canonicalCompetitionCode)}`,
          canonicalCode: canonicalCompetitionCode,
        })
        .onConflictDoNothing();

      for (const [participantId, name] of [
        [homeId, fixture.sourceHomeName],
        [awayId, fixture.sourceAwayName],
      ] as const)
        await transaction
          .insert(participants)
          .values({
            id: participantId,
            sportId: FOOTBALL_SPORT_ID,
            type: "TEAM",
            code: slug(name),
            /*
             * The publisher's own spelling, unmodified. Team identity in the
             * trained model is the normalized form of exactly this string, so
             * "tidying" it here would break the join to the ratings.
             */
            displayName: name,
          })
          .onConflictDoNothing();

      const inserted = await transaction
        .insert(events)
        .values({
          id: eventId,
          sportId: FOOTBALL_SPORT_ID,
          competitionId,
          seasonLabel: null,
          startsAt: new Date(candidate.startsAt),
          status: "SCHEDULED",
          synthetic: false,
        })
        .onConflictDoNothing()
        .returning({ id: events.id });
      if (inserted.length > 0) eventsWritten += 1;

      await transaction
        .insert(eventParticipants)
        .values([
          { eventId, participantId: homeId, role: "HOME" },
          { eventId, participantId: awayId, role: "AWAY" },
        ])
        .onConflictDoNothing();

      for (const plan of MARKET_PLANS) {
        const definition = definitions.get(plan.marketCode);
        if (!definition) continue;
        const marketId = stableId(
          `football-data:market:${eventId}:${plan.marketCode}:${plan.line ?? "-"}`,
        );
        const marketRows = await transaction
          .insert(eventMarkets)
          .values({
            id: marketId,
            eventId,
            marketDefinitionId: definition.id,
            lineValue: plan.line,
            canonicalKey: `football-data|${eventId}|${plan.marketCode}|${plan.line ?? "-"}`,
          })
          .onConflictDoNothing()
          .returning({ id: eventMarkets.id });
        if (marketRows.length > 0) marketsWritten += 1;

        for (const outcomeCode of plan.outcomes) {
          const outcomeDefinitionId = definition.outcomes.get(outcomeCode);
          if (!outcomeDefinitionId) continue;
          const outcomeId = stableId(
            `football-data:outcome:${marketId}:${outcomeCode}`,
          );
          const outcomeRows = await transaction
            .insert(eventMarketOutcomes)
            .values({
              id: outcomeId,
              eventMarketId: marketId,
              marketDefinitionId: definition.id,
              outcomeDefinitionId,
              canonicalKey: `football-data|${eventId}|${plan.marketCode}|${plan.line ?? "-"}|${outcomeCode}`,
            })
            .onConflictDoNothing()
            .returning({ id: eventMarketOutcomes.id });
          if (outcomeRows.length > 0) outcomesWritten += 1;

          const quotes = fixture.quotes.filter(
            (quote) =>
              quote.marketCode === plan.marketCode &&
              quote.outcomeCode === outcomeCode &&
              quote.scope === "BOOKMAKER" &&
              quote.phase === "PRE_CLOSING",
          );
          for (const quote of quotes) {
            const bookmakerCode = quote.bookmakerCode;
            if (!bookmakerCode) continue;
            const bookmakerId = stableId(`football-data:book:${bookmakerCode}`);
            await transaction
              .insert(bookmakers)
              .values({
                id: bookmakerId,
                code: bookmakerCode,
                displayName: bookmakerCode,
                synthetic: false,
              })
              .onConflictDoNothing();

            /*
             * Observation identity is the price itself, so re-running the
             * cycle against an unchanged feed adds nothing, while a genuinely
             * repriced market becomes a new observation and a new decision
             * input.
             */
            const observationSeed = `football-data:${eventId}:${plan.marketCode}:${plan.line ?? "-"}:${outcomeCode}:${bookmakerCode}:${quote.decimalOdds}`;
            const sourceObservationId = stableId(observationSeed);
            await transaction
              .insert(sourceObservations)
              .values({
                id: sourceObservationId,
                providerId: PROVIDER_ID,
                syncRunId: runId,
                observationType: "ODDS",
                providerExternalId: `${fixture.sourceDivision}:${fixture.kickoffDate}:${slug(fixture.sourceHomeName)}`,
                providerObservedAt: options.asOf,
                receivedAt: options.asOf,
                normalizedAt: options.asOf,
                normalizationVersion: MAPPING_VERSION,
                mappingVersion: MAPPING_VERSION,
                contentHash: `sha256:${createHash("sha256").update(observationSeed).digest("hex")}`,
              })
              .onConflictDoNothing();

            const observationRows = await transaction
              .insert(oddsObservations)
              .values({
                sourceObservationId,
                eventMarketOutcomeId: outcomeId,
                bookmakerId,
                decimalOdds: quote.decimalOdds,
                providerObservedAt: options.asOf,
                receivedAt: options.asOf,
                normalizedAt: options.asOf,
                status: "ACTIVE",
                isSynthetic: false,
              })
              .onConflictDoNothing()
              .returning({ id: oddsObservations.id });
            if (observationRows.length > 0) observationsWritten += 1;
          }
        }
      }
    }

    await transaction
      .update(providerSyncRuns)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        receivedCount: feed.fixtures.length,
        acceptedCount: selection.candidates.length,
        rejectedCount: feed.rejected.length,
      })
      .where(eq(providerSyncRuns.id, runId));
  });

  return {
    provider: "FOOTBALL_DATA_UK",
    runId,
    asOf: asOfIso,
    feedFixtures: feed.fixtures.length,
    feedRejected: feed.rejected.length,
    inUniverse: feed.fixtures.filter(
      (fixture) =>
        FOOTBALL_DATA_DIVISIONS[fixture.sourceDivision] !== undefined,
    ).length,
    alreadyStarted: selection.alreadyStarted,
    eventsWritten,
    marketsWritten,
    outcomesWritten,
    observationsWritten,
    divisionsSkipped: selection.divisionsSkipped,
    persisted: true,
  };
}
