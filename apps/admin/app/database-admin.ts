import { desc, eq, sql } from "drizzle-orm";
import { DatabasePermissionResolver } from "@velyq/database/repositories/permissions";
import type { PrivilegedVelyqDatabase } from "@velyq/database/server";
import { createPrivilegedDatabaseClient } from "@velyq/database/server";
import { adminAuditEvents } from "@velyq/database/schema/audit";
import {
  dataQualityAssessments,
  predictionInputs,
  predictionRuns,
  predictions,
  scoreDefinitionVersions,
  scoreResults,
} from "@velyq/database/schema/intelligence";
import { providers, providerSyncRuns } from "@velyq/database/schema/operations";
import type { ProviderRun } from "@velyq/contracts";
import type {
  AdminPage,
  AdminPredictionTraceDto,
  AdminQualityDto,
  AdminQueries,
  AdminIntelligenceOverviewDto,
  AdminScoreDto,
} from "./admin-api";
import { createSupabaseAdminAuthenticator } from "./admin-auth";

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

  async getIntelligenceOverview(): Promise<AdminIntelligenceOverviewDto> {
    const result = await this.database.execute(sql`
      with today_events as (select id, competition_id from catalog.events where starts_at >= date_trunc('day', now() at time zone 'utc') and starts_at < date_trunc('day', now() at time zone 'utc') + interval '1 day'),
      forecast_rows as (select f.*, em.event_id from intelligence.forecasts f join market.event_market_outcomes emo on emo.id=f.event_market_outcome_id join market.event_markets em on em.id=emo.event_market_id),
      decision_rows as (select d.*, em.event_id from intelligence.decisions d join market.event_market_outcomes emo on emo.id=d.event_market_outcome_id join market.event_markets em on em.id=emo.event_market_id)
      select
        (select count(*) from today_events)::int fixtures_discovered,
        (select count(distinct te.id) from today_events te join catalog.competition_identities ci on ci.competition_id=te.competition_id and ci.mapping_status='CONFIRMED')::int competition_mapped,
        (select count(distinct te.id) from today_events te where (select count(*) from catalog.event_participants ep where ep.event_id=te.id)=2)::int teams_resolved,
        (select count(distinct event_id) from forecast_rows where event_id in (select id from today_events))::int model_supported,
        (select count(distinct event_id) from forecast_rows where event_id in (select id from today_events))::int forecast_generated,
        (select count(distinct em.event_id) from market.odds_observations oo join market.event_market_outcomes emo on emo.id=oo.event_market_outcome_id join market.event_markets em on em.id=emo.event_market_id where em.event_id in (select id from today_events) and oo.status='ACTIVE')::int odds_available,
        (select count(distinct event_id) from decision_rows where event_id in (select id from today_events))::int decision_evaluated,
        (select count(*) from decision_rows where event_id in (select id from today_events) and status='STRONG_EDGE')::int edge,
        (select count(*) from decision_rows where event_id in (select id from today_events) and status in ('WAIT','EDGE_DISAPPEARED'))::int watch,
        (select count(*) from decision_rows where event_id in (select id from today_events) and status='NO_BET')::int no_bet,
        (select count(*) from decision_rows where event_id in (select id from today_events) and status='WAIT_FOR_LINEUP')::int wait_for_lineup,
        (select count(*) from decision_rows where event_id in (select id from today_events) and status='INSUFFICIENT_DATA')::int insufficient_data,
        (select count(*) from catalog.events e where e.starts_at < now() and e.status not in ('FINAL','CANCELLED','ABANDONED') and not exists(select 1 from intelligence.event_results er where er.event_id=e.id and er.status='FINAL'))::int events_awaiting_result,
        (select count(*) from intelligence.event_results where status='FINAL')::int final_results_received,
        (select count(*) from intelligence.decisions d where d.status='STRONG_EDGE' and not exists(select 1 from intelligence.market_settlements ms where ms.decision_id=d.id))::int settlements_pending,
        (select count(*) from intelligence.market_settlements where outcome<>'UNSETTLED')::int settlements_completed,
        (select count(*) from operations.provider_sync_runs where status='FAILED' and replay_sequence ilike '%result%')::int result_ingestion_failures,
        (select count(*) from intelligence.decisions d left join intelligence.market_settlements ms on ms.decision_id=d.id where d.status='STRONG_EDGE' and (ms.id is null or ms.outcome='UNSETTLED'))::int unsettled_actionable_decisions,
        (select max(completed_at) from operations.provider_sync_runs where status='COMPLETED' and replay_sequence ilike '%result%') last_successful_result_sync,
        (select max(settled_at) from intelligence.market_settlements) last_settlement_run
    `);
    const row = result.rows[0] as Record<string, unknown>;
    const blockerResult = await this.database.execute(
      sql`select code, count(*)::int count from intelligence.decisions d cross join lateral unnest(d.why_not_codes) code where d.created_at >= date_trunc('day', now() at time zone 'utc') group by code order by count desc, code`,
    );
    const blockers = Object.fromEntries(
      blockerResult.rows.map((item) => [
        String(item["code"]),
        Number(item["count"]),
      ]),
    );
    const healthResult = await this.database.execute(
      sql`select f.model_version, f.probability, ms.outcome from intelligence.forecasts f join intelligence.decisions d on d.forecast_id=f.id join intelligence.market_settlements ms on ms.decision_id=d.id where ms.outcome in ('WIN','LOSS') order by f.model_version`,
    );
    const grouped = new Map<
      string,
      { probability: number; actual: number }[]
    >();
    for (const item of healthResult.rows) {
      const version = String(item["model_version"]);
      const values = grouped.get(version) ?? [];
      values.push({
        probability: Number(item["probability"]),
        actual: item["outcome"] === "WIN" ? 1 : 0,
      });
      grouped.set(version, values);
    }
    const modelHealth = [...grouped].map(([modelVersion, values]) => {
      const enough = values.length >= 30;
      return {
        modelVersion,
        sampleCount: values.length,
        brierScore: enough
          ? values.reduce(
              (sum, value) => sum + (value.probability - value.actual) ** 2,
              0,
            ) / values.length
          : null,
        logLoss: enough
          ? -values.reduce(
              (sum, value) =>
                sum +
                value.actual * Math.log(Math.max(value.probability, 1e-12)) +
                (1 - value.actual) *
                  Math.log(Math.max(1 - value.probability, 1e-12)),
              0,
            ) / values.length
          : null,
        status: enough
          ? ("AVAILABLE" as const)
          : ("INSUFFICIENT_SAMPLE" as const),
      };
    });
    const count = (key: string) => Number(row[key] ?? 0);
    const timestamp = (key: string) =>
      row[key] ? new Date(String(row[key])).toISOString() : null;
    return {
      fixturesDiscovered: count("fixtures_discovered"),
      competitionMapped: count("competition_mapped"),
      teamsResolved: count("teams_resolved"),
      modelSupported: count("model_supported"),
      forecastGenerated: count("forecast_generated"),
      oddsAvailable: count("odds_available"),
      decisionEvaluated: count("decision_evaluated"),
      edge: count("edge"),
      watch: count("watch"),
      noBet: count("no_bet"),
      waitForLineup: count("wait_for_lineup"),
      insufficientData: count("insufficient_data"),
      blockers,
      eventsAwaitingResult: count("events_awaiting_result"),
      finalResultsReceived: count("final_results_received"),
      settlementsPending: count("settlements_pending"),
      settlementsCompleted: count("settlements_completed"),
      resultIngestionFailures: count("result_ingestion_failures"),
      unsettledActionableDecisions: count("unsettled_actionable_decisions"),
      lastSuccessfulResultSync: timestamp("last_successful_result_sync"),
      lastSettlementRun: timestamp("last_settlement_run"),
      modelHealth,
    };
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
