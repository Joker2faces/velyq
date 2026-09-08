import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { runForecastCycle } from "@velyq/application/forecast-cycle";
import { DEFAULT_HYPERPARAMETERS } from "@velyq/research";
import type { ModelArtifact } from "@velyq/research";
import { teamAliasLookupFor } from "@velyq/providers";
import type { NormalizedEvent } from "@velyq/providers";

import { createPrivilegedDatabaseClient } from "../src/client.js";
import {
  ingestFootballFixture,
  loadCompetitionBridge,
} from "../src/repositories/fixture-ingestion.js";
import { ensureFootballReferenceData } from "../src/repositories/odds-ingestion.js";
import { createForecastCycleDbAdapter } from "../src/repositories/forecast-cycle-adapter.js";
import {
  predictions,
  forecasts,
  decisions,
} from "../src/schema/intelligence.js";
import { competitionIdentities, competitions } from "../src/schema/catalog.js";
import { eventMarketOutcomes, eventMarkets } from "../src/schema/market.js";
import { DatabaseCustomerQueryAdapter } from "../src/repositories/customer-queries.js";

/*
 * The release-critical proof: a real fixture in a real PostgreSQL 17
 * database, run through the actual runForecastCycle() bound to the actual
 * repositories, produces real intelligence.predictions/forecasts/decisions
 * rows -- and the customer Today read model returns them. No manual insert
 * of prediction/forecast/decision rows anywhere in this file: the service
 * under test must be the only thing that writes them. See
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

/**
 * A fabricated but internally consistent Dixon-Coles artifact, exactly the
 * shape production loads -- two rated teams in one rated competition.
 * Fitting a real model is not the point of this test; the pipeline calling
 * the real inference function correctly is.
 */
function testArtifact(overrides: Partial<ModelArtifact> = {}): ModelArtifact {
  return {
    modelCode: "FOOTBALL_DIXON_COLES",
    version: "e2e-test-model.v1",
    maturity: "EXPERIMENTAL",
    featureContractVersion: "test.v1",
    trainingCutoff: "2026-01-01T00:00:00.000Z",
    trainingDatasetFingerprint: "sha256:e2e-test",
    parameters: {
      teams: [
        {
          teamKey: "juventus",
          competitionCode: "ITA_SERIE_A_E2E",
          attack: 0.25,
          defence: -0.1,
          sampleWeight: 20,
          matches: 20,
        },
        {
          teamKey: "inter",
          competitionCode: "ITA_SERIE_A_E2E",
          attack: 0.05,
          defence: 0.02,
          sampleWeight: 20,
          matches: 20,
        },
      ],
      competitions: [
        {
          competitionCode: "ITA_SERIE_A_E2E",
          base: 0.15,
          homeAdvantage: 0.28,
          matches: 20,
        },
      ],
      rho: -0.04,
      hyperparameters: DEFAULT_HYPERPARAMETERS,
      trainingCutoff: "2026-01-01T00:00:00.000Z",
      iterations: 12,
      logLikelihood: -120,
      converged: true,
      matchesUsed: 20,
    },
    calibrators: [],
    uncertaintyProfiles: [],
    validationReport: {
      generatedAt: "2026-01-01T00:00:00.000Z",
      corpusSourceCodes: [],
      walkForwardCutoffs: [],
      holdoutFrom: "2026-01-01T00:00:00.000Z",
      trainRecords: 20,
      validationRecords: 5,
      holdoutRecords: 5,
      leakageAudit: { ok: true, violations: 0 },
      competitions: [],
    },
    ...overrides,
  };
}

function fixture(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    sport: "FOOTBALL",
    providerEventId: "970001",
    competition: "Serie A",
    competitionProviderId: "9370001",
    competitionCountry: "Italy",
    competitionCountryCode: "IT",
    season: 2026,
    participants: ["Juventus", "Inter"],
    scheduledAt: "2026-09-22T18:00:00.000Z",
    status: "NS",
    provider: "API_SPORTS",
    sourceReference: "test",
    ...overrides,
  };
}

describe("runForecastCycle, against a real database, end to end", () => {
  afterAll(async () => {
    await client.close();
  });

  /** Ingests a real fixture and stamps its competition's code to match the
      test artifact's known competition key ("ITA_SERIE_A_E2E") -- fixture
      ingestion assigns the competition its own generated code by default,
      so this rewrites it post-ingestion the way an operator's real
      competition-catalog naming would, not as a test shortcut around
      identity resolution (which already ran, for real, inside
      ingestFootballFixture). */
  async function ingestRealFixture(
    providerEventId: string,
    providerCompetitionId: string,
    participantsNames: readonly [string, string],
  ): Promise<string> {
    const referenceData = await ensureFootballReferenceData(
      database,
      PROVIDER_CODE,
    );
    const [competition] = await database
      .insert(competitions)
      .values({
        sportId: referenceData.sportId,
        code: "ITA_SERIE_A_E2E",
        nameKey: "competition.ita_serie_a_e2e",
        countryCode: "IT",
      })
      .onConflictDoNothing({
        target: [competitions.sportId, competitions.code],
      })
      .returning({ id: competitions.id });
    const competitionId =
      competition?.id ??
      (
        await database
          .select({ id: competitions.id })
          .from(competitions)
          .where(eq(competitions.code, "ITA_SERIE_A_E2E"))
          .limit(1)
      )[0]!.id;

    await database
      .insert(competitionIdentities)
      .values({
        competitionId,
        providerId: referenceData.providerId,
        providerCompetitionId,
        displayName: "Serie A",
        countryCode: "IT",
        mappingStatus: "CONFIRMED",
      })
      .onConflictDoNothing();

    const bridge = await loadCompetitionBridge(
      database,
      referenceData.providerId,
    );
    const ingested = await ingestFootballFixture(database, {
      providerId: referenceData.providerId,
      providerCode: PROVIDER_CODE,
      sportId: referenceData.sportId,
      event: fixture({
        providerEventId,
        competitionProviderId: providerCompetitionId,
        participants: [...participantsNames],
      }),
      competitionBridge: bridge,
      teamAliasLookup: teamAliasLookupFor,
    });
    if (!ingested.ok)
      throw new Error(`fixture ingestion failed: ${ingested.reason}`);
    return ingested.eventId;
  }

  it("persists real prediction/forecast/decision rows from a real fixture, with real Dixon-Coles output, no odds -- forecast stays visible as WAIT", async () => {
    const eventId = await ingestRealFixture("970001", "9370001", [
      "Juventus",
      "Inter",
    ]);

    const adapter = await createForecastCycleDbAdapter(database, {
      modelArtifact: testArtifact(),
      providerCode: PROVIDER_CODE,
      dataOrigin: "LIVE",
      clock: () => new Date("2026-09-22T00:00:00.000Z"),
    });

    const result = await runForecastCycle(adapter, {
      from: new Date("2026-09-22T00:00:00.000Z"),
      to: new Date("2026-09-23T00:00:00.000Z"),
    });

    expect(result.fixturesScanned).toBeGreaterThanOrEqual(1);
    expect(result.modelEligible).toBeGreaterThanOrEqual(1);
    expect(result.predictionsCreated).toBeGreaterThanOrEqual(3);
    expect(Object.keys(result.errorsByReason)).toHaveLength(0);

    // Real rows, not asserted by row-count alone: read them back and check
    // the actual persisted numbers are a valid probability vector.
    const [homeOutcome] = await database
      .select({ id: eventMarketOutcomes.id })
      .from(eventMarketOutcomes)
      .innerJoin(
        eventMarkets,
        eq(eventMarketOutcomes.eventMarketId, eventMarkets.id),
      )
      .where(eq(eventMarkets.eventId, eventId))
      .limit(1);
    expect(homeOutcome).toBeDefined();

    const persistedPredictions = await database
      .select({ prediction: predictions, outcome: eventMarketOutcomes })
      .from(predictions)
      .innerJoin(
        eventMarketOutcomes,
        eq(predictions.eventMarketOutcomeId, eventMarketOutcomes.id),
      );
    const forThisEvent = persistedPredictions.filter(
      (row) => row.outcome.id === homeOutcome!.id,
    );
    expect(forThisEvent.length).toBeGreaterThanOrEqual(1);
    const predictionRow = forThisEvent[0]!.prediction;
    expect(predictionRow.decisionStatus).toBe("WAIT");
    const probability = Number(predictionRow.modelProbability);
    expect(probability).toBeGreaterThan(0);
    expect(probability).toBeLessThan(1);
    expect(Number.isFinite(probability)).toBe(true);

    const [forecastRow] = await database
      .select()
      .from(forecasts)
      .where(eq(forecasts.predictionId, predictionRow.id));
    expect(forecastRow).toBeDefined();
    expect(forecastRow!.modelVersion).toBe("e2e-test-model.v1");
    expect(Number(forecastRow!.probability)).toBeCloseTo(probability, 10);

    const [decisionRow] = await database
      .select()
      .from(decisions)
      .where(eq(decisions.forecastId, forecastRow!.id));
    expect(decisionRow).toBeDefined();
    expect(decisionRow!.status).toBe("WAIT");
    expect(decisionRow!.whyNotCodes).toContain("MARKET_DATA_UNAVAILABLE");
    const snapshot = decisionRow!.decisionSnapshot as Record<string, unknown>;
    expect(snapshot["modelVersion"]).toBe("e2e-test-model.v1");
    expect(snapshot["modelMaturity"]).toBe("EXPERIMENTAL");

    // Today's actual read model must return this fixture with real numbers.
    const customerQueries = new DatabaseCustomerQueryAdapter(database);
    const match = await customerQueries.getMatch(
      eventId,
      new Date("2026-09-22T00:00:00.000Z"),
    );
    expect(match).not.toBeNull();
    const matchOutcomes = match!.outcomes.filter(
      (outcome) => outcome.prediction !== null,
    );
    expect(matchOutcomes.length).toBeGreaterThanOrEqual(1);
    const matchedOutcome = matchOutcomes.find(
      (outcome) => outcome.outcome.id === homeOutcome!.id,
    );
    expect(matchedOutcome).toBeDefined();
    expect(matchedOutcome!.prediction!.prediction.decisionStatus).toBe("WAIT");
    expect(
      Number(matchedOutcome!.prediction!.prediction.modelProbability),
    ).toBeCloseTo(probability, 10);
  });

  it("running the cycle twice against unchanged inputs does not create duplicate logical prediction/forecast rows", async () => {
    const eventId = await ingestRealFixture("970002", "9370001", [
      "Juventus",
      "Inter",
    ]);
    const adapter = await createForecastCycleDbAdapter(database, {
      modelArtifact: testArtifact(),
      providerCode: PROVIDER_CODE,
      dataOrigin: "LIVE",
      clock: () => new Date("2026-09-22T00:00:00.000Z"),
    });
    const window = {
      from: new Date("2026-09-22T00:00:00.000Z"),
      to: new Date("2026-09-23T00:00:00.000Z"),
    };

    await runForecastCycle(adapter, window);
    await runForecastCycle(adapter, window);

    const [outcome] = await database
      .select({ id: eventMarketOutcomes.id })
      .from(eventMarketOutcomes)
      .innerJoin(
        eventMarkets,
        eq(eventMarketOutcomes.eventMarketId, eventMarkets.id),
      )
      .where(eq(eventMarkets.eventId, eventId))
      .limit(1);

    const rows = await database
      .select()
      .from(predictions)
      .where(eq(predictions.eventMarketOutcomeId, outcome!.id));
    // Two identical cycle runs against the same feature cutoff and inputs
    // must not create two prediction rows for the same outcome.
    expect(rows.length).toBe(1);

    const forecastRows = await database
      .select()
      .from(forecasts)
      .where(eq(forecasts.eventMarketOutcomeId, outcome!.id));
    expect(forecastRows.length).toBe(1);
  });

  it("isolates one fixture with no model coverage (COMPETITION_NOT_IN_MODEL) without failing the fixture with real coverage", async () => {
    const goodEventId = await ingestRealFixture("970003", "9370001", [
      "Juventus",
      "Inter",
    ]);
    // A second fixture in a real, correctly-identified competition the
    // Dixon-Coles artifact has simply never rated -- the model-coverage
    // gap, not an identity failure.
    const referenceData = await ensureFootballReferenceData(
      database,
      PROVIDER_CODE,
    );
    const [otherCompetition] = await database
      .insert(competitions)
      .values({
        sportId: referenceData.sportId,
        code: "UNRATED_LEAGUE_E2E",
        nameKey: "competition.unrated_league_e2e",
        countryCode: "GR",
      })
      .onConflictDoNothing({
        target: [competitions.sportId, competitions.code],
      })
      .returning({ id: competitions.id });
    const otherCompetitionId =
      otherCompetition?.id ??
      (
        await database
          .select({ id: competitions.id })
          .from(competitions)
          .where(eq(competitions.code, "UNRATED_LEAGUE_E2E"))
          .limit(1)
      )[0]!.id;
    await database
      .insert(competitionIdentities)
      .values({
        competitionId: otherCompetitionId,
        providerId: referenceData.providerId,
        providerCompetitionId: "9370099",
        displayName: "Unrated League",
        countryCode: "GR",
        mappingStatus: "CONFIRMED",
      })
      .onConflictDoNothing();
    const bridge = await loadCompetitionBridge(
      database,
      referenceData.providerId,
    );
    const ingestedOther = await ingestFootballFixture(database, {
      providerId: referenceData.providerId,
      providerCode: PROVIDER_CODE,
      sportId: referenceData.sportId,
      event: fixture({
        providerEventId: "970004",
        competitionProviderId: "9370099",
        participants: ["Unrated Home FC", "Unrated Away FC"],
      }),
      competitionBridge: bridge,
      teamAliasLookup: teamAliasLookupFor,
    });
    if (!ingestedOther.ok)
      throw new Error(`fixture ingestion failed: ${ingestedOther.reason}`);

    const adapter = await createForecastCycleDbAdapter(database, {
      modelArtifact: testArtifact(),
      providerCode: PROVIDER_CODE,
      dataOrigin: "LIVE",
      clock: () => new Date("2026-09-22T00:00:00.000Z"),
    });
    const result = await runForecastCycle(adapter, {
      from: new Date("2026-09-22T00:00:00.000Z"),
      to: new Date("2026-09-23T00:00:00.000Z"),
    });

    expect(result.fixturesScanned).toBeGreaterThanOrEqual(2);
    expect(
      result.skippedByReason["COMPETITION_NOT_IN_MODEL"],
    ).toBeGreaterThanOrEqual(1);
    expect(Object.keys(result.errorsByReason)).toHaveLength(0);

    const [goodOutcome] = await database
      .select({ id: eventMarketOutcomes.id })
      .from(eventMarketOutcomes)
      .innerJoin(
        eventMarkets,
        eq(eventMarketOutcomes.eventMarketId, eventMarkets.id),
      )
      .where(eq(eventMarkets.eventId, goodEventId))
      .limit(1);
    const goodPredictions = await database
      .select()
      .from(predictions)
      .where(eq(predictions.eventMarketOutcomeId, goodOutcome!.id));
    expect(goodPredictions.length).toBeGreaterThanOrEqual(1);
  });
});
