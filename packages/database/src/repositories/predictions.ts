import { and, desc, eq, inArray, lte } from "drizzle-orm";

import type {
  PrivilegedVelyqDatabase,
  RepositoryTransaction,
} from "../client.js";
import {
  predictionInputs,
  predictionRuns,
  predictions,
} from "../schema/intelligence.js";
import {
  eventMarketOutcomes,
  eventMarkets,
  oddsObservations,
} from "../schema/market.js";
import { sourceObservations } from "../schema/operations.js";

export type PredictionObservationRead = Readonly<{
  id: string;
  eventId: string;
  eventMarketOutcomeId: string;
  receivedAt: string;
  decimalOdds: string;
}>;

/**
 * Reads persisted odds lineage for the prediction worker's cutoff guard.
 * Only canonical market joins are returned; provider payloads never cross
 * this adapter boundary.
 */
export class DatabasePredictionObservationReader {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async getByIds(
    ids: readonly string[],
  ): Promise<readonly PredictionObservationRead[]> {
    if (ids.length === 0) return [];
    const rows = await this.database
      .select({
        id: sourceObservations.id,
        eventId: eventMarkets.eventId,
        eventMarketOutcomeId: oddsObservations.eventMarketOutcomeId,
        receivedAt: oddsObservations.receivedAt,
        decimalOdds: oddsObservations.decimalOdds,
      })
      .from(oddsObservations)
      .innerJoin(
        eventMarketOutcomes,
        eq(oddsObservations.eventMarketOutcomeId, eventMarketOutcomes.id),
      )
      .innerJoin(
        eventMarkets,
        eq(eventMarketOutcomes.eventMarketId, eventMarkets.id),
      )
      .innerJoin(
        sourceObservations,
        eq(oddsObservations.sourceObservationId, sourceObservations.id),
      )
      .where(inArray(sourceObservations.id, [...ids]));

    return rows.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      eventMarketOutcomeId: row.eventMarketOutcomeId,
      receivedAt: row.receivedAt.toISOString(),
      decimalOdds: row.decimalOdds,
    }));
  }
}

export type AppendPredictionInput = Readonly<{
  run: Readonly<{
    id?: string;
    modelVersionId: string;
    calibrationVersionId: string;
    eventId: string;
    featureCutoff: Date;
    status: string;
    startedAt?: Date | null;
    completedAt?: Date | null;
    triggerJobId?: string | null;
  }>;
  prediction: Readonly<{
    id?: string;
    eventMarketOutcomeId: string;
    dataQualityAssessmentId: string;
    marketPriceObservationId?: string | null;
    decisionStatus: string;
    modelProbability?: string | null;
    confidence?: string | null;
    fairOdds?: string | null;
    marketImpliedProbability?: string | null;
    edge?: string | null;
    expectedValue?: string | null;
    reasonCodes: readonly string[];
    structuredReasons: Record<string, unknown>;
    createdAt?: Date;
  }>;
  inputs: readonly Readonly<{
    sourceObservationId: string;
    inputRole: string;
    createdAt?: Date;
  }>[];
}>;

export type PersistedPrediction = Readonly<{
  run: typeof predictionRuns.$inferSelect;
  prediction: typeof predictions.$inferSelect;
  inputs: readonly (typeof predictionInputs.$inferSelect)[];
}>;

type PredictionJoin = Readonly<{
  run: typeof predictionRuns.$inferSelect;
  prediction: typeof predictions.$inferSelect;
}>;

/**
 * Durable append-only prediction writer and as-of reader.
 *
 * The run, prediction, and lineage rows are committed in one transaction.
 * Trigger jobs and run/outcome pairs both have database-enforced uniqueness;
 * lookup/reuse keeps retries observationally idempotent.
 */
export class DatabasePredictionRepository {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async append(input: AppendPredictionInput): Promise<PersistedPrediction> {
    return this.database.transaction((transaction) =>
      this.appendInTransaction(transaction, input),
    );
  }

  async getLatestAsOf(
    eventMarketOutcomeId: string,
    asOf: Date,
  ): Promise<PersistedPrediction | null> {
    const [joined] = await this.database
      .select({ run: predictionRuns, prediction: predictions })
      .from(predictions)
      .innerJoin(
        predictionRuns,
        eq(predictions.predictionRunId, predictionRuns.id),
      )
      .where(
        and(
          eq(predictions.eventMarketOutcomeId, eventMarketOutcomeId),
          lte(predictions.createdAt, asOf),
          lte(predictionRuns.featureCutoff, asOf),
        ),
      )
      .orderBy(
        desc(predictions.createdAt),
        desc(predictionRuns.featureCutoff),
        desc(predictions.id),
      )
      .limit(1);

    return joined ? this.withInputs(this.database, joined) : null;
  }

  private async appendInTransaction(
    transaction: RepositoryTransaction,
    input: AppendPredictionInput,
  ): Promise<PersistedPrediction> {
    const existing = await this.findExisting(
      transaction,
      input.run.id,
      input.run.triggerJobId,
      input.prediction.eventMarketOutcomeId,
    );
    if (existing) return this.withInputs(transaction, existing);

    const refusalWithNullMetrics =
      input.prediction.decisionStatus === "INSUFFICIENT_DATA" ||
      input.prediction.decisionStatus === "WAIT_FOR_LINEUP";
    const hasAnyMetric = [
      input.prediction.modelProbability,
      input.prediction.confidence,
      input.prediction.fairOdds,
      input.prediction.marketImpliedProbability,
      input.prediction.edge,
      input.prediction.expectedValue,
    ].some((value) => value !== null && value !== undefined);
    if (refusalWithNullMetrics && hasAnyMetric)
      throw new Error("INVALID_PREDICTION_REFUSAL_METRICS");

    const run = await this.findOrInsertRun(transaction, input.run);
    const inserted = await transaction
      .insert(predictions)
      .values({
        ...(input.prediction.id ? { id: input.prediction.id } : {}),
        predictionRunId: run.id,
        eventMarketOutcomeId: input.prediction.eventMarketOutcomeId,
        dataQualityAssessmentId: input.prediction.dataQualityAssessmentId,
        marketPriceObservationId:
          input.prediction.marketPriceObservationId ?? null,
        decisionStatus: input.prediction.decisionStatus,
        modelProbability: input.prediction.modelProbability ?? null,
        confidence: input.prediction.confidence ?? null,
        fairOdds: input.prediction.fairOdds ?? null,
        marketImpliedProbability:
          input.prediction.marketImpliedProbability ?? null,
        edge: input.prediction.edge ?? null,
        expectedValue: input.prediction.expectedValue ?? null,
        reasonCodes: [...input.prediction.reasonCodes],
        structuredReasons: input.prediction.structuredReasons,
        ...(input.prediction.createdAt
          ? { createdAt: input.prediction.createdAt }
          : {}),
      })
      .onConflictDoNothing({
        target: [predictions.predictionRunId, predictions.eventMarketOutcomeId],
      })
      .returning();

    const prediction =
      inserted[0] ??
      (await this.findPrediction(
        transaction,
        run.id,
        input.prediction.eventMarketOutcomeId,
      ));
    if (!prediction) throw new Error("PREDICTION_INSERT_FAILED");

    if (inserted[0]) {
      const uniqueInputs = new Map(
        input.inputs.map((lineage) => [
          `${lineage.sourceObservationId}:${lineage.inputRole}`,
          lineage,
        ]),
      );
      if (uniqueInputs.size > 0) {
        await transaction
          .insert(predictionInputs)
          .values(
            [...uniqueInputs.values()].map((lineage) => ({
              predictionId: prediction.id,
              sourceObservationId: lineage.sourceObservationId,
              inputRole: lineage.inputRole,
              ...(lineage.createdAt ? { createdAt: lineage.createdAt } : {}),
            })),
          )
          .onConflictDoNothing();
      }
    }

    return this.withInputs(transaction, { run, prediction });
  }

  private async findOrInsertRun(
    transaction: RepositoryTransaction,
    input: AppendPredictionInput["run"],
  ): Promise<typeof predictionRuns.$inferSelect> {
    const existing = await this.findRun(
      transaction,
      input.id,
      input.triggerJobId,
    );
    if (existing) return existing;

    const [run] = await transaction
      .insert(predictionRuns)
      .values({
        ...(input.id ? { id: input.id } : {}),
        modelVersionId: input.modelVersionId,
        calibrationVersionId: input.calibrationVersionId,
        eventId: input.eventId,
        featureCutoff: input.featureCutoff,
        status: input.status,
        startedAt: input.startedAt ?? null,
        completedAt: input.completedAt ?? null,
        triggerJobId: input.triggerJobId ?? null,
      })
      .onConflictDoNothing()
      .returning();
    const persistedRun =
      run ?? (await this.findRun(transaction, input.id, input.triggerJobId));
    if (!persistedRun) throw new Error("PREDICTION_RUN_INSERT_FAILED");
    return persistedRun;
  }

  private async findRun(
    database: Pick<RepositoryTransaction, "select">,
    runId?: string,
    triggerJobId?: string | null,
  ) {
    if (!runId && !triggerJobId) return null;
    const [row] = await database
      .select()
      .from(predictionRuns)
      .where(
        runId
          ? eq(predictionRuns.id, runId)
          : eq(predictionRuns.triggerJobId, triggerJobId as string),
      )
      .orderBy(desc(predictionRuns.startedAt))
      .limit(1);
    return row ?? null;
  }

  private async findExisting(
    database: Pick<RepositoryTransaction, "select">,
    runId: string | undefined,
    triggerJobId: string | null | undefined,
    eventMarketOutcomeId: string,
  ): Promise<PredictionJoin | null> {
    const predicates = [
      eq(predictions.eventMarketOutcomeId, eventMarketOutcomeId),
    ];
    if (runId) predicates.push(eq(predictions.predictionRunId, runId));
    else if (triggerJobId)
      predicates.push(eq(predictionRuns.triggerJobId, triggerJobId));
    else return null;

    const [row] = await database
      .select({ run: predictionRuns, prediction: predictions })
      .from(predictions)
      .innerJoin(
        predictionRuns,
        eq(predictions.predictionRunId, predictionRuns.id),
      )
      .where(and(...predicates))
      .orderBy(desc(predictions.createdAt))
      .limit(1);
    return row ?? null;
  }

  private async findPrediction(
    database: Pick<RepositoryTransaction, "select">,
    runId: string,
    eventMarketOutcomeId: string,
  ) {
    const [row] = await database
      .select()
      .from(predictions)
      .where(
        and(
          eq(predictions.predictionRunId, runId),
          eq(predictions.eventMarketOutcomeId, eventMarketOutcomeId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  private async withInputs(
    database: Pick<RepositoryTransaction, "select">,
    joined: PredictionJoin,
  ): Promise<PersistedPrediction> {
    const inputs = await database
      .select()
      .from(predictionInputs)
      .where(eq(predictionInputs.predictionId, joined.prediction.id));
    return { ...joined, inputs };
  }
}
