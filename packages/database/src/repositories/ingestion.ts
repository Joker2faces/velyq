import { and, eq } from "drizzle-orm";
import {
  JOB_CONTRACT_VERSIONS,
  type FixtureObservationBatch,
  type Job,
  type JobPayload,
  type LineupObservationBatch,
  type OddsObservationBatch,
  type QuarantinedProviderObservation,
  type SyntheticScenarioRecord,
} from "@velyq/contracts";
import type { PrivilegedVelyqDatabase } from "../client.js";
import { eventMarketOutcomes } from "../schema/market.js";
import { jobs, providerSyncRuns } from "../schema/operations.js";
import {
  LineupObservationRepository,
  OddsObservationRepository,
  SourceObservationRepository,
} from "./observations.js";

type DatabaseIngestionBatch = Readonly<{
  fixtures: FixtureObservationBatch;
  odds: OddsObservationBatch;
  lineups: LineupObservationBatch;
  quarantined: readonly QuarantinedProviderObservation[];
  scenarios?: readonly SyntheticScenarioRecord[];
}>;
type DatabaseIngestionJobInput = Readonly<{
  type: Job["type"];
  idempotencyKey: string;
  payload: JobPayload;
  correlationId: string;
  causationId: string;
}>;

type DatabaseIngestionInput = Readonly<{
  providerId: string;
  runId: string;
  providerCode: string;
  sequenceName: string;
  fixedClock: string;
}>;

/**
 * Atomic persistence adapter for a replay batch. The provider run is created
 * by the composition root; this adapter commits all child observations and
 * downstream prediction commands together or not at all.
 */
export class DatabaseTransactionalIngestionSink {
  private readonly source: SourceObservationRepository;
  private readonly odds: OddsObservationRepository;
  private readonly lineups: LineupObservationRepository;

  constructor(
    private readonly database: PrivilegedVelyqDatabase,
    private readonly input: DatabaseIngestionInput,
  ) {
    this.source = new SourceObservationRepository(database);
    this.odds = new OddsObservationRepository(database);
    this.lineups = new LineupObservationRepository(database);
  }

  async hasRun(sequenceName: string, fixedClock: string): Promise<boolean> {
    const row = await this.database.query.providerSyncRuns.findFirst({
      where: and(
        eq(providerSyncRuns.id, this.input.runId),
        eq(providerSyncRuns.replaySequence, sequenceName),
      ),
    });
    return (
      row?.status === "COMPLETED" &&
      row.startedAt !== null &&
      row.startedAt.toISOString() <= fixedClock
    );
  }

  writeBatch(): never {
    throw new Error("ATOMIC_INGESTION_REQUIRED");
  }

  async writeBatchAndEnqueue(
    batch: DatabaseIngestionBatch,
    runKey: string,
    jobInputs: readonly DatabaseIngestionJobInput[],
  ) {
    if (runKey !== `${this.input.sequenceName}:${this.input.fixedClock}`)
      throw new Error("INGESTION_RUN_KEY_MISMATCH");

    return this.database.transaction(async (transaction) => {
      const existing = await transaction.query.providerSyncRuns.findFirst({
        where: eq(providerSyncRuns.id, this.input.runId),
      });
      if (!existing) throw new Error("PROVIDER_RUN_NOT_FOUND");
      if (existing.status === "COMPLETED") {
        return {
          accepted: 0,
          rejected: batch.quarantined.length,
          duplicate: true,
          downstreamJobs: [],
        } as const;
      }

      const sourceIds = new Map<string, string>();
      const all = [
        ...batch.fixtures.observations.map((observation) => ({
          type: "FIXTURE",
          value: observation,
        })),
        ...batch.odds.observations.map((observation) => ({
          type: "ODDS",
          value: observation,
        })),
        ...batch.lineups.observations.map((observation) => ({
          type: "LINEUP",
          value: observation,
        })),
        ...batch.quarantined.map((observation) => ({
          type: "QUARANTINED_ODDS",
          value: observation,
        })),
      ] as const;

      let accepted = 0;
      for (const item of all) {
        const observation = item.value;
        const persisted = await this.source.appendInTransaction(transaction, {
          id: observation.provenance.sourceObservationId,
          providerId: this.input.providerId,
          syncRunId: this.input.runId,
          observationType: item.type,
          providerExternalId: observation.provenance.providerExternalId,
          observation,
        });
        sourceIds.set(
          observation.provenance.sourceObservationId,
          persisted.row.id,
        );
        if (!persisted.duplicate && item.type !== "QUARANTINED_ODDS")
          accepted += 1;
      }

      for (const observation of batch.odds.observations) {
        const sourceObservationId = sourceIds.get(
          observation.provenance.sourceObservationId,
        );
        if (!sourceObservationId)
          throw new Error("SOURCE_OBSERVATION_NOT_PERSISTED");
        const [outcome] = await transaction
          .select({ id: eventMarketOutcomes.id })
          .from(eventMarketOutcomes)
          .where(eq(eventMarketOutcomes.canonicalKey, observation.outcomeKey))
          .limit(1);
        if (!outcome)
          throw new Error(
            `CANONICAL_OUTCOME_NOT_FOUND:${observation.outcomeKey}`,
          );
        await this.odds.appendInTransaction(transaction, {
          sourceObservationId,
          eventMarketOutcomeId: outcome.id,
          bookmakerId: observation.bookmakerId,
          observation,
        });
      }

      for (const observation of batch.lineups.observations) {
        const sourceObservationId = sourceIds.get(
          observation.provenance.sourceObservationId,
        );
        if (!sourceObservationId)
          throw new Error("SOURCE_OBSERVATION_NOT_PERSISTED");
        await this.lineups.appendInTransaction(transaction, {
          sourceObservationId,
          observation,
        });
      }

      const downstreamJobs: Job[] = [];
      for (const job of jobInputs) {
        const [inserted] = await transaction
          .insert(jobs)
          .values({
            type: job.type,
            contractVersion: JOB_CONTRACT_VERSIONS[job.type],
            idempotencyKey: job.idempotencyKey,
            payload: job.payload,
            status: "PENDING",
            maxAttempts: 3,
            availableAt: new Date(this.input.fixedClock),
            correlationId: job.correlationId,
            causationId: job.causationId,
          })
          .onConflictDoNothing({ target: jobs.idempotencyKey })
          .returning();
        const persisted =
          inserted ??
          (await transaction.query.jobs.findFirst({
            where: eq(jobs.idempotencyKey, job.idempotencyKey),
          }));
        if (!persisted) throw new Error("JOB_IDEMPOTENCY_LOOKUP_FAILED");
        downstreamJobs.push(persisted as unknown as Job);
      }

      await transaction
        .update(providerSyncRuns)
        .set({
          status: "COMPLETED",
          receivedCount:
            batch.fixtures.observations.length +
            batch.odds.observations.length +
            batch.lineups.observations.length +
            batch.quarantined.length,
          acceptedCount: accepted,
          rejectedCount: batch.quarantined.length,
          completedAt: new Date(this.input.fixedClock),
        })
        .where(eq(providerSyncRuns.id, this.input.runId));

      return {
        accepted,
        rejected: batch.quarantined.length,
        duplicate: false,
        downstreamJobs,
      } as const;
    });
  }
}
