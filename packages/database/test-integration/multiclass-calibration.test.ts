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
  let homeEventMarketId = "";
  let awayEventMarketId = "";

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

    const makeSource = async (
      type: "ODDS" | "RESULT",
      suffix: string,
      timing?: { observedAt: Date | null; receivedAt: Date },
    ) => {
      const [source] = await database
        .insert(sourceObservations)
        .values({
          providerId: referenceData.providerId,
          syncRunId: syncRun!.id,
          observationType: type,
          providerExternalId: `multiclass-${suffix}`,
          providerObservedAt: timing
            ? timing.observedAt
            : new Date("2026-10-18T15:00:00.000Z"),
          receivedAt:
            timing?.receivedAt ?? new Date("2026-10-18T15:00:01.000Z"),
          normalizedAt:
            timing?.receivedAt ?? new Date("2026-10-18T15:00:01.000Z"),
          normalizationVersion: "test.v1",
          mappingVersion: "test.v1",
          contentHash: `sha256:multiclass-${suffix}`,
        })
        .returning({ id: sourceObservations.id });
      return source!.id;
    };

    const appendResult = async (input: {
      eventId: string;
      suffix: string;
      score: readonly [number, number];
      observedAt: string | null;
      receivedAt: string;
      createdAt: string;
    }) => {
      const observedAt =
        input.observedAt === null ? null : new Date(input.observedAt);
      const sourceId = await makeSource("RESULT", input.suffix, {
        observedAt,
        receivedAt: new Date(input.receivedAt),
      });
      await database.insert(eventResults).values({
        eventId: input.eventId,
        sourceObservationId: sourceId,
        status: "FINAL",
        homeScore: input.score[0],
        awayScore: input.score[1],
        providerObservedAt: observedAt,
        createdAt: new Date(input.createdAt),
      });
    };

    const resultSourceId = await makeSource("RESULT", "results");
    const inProgressResultSourceId = await makeSource(
      "RESULT",
      "in-progress-result",
    );
    const supersededFinalSourceId = await makeSource(
      "RESULT",
      "superseded-final-result",
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
      odds?: readonly [string, string, string];
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

      for (const bookmaker of insertedBookmakers) {
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
            decimalOdds: (input.odds ?? ["4", "2", "4"])[outcomeIndex]!,
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
      odds: ["4", "2", "4"],
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
    await database.insert(eventResults).values({
      eventId: coherent.eventId,
      sourceObservationId: supersededFinalSourceId,
      status: "FINAL",
      homeScore: 4,
      awayScore: 0,
      providerObservedAt: new Date(KICKOFF.getTime() + 3_600_000),
    });

    await appendResult({
      eventId: coherent.eventId,
      suffix: "newer-null-correction",
      score: [3, 3],
      observedAt: null,
      receivedAt: "2026-10-18T20:45:00.000Z",
      createdAt: "2026-10-18T20:46:00.000Z",
    });
    // Persisted later, but acquired before the draw correction. DESC NULLS
    // FIRST followed by created_at incorrectly makes this HOME the truth.
    await appendResult({
      eventId: coherent.eventId,
      suffix: "delayed-older-null",
      score: [4, 0],
      observedAt: null,
      receivedAt: "2026-10-18T19:00:00.000Z",
      createdAt: "2026-10-18T21:00:00.000Z",
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

    // Pre-kickoff features do not make a forecast available before kickoff
    // when the run itself only finishes after the event has started.
    await persistRun({
      eventId: coherent.eventId,
      eventMarketOutcomeIds: coherent.outcomeIds,
      probabilities: ["0.05", "0.05", "0.90"],
      featureCutoff: new Date(KICKOFF.getTime() - 600_000),
      completedAt: new Date(KICKOFF.getTime() + 600_000),
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

    const home = await persistSettledEvent({
      suffix: "home-truth",
      kickoff: new Date(KICKOFF.getTime() + 86_400_000),
      score: [3, 1],
      probabilities: ["0.60", "0.25", "0.15"],
      odds: ["2", "4", "4"],
    });
    homeEventMarketId = home.eventMarketId;
    // The genuine 18:30:45 provider update beats this unknown update acquired
    // at 18:00. Null does not mean newer than every known observation.
    await appendResult({
      eventId: home.eventId,
      suffix: "older-null-than-known",
      score: [0, 2],
      observedAt: null,
      receivedAt: "2026-10-19T18:00:00.000Z",
      createdAt: "2026-10-19T21:00:00.000Z",
    });
    const away = await persistSettledEvent({
      suffix: "away-truth",
      kickoff: new Date(KICKOFF.getTime() + 172_800_000),
      score: [0, 1],
      probabilities: ["0.20", "0.30", "0.50"],
      odds: ["4", "4", "2"],
    });
    awayEventMarketId = away.eventMarketId;
    await appendResult({
      eventId: away.eventId,
      suffix: "newer-null-than-known",
      score: [0, 3],
      observedAt: null,
      receivedAt: "2026-10-20T20:45:00.000Z",
      createdAt: "2026-10-20T20:46:00.000Z",
    });
    // Receipt alone must not replace a genuine provider update timestamp.
    await appendResult({
      eventId: away.eventId,
      suffix: "delayed-known-update",
      score: [3, 0],
      observedAt: "2026-10-20T19:00:00.000Z",
      receivedAt: "2026-10-20T22:00:00.000Z",
      createdAt: "2026-10-20T22:01:00.000Z",
    });
    for (let index = 0; index < 27; index += 1) {
      await persistSettledEvent({
        suffix: `draw-cohort-${index}`,
        kickoff: new Date(KICKOFF.getTime() + (index + 3) * 86_400_000),
        score: [1, 1],
        probabilities: ["0.25", "0.35", "0.40"],
        odds: ["4", "2", "4"],
      });
    }

    // A separate three-way market deliberately reuses HOME/DRAW/AWAY codes.
    // Without the exact market-definition filter it would produce another
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
      kickoff: new Date(KICKOFF.getTime() + 31 * 86_400_000),
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

  it("orders unknown provider updates by acquisition rather than delayed persistence", async () => {
    const rows = await queryMultiClassCalibrationRows(database);
    expect(
      rows.find((row) => row.eventMarketId === coherentEventMarketId),
    ).toMatchObject({
      trueOutcome: "DRAW",
      modelVersion: MODEL_VERSION,
      competitionCode: COMPETITION_CODE,
      seasonLabel: SEASON_LABEL,
      kickoff: KICKOFF,
    });
  });

  it("compares mixed known and unknown updates by provider time or receipt respectively", async () => {
    const rows = await queryMultiClassCalibrationRows(database);
    expect(
      rows.find((row) => row.eventMarketId === homeEventMarketId)?.trueOutcome,
    ).toBe("HOME");
    expect(
      rows.find((row) => row.eventMarketId === awayEventMarketId)?.trueOutcome,
    ).toBe("AWAY");
  });

  it("uses only settled 1X2 pre-kickoff rows with correct truth and grouping fields", async () => {
    const rows = (await queryMultiClassCalibrationRows(database)).filter(
      (row) => row.modelVersion === MODEL_VERSION,
    );

    expect(rows).toHaveLength(30);
    expect(
      rows.reduce(
        (counts, row) => ({
          ...counts,
          [row.trueOutcome]: counts[row.trueOutcome] + 1,
        }),
        { HOME: 0, DRAW: 0, AWAY: 0 },
      ),
    ).toEqual({ HOME: 1, DRAW: 28, AWAY: 1 });
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
    expect(calibration!.status).toBe("AVAILABLE");
    expect(calibration!.brierScore).toBeCloseTo(0.6228333333333332, 12);
    expect(calibration!.logLoss).toBeCloseTo(1.0199664096762973, 12);
    expect(calibration!.calibrationError).toBeCloseTo(0.4177777777777778, 12);
    expect(calibration!.baselineFrequencies).toEqual({
      home: 1 / 30,
      draw: 28 / 30,
      away: 1 / 30,
    });
    expect(calibration!.byCompetition).toEqual([
      expect.objectContaining({
        competitionCode: COMPETITION_CODE,
        sampleCount: rows.length,
        brierScore: expect.closeTo(0.6228333333333332, 12),
        logLoss: expect.closeTo(1.0199664096762973, 12),
      }),
    ]);
    expect(calibration!.bySeason).toEqual([
      expect.objectContaining({
        seasonLabel: SEASON_LABEL,
        sampleCount: rows.length,
        brierScore: expect.closeTo(0.6228333333333332, 12),
        logLoss: expect.closeTo(1.0199664096762973, 12),
      }),
    ]);
    expect(calibration!.noVigConsensus.sampleCount).toBe(rows.length);
    expect(calibration!.impliedMarket.sampleCount).toBe(rows.length);
    expect(calibration!.noVigConsensus.status).toBe("AVAILABLE");
    expect(calibration!.impliedMarket.status).toBe("AVAILABLE");
    expect(calibration!.noVigConsensus.brierScore).toBeCloseTo(0.375, 12);
    expect(calibration!.noVigConsensus.logLoss).toBeCloseTo(
      0.6931471805599453,
      12,
    );
    expect(calibration!.impliedMarket.brierScore).toBeCloseTo(0.375, 12);
    expect(calibration!.impliedMarket.logLoss).toBeCloseTo(
      0.6931471805599453,
      12,
    );
  });
});
