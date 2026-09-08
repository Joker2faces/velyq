import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { teamAliasLookupFor } from "@velyq/providers";
import type { NormalizedEvent, NormalizedOdds } from "@velyq/providers";

import { createPrivilegedDatabaseClient } from "../src/client.js";
import {
  ingestFootballFixture,
  loadCompetitionBridge,
} from "../src/repositories/fixture-ingestion.js";
import {
  ensureFootballReferenceData,
  ingestFootballOdds,
} from "../src/repositories/odds-ingestion.js";
import {
  DatabaseDecisionRepository,
  DatabaseForecastRepository,
  DatabaseFreshestOddsReader,
} from "../src/repositories/forecast-decision.js";
import {
  calibrationVersions,
  dataQualityAssessments,
  dataQualityPolicyVersions,
  modelDefinitions,
  modelVersions,
  predictionRuns,
  predictions,
} from "../src/schema/intelligence.js";
import { competitionIdentities, competitions } from "../src/schema/catalog.js";
import {
  eventMarketOutcomes,
  eventMarkets,
  oddsObservations,
} from "../src/schema/market.js";

/*
 * Real-Postgres proof for the two repositories runForecastCycle() depends
 * on: DatabaseForecastRepository, DatabaseDecisionRepository, and the
 * freshest-valid-odds reader. See
 * tooling/vitest/vitest.db-integration.config.mts for why this file sits
 * outside the default test glob.
 */
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = createPrivilegedDatabaseClient({
  connectionString: DATABASE_URL,
});
const database = client.database;

const PROVIDER_CODE = "API_SPORTS";

function fixture(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    sport: "FOOTBALL",
    providerEventId: "960001",
    competition: "Serie A",
    competitionProviderId: "9360001",
    competitionCountry: "Italy",
    competitionCountryCode: "IT",
    season: 2026,
    participants: ["Roma", "Lazio"],
    scheduledAt: "2026-09-21T18:00:00.000Z",
    status: "NS",
    provider: "API_SPORTS",
    sourceReference: "test",
    ...overrides,
  };
}

describe("forecast and decision repositories, against a real database", () => {
  let eventId: string;
  let eventMarketOutcomeId: string;
  let modelVersionId: string;
  let calibrationVersionId: string;
  let dataQualityAssessmentId: string;
  let referenceData: Awaited<ReturnType<typeof ensureFootballReferenceData>>;

  beforeAll(async () => {
    referenceData = await ensureFootballReferenceData(database, PROVIDER_CODE);

    const [competition] = await database
      .insert(competitions)
      .values({
        sportId: referenceData.sportId,
        code: "ITA_SERIE_A_FORECAST_REPO_TEST",
        nameKey: "competition.ita_serie_a",
        countryCode: "IT",
      })
      .returning({ id: competitions.id });

    await database.insert(competitionIdentities).values({
      competitionId: competition!.id,
      providerId: referenceData.providerId,
      providerCompetitionId: "9360001",
      displayName: "Serie A",
      countryCode: "IT",
      mappingStatus: "CONFIRMED",
    });

    const bridge = await loadCompetitionBridge(
      database,
      referenceData.providerId,
    );
    const ingested = await ingestFootballFixture(database, {
      providerId: referenceData.providerId,
      providerCode: PROVIDER_CODE,
      sportId: referenceData.sportId,
      event: fixture(),
      competitionBridge: bridge,
      teamAliasLookup: teamAliasLookupFor,
    });
    if (!ingested.ok)
      throw new Error(`fixture setup failed: ${ingested.reason}`);
    eventId = ingested.eventId;

    const [eventMarket] = await database
      .insert(eventMarkets)
      .values({
        eventId,
        marketDefinitionId: referenceData.marketDefinitionId,
        subjectParticipantId: null,
        lineValue: null,
        canonicalKey: `${eventId}:${referenceData.marketDefinitionId}:null:null`,
      })
      .returning({ id: eventMarkets.id });

    const [outcome] = await database
      .insert(eventMarketOutcomes)
      .values({
        eventMarketId: eventMarket!.id,
        marketDefinitionId: referenceData.marketDefinitionId,
        outcomeDefinitionId: referenceData.outcomeDefinitionIds.HOME,
        canonicalKey: `${eventMarket!.id}:${referenceData.outcomeDefinitionIds.HOME}`,
      })
      .returning({ id: eventMarketOutcomes.id });
    eventMarketOutcomeId = outcome!.id;

    const [modelDefinition] = await database
      .insert(modelDefinitions)
      .values({
        code: "TEST_MODEL_REPO",
        displayName: "Test Model",
        description: "Deterministic test model",
      })
      .returning({ id: modelDefinitions.id });

    const [modelVersion] = await database
      .insert(modelVersions)
      .values({
        modelDefinitionId: modelDefinition!.id,
        version: "test.v1",
        maturityStatus: "EXPERIMENTAL",
        validationStatus: "UNVALIDATED",
        featureContractVersion: "test.v1",
      })
      .returning({ id: modelVersions.id });

    const [calibrationVersion] = await database
      .insert(calibrationVersions)
      .values({
        modelVersionId: modelVersion!.id,
        version: "test.v1",
        method: "NONE",
        parameters: {},
        validationStatus: "UNVALIDATED",
      })
      .returning({ id: calibrationVersions.id });
    modelVersionId = modelVersion!.id;
    calibrationVersionId = calibrationVersion!.id;

    const [qualityPolicy] = await database
      .insert(dataQualityPolicyVersions)
      .values({
        code: "TEST_QUALITY_REPO",
        version: "v1",
        validationStatus: "UNVALIDATED",
        definition: {},
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      })
      .returning({ id: dataQualityPolicyVersions.id });

    const [qualityAssessment] = await database
      .insert(dataQualityAssessments)
      .values({
        policyVersionId: qualityPolicy!.id,
        eventId,
        marketOutcomeId: eventMarketOutcomeId,
        asOf: new Date("2026-09-20T00:00:00.000Z"),
        grade: "A",
        numericScore: "1",
        components: {},
        reasonCodes: [],
      })
      .returning({ id: dataQualityAssessments.id });
    dataQualityAssessmentId = qualityAssessment!.id;
  });

  afterAll(async () => {
    await client.close();
  });

  /**
   * Each test needs its own prediction, and `predictions_run_id_outcome_id_unique`
   * is per (run, outcome) -- reusing one shared run across tests would
   * silently no-op every insert after the first (the real idempotency
   * behaviour predictions.ts is supposed to have), masking a different
   * requested probability rather than persisting it. A fresh run per call
   * sidesteps that without weakening the real constraint.
   */
  async function insertPrediction(overrides: { modelProbability: string }) {
    const [run] = await database
      .insert(predictionRuns)
      .values({
        modelVersionId,
        calibrationVersionId,
        eventId,
        featureCutoff: new Date("2026-09-20T00:00:00.000Z"),
        status: "COMPLETED",
      })
      .returning({ id: predictionRuns.id });

    const [prediction] = await database
      .insert(predictions)
      .values({
        predictionRunId: run!.id,
        eventMarketOutcomeId,
        dataQualityAssessmentId,
        decisionStatus: "NO_BET",
        modelProbability: overrides.modelProbability,
        reasonCodes: [],
        structuredReasons: {},
      })
      .returning();
    return prediction!;
  }

  /**
   * Ingests one real odds observation through the actual production write
   * path (`ingestFootballOdds`), then resolves the row it produced --
   * proving the freshest-odds reader against data shaped exactly like a
   * real ingestion cycle would leave it, not a hand-built row that happens
   * to satisfy the reader's own query.
   */
  async function ingestOddsAndGetObservationId(args: {
    providerEventId: string;
    outcomeId: string;
    bookmaker: string;
    decimalOdds: string;
    providerObservedAt: string;
    ingestedAt?: string;
  }): Promise<string> {
    const outcomes = await ingestFootballOdds(
      database,
      [
        {
          sport: "FOOTBALL",
          providerEventId: args.providerEventId,
          bookmaker: args.bookmaker,
          providerMarket: "Match Winner",
          canonicalMarket: "MATCH_WINNER_1X2",
          selection: "home",
          decimalOdds: args.decimalOdds as NormalizedOdds["decimalOdds"],
          providerObservedAt: args.providerObservedAt,
          ingestedAt: args.ingestedAt ?? args.providerObservedAt,
          provider: "API_SPORTS",
          sourceReference: "test",
        },
      ],
      referenceData,
    );
    const outcome = outcomes[0];
    if (!outcome || !outcome.ok)
      throw new Error(
        `odds ingestion setup failed: ${JSON.stringify(outcome)}`,
      );

    const bookmaker = await database.query.bookmakers.findFirst({
      where: (table, { eq: equals }) => equals(table.code, args.bookmaker),
    });
    if (!bookmaker) throw new Error("BOOKMAKER_NOT_FOUND_AFTER_INGESTION");

    const [observation] = await database
      .select({ id: oddsObservations.id })
      .from(oddsObservations)
      .where(
        and(
          eq(oddsObservations.eventMarketOutcomeId, args.outcomeId),
          eq(oddsObservations.bookmakerId, bookmaker.id),
        ),
      )
      .orderBy(oddsObservations.providerObservedAt)
      .limit(1);
    if (!observation)
      throw new Error("ODDS_OBSERVATION_NOT_FOUND_AFTER_INGESTION");
    return observation.id;
  }

  async function ingestOddsAndGetBookmakerId(args: {
    providerEventId: string;
    outcomeId: string;
    bookmaker: string;
    decimalOdds: string;
    providerObservedAt: string;
    ingestedAt?: string;
  }): Promise<string> {
    await ingestOddsAndGetObservationId(args);
    const bookmaker = await database.query.bookmakers.findFirst({
      where: (table, { eq: equals }) => equals(table.code, args.bookmaker),
    });
    if (!bookmaker) throw new Error("BOOKMAKER_NOT_FOUND_AFTER_INGESTION");
    return bookmaker.id;
  }

  /**
   * Ingests a brand-new fixture (own providerEventId) and returns its HOME
   * outcome id. The chronology tests below need an outcome untouched by
   * every other test in this file -- reusing the shared `eventMarketOutcomeId`
   * would let odds inserted by the forecast/decision tests earlier in the
   * run leak into "freshest price" comparisons here, which is a test
   * isolation bug, not a defect in the reader being tested.
   */
  async function freshOutcomeId(providerEventId: string): Promise<string> {
    const bridge = await loadCompetitionBridge(
      database,
      referenceData.providerId,
    );
    const ingested = await ingestFootballFixture(database, {
      providerId: referenceData.providerId,
      providerCode: PROVIDER_CODE,
      sportId: referenceData.sportId,
      event: fixture({ providerEventId }),
      competitionBridge: bridge,
      teamAliasLookup: teamAliasLookupFor,
    });
    if (!ingested.ok)
      throw new Error(`fresh outcome fixture setup failed: ${ingested.reason}`);

    const [eventMarket] = await database
      .insert(eventMarkets)
      .values({
        eventId: ingested.eventId,
        marketDefinitionId: referenceData.marketDefinitionId,
        subjectParticipantId: null,
        lineValue: null,
        canonicalKey: `${ingested.eventId}:${referenceData.marketDefinitionId}:null:null`,
      })
      .onConflictDoNothing({
        target: [
          eventMarkets.eventId,
          eventMarkets.marketDefinitionId,
          eventMarkets.subjectParticipantId,
          eventMarkets.lineValue,
        ],
      })
      .returning({ id: eventMarkets.id });
    const eventMarketId =
      eventMarket?.id ??
      (
        await database
          .select({ id: eventMarkets.id })
          .from(eventMarkets)
          .where(eq(eventMarkets.eventId, ingested.eventId))
          .limit(1)
      )[0]!.id;

    const [outcome] = await database
      .insert(eventMarketOutcomes)
      .values({
        eventMarketId,
        marketDefinitionId: referenceData.marketDefinitionId,
        outcomeDefinitionId: referenceData.outcomeDefinitionIds.HOME,
        canonicalKey: `${eventMarketId}:${referenceData.outcomeDefinitionIds.HOME}`,
      })
      .onConflictDoNothing({
        target: [eventMarketOutcomes.canonicalKey],
      })
      .returning({ id: eventMarketOutcomes.id });
    return (
      outcome?.id ??
      (
        await database
          .select({ id: eventMarketOutcomes.id })
          .from(eventMarketOutcomes)
          .where(eq(eventMarketOutcomes.eventMarketId, eventMarketId))
          .limit(1)
      )[0]!.id
    );
  }

  it("[forecast repository] appends a real forecast row for a real prediction", async () => {
    const prediction = await insertPrediction({ modelProbability: "0.55" });
    const repository = new DatabaseForecastRepository(database);

    const forecast = await repository.append({
      predictionId: prediction.id,
      eventMarketOutcomeId,
      probability: "0.55",
      modelVersion: "football-dixon-coles.v1",
      featureCutoff: new Date("2026-09-20T00:00:00.000Z"),
    });

    expect(forecast.predictionId).toBe(prediction.id);
    expect(forecast.probability).toBe("0.550000000000");
  });

  it("[forecast repository] is idempotent: appending the same prediction twice returns the same row, not a duplicate", async () => {
    const prediction = await insertPrediction({ modelProbability: "0.60" });
    const repository = new DatabaseForecastRepository(database);

    const first = await repository.append({
      predictionId: prediction.id,
      eventMarketOutcomeId,
      probability: "0.60",
      modelVersion: "football-dixon-coles.v1",
      featureCutoff: new Date("2026-09-20T00:00:00.000Z"),
    });
    const second = await repository.append({
      predictionId: prediction.id,
      eventMarketOutcomeId,
      probability: "0.60",
      modelVersion: "football-dixon-coles.v1",
      featureCutoff: new Date("2026-09-20T00:00:00.000Z"),
    });

    expect(second.id).toBe(first.id);
  });

  it("[decision repository] appends a real decision row referencing a real forecast", async () => {
    const prediction = await insertPrediction({ modelProbability: "0.62" });
    const forecastRepository = new DatabaseForecastRepository(database);
    const forecast = await forecastRepository.append({
      predictionId: prediction.id,
      eventMarketOutcomeId,
      probability: "0.62",
      modelVersion: "football-dixon-coles.v1",
      featureCutoff: new Date("2026-09-20T00:00:00.000Z"),
    });

    const decisionRepository = new DatabaseDecisionRepository(database);
    const decision = await decisionRepository.append({
      forecastId: forecast.id,
      eventMarketOutcomeId,
      status: "WAIT",
      selection: "HOME",
      whyNotCodes: ["MARKET_DATA_UNAVAILABLE"],
      decisionSnapshot: { modelProbability: "0.62" },
    });

    expect(decision.forecastId).toBe(forecast.id);
    expect(decision.status).toBe("WAIT");
    expect(decision.whyNotCodes).toEqual(["MARKET_DATA_UNAVAILABLE"]);
  });

  it("[decision repository] is idempotent for an identical logical decision, but allows a new snapshot when the price changes", async () => {
    const prediction = await insertPrediction({ modelProbability: "0.58" });
    const forecastRepository = new DatabaseForecastRepository(database);
    const forecast = await forecastRepository.append({
      predictionId: prediction.id,
      eventMarketOutcomeId,
      probability: "0.58",
      modelVersion: "football-dixon-coles.v1",
      featureCutoff: new Date("2026-09-20T00:00:00.000Z"),
    });

    const priceObservationId = await ingestOddsAndGetObservationId({
      providerEventId: "960001",
      outcomeId: eventMarketOutcomeId,
      bookmaker: "PRICE_CHANGE_TEST_BOOK",
      decimalOdds: "1.90",
      providerObservedAt: "2026-09-19T00:00:00.000Z",
    });

    const decisionRepository = new DatabaseDecisionRepository(database);
    const input = {
      forecastId: forecast.id,
      eventMarketOutcomeId,
      marketPriceObservationId: priceObservationId,
      status: "NO_BET" as const,
      selection: "HOME",
      offeredOdds: "1.90",
      fairOdds: "1.72413793",
      whyNotCodes: ["EDGE_TOO_SMALL"],
      decisionSnapshot: { modelProbability: "0.58", offeredOdds: "1.90" },
    };

    const first = await decisionRepository.append(input);
    const second = await decisionRepository.append(input);
    expect(second.id).toBe(first.id);

    const changedPrice = await decisionRepository.append({
      ...input,
      marketPriceObservationId: null,
      offeredOdds: null,
      fairOdds: null,
      status: "WAIT",
      whyNotCodes: ["MARKET_DATA_UNAVAILABLE"],
    });
    expect(changedPrice.id).not.toBe(first.id);

    const latest = await decisionRepository.getLatestForForecast(forecast.id);
    expect(latest?.id).toBe(changedPrice.id);
  });

  it("[freshest odds] selects by providerObservedAt, not receipt order -- a payload received later but observed earlier does not win", async () => {
    const outcomeId = await freshOutcomeId("960002");
    // Observed earlier, but arrives (received) LATER than the second one.
    await ingestOddsAndGetObservationId({
      providerEventId: "960002",
      outcomeId,
      bookmaker: "RADAR_TEST_BOOK_A",
      decimalOdds: "1.80",
      providerObservedAt: "2026-09-15T10:00:00.000Z",
      ingestedAt: "2026-09-15T12:00:00.000Z",
    });
    // Observed later, received earlier -- this is the one that must win.
    const laterObservationBookmakerId = await ingestOddsAndGetBookmakerId({
      providerEventId: "960002",
      outcomeId,
      bookmaker: "RADAR_TEST_BOOK_B",
      decimalOdds: "1.95",
      providerObservedAt: "2026-09-15T11:00:00.000Z",
      ingestedAt: "2026-09-15T11:30:00.000Z",
    });

    const reader = new DatabaseFreshestOddsReader(database);
    const freshest = await reader.getFreshestValidOdds(
      outcomeId,
      new Date("2026-09-20T00:00:00.000Z"),
    );

    expect(freshest?.decimalOdds).toBe("1.95000000");
    expect(freshest?.bookmakerId).toBe(laterObservationBookmakerId);
  });

  it("[freshest odds] rejects an observation after the cutoff (post-kickoff), returning the last valid pre-cutoff price", async () => {
    const outcomeId = await freshOutcomeId("960003");
    await ingestOddsAndGetObservationId({
      providerEventId: "960003",
      outcomeId,
      bookmaker: "KICKOFF_TEST_BOOK",
      decimalOdds: "2.10",
      providerObservedAt: "2026-09-16T10:00:00.000Z",
    });
    // Same bookmaker repriced after kickoff -- must never be selected once a
    // cutoff at kickoff is supplied, even though it is the objectively
    // freshest row in the table.
    await ingestOddsAndGetObservationId({
      providerEventId: "960003",
      outcomeId,
      bookmaker: "KICKOFF_TEST_BOOK",
      decimalOdds: "3.50",
      providerObservedAt: "2026-09-21T18:05:00.000Z",
    });

    const reader = new DatabaseFreshestOddsReader(database);
    // Cutoff at kickoff -- the post-kickoff observation must never be selected.
    const freshest = await reader.getFreshestValidOdds(
      outcomeId,
      new Date("2026-09-21T18:00:00.000Z"),
    );

    expect(freshest?.decimalOdds).toBe("2.10000000");
  });

  it("[freshest odds] returns null when no valid observation exists, never an error", async () => {
    const referenceData = await ensureFootballReferenceData(
      database,
      PROVIDER_CODE,
    );
    const [existingEventMarket] = await database
      .select({ id: eventMarkets.id })
      .from(eventMarkets)
      .where(eq(eventMarkets.eventId, eventId))
      .limit(1);

    // A never-quoted DRAW outcome on the same real event market -- proving
    // "no odds yet" returns null rather than accidentally matching HOME's
    // odds inserted by earlier tests in this file.
    const [noOddsOutcome] = await database
      .insert(eventMarketOutcomes)
      .values({
        eventMarketId: existingEventMarket!.id,
        marketDefinitionId: referenceData.marketDefinitionId,
        outcomeDefinitionId: referenceData.outcomeDefinitionIds.DRAW,
        canonicalKey: `${existingEventMarket!.id}:no-odds-outcome-test`,
      })
      .onConflictDoNothing({
        target: [eventMarketOutcomes.canonicalKey],
      })
      .returning({ id: eventMarketOutcomes.id });

    const reader = new DatabaseFreshestOddsReader(database);
    const noOdds = await reader.getFreshestValidOdds(
      noOddsOutcome!.id,
      new Date("2020-01-01T00:00:00.000Z"),
    );
    expect(noOdds).toBeNull();
  });
});
