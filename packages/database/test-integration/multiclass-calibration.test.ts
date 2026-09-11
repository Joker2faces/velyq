import { afterAll, beforeAll, describe, expect, it } from "vitest";

// This real-Postgres contract intentionally exercises the admin consumer too.
// eslint-disable-next-line velyq/no-cross-package-relative-import
import { DatabaseAdminQueries } from "../../../apps/admin/app/database-admin.js";
import { createPrivilegedDatabaseClient } from "../src/client.js";
import { ensureFootballReferenceData } from "../src/repositories/odds-ingestion.js";
import { queryMultiClassCalibrationRows } from "../src/repositories/multiclass-calibration.js";
import { competitions, events } from "../src/schema/catalog.js";
import {
  calibrationVersions,
  dataQualityAssessments,
  dataQualityPolicyVersions,
  eventResults,
  forecasts,
  modelDefinitions,
  modelVersions,
  predictionRuns,
  predictions,
} from "../src/schema/intelligence.js";
import {
  bookmakers,
  eventMarketOutcomes,
  eventMarkets,
  marketDefinitions,
  oddsObservations,
  outcomeDefinitions,
} from "../src/schema/market.js";
import {
  providerSyncRuns,
  sourceObservations,
} from "../src/schema/operations.js";

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = createPrivilegedDatabaseClient({
  connectionString: DATABASE_URL,
});
const database = client.database;

const MODEL_VERSION = "multiclass-coherence-regression.v1";
const COMPETITION_CODE = "MULTICLASS_COHERENCE_TEST";
const SEASON_LABEL = "2026/27";
const KICKOFF = new Date("2026-10-18T16:30:45.678Z");

describe("multi-class calibration rows, against a real database", () => {
  let coherentEventMarketId = "";

  beforeAll(async () => {
    const referenceData = await ensureFootballReferenceData(
      database,
      "MULTICLASS_CALIBRATION_TEST",
    );

    const [competition] = await database
      .insert(competitions)
      .values({
        sportId: referenceData.sportId,
        code: COMPETITION_CODE,
        nameKey: "competition.multiclass_coherence_test",
        countryCode: "GR",
      })
      .returning({ id: competitions.id });

    const [modelDefinition] = await database
      .insert(modelDefinitions)
      .values({
        code: "MULTICLASS_COHERENCE_MODEL",
        displayName: "Multi-class coherence model",
        description: "Real-Postgres calibration regression fixture",
      })
      .returning({ id: modelDefinitions.id });
    const [modelVersion] = await database
      .insert(modelVersions)
      .values({
        modelDefinitionId: modelDefinition!.id,
        version: MODEL_VERSION,
        maturityStatus: "EXPERIMENTAL",
        validationStatus: "UNVALIDATED",
        featureContractVersion: "multiclass-coherence-test.v1",
      })
      .returning({ id: modelVersions.id });
    const [calibrationVersion] = await database
      .insert(calibrationVersions)
      .values({
        modelVersionId: modelVersion!.id,
        version: "none.v1",
        method: "NONE",
        parameters: {},
        validationStatus: "UNVALIDATED",
      })
      .returning({ id: calibrationVersions.id });
    const [qualityPolicy] = await database
      .insert(dataQualityPolicyVersions)
      .values({
        code: "MULTICLASS_COHERENCE_QUALITY",
        version: "v1",
        validationStatus: "UNVALIDATED",
        definition: {},
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      })
      .returning({ id: dataQualityPolicyVersions.id });
    const insertedBookmakers = await database
      .insert(bookmakers)
      .values([
        {
          code: "MULTICLASS_COHERENCE_BOOK_A",
          displayName: "Multi-class coherence book A",
          synthetic: true,
          marketClassification: "SHARP",
        },
        {
          code: "MULTICLASS_COHERENCE_BOOK_B",
          displayName: "Multi-class coherence book B",
          synthetic: true,
          marketClassification: "SHARP",
        },
      ])
      .returning({ id: bookmakers.id });
    const [syncRun] = await database
      .insert(providerSyncRuns)
      .values({
        providerId: referenceData.providerId,
        capability: "CALIBRATION_TEST",
        status: "COMPLETED",
        providerSchemaVersion: "test.v1",
        normalizationVersion: "test.v1",
        mappingVersion: "test.v1",
        policyVersionId: referenceData.policyVersionId,
        startedAt: new Date("2026-10-18T10:00:00.000Z"),
        completedAt: new Date("2026-10-18T10:00:01.000Z"),
      })
      .returning({ id: providerSyncRuns.id });

    const makeSource = async (type: "ODDS" | "RESULT", suffix: string) => {
      const [source] = await database
        .insert(sourceObservations)
        .values({
          providerId: referenceData.providerId,
          syncRunId: syncRun!.id,
          observationType: type,
          providerExternalId: `multiclass-${suffix}`,
          providerObservedAt: new Date("2026-10-18T15:00:00.000Z"),
          receivedAt: new Date("2026-10-18T15:00:01.000Z"),
          normalizedAt: new Date("2026-10-18T15:00:01.000Z"),
          normalizationVersion: "test.v1",
          mappingVersion: "test.v1",
          contentHash: `sha256:multiclass-${suffix}`,
        })
        .returning({ id: sourceObservations.id });
      return source!.id;
    };

    const resultSourceId = await makeSource("RESULT", "results");
    const inProgressResultSourceId = await makeSource(
      "RESULT",
      "in-progress-result",
    );
    const oddsSourceId = await makeSource("ODDS", "odds");

    const persistRun = async (input: {
      eventId: string;
      eventMarketOutcomeIds: Readonly<Record<"HOME" | "DRAW" | "AWAY", string>>;
      probabilities: readonly [string, string, string];
      featureCutoff: Date;
      completedAt: Date;
      status?: "COMPLETED" | "FAILED";
    }) => {
      const [run] = await database
        .insert(predictionRuns)
        .values({
          modelVersionId: modelVersion!.id,
          calibrationVersionId: calibrationVersion!.id,
          eventId: input.eventId,
          featureCutoff: input.featureCutoff,
          status: input.status ?? "COMPLETED",
          startedAt: new Date(input.completedAt.getTime() - 1_000),
          completedAt: input.completedAt,
        })
        .returning({ id: predictionRuns.id });

      for (const [index, outcome] of ["HOME", "DRAW", "AWAY"].entries()) {
        const eventMarketOutcomeId =
          input.eventMarketOutcomeIds[outcome as "HOME" | "DRAW" | "AWAY"];
        const [quality] = await database
          .insert(dataQualityAssessments)
          .values({
            policyVersionId: qualityPolicy!.id,
            eventId: input.eventId,
            marketOutcomeId: eventMarketOutcomeId,
            asOf: input.featureCutoff,
            grade: "A",
            numericScore: "1",
            components: {},
            reasonCodes: [],
          })
          .returning({ id: dataQualityAssessments.id });
        const [prediction] = await database
          .insert(predictions)
          .values({
            predictionRunId: run!.id,
            eventMarketOutcomeId,
            dataQualityAssessmentId: quality!.id,
            decisionStatus: "NO_BET",
            modelProbability: input.probabilities[index]!,
            reasonCodes: [],
            structuredReasons: {},
          })
          .returning({ id: predictions.id });
        await database.insert(forecasts).values({
          predictionId: prediction!.id,
          eventMarketOutcomeId,
          probability: input.probabilities[index]!,
          modelVersion: MODEL_VERSION,
          featureCutoff: input.featureCutoff,
        });
      }
    };

    const persistSettledEvent = async (input: {
      suffix: string;
      kickoff: Date;
      score: readonly [number, number];
      probabilities: readonly [string, string, string];
      seasonLabel?: string;
      futureOnly?: boolean;
    }) => {
      const [event] = await database
        .insert(events)
        .values({
          sportId: referenceData.sportId,
          competitionId: competition!.id,
          seasonLabel: input.seasonLabel ?? SEASON_LABEL,
          startsAt: input.kickoff,
          status: "FINAL",
          synthetic: true,
        })
        .returning({ id: events.id });
      const [eventMarket] = await database
        .insert(eventMarkets)
        .values({
          eventId: event!.id,
          marketDefinitionId: referenceData.marketDefinitionId,
          subjectParticipantId: null,
          lineValue: null,
          canonicalKey: `multiclass:${input.suffix}:1x2`,
        })
        .returning({ id: eventMarkets.id });

      const outcomeIds = { HOME: "", DRAW: "", AWAY: "" };
      for (const outcome of ["HOME", "DRAW", "AWAY"] as const) {
        const [row] = await database
          .insert(eventMarketOutcomes)
          .values({
            eventMarketId: eventMarket!.id,
            marketDefinitionId: referenceData.marketDefinitionId,
            outcomeDefinitionId: referenceData.outcomeDefinitionIds[outcome],
            canonicalKey: `multiclass:${input.suffix}:1x2:${outcome}`,
          })
          .returning({ id: eventMarketOutcomes.id });
        outcomeIds[outcome] = row!.id;
      }

      await database.insert(eventResults).values({
        eventId: event!.id,
        sourceObservationId: resultSourceId,
        status: "FINAL",
        homeScore: input.score[0],
        awayScore: input.score[1],
        providerObservedAt: new Date(input.kickoff.getTime() + 7_200_000),
      });
      await persistRun({
        eventId: event!.id,
        eventMarketOutcomeIds: outcomeIds,
        probabilities: input.probabilities,
        featureCutoff: new Date(
          input.kickoff.getTime() + (input.futureOnly ? 3_600_000 : -7_200_000),
        ),
        completedAt: new Date(
          input.kickoff.getTime() + (input.futureOnly ? 3_601_000 : -7_199_000),
        ),
      });

      for (const [bookmakerIndex, bookmaker] of insertedBookmakers.entries()) {
        for (const [outcomeIndex, outcome] of [
          "HOME",
          "DRAW",
          "AWAY",
        ].entries()) {
          await database.insert(oddsObservations).values({
            sourceObservationId: oddsSourceId,
            eventMarketOutcomeId:
              outcomeIds[outcome as "HOME" | "DRAW" | "AWAY"],
            bookmakerId: bookmaker.id,
            decimalOdds: [
              ["2.20", "3.40", "3.10"],
              ["2.15", "3.50", "3.20"],
            ][bookmakerIndex]![outcomeIndex]!,
            providerObservedAt: new Date(input.kickoff.getTime() - 3_600_000),
            receivedAt: new Date(input.kickoff.getTime() - 3_599_000),
            normalizedAt: new Date(input.kickoff.getTime() - 3_599_000),
            status: "ACTIVE",
            isSynthetic: true,
          });
        }
      }

      return {
        eventId: event!.id,
        eventMarketId: eventMarket!.id,
        outcomeIds,
      };
    };

    const coherent = await persistSettledEvent({
      suffix: "coherent",
      kickoff: KICKOFF,
      score: [2, 2],
      probabilities: ["0.70", "0.20", "0.10"],
    });
    coherentEventMarketId = coherent.eventMarketId;
    await database.insert(eventResults).values({
      eventId: coherent.eventId,
      sourceObservationId: inProgressResultSourceId,
      status: "IN_PROGRESS",
      homeScore: 5,
      awayScore: 0,
      providerObservedAt: new Date(KICKOFF.getTime() - 1_800_000),
    });

    // A later valid recomputation must win as one whole vector. Restoring
    // the former independent MAX() aggregation makes this [0.70, 0.35, 0.40]
    // instead of the real second forecast [0.25, 0.35, 0.40].
    await persistRun({
      eventId: coherent.eventId,
      eventMarketOutcomeIds: coherent.outcomeIds,
      probabilities: ["0.25", "0.35", "0.40"],
      featureCutoff: new Date(KICKOFF.getTime() - 3_600_000),
      completedAt: new Date(KICKOFF.getTime() - 3_599_000),
    });

    // A newer failed run is not a forecast the product actually completed.
    await persistRun({
      eventId: coherent.eventId,
      eventMarketOutcomeIds: coherent.outcomeIds,
      probabilities: ["0.88", "0.07", "0.05"],
      featureCutoff: new Date(KICKOFF.getTime() - 1_800_000),
      completedAt: new Date(KICKOFF.getTime() - 1_799_000),
      status: "FAILED",
    });

    // Even when it completed later, a forecast whose feature cutoff is after
    // kickoff has future knowledge and must not enter calibration.
    await persistRun({
      eventId: coherent.eventId,
      eventMarketOutcomeIds: coherent.outcomeIds,
      probabilities: ["0.95", "0.03", "0.02"],
      featureCutoff: new Date(KICKOFF.getTime() + 3_600_000),
      completedAt: new Date(KICKOFF.getTime() + 3_601_000),
    });

    await persistSettledEvent({
      suffix: "home-truth",
      kickoff: new Date(KICKOFF.getTime() + 86_400_000),
      score: [3, 1],
      probabilities: ["0.60", "0.25", "0.15"],
    });
    await persistSettledEvent({
      suffix: "away-truth",
      kickoff: new Date(KICKOFF.getTime() + 172_800_000),
      score: [0, 1],
      probabilities: ["0.20", "0.30", "0.50"],
    });

    // A separate three-way market deliberately reuses HOME/DRAW/AWAY codes.
    // Without the exact market-definition filter it would produce a fourth
    // apparently valid row and silently contaminate full-time calibration.
    const [otherDefinition] = await database
      .insert(marketDefinitions)
      .values({
        sportId: referenceData.sportId,
        code: "FOOTBALL_HALF_TIME_1X2_CALIBRATION_TEST",
        familyCode: "MATCH_WINNER_1X2",
        periodCode: "FIRST_HALF",
        structure: "THREE_WAY",
        subjectType: "EVENT",
        lineRequired: false,
        lineRules: {},
        settlementRuleVersion: "test.v1",
        labelKey: "market.football_half_time_1x2_calibration_test",
      })
      .returning({ id: marketDefinitions.id });
    const otherOutcomeIds = { HOME: "", DRAW: "", AWAY: "" };
    for (const [sortOrder, outcome] of ["HOME", "DRAW", "AWAY"].entries()) {
      const [row] = await database
        .insert(outcomeDefinitions)
        .values({
          marketDefinitionId: otherDefinition!.id,
          code: outcome,
          labelKey: `market.football_half_time_1x2_calibration_test.${outcome.toLowerCase()}`,
          sortOrder,
        })
        .returning({ id: outcomeDefinitions.id });
      otherOutcomeIds[outcome as "HOME" | "DRAW" | "AWAY"] = row!.id;
    }
    const [otherMarket] = await database
      .insert(eventMarkets)
      .values({
        eventId: coherent.eventId,
        marketDefinitionId: otherDefinition!.id,
        subjectParticipantId: null,
        lineValue: null,
        canonicalKey: "multiclass:coherent:other-market",
      })
      .returning({ id: eventMarkets.id });
    const otherEventMarketOutcomeIds = { HOME: "", DRAW: "", AWAY: "" };
    for (const outcome of ["HOME", "DRAW", "AWAY"] as const) {
      const [row] = await database
        .insert(eventMarketOutcomes)
        .values({
          eventMarketId: otherMarket!.id,
          marketDefinitionId: otherDefinition!.id,
          outcomeDefinitionId: otherOutcomeIds[outcome],
          canonicalKey: `multiclass:coherent:other-market:${outcome}`,
        })
        .returning({ id: eventMarketOutcomes.id });
      otherEventMarketOutcomeIds[outcome] = row!.id;
    }
    await persistRun({
      eventId: coherent.eventId,
      eventMarketOutcomeIds: otherEventMarketOutcomeIds,
      probabilities: ["0.33", "0.34", "0.33"],
      featureCutoff: new Date(KICKOFF.getTime() - 1_800_000),
      completedAt: new Date(KICKOFF.getTime() - 1_799_000),
    });

    // A settled event with only post-kickoff forecasts must contribute no
    // row at all, not a leaky row merely because it is the latest run.
    await persistSettledEvent({
      suffix: "future-only",
      kickoff: new Date(KICKOFF.getTime() + 259_200_000),
      score: [1, 0],
      probabilities: ["0.55", "0.25", "0.20"],
      futureOnly: true,
    });
  });

  afterAll(async () => {
    await client.close();
  });

  it("takes HOME, DRAW, and AWAY from the same latest eligible prediction run", async () => {
    const rows = (await queryMultiClassCalibrationRows(database)).filter(
      (row) => row.modelVersion === MODEL_VERSION,
    );
    const coherent = rows.find(
      (row) => row.eventMarketId === coherentEventMarketId,
    );
    expect(coherent).toBeDefined();
    expect([
      Number(coherent!.probabilityHome),
      Number(coherent!.probabilityDraw),
      Number(coherent!.probabilityAway),
    ]).toEqual([0.25, 0.35, 0.4]);
  });

  it("uses only settled 1X2 pre-kickoff rows with correct truth and grouping fields", async () => {
    const rows = (await queryMultiClassCalibrationRows(database)).filter(
      (row) => row.modelVersion === MODEL_VERSION,
    );

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.trueOutcome).sort()).toEqual([
      "AWAY",
      "DRAW",
      "HOME",
    ]);
    const coherent = rows.find(
      (row) => row.eventMarketId === coherentEventMarketId,
    );
    expect(coherent).toBeDefined();
    expect(coherent!.trueOutcome).toBe("DRAW");
    expect(coherent!.kickoff).toBeInstanceOf(Date);
    expect(coherent!.kickoff.getTime()).toBe(KICKOFF.getTime());
    expect(coherent!.competitionCode).toBe(COMPETITION_CODE);
    expect(coherent!.seasonLabel).toBe(SEASON_LABEL);
  });

  it("feeds admin calibration and both market baselines from that same coherent row set", async () => {
    const rows = (await queryMultiClassCalibrationRows(database)).filter(
      (row) => row.modelVersion === MODEL_VERSION,
    );

    const overview = await new DatabaseAdminQueries(
      database,
    ).getIntelligenceOverview();
    const calibration = overview.multiClassCalibration.find(
      (entry) => entry.modelVersion === MODEL_VERSION,
    );
    expect(calibration).toBeDefined();
    expect(calibration!.sampleCount).toBe(rows.length);
    expect(calibration!.byCompetition).toEqual([
      expect.objectContaining({
        competitionCode: COMPETITION_CODE,
        sampleCount: rows.length,
      }),
    ]);
    expect(calibration!.bySeason).toEqual([
      expect.objectContaining({
        seasonLabel: SEASON_LABEL,
        sampleCount: rows.length,
      }),
    ]);
    expect(calibration!.noVigConsensus.sampleCount).toBe(rows.length);
    expect(calibration!.impliedMarket.sampleCount).toBe(rows.length);
  });
});
