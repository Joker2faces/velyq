import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { orchestrateResultSettlement } from "@velyq/application";
import { canonicalMarketDefinitions } from "@velyq/market-semantics";
import type { NormalizedEvent } from "@velyq/providers";
import { teamAliasLookupFor } from "@velyq/providers";

import { createPrivilegedDatabaseClient } from "../src/client.js";
import {
  ingestFootballFixture,
  loadCompetitionBridge,
} from "../src/repositories/fixture-ingestion.js";
import { ensureFootballReferenceData } from "../src/repositories/odds-ingestion.js";
import { DatabaseResultSettlementRepository } from "../src/repositories/result-settlement.js";
import { DatabaseHistoryQueryAdapter } from "../src/repositories/history.js";
import {
  calibrationVersions,
  dataQualityAssessments,
  dataQualityPolicyVersions,
  decisions,
  forecasts,
  modelDefinitions,
  modelVersions,
  predictionRuns,
  predictions,
} from "../src/schema/intelligence.js";
import { competitionIdentities, competitions } from "../src/schema/catalog.js";
import { eventMarketOutcomes, eventMarkets } from "../src/schema/market.js";
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
});
