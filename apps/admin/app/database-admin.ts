import { desc, eq } from "drizzle-orm";
import {
  DatabasePermissionResolver,
  type PrivilegedVelyqDatabase,
} from "@velyq/database";
import { createPrivilegedDatabaseClient } from "@velyq/database/client";
import {
  adminAuditEvents,
  dataQualityAssessments,
  predictionInputs,
  predictionRuns,
  predictions,
  providers,
  providerSyncRuns,
  scoreDefinitionVersions,
  scoreResults,
} from "@velyq/database";
import type { ProviderRun } from "@velyq/contracts";
import {
  createSupabaseAdminAuthenticator,
  type AdminPage,
  type AdminPredictionTraceDto,
  type AdminQualityDto,
  type AdminQueries,
  type AdminScoreDto,
} from "./admin-api";

const json = (value: unknown) => value as never;

function cursorOffset(cursor: string | null) {
  if (cursor === null) return 0;
  const value = Number.parseInt(cursor, 10);
  if (!/^\d+$/.test(cursor) || !Number.isInteger(value) || value < 0)
    throw new Error("INVALID_REQUEST");
  return value;
}

function nextCursor(offset: number, limit: number, count: number) {
  return count === limit ? String(offset + limit) : null;
}

function providerRun(
  row: typeof providerSyncRuns.$inferSelect,
  providerCode = row.providerId,
): ProviderRun {
  return {
    id: row.id,
    providerCode,
    sequenceName: row.replaySequence ?? "unknown",
    status: row.status as ProviderRun["status"],
    sourceFixtureHash: row.contentHash ?? "unknown",
    normalizedOutputHash: row.normalizedOutputHash,
    receivedCount: row.receivedCount,
    acceptedCount: row.acceptedCount,
    rejectedCount: row.rejectedCount,
    startedAt: row.startedAt?.toISOString() ?? "",
    completedAt: row.completedAt?.toISOString() ?? null,
    errorSummary: row.errorSummary as ProviderRun["errorSummary"],
  };
}

export class DatabaseAdminQueries implements AdminQueries {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async listProviderRuns(input: { limit: number; cursor: string | null }) {
    const offset = cursorOffset(input.cursor);
    const rows = await this.database
      .select({ run: providerSyncRuns, providerCode: providers.code })
      .from(providerSyncRuns)
      .innerJoin(providers, eq(providerSyncRuns.providerId, providers.id))
      .orderBy(desc(providerSyncRuns.startedAt), desc(providerSyncRuns.id))
      .limit(input.limit)
      .offset(offset);
    return {
      items: rows.map(({ run, providerCode }) =>
        providerRun(run, providerCode),
      ),
      nextCursor: nextCursor(offset, input.limit, rows.length),
    } satisfies AdminPage<ProviderRun>;
  }

  async getProviderRun(runId: string) {
    const [row] = await this.database
      .select({ run: providerSyncRuns, providerCode: providers.code })
      .from(providerSyncRuns)
      .innerJoin(providers, eq(providerSyncRuns.providerId, providers.id))
      .where(eq(providerSyncRuns.id, runId))
      .limit(1);
    if (!row) throw new Error("NOT_FOUND");
    return providerRun(row.run, row.providerCode);
  }

  async getPredictionTrace(
    predictionId: string,
  ): Promise<AdminPredictionTraceDto> {
    const [row] = await this.database
      .select({ prediction: predictions, run: predictionRuns })
      .from(predictions)
      .innerJoin(
        predictionRuns,
        eq(predictions.predictionRunId, predictionRuns.id),
      )
      .where(eq(predictions.id, predictionId))
      .limit(1);
    if (!row) throw new Error("NOT_FOUND");
    const inputs = await this.database
      .select({ sourceObservationId: predictionInputs.sourceObservationId })
      .from(predictionInputs)
      .where(eq(predictionInputs.predictionId, predictionId));
    return {
      predictionId: row.prediction.id,
      predictionRunId: row.run.id,
      eventId: row.run.eventId,
      eventMarketOutcomeId: row.prediction.eventMarketOutcomeId,
      modelVersionId: row.run.modelVersionId,
      calibrationVersionId: row.run.calibrationVersionId,
      featureCutoff: row.run.featureCutoff.toISOString(),
      status: row.run.status,
      decisionStatus: row.prediction.decisionStatus,
      modelProbability: row.prediction.modelProbability,
      confidence: row.prediction.confidence,
      fairOdds: row.prediction.fairOdds,
      marketImpliedProbability: row.prediction.marketImpliedProbability,
      edge: row.prediction.edge,
      expectedValue: row.prediction.expectedValue,
      reasonCodes: row.prediction.reasonCodes,
      structuredReasons: json(row.prediction.structuredReasons),
      sourceObservationIds: inputs.map((item) => item.sourceObservationId),
      dataQualityAssessmentId: row.prediction.dataQualityAssessmentId,
      marketPriceObservationId: row.prediction.marketPriceObservationId,
      createdAt: row.prediction.createdAt.toISOString(),
    };
  }

  async getScore(scoreId: string): Promise<AdminScoreDto> {
    const [row] = await this.database
      .select({ score: scoreResults, definition: scoreDefinitionVersions })
      .from(scoreResults)
      .innerJoin(
        scoreDefinitionVersions,
        eq(scoreResults.scoreDefinitionVersionId, scoreDefinitionVersions.id),
      )
      .where(eq(scoreResults.id, scoreId))
      .limit(1);
    if (!row) throw new Error("NOT_FOUND");
    return {
      id: row.score.id,
      scoreDefinitionVersionId: row.score.scoreDefinitionVersionId,
      scoreType: row.definition.scoreType as "EDGE" | "RADAR",
      validationStatus: "DEVELOPMENT_HEURISTIC",
      predictionId: row.score.predictionId,
      eventMarketOutcomeId: row.score.eventMarketOutcomeId,
      dataQualityAssessmentId: row.score.dataQualityAssessmentId,
      asOf: row.score.asOf.toISOString(),
      score: row.score.score,
      components: json(row.score.components),
      weights: json(row.score.weights),
      capsPenalties: json(row.score.capsPenalties),
      reasonCodes: row.score.reasonCodes,
      createdAt: row.score.createdAt.toISOString(),
    };
  }

  async getQuality(assessmentId: string): Promise<AdminQualityDto> {
    const row = await this.database.query.dataQualityAssessments.findFirst({
      where: eq(dataQualityAssessments.id, assessmentId),
    });
    if (!row) throw new Error("NOT_FOUND");
    return {
      id: row.id,
      policyVersionId: row.policyVersionId,
      eventId: row.eventId,
      marketOutcomeId: row.marketOutcomeId,
      asOf: row.asOf.toISOString(),
      grade: row.grade,
      numericScore: row.numericScore,
      components: json(row.components),
      reasonCodes: row.reasonCodes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listAudit(input: { limit: number; cursor: string | null }) {
    const offset = cursorOffset(input.cursor);
    const rows = await this.database
      .select()
      .from(adminAuditEvents)
      .orderBy(desc(adminAuditEvents.occurredAt), desc(adminAuditEvents.id))
      .limit(input.limit)
      .offset(offset);
    return {
      items: rows.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        requestId: row.requestId,
        occurredAt: row.occurredAt.toISOString(),
        metadata: json({
          beforeState: row.beforeState,
          afterState: row.afterState,
        }),
      })),
      nextCursor: nextCursor(offset, input.limit, rows.length),
    };
  }
}

export function createDatabaseAdminRuntime() {
  const connectionString = process.env["VELYQ_DATABASE_URL"];
  if (!connectionString) return null;
  const client = createPrivilegedDatabaseClient({ connectionString });
  const resolver = new DatabasePermissionResolver(client.database);
  const queries = new DatabaseAdminQueries(client.database);
  return {
    authenticator: createSupabaseAdminAuthenticator((userId) =>
      resolver.resolve(userId),
    ),
    queries,
    close: client.close,
  };
}
