import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { orchestrateResultSettlement } from "@velyq/application";
import { canonicalMarketDefinitions } from "@velyq/market-semantics";
import type { NormalizedEvent } from "@velyq/providers";
import { normalizeFootballResult, teamAliasLookupFor } from "@velyq/providers";

import { createPrivilegedDatabaseClient } from "../src/client.js";
import {
  ingestFootballFixture,
  loadCompetitionBridge,
} from "../src/repositories/fixture-ingestion.js";
import { ensureFootballReferenceData } from "../src/repositories/odds-ingestion.js";
import { DatabaseResultSettlementRepository } from "../src/repositories/result-settlement.js";
import { ingestFootballResults } from "../src/repositories/result-ingestion.js";
import { DatabaseHistoryQueryAdapter } from "../src/repositories/history.js";
import {
  calibrationVersions,
  dataQualityAssessments,
  dataQualityPolicyVersions,
  decisions,
  eventResults,
  forecasts,
  marketSettlements,
  modelDefinitions,
  modelVersions,
  predictionRuns,
  predictions,
} from "../src/schema/intelligence.js";
import { competitionIdentities, competitions } from "../src/schema/catalog.js";
import {
  bookmakers,
  eventMarketOutcomes,
  eventMarkets,
  oddsObservations,
} from "../src/schema/market.js";
import { sourceObservations } from "../src/schema/operations.js";

/*
 * Real-Postgres proof of the full owner-critical chain: a fixture reaching
 * an actual persisted forecast and decision (not just React cards), and a
 * provider final result actually settling that decision -- including a
 * later correction, which must not rewrite the original decision snapshot.
 * See tooling/vitest/vitest.db-integration.config.mts for why this file is
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
    providerEventId: "950001",
    competition: "Serie A",
    competitionProviderId: "9350001",
    competitionCountry: "Italy",
    competitionCountryCode: "IT",
    season: 2026,
    participants: ["Juventus", "Inter"],
    scheduledAt: "2026-09-20T18:00:00.000Z",
    status: "NS",
    provider: "API_SPORTS",
    sourceReference: "test",
    ...overrides,
  };
}

describe("forecast, decision and settlement, against a real database", () => {
  let referenceData: Awaited<ReturnType<typeof ensureFootballReferenceData>>;
  let competitionId: string;
  let eventId: string;
  let eventMarketOutcomeId: string;
  const outcomeIdBySelection: Record<
    "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER",
    string
  > = { HOME: "", DRAW: "", AWAY: "", OVER: "", UNDER: "" };

  beforeAll(async () => {
    referenceData = await ensureFootballReferenceData(database, PROVIDER_CODE);

    const [competition] = await database
      .insert(competitions)
      .values({
        sportId: referenceData.sportId,
        code: "ITA_SERIE_A_SETTLEMENT_TEST",
        nameKey: "competition.ita_serie_a",
        countryCode: "IT",
      })
      .returning({ id: competitions.id });
    competitionId = competition!.id;

    await database.insert(competitionIdentities).values({
      competitionId,
      providerId: referenceData.providerId,
      providerCompetitionId: "9350001",
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
          .where(eq(eventMarkets.eventId, eventId))
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
      .returning({ id: eventMarketOutcomes.id });
    eventMarketOutcomeId = outcome!.id;

    /*
     * DRAW and AWAY outcomes on the same 1X2 event market -- proving
     * settlement resolves the winner correctly for every 1X2 selection, not
     * only HOME.
     */
    for (const code of ["DRAW", "AWAY"] as const) {
      const [row] = await database
        .insert(eventMarketOutcomes)
        .values({
          eventMarketId,
          marketDefinitionId: referenceData.marketDefinitionId,
          outcomeDefinitionId: referenceData.outcomeDefinitionIds[code],
          canonicalKey: `${eventMarketId}:${referenceData.outcomeDefinitionIds[code]}`,
        })
        .returning({ id: eventMarketOutcomes.id });
      outcomeIdBySelection[code] = row!.id;
    }
    outcomeIdBySelection.HOME = eventMarketOutcomeId;

    /*
     * A separate O/U 2.5 market, wired directly here rather than through
     * ensureFootballReferenceData (which only wires MATCH_WINNER_1X2) --
     * FOOTBALL_FULL_TIME_TOTAL requires a line value (2.5), so its
     * event_markets row differs in shape from the 1X2 market's.
     */
    const { marketDefinitions, outcomeDefinitions } =
      await import("../src/schema/market.js");
    const totalDefinition = canonicalMarketDefinitions.FOOTBALL_FULL_TIME_TOTAL;
    const [totalMarketDefinition] = await database
      .insert(marketDefinitions)
      .values({
        sportId: referenceData.sportId,
        code: totalDefinition.code,
        familyCode: totalDefinition.familyCode,
        periodCode: totalDefinition.periodCode,
        structure: totalDefinition.structure,
        subjectType: totalDefinition.subjectType,
        lineRequired: true,
        lineRules: {},
        settlementRuleVersion: totalDefinition.settlementRuleVersion,
        labelKey: `market.${totalDefinition.code.toLowerCase()}`,
      })
      .onConflictDoNothing({
        target: [marketDefinitions.sportId, marketDefinitions.code],
      })
      .returning({ id: marketDefinitions.id });
    const totalMarketDefinitionId =
      totalMarketDefinition?.id ??
      (
        await database
          .select({ id: marketDefinitions.id })
          .from(marketDefinitions)
          .where(eq(marketDefinitions.code, totalDefinition.code))
          .limit(1)
      )[0]!.id;

    const totalOutcomeIds: Record<"OVER" | "UNDER", string> = {
      OVER: "",
      UNDER: "",
    };
    for (const [sortOrder, code] of ["OVER", "UNDER"].entries()) {
      const [row] = await database
        .insert(outcomeDefinitions)
        .values({
          marketDefinitionId: totalMarketDefinitionId,
          code,
          labelKey: `market.${totalDefinition.code.toLowerCase()}.${code.toLowerCase()}`,
          sortOrder,
        })
        .onConflictDoNothing({
          target: [
            outcomeDefinitions.marketDefinitionId,
            outcomeDefinitions.code,
          ],
        })
        .returning({ id: outcomeDefinitions.id });
      totalOutcomeIds[code as "OVER" | "UNDER"] =
        row?.id ??
        (
          await database
            .select({ id: outcomeDefinitions.id })
            .from(outcomeDefinitions)
            .where(
              and(
                eq(
                  outcomeDefinitions.marketDefinitionId,
                  totalMarketDefinitionId,
                ),
                eq(outcomeDefinitions.code, code),
              ),
            )
            .limit(1)
        )[0]!.id;
    }

    const [totalEventMarket] = await database
      .insert(eventMarkets)
      .values({
        eventId,
        marketDefinitionId: totalMarketDefinitionId,
        subjectParticipantId: null,
        lineValue: "2.5",
        canonicalKey: `${eventId}:${totalMarketDefinitionId}:null:2.5`,
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
    const totalEventMarketId =
      totalEventMarket?.id ??
      (
        await database
          .select({ id: eventMarkets.id })
          .from(eventMarkets)
          .where(eq(eventMarkets.marketDefinitionId, totalMarketDefinitionId))
          .limit(1)
      )[0]!.id;

    for (const code of ["OVER", "UNDER"] as const) {
      const [row] = await database
        .insert(eventMarketOutcomes)
        .values({
          eventMarketId: totalEventMarketId,
          marketDefinitionId: totalMarketDefinitionId,
          outcomeDefinitionId: totalOutcomeIds[code],
          canonicalKey: `${totalEventMarketId}:${totalOutcomeIds[code]}`,
        })
        .onConflictDoNothing({
          target: [
            eventMarketOutcomes.eventMarketId,
            eventMarketOutcomes.outcomeDefinitionId,
          ],
        })
        .returning({ id: eventMarketOutcomes.id });
      outcomeIdBySelection[code] =
        row?.id ??
        (
          await database
            .select({ id: eventMarketOutcomes.id })
            .from(eventMarketOutcomes)
            .where(
              and(
                eq(eventMarketOutcomes.eventMarketId, totalEventMarketId),
                eq(
                  eventMarketOutcomes.outcomeDefinitionId,
                  totalOutcomeIds[code],
                ),
              ),
            )
            .limit(1)
        )[0]!.id;
    }
  });

  afterAll(async () => {
    await client.close();
  });

  /**
   * Builds one complete, real persisted prediction -> forecast -> decision
   * chain for `eventMarketOutcomeId`, using deterministic model/calibration/
   * quality reference rows. Returns the decision id settlement is proven
   * against. Not a mock: every row is a real insert into the schema this
   * feature actually ships.
   */
  async function persistDecision(input: {
    decisionStatus: "STRONG_EDGE";
    modelProbability: string;
    offeredOdds: string;
    eventMarketOutcomeId?: string;
    selection?: "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER";
  }) {
    const eventMarketOutcomeId =
      input.eventMarketOutcomeId ?? outcomeIdBySelection.HOME;
    const selection = input.selection ?? "HOME";
    const [modelDefinition] = await database
      .insert(modelDefinitions)
      .values({
        code: "TEST_MODEL",
        displayName: "Test Model",
        description: "Deterministic test model",
      })
      .onConflictDoNothing({ target: [modelDefinitions.code] })
      .returning({ id: modelDefinitions.id });
    const modelDefinitionId =
      modelDefinition?.id ??
      (
        await database
          .select({ id: modelDefinitions.id })
          .from(modelDefinitions)
          .where(eq(modelDefinitions.code, "TEST_MODEL"))
          .limit(1)
      )[0]!.id;

    const [modelVersion] = await database
      .insert(modelVersions)
      .values({
        modelDefinitionId,
        version: "test.v1",
        maturityStatus: "EXPERIMENTAL",
        validationStatus: "UNVALIDATED",
        featureContractVersion: "test.v1",
      })
      .onConflictDoNothing({
        target: [modelVersions.modelDefinitionId, modelVersions.version],
      })
      .returning({ id: modelVersions.id });
    const modelVersionId =
      modelVersion?.id ??
      (
        await database
          .select({ id: modelVersions.id })
          .from(modelVersions)
          .where(eq(modelVersions.modelDefinitionId, modelDefinitionId))
          .limit(1)
      )[0]!.id;

    const [calibrationVersion] = await database
      .insert(calibrationVersions)
      .values({
        modelVersionId,
        version: "test.v1",
        method: "NONE",
        parameters: {},
        validationStatus: "UNVALIDATED",
      })
      .onConflictDoNothing({
        target: [
          calibrationVersions.modelVersionId,
          calibrationVersions.version,
        ],
      })
      .returning({ id: calibrationVersions.id });
    const calibrationVersionId =
      calibrationVersion?.id ??
      (
        await database
          .select({ id: calibrationVersions.id })
          .from(calibrationVersions)
          .where(eq(calibrationVersions.modelVersionId, modelVersionId))
          .limit(1)
      )[0]!.id;

    const [qualityPolicy] = await database
      .insert(dataQualityPolicyVersions)
      .values({
        code: "TEST_QUALITY",
        version: "v1",
        validationStatus: "UNVALIDATED",
        definition: {},
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      })
      .onConflictDoNothing({
        target: [
          dataQualityPolicyVersions.code,
          dataQualityPolicyVersions.version,
        ],
      })
      .returning({ id: dataQualityPolicyVersions.id });
    const qualityPolicyId =
      qualityPolicy?.id ??
      (
        await database
          .select({ id: dataQualityPolicyVersions.id })
          .from(dataQualityPolicyVersions)
          .where(eq(dataQualityPolicyVersions.code, "TEST_QUALITY"))
          .limit(1)
      )[0]!.id;

    const [qualityAssessment] = await database
      .insert(dataQualityAssessments)
      .values({
        policyVersionId: qualityPolicyId,
        eventId,
        marketOutcomeId: eventMarketOutcomeId,
        asOf: new Date("2026-09-19T00:00:00.000Z"),
        grade: "A",
        numericScore: "1",
        components: {},
        reasonCodes: [],
      })
      .returning({ id: dataQualityAssessments.id });

    const [predictionRun] = await database
      .insert(predictionRuns)
      .values({
        modelVersionId,
        calibrationVersionId,
        eventId,
        featureCutoff: new Date("2026-09-19T00:00:00.000Z"),
        status: "COMPLETED",
        startedAt: new Date("2026-09-19T00:00:00.000Z"),
        completedAt: new Date("2026-09-19T00:00:01.000Z"),
      })
      .returning({ id: predictionRuns.id });

    const [prediction] = await database
      .insert(predictions)
      .values({
        predictionRunId: predictionRun!.id,
        eventMarketOutcomeId,
        dataQualityAssessmentId: qualityAssessment!.id,
        decisionStatus: input.decisionStatus,
        modelProbability: input.modelProbability,
        reasonCodes: [],
        structuredReasons: {},
      })
      .returning({ id: predictions.id });

    const [forecast] = await database
      .insert(forecasts)
      .values({
        predictionId: prediction!.id,
        eventMarketOutcomeId,
        probability: input.modelProbability,
        modelVersion: "test.v1",
        featureCutoff: new Date("2026-09-19T00:00:00.000Z"),
      })
      .returning({ id: forecasts.id });

    const [decision] = await database
      .insert(decisions)
      .values({
        forecastId: forecast!.id,
        eventMarketOutcomeId,
        status: input.decisionStatus,
        selection,
        offeredOdds: input.offeredOdds,
        fairOdds: (1 / Number(input.modelProbability)).toFixed(8),
        expectedValue: (
          Number(input.modelProbability) * Number(input.offeredOdds) -
          1
        ).toFixed(12),
        whyNotCodes: [],
        decisionSnapshot: {
          modelProbability: input.modelProbability,
          offeredOdds: input.offeredOdds,
        },
      })
      .returning();

    return decision!;
  }

  it("[forecast pipeline] persists a real decision reachable from a real fixture, not just a card", async () => {
    const decision = await persistDecision({
      decisionStatus: "STRONG_EDGE",
      modelProbability: "0.6",
      offeredOdds: "1.85",
    });

    expect(decision.eventMarketOutcomeId).toBe(eventMarketOutcomeId);
    expect(decision.decisionSnapshot).toMatchObject({
      modelProbability: "0.6",
      offeredOdds: "1.85",
    });
  });

  it("[result + settlement] a provider FINAL result settles a real persisted decision", async () => {
    const decision = await persistDecision({
      decisionStatus: "STRONG_EDGE",
      modelProbability: "0.6",
      offeredOdds: "1.85",
    });

    const [syncRun] = await database
      .insert((await import("../src/schema/operations.js")).providerSyncRuns)
      .values({
        providerId: referenceData.providerId,
        capability: "RESULTS",
        status: "COMPLETED",
        providerSchemaVersion: "api-sports.v1",
        normalizationVersion: "api-sports.v1",
        mappingVersion: "api-sports.v1",
        policyVersionId: referenceData.policyVersionId,
        startedAt: new Date(),
        completedAt: new Date(),
      })
      .returning({
        id: (await import("../src/schema/operations.js")).providerSyncRuns.id,
      });

    const [source] = await database
      .insert(sourceObservations)
      .values({
        providerId: referenceData.providerId,
        syncRunId: syncRun!.id,
        observationType: "RESULT",
        providerExternalId: "950001",
        providerObservedAt: new Date("2026-09-20T20:00:00.000Z"),
        receivedAt: new Date("2026-09-20T20:00:01.000Z"),
        normalizedAt: new Date("2026-09-20T20:00:01.000Z"),
        normalizationVersion: "api-sports.v1",
        mappingVersion: "api-sports.v1",
        contentHash: "sha256:settlement-test-2-1",
      })
      .returning({ id: sourceObservations.id });

    const settlementInstructions = orchestrateResultSettlement(
      {
        provider: PROVIDER_CODE,
        providerFixtureId: "950001",
        status: "FINAL",
        homeScore: 2,
        awayScore: 1,
        observedAt: "2026-09-20T20:00:00.000Z",
      },
      [{ decisionId: decision.id, market: "1X2", selection: "HOME" }],
    );
    expect(settlementInstructions[0]?.outcome).toBe("WIN");

    const repository = new DatabaseResultSettlementRepository(database);
    const { result, settlements } = await repository.append({
      providerId: referenceData.providerId,
      sourceObservationId: source!.id,
      result: {
        provider: PROVIDER_CODE,
        providerFixtureId: "950001",
        status: "FINAL",
        homeScore: 2,
        awayScore: 1,
        observedAt: "2026-09-20T20:00:00.000Z",
      },
      settlements: settlementInstructions,
      settlementRuleVersion: "1X2.v1",
    });

    expect(result.homeScore).toBe(2);
    expect(result.awayScore).toBe(1);
    expect(settlements).toHaveLength(1);
    expect(settlements[0]?.outcome).toBe("WIN");
    expect(settlements[0]?.decisionId).toBe(decision.id);

    const history = await new DatabaseHistoryQueryAdapter(
      database,
    ).listDecisions();
    const historyRow = history.find((row) => row.decision.id === decision.id);
    expect(historyRow?.result?.homeScore).toBe(2);
    expect(historyRow?.settlement?.outcome).toBe("WIN");
    /* The original decision snapshot is immutable -- settlement must never
       rewrite what the decision looked like at the moment it was made. */
    expect(historyRow?.decision.decisionSnapshot).toMatchObject({
      modelProbability: "0.6",
      offeredOdds: "1.85",
    });
  });

  it("[result correction] a later corrected result settles again without erasing the original settlement", async () => {
    const decision = await persistDecision({
      decisionStatus: "STRONG_EDGE",
      modelProbability: "0.55",
      offeredOdds: "2.10",
    });
    const originalSnapshot = structuredClone(decision.decisionSnapshot);

    const { providerSyncRuns } = await import("../src/schema/operations.js");
    const [syncRun] = await database
      .insert(providerSyncRuns)
      .values({
        providerId: referenceData.providerId,
        capability: "RESULTS",
        status: "COMPLETED",
        providerSchemaVersion: "api-sports.v1",
        normalizationVersion: "api-sports.v1",
        mappingVersion: "api-sports.v1",
        policyVersionId: referenceData.policyVersionId,
        startedAt: new Date(),
        completedAt: new Date(),
      })
      .returning({ id: providerSyncRuns.id });

    async function settleWith(
      homeScore: number,
      awayScore: number,
      contentHash: string,
      observedAt: string,
    ) {
      const [source] = await database
        .insert(sourceObservations)
        .values({
          providerId: referenceData.providerId,
          syncRunId: syncRun!.id,
          observationType: "RESULT",
          providerExternalId: "950001",
          providerObservedAt: new Date(observedAt),
          receivedAt: new Date(observedAt),
          normalizedAt: new Date(observedAt),
          normalizationVersion: "api-sports.v1",
          mappingVersion: "api-sports.v1",
          contentHash,
        })
        .returning({ id: sourceObservations.id });

      const result = {
        provider: PROVIDER_CODE,
        providerFixtureId: "950001",
        status: "FINAL" as const,
        homeScore,
        awayScore,
        observedAt,
      };
      const settlementInstructions = orchestrateResultSettlement(result, [
        { decisionId: decision.id, market: "1X2", selection: "HOME" },
      ]);
      return new DatabaseResultSettlementRepository(database).append({
        providerId: referenceData.providerId,
        sourceObservationId: source!.id,
        result,
        settlements: settlementInstructions,
        settlementRuleVersion: "1X2.v1",
      });
    }

    // Provider initially reports 2-1 (HOME win)
    const first = await settleWith(
      2,
      1,
      "sha256:correction-test-first-2-1",
      "2026-09-20T20:00:00.000Z",
    );
    expect(first.settlements[0]?.outcome).toBe("WIN");

    // Provider later corrects to 1-1 (a draw -- HOME selection now loses)
    const corrected = await settleWith(
      1,
      1,
      "sha256:correction-test-corrected-1-1",
      "2026-09-20T21:00:00.000Z",
    );
    expect(corrected.settlements[0]?.outcome).toBe("LOSS");
    expect(corrected.result.id).not.toBe(first.result.id);

    // Both event_results rows persist -- the correction did not overwrite
    // or delete the original provider observation.
    const { eventResults, marketSettlements } =
      await import("../src/schema/intelligence.js");
    const allResults = await database
      .select()
      .from(eventResults)
      .where(eq(eventResults.eventId, eventId));
    expect(
      allResults.filter(
        (row) => row.id === first.result.id || row.id === corrected.result.id,
      ),
    ).toHaveLength(2);

    // Both settlements persist too -- the earlier WIN settlement is not
    // silently erased when the correction produces a new LOSS settlement.
    const allSettlements = await database
      .select()
      .from(marketSettlements)
      .where(eq(marketSettlements.decisionId, decision.id));
    expect(allSettlements.map((row) => row.outcome).sort()).toEqual([
      "LOSS",
      "WIN",
    ]);

    // The decision snapshot itself never changed.
    const [decisionRow] = await database
      .select()
      .from(decisions)
      .where(eq(decisions.id, decision.id));
    expect(decisionRow?.decisionSnapshot).toEqual(originalSnapshot);
  });

  /**
   * Settles one decision against one provider result, using a fresh
   * provider_sync_runs + source_observations pair so repeated calls within a
   * test file sharing one database never collide on source_observations'
   * (provider, type, content hash) uniqueness.
   */
  async function settleOnce(input: {
    decisionId: string;
    market: "1X2" | "OVER_UNDER_2_5";
    selection: "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER";
    status: "FINAL" | "CANCELLED" | "ABANDONED";
    homeScore?: number;
    awayScore?: number;
    contentHash: string;
  }) {
    const { providerSyncRuns } = await import("../src/schema/operations.js");
    const [syncRun] = await database
      .insert(providerSyncRuns)
      .values({
        providerId: referenceData.providerId,
        capability: "RESULTS",
        status: "COMPLETED",
        providerSchemaVersion: "api-sports.v1",
        normalizationVersion: "api-sports.v1",
        mappingVersion: "api-sports.v1",
        policyVersionId: referenceData.policyVersionId,
        startedAt: new Date(),
        completedAt: new Date(),
      })
      .returning({ id: providerSyncRuns.id });
    const [source] = await database
      .insert(sourceObservations)
      .values({
        providerId: referenceData.providerId,
        syncRunId: syncRun!.id,
        observationType: "RESULT",
        providerExternalId: "950001",
        providerObservedAt: new Date("2026-09-20T20:00:00.000Z"),
        receivedAt: new Date("2026-09-20T20:00:01.000Z"),
        normalizedAt: new Date("2026-09-20T20:00:01.000Z"),
        normalizationVersion: "api-sports.v1",
        mappingVersion: "api-sports.v1",
        contentHash: input.contentHash,
      })
      .returning({ id: sourceObservations.id });

    const result = {
      provider: PROVIDER_CODE,
      providerFixtureId: "950001",
      status: input.status,
      homeScore: input.homeScore ?? null,
      awayScore: input.awayScore ?? null,
      observedAt: "2026-09-20T20:00:00.000Z",
    };
    const settlementInstructions = orchestrateResultSettlement(result, [
      {
        decisionId: input.decisionId,
        market: input.market,
        selection: input.selection,
      },
    ]);
    const repository = new DatabaseResultSettlementRepository(database);
    return repository.append({
      providerId: referenceData.providerId,
      sourceObservationId: source!.id,
      result,
      settlements: settlementInstructions,
      settlementRuleVersion: `${input.market}.v1`,
    });
  }

  it("[settlement: 1X2] DRAW and AWAY selections settle correctly for the same real result", async () => {
    const draw = await persistDecision({
      decisionStatus: "STRONG_EDGE",
      modelProbability: "0.27",
      offeredOdds: "3.6",
      eventMarketOutcomeId: outcomeIdBySelection.DRAW,
      selection: "DRAW",
    });
    const away = await persistDecision({
      decisionStatus: "STRONG_EDGE",
      modelProbability: "0.24",
      offeredOdds: "4.2",
      eventMarketOutcomeId: outcomeIdBySelection.AWAY,
      selection: "AWAY",
    });

    // A real 1-1 final: DRAW selection wins, AWAY and (implicitly) HOME lose.
    const drawSettlement = await settleOnce({
      decisionId: draw.id,
      market: "1X2",
      selection: "DRAW",
      status: "FINAL",
      homeScore: 1,
      awayScore: 1,
      contentHash: "sha256:draw-away-test-1-1-draw",
    });
    expect(drawSettlement.settlements[0]?.outcome).toBe("WIN");

    // A real 1-2 final: AWAY selection wins.
    const awaySettlement = await settleOnce({
      decisionId: away.id,
      market: "1X2",
      selection: "AWAY",
      status: "FINAL",
      homeScore: 1,
      awayScore: 2,
      contentHash: "sha256:draw-away-test-1-2-away",
    });
    expect(awaySettlement.settlements[0]?.outcome).toBe("WIN");
  });

  it("[settlement: O/U 2.5] OVER and UNDER settle correctly for real total-goals results", async () => {
    const over = await persistDecision({
      decisionStatus: "STRONG_EDGE",
      modelProbability: "0.55",
      offeredOdds: "1.9",
      eventMarketOutcomeId: outcomeIdBySelection.OVER,
      selection: "OVER",
    });
    const under = await persistDecision({
      decisionStatus: "STRONG_EDGE",
      modelProbability: "0.5",
      offeredOdds: "1.95",
      eventMarketOutcomeId: outcomeIdBySelection.UNDER,
      selection: "UNDER",
    });

    // 2-2 = 4 total goals: OVER 2.5 wins.
    const overSettlement = await settleOnce({
      decisionId: over.id,
      market: "OVER_UNDER_2_5",
      selection: "OVER",
      status: "FINAL",
      homeScore: 2,
      awayScore: 2,
      contentHash: "sha256:over-under-test-2-2-over",
    });
    expect(overSettlement.settlements[0]?.outcome).toBe("WIN");

    // 1-0 = 1 total goal: UNDER 2.5 wins.
    const underSettlement = await settleOnce({
      decisionId: under.id,
      market: "OVER_UNDER_2_5",
      selection: "UNDER",
      status: "FINAL",
      homeScore: 1,
      awayScore: 0,
      contentHash: "sha256:over-under-test-1-0-under",
    });
    expect(underSettlement.settlements[0]?.outcome).toBe("WIN");
  });

  it("[settlement: VOID] a cancelled or abandoned fixture voids the decision rather than guessing an outcome", async () => {
    const cancelled = await persistDecision({
      decisionStatus: "STRONG_EDGE",
      modelProbability: "0.6",
      offeredOdds: "1.85",
    });
    const cancelledSettlement = await settleOnce({
      decisionId: cancelled.id,
      market: "1X2",
      selection: "HOME",
      status: "CANCELLED",
      contentHash: "sha256:void-test-cancelled",
    });
    expect(cancelledSettlement.settlements[0]?.outcome).toBe("VOID");

    const abandoned = await persistDecision({
      decisionStatus: "STRONG_EDGE",
      modelProbability: "0.6",
      offeredOdds: "1.85",
    });
    const abandonedSettlement = await settleOnce({
      decisionId: abandoned.id,
      market: "1X2",
      selection: "HOME",
      status: "ABANDONED",
      contentHash: "sha256:void-test-abandoned",
    });
    expect(abandonedSettlement.settlements[0]?.outcome).toBe("VOID");
  });

  it("[settlement: UNSETTLED] a FINAL status with no scores yet never guesses a winner", async () => {
    /*
     * A genuinely ambiguous/incomplete provider payload -- FINAL without
     * scores should never happen for a real provider, but if it does,
     * settleDecision must fail closed rather than treat missing scores as
     * 0-0 or silently pick a winner.
     */
    const decision = await persistDecision({
      decisionStatus: "STRONG_EDGE",
      modelProbability: "0.6",
      offeredOdds: "1.85",
    });
    const settlement = await settleOnce({
      decisionId: decision.id,
      market: "1X2",
      selection: "HOME",
      status: "FINAL",
      contentHash: "sha256:unsettled-test-missing-scores",
    });
    expect(settlement.settlements[0]?.outcome).toBe("UNSETTLED");
  });

  /* --------------------------------------------------------- result pass */

  /*
   * The unit tests prove the orchestrator's budgeting and the normalizer's
   * status mapping. What only a real database can prove is the part in
   * between: that a provider payload becomes a stored result, that the
   * settlement candidates are actually recovered from `decisions` by joining
   * out to the market definition (which is the only way to learn a decision's
   * market, since the table has no market column), and that replaying the
   * same payload writes nothing the second time.
   */
  describe("ingestFootballResults", () => {
    function providerRecord(
      overrides: Record<string, unknown> = {},
      goals: Record<string, unknown> = {},
      score: Record<string, unknown> = {},
    ) {
      return {
        fixture: {
          id: 950001,
          date: "2026-09-20T18:00:00.000Z",
          timestamp: 1_789_237_800,
          status: { short: "FT" },
          ...overrides,
        },
        goals: { home: 2, away: 0, ...goals },
        score,
      };
    }

    it("stores a result and settles the decisions it answers", async () => {
      const decision = await persistDecision({
        decisionStatus: "STRONG_EDGE",
        modelProbability: "0.55",
        offeredOdds: "2.10",
        selection: "HOME",
        eventMarketOutcomeId: outcomeIdBySelection.HOME,
      });

      const summary = await ingestFootballResults(database, {
        providerId: referenceData.providerId,
        results: [normalizeFootballResult(providerRecord())],
        policyVersionId: referenceData.policyVersionId,
      });

      expect(summary.received).toBe(1);
      expect(summary.written).toBe(1);
      expect(summary.duplicate).toBe(0);
      expect(summary.settlementsWritten).toBeGreaterThanOrEqual(1);
      expect(summary.statusByProviderFixtureId["950001"]).toBe("FINAL");

      const settled = await database
        .select({
          outcome: marketSettlements.outcome,
          ruleVersion: marketSettlements.settlementRuleVersion,
        })
        .from(marketSettlements)
        .where(eq(marketSettlements.decisionId, decision.id));

      /* Home won 2-0 and the decision selected HOME, so this is a WIN --
         and the rule version is the canonical one, not an ad-hoc string. */
      expect(settled[0]?.outcome).toBe("WIN");
      expect(settled[0]?.ruleVersion).toBe(
        canonicalMarketDefinitions.FOOTBALL_FULL_TIME_1X2.settlementRuleVersion,
      );
    });

    /*
     * Idempotency is what makes the pass safe to re-run, and it comes from
     * the source observation's content hash rather than from any
     * already-settled filter. A provider that reports the same result twice
     * must not double-write.
     */
    it("writes nothing when the identical result is reported again", async () => {
      const results = [normalizeFootballResult(providerRecord())];
      const first = await ingestFootballResults(database, {
        providerId: referenceData.providerId,
        results,
        policyVersionId: referenceData.policyVersionId,
      });
      const second = await ingestFootballResults(database, {
        providerId: referenceData.providerId,
        results,
        policyVersionId: referenceData.policyVersionId,
      });

      expect(second.written).toBe(0);
      expect(second.duplicate).toBe(1);
      expect(second.settlementsWritten).toBe(0);
      /* The marker still learns the status, even from a duplicate: that is
         what stops the fixture being asked about again. */
      expect(second.statusByProviderFixtureId["950001"]).toBe("FINAL");
      expect(first.written + second.written).toBe(first.written);
    });

    it("settles 1X2 and O/U 2.5 from the normalized AET regulation score", async () => {
      const draw = await persistDecision({
        decisionStatus: "STRONG_EDGE",
        modelProbability: "0.3",
        offeredOdds: "3.5",
        selection: "DRAW",
        eventMarketOutcomeId: outcomeIdBySelection.DRAW,
      });
      const over = await persistDecision({
        decisionStatus: "STRONG_EDGE",
        modelProbability: "0.55",
        offeredOdds: "1.9",
        selection: "OVER",
        eventMarketOutcomeId: outcomeIdBySelection.OVER,
      });
      const observedAt = 1_789_310_000;

      const summary = await ingestFootballResults(database, {
        providerId: referenceData.providerId,
        results: [
          normalizeFootballResult(
            providerRecord(
              { status: { short: "AET" }, timestamp: observedAt },
              { home: 2, away: 1 },
              {
                fulltime: { home: 1, away: 1 },
                extratime: { home: 2, away: 1 },
              },
            ),
          ),
        ],
        policyVersionId: referenceData.policyVersionId,
      });

      expect(summary.written).toBe(1);
      expect(summary.settlementsWritten).toBeGreaterThanOrEqual(2);

      const [stored] = await database
        .select({
          homeScore: eventResults.homeScore,
          awayScore: eventResults.awayScore,
        })
        .from(eventResults)
        .where(
          eq(eventResults.providerObservedAt, new Date(observedAt * 1000)),
        );
      expect(stored).toEqual({ homeScore: 1, awayScore: 1 });

      const drawSettlements = await database
        .select({ outcome: marketSettlements.outcome })
        .from(marketSettlements)
        .where(eq(marketSettlements.decisionId, draw.id));
      const overSettlements = await database
        .select({ outcome: marketSettlements.outcome })
        .from(marketSettlements)
        .where(eq(marketSettlements.decisionId, over.id));
      expect(drawSettlements).toEqual([{ outcome: "WIN" }]);
      expect(overSettlements).toEqual([{ outcome: "LOSS" }]);
    });

    it.each([
      { providerCode: "CANC", status: "CANCELLED", timestamp: 1_789_320_000 },
      { providerCode: "ABD", status: "ABANDONED", timestamp: 1_789_330_000 },
    ] as const)(
      "persists idempotent VOID settlements for $status 1X2 and O/U 2.5 decisions",
      async ({ providerCode, status, timestamp }) => {
        const home = await persistDecision({
          decisionStatus: "STRONG_EDGE",
          modelProbability: "0.55",
          offeredOdds: "2.1",
          selection: "HOME",
          eventMarketOutcomeId: outcomeIdBySelection.HOME,
        });
        const under = await persistDecision({
          decisionStatus: "STRONG_EDGE",
          modelProbability: "0.55",
          offeredOdds: "1.9",
          selection: "UNDER",
          eventMarketOutcomeId: outcomeIdBySelection.UNDER,
        });
        const results = [
          normalizeFootballResult(
            providerRecord({
              status: { short: providerCode },
              timestamp,
            }),
          ),
        ];

        const first = await ingestFootballResults(database, {
          providerId: referenceData.providerId,
          results,
          policyVersionId: referenceData.policyVersionId,
        });
        const replay = await ingestFootballResults(database, {
          providerId: referenceData.providerId,
          results,
          policyVersionId: referenceData.policyVersionId,
        });

        expect(first.written).toBe(1);
        expect(first.settlementsWritten).toBeGreaterThanOrEqual(2);
        expect(first.statusByProviderFixtureId["950001"]).toBe(status);
        expect(replay).toMatchObject({
          written: 0,
          duplicate: 1,
          settlementsWritten: 0,
        });

        for (const decisionId of [home.id, under.id]) {
          const settlements = await database
            .select({ outcome: marketSettlements.outcome })
            .from(marketSettlements)
            .where(eq(marketSettlements.decisionId, decisionId));
          expect(settlements).toEqual([{ outcome: "VOID" }]);
        }
      },
    );

    /*
     * Stored nonterminal results tell the scheduler what to ask for next.
     * Running settlement over a half-time score would post real outcomes too
     * early, while POSTPONED has no separate settlement policy.
     */
    it.each([
      { providerCode: "HT", status: "IN_PROGRESS", timestamp: 1_789_240_000 },
      { providerCode: "PST", status: "POSTPONED", timestamp: 1_789_241_000 },
    ] as const)(
      "stores a $status match without settling anything",
      async ({ providerCode, status, timestamp }) => {
        const decision = await persistDecision({
          decisionStatus: "STRONG_EDGE",
          modelProbability: "0.55",
          offeredOdds: "2.10",
          selection: "DRAW",
          eventMarketOutcomeId: outcomeIdBySelection.DRAW,
        });

        const summary = await ingestFootballResults(database, {
          providerId: referenceData.providerId,
          results: [
            normalizeFootballResult(
              providerRecord(
                { status: { short: providerCode }, timestamp },
                { home: 1, away: 0 },
              ),
            ),
          ],
          policyVersionId: referenceData.policyVersionId,
        });

        expect(summary.written).toBe(1);
        expect(summary.settlementsWritten).toBe(0);
        expect(summary.statusByProviderFixtureId["950001"]).toBe(status);

        const settled = await database
          .select({ id: marketSettlements.id })
          .from(marketSettlements)
          .where(eq(marketSettlements.decisionId, decision.id));
        expect(settled).toEqual([]);
      },
    );

    /*
     * One unresolvable fixture must not discard the rest of a batch of
     * twenty, and it must be named rather than silently dropped.
     */
    it("skips a fixture with no event identity and keeps the rest of the batch", async () => {
      const summary = await ingestFootballResults(database, {
        providerId: referenceData.providerId,
        results: [
          normalizeFootballResult(
            providerRecord({ id: 999999, timestamp: 1_789_250_000 }),
          ),
          normalizeFootballResult(
            providerRecord({ timestamp: 1_789_251_000 }, { home: 3, away: 1 }),
          ),
        ],
        policyVersionId: referenceData.policyVersionId,
      });

      expect(summary.received).toBe(2);
      expect(summary.written).toBe(1);
      expect(summary.skippedByReason["RESULT_EVENT_IDENTITY_NOT_FOUND"]).toBe(
        1,
      );
      /* The unresolvable fixture still reports its status, so the scheduler
         does not re-ask about it every fifteen minutes for three days. */
      expect(summary.statusByProviderFixtureId["999999"]).toBe("FINAL");
    });

    /*
     * A corrected score is a new observation, never an update: the original
     * result row stays exactly as reported, which is what makes the audit
     * trail meaningful.
     */
    it("records a corrected score as a new observation, leaving the first intact", async () => {
      await ingestFootballResults(database, {
        providerId: referenceData.providerId,
        results: [
          normalizeFootballResult(
            providerRecord({ timestamp: 1_789_260_000 }, { home: 1, away: 1 }),
          ),
        ],
        policyVersionId: referenceData.policyVersionId,
      });
      const corrected = await ingestFootballResults(database, {
        providerId: referenceData.providerId,
        results: [
          normalizeFootballResult(
            providerRecord({ timestamp: 1_789_261_000 }, { home: 1, away: 2 }),
          ),
        ],
        policyVersionId: referenceData.policyVersionId,
      });

      expect(corrected.written).toBe(1);
      expect(corrected.duplicate).toBe(0);

      const stored = await database
        .select({
          homeScore: eventResults.homeScore,
          awayScore: eventResults.awayScore,
        })
        .from(eventResults)
        .where(eq(eventResults.eventId, eventId));

      /* Both observations survive. Nothing was rewritten. */
      const scores = stored.map((row) => `${row.homeScore}-${row.awayScore}`);
      expect(scores).toContain("1-1");
      expect(scores).toContain("1-2");
    });

    /*
     * A refused decision has no position to win or lose, so settling it
     * would fabricate a performance record.
     */
    it("does not settle a decision the engine refused", async () => {
      /*
       * Built by copying a real decision row and changing only its status, so
       * the refused decision is identical to a settleable one in every other
       * respect -- same event, same market, same selection. Anything that
       * settles it is selecting on something other than the status.
       */
      const settleable = await persistDecision({
        decisionStatus: "STRONG_EDGE",
        modelProbability: "0.55",
        offeredOdds: "2.10",
        selection: "AWAY",
        eventMarketOutcomeId: outcomeIdBySelection.AWAY,
      });
      const [refused] = await database
        .insert(decisions)
        .values({
          forecastId: settleable.forecastId,
          eventMarketOutcomeId: outcomeIdBySelection.AWAY,
          status: "NO_BET",
          selection: "AWAY",
          offeredOdds: settleable.offeredOdds,
          fairOdds: settleable.fairOdds,
          expectedValue: settleable.expectedValue,
          whyNotCodes: ["EDGE_TOO_SMALL"],
          decisionSnapshot: { refused: true },
        })
        .returning({ id: decisions.id });

      const summary = await ingestFootballResults(database, {
        providerId: referenceData.providerId,
        results: [
          normalizeFootballResult(
            providerRecord({ timestamp: 1_789_270_000 }, { home: 0, away: 2 }),
          ),
        ],
        policyVersionId: referenceData.policyVersionId,
      });
      expect(summary.written).toBe(1);

      /* AWAY won 0-2, so the settleable decision is a WIN -- which proves
         the result really did reach the settlement path on this event. */
      const settledWin = await database
        .select({ outcome: marketSettlements.outcome })
        .from(marketSettlements)
        .where(eq(marketSettlements.decisionId, settleable.id));
      expect(settledWin[0]?.outcome).toBe("WIN");

      /* The refused decision, on the same winning selection, gets nothing. */
      const settledRefused = await database
        .select({ id: marketSettlements.id })
        .from(marketSettlements)
        .where(eq(marketSettlements.decisionId, refused!.id));
      expect(settledRefused).toEqual([]);
    });

    /*
     * The CLV write path (mandate's "critical DB gate"): closingOdds/clv on
     * marketSettlements were previously always null in production, because
     * ingestFootballResults -- the only settlement writer actually wired in
     * -- never computed them. Proves the real fix against a real database:
     * two bookmakers' last observations before kickoff produce a real
     * closing-price median, and CLV is computed from the decision's own
     * offered price against that close, not fabricated.
     */
    it("computes and persists closingOdds/clv from real pre-kickoff odds observations", async () => {
      const decision = await persistDecision({
        decisionStatus: "STRONG_EDGE",
        modelProbability: "0.5",
        offeredOdds: "2.2",
        selection: "HOME",
        eventMarketOutcomeId: outcomeIdBySelection.HOME,
      });

      const [bookmakerA] = await database
        .insert(bookmakers)
        .values({
          code: "CLV_TEST_BOOK_A",
          displayName: "CLV Test Book A",
          synthetic: false,
        })
        .onConflictDoNothing({ target: [bookmakers.code] })
        .returning({ id: bookmakers.id });
      const bookmakerAId =
        bookmakerA?.id ??
        (
          await database
            .select({ id: bookmakers.id })
            .from(bookmakers)
            .where(eq(bookmakers.code, "CLV_TEST_BOOK_A"))
            .limit(1)
        )[0]!.id;

      const [bookmakerB] = await database
        .insert(bookmakers)
        .values({
          code: "CLV_TEST_BOOK_B",
          displayName: "CLV Test Book B",
          synthetic: false,
        })
        .onConflictDoNothing({ target: [bookmakers.code] })
        .returning({ id: bookmakers.id });
      const bookmakerBId =
        bookmakerB?.id ??
        (
          await database
            .select({ id: bookmakers.id })
            .from(bookmakers)
            .where(eq(bookmakers.code, "CLV_TEST_BOOK_B"))
            .limit(1)
        )[0]!.id;

      const { providerSyncRuns } = await import("../src/schema/operations.js");
      const [oddsSyncRun] = await database
        .insert(providerSyncRuns)
        .values({
          providerId: referenceData.providerId,
          capability: "ODDS",
          status: "COMPLETED",
          providerSchemaVersion: "api-sports.v1",
          normalizationVersion: "api-sports.v1",
          mappingVersion: "api-sports.v1",
          policyVersionId: referenceData.policyVersionId,
          startedAt: new Date(),
          completedAt: new Date(),
        })
        .returning({ id: providerSyncRuns.id });

      const [oddsSource] = await database
        .insert(sourceObservations)
        .values({
          providerId: referenceData.providerId,
          syncRunId: oddsSyncRun!.id,
          observationType: "ODDS",
          providerExternalId: "950001",
          providerObservedAt: new Date("2026-09-20T17:30:00.000Z"),
          receivedAt: new Date("2026-09-20T17:30:01.000Z"),
          normalizedAt: new Date("2026-09-20T17:30:01.000Z"),
          normalizationVersion: "api-sports.v1",
          mappingVersion: "api-sports.v1",
          contentHash: "sha256:clv-test-odds",
        })
        .returning({ id: sourceObservations.id });

      /*
       * Both at/before kickoff (18:00), 30 minutes apart -- well inside the
       * policy's 60-minute freshness cutoff, so both are eligible and the
       * closing price is their real median: (1.90 + 2.10) / 2 = 2.00.
       */
      await database.insert(oddsObservations).values([
        {
          sourceObservationId: oddsSource!.id,
          eventMarketOutcomeId: outcomeIdBySelection.HOME,
          bookmakerId: bookmakerAId,
          decimalOdds: "1.90",
          providerObservedAt: new Date("2026-09-20T17:00:00.000Z"),
          receivedAt: new Date("2026-09-20T17:00:01.000Z"),
          normalizedAt: new Date("2026-09-20T17:00:01.000Z"),
          status: "ACTIVE",
          isSynthetic: false,
        },
        {
          sourceObservationId: oddsSource!.id,
          eventMarketOutcomeId: outcomeIdBySelection.HOME,
          bookmakerId: bookmakerBId,
          decimalOdds: "2.10",
          providerObservedAt: new Date("2026-09-20T17:30:00.000Z"),
          receivedAt: new Date("2026-09-20T17:30:01.000Z"),
          normalizedAt: new Date("2026-09-20T17:30:01.000Z"),
          status: "ACTIVE",
          isSynthetic: false,
        },
      ]);

      const summary = await ingestFootballResults(database, {
        providerId: referenceData.providerId,
        results: [
          normalizeFootballResult(
            providerRecord({ timestamp: 1_789_300_000 }, { home: 3, away: 0 }),
          ),
        ],
        policyVersionId: referenceData.policyVersionId,
      });
      expect(
        summary.settlementsWritten,
        JSON.stringify(summary.skippedByReason),
      ).toBeGreaterThanOrEqual(1);

      const [settlement] = await database
        .select({
          outcome: marketSettlements.outcome,
          closingOdds: marketSettlements.closingOdds,
          clv: marketSettlements.clv,
        })
        .from(marketSettlements)
        .where(eq(marketSettlements.decisionId, decision.id));

      expect(settlement?.outcome).toBe("WIN");
      /* Median of 1.90 and 2.10 -- a real closing price, not a fabricated
         placeholder, and never null now that the write path is fixed. */
      expect(Number(settlement?.closingOdds)).toBeCloseTo(2.0, 8);
      /* CLV = offeredOdds / closingOdds - 1 = 2.2 / 2.0 - 1 = 0.1 exactly. */
      expect(Number(settlement?.clv)).toBeCloseTo(0.1, 8);
    });
  });
});
