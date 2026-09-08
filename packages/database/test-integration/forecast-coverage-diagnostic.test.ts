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
import { getForecastCoverageDiagnostic } from "../src/repositories/forecast-coverage-diagnostic.js";
import { competitionIdentities, competitions } from "../src/schema/catalog.js";

/*
 * The read-only coverage diagnostic, proven against real PostgreSQL 17:
 * a fixture the cycle actually forecasts is reported as covered, with the
 * right decisionStatus breakdown; a second fixture in a competition the
 * model has never rated has no prediction at all and is reported as
 * uncovered -- exactly the "how many of today's fixtures have a real
 * forecast right now" question this diagnostic exists to answer.
 */
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = createPrivilegedDatabaseClient({
  connectionString: DATABASE_URL,
});
const database = client.database;

const PROVIDER_CODE = "API_SPORTS";
const COMPETITION_CODE = "COVERAGE_DIAGNOSTIC_LEAGUE_E2E";

function testArtifact(): ModelArtifact {
  return {
    modelCode: "FOOTBALL_DIXON_COLES",
    version: "coverage-diagnostic-test-model.v1",
    maturity: "EXPERIMENTAL",
    featureContractVersion: "test.v1",
    trainingCutoff: "2026-01-01T00:00:00.000Z",
    trainingDatasetFingerprint: "sha256:coverage-diagnostic-test",
    parameters: {
      teams: [
        {
          teamKey: "covered-home",
          competitionCode: COMPETITION_CODE,
          attack: 0.1,
          defence: -0.05,
          sampleWeight: 15,
          matches: 15,
        },
        {
          teamKey: "covered-away",
          competitionCode: COMPETITION_CODE,
          attack: -0.05,
          defence: 0.05,
          sampleWeight: 15,
          matches: 15,
        },
      ],
      competitions: [
        {
          competitionCode: COMPETITION_CODE,
          base: 0.1,
          homeAdvantage: 0.2,
          matches: 15,
        },
      ],
      rho: -0.03,
      hyperparameters: DEFAULT_HYPERPARAMETERS,
      trainingCutoff: "2026-01-01T00:00:00.000Z",
      iterations: 10,
      logLikelihood: -100,
      converged: true,
      matchesUsed: 15,
    },
    calibrators: [],
    uncertaintyProfiles: [],
    validationReport: {
      generatedAt: "2026-01-01T00:00:00.000Z",
      corpusSourceCodes: [],
      walkForwardCutoffs: [],
      holdoutFrom: "2026-01-01T00:00:00.000Z",
      trainRecords: 15,
      validationRecords: 5,
      holdoutRecords: 5,
      leakageAudit: { ok: true, violations: 0 },
      competitions: [],
    },
  };
}

function fixture(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    sport: "FOOTBALL",
    providerEventId: "990001",
    competition: "Coverage Diagnostic League",
    competitionProviderId: "9390001",
    competitionCountry: "Greece",
    competitionCountryCode: "GR",
    season: 2026,
    participants: ["Covered Home", "Covered Away"],
    scheduledAt: "2026-09-27T18:00:00.000Z",
    status: "NS",
    provider: "API_SPORTS",
    sourceReference: "test",
    ...overrides,
  };
}

describe("getForecastCoverageDiagnostic, against a real database", () => {
  afterAll(async () => {
    await client.close();
  });

  it("reports covered vs. uncovered fixtures and a real decisionStatus breakdown after a real cycle run", async () => {
    const referenceData = await ensureFootballReferenceData(
      database,
      PROVIDER_CODE,
    );
    const [competition] = await database
      .insert(competitions)
      .values({
        sportId: referenceData.sportId,
        code: COMPETITION_CODE,
        nameKey: "competition.coverage_diagnostic_league_e2e",
        countryCode: "GR",
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
          .where(eq(competitions.code, COMPETITION_CODE))
          .limit(1)
      )[0]!.id;
    await database
      .insert(competitionIdentities)
      .values({
        competitionId,
        providerId: referenceData.providerId,
        providerCompetitionId: "9390001",
        displayName: "Coverage Diagnostic League",
        countryCode: "GR",
        mappingStatus: "CONFIRMED",
      })
      .onConflictDoNothing();

    const bridge = await loadCompetitionBridge(
      database,
      referenceData.providerId,
    );

    // Fixture A: real model coverage.
    const coveredIngested = await ingestFootballFixture(database, {
      providerId: referenceData.providerId,
      providerCode: PROVIDER_CODE,
      sportId: referenceData.sportId,
      event: fixture(),
      competitionBridge: bridge,
      teamAliasLookup: teamAliasLookupFor,
    });
    if (!coveredIngested.ok)
      throw new Error(`fixture setup failed: ${coveredIngested.reason}`);

    // Fixture B: a second, correctly-identified competition the artifact
    // has never rated -- a real, uncovered fixture, not a fabricated one.
    const [uncoveredCompetition] = await database
      .insert(competitions)
      .values({
        sportId: referenceData.sportId,
        code: "UNRATED_COVERAGE_DIAGNOSTIC_E2E",
        nameKey: "competition.unrated_coverage_diagnostic_e2e",
        countryCode: "GR",
      })
      .onConflictDoNothing({
        target: [competitions.sportId, competitions.code],
      })
      .returning({ id: competitions.id });
    const uncoveredCompetitionId =
      uncoveredCompetition?.id ??
      (
        await database
          .select({ id: competitions.id })
          .from(competitions)
          .where(eq(competitions.code, "UNRATED_COVERAGE_DIAGNOSTIC_E2E"))
          .limit(1)
      )[0]!.id;
    await database
      .insert(competitionIdentities)
      .values({
        competitionId: uncoveredCompetitionId,
        providerId: referenceData.providerId,
        providerCompetitionId: "9390099",
        displayName: "Unrated Coverage Diagnostic League",
        countryCode: "GR",
        mappingStatus: "CONFIRMED",
      })
      .onConflictDoNothing();
    const uncoveredBridge = await loadCompetitionBridge(
      database,
      referenceData.providerId,
    );
    const uncoveredIngested = await ingestFootballFixture(database, {
      providerId: referenceData.providerId,
      providerCode: PROVIDER_CODE,
      sportId: referenceData.sportId,
      event: fixture({
        providerEventId: "990002",
        competitionProviderId: "9390099",
        participants: ["Uncovered Home", "Uncovered Away"],
      }),
      competitionBridge: uncoveredBridge,
      teamAliasLookup: teamAliasLookupFor,
    });
    if (!uncoveredIngested.ok)
      throw new Error(`fixture setup failed: ${uncoveredIngested.reason}`);

    const adapter = await createForecastCycleDbAdapter(database, {
      modelArtifact: testArtifact(),
      providerCode: PROVIDER_CODE,
      dataOrigin: "LIVE",
      clock: () => new Date("2026-09-27T00:00:00.000Z"),
    });
    const window = {
      from: new Date("2026-09-27T00:00:00.000Z"),
      to: new Date("2026-09-28T00:00:00.000Z"),
    };
    const cycleResult = await runForecastCycle(adapter, window);
    expect(cycleResult.predictionsCreated).toBeGreaterThan(0);
    expect(cycleResult.skippedByReason["COMPETITION_NOT_IN_MODEL"]).toBe(1);

    const diagnostic = await getForecastCoverageDiagnostic(database, window);
    expect(diagnostic.totalEvents).toBeGreaterThanOrEqual(2);
    expect(diagnostic.eventsWithAnyPrediction).toBeGreaterThanOrEqual(1);
    expect(diagnostic.eventsWithNoPrediction).toBeGreaterThanOrEqual(1);
    const totalPredictionsInBreakdown = Object.values(
      diagnostic.predictionsByDecisionStatus,
    ).reduce((sum, count) => sum + count, 0);
    expect(totalPredictionsInBreakdown).toBeGreaterThan(0);
  });
});
