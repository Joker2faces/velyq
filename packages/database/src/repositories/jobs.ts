import { and, asc, eq, lte, or, isNull } from "drizzle-orm";

import type { Job, JobPayload, JobStatus } from "@velyq/contracts";
import type {
  PrivilegedVelyqDatabase,
  RepositoryTransaction,
} from "../client.js";
import { jobs } from "../schema/operations.js";

export type EnqueueJobInput = Readonly<{
  type: Job["type"];
  contractVersion: Job["contractVersion"];
  idempotencyKey: string;
  payload: JobPayload;
  correlationId: string;
  causationId: string;
  maxAttempts?: number;
  availableAt: Date;
}>;

export class DatabaseJobRepository {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async enqueue(input: EnqueueJobInput): Promise<Job> {
    return this.enqueueInTransaction(this.database, input);
  }

  async enqueueInTransaction(
    database: PrivilegedVelyqDatabase | RepositoryTransaction,
    input: EnqueueJobInput,
  ): Promise<Job> {
    const inserted = await database
      .insert(jobs)
      .values({
        type: input.type,
        contractVersion: input.contractVersion,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        status: "PENDING",
        maxAttempts: input.maxAttempts ?? 3,
        availableAt: input.availableAt,
        correlationId: input.correlationId,
        causationId: input.causationId,
      })
      .onConflictDoNothing({ target: jobs.idempotencyKey })
      .returning();
    if (inserted[0]) return inserted[0] as unknown as Job;
    const existing = await database.query.jobs.findFirst({
      where: eq(jobs.idempotencyKey, input.idempotencyKey),
    });
    if (!existing) throw new Error("JOB_IDEMPOTENCY_LOOKUP_FAILED");
    return existing as unknown as Job;
  }

  async leaseNext(
    workerId: string,
    now: Date,
    leaseUntil: Date,
  ): Promise<Job | null> {
    return this.database.transaction(async (transaction) => {
      const [candidate] = await transaction
        .select()
        .from(jobs)
        .where(
          and(
            or(
              and(eq(jobs.status, "PENDING"), lte(jobs.availableAt, now)),
              and(eq(jobs.status, "RUNNING"), lte(jobs.leaseExpiresAt, now)),
            ),
            or(isNull(jobs.leaseExpiresAt), lte(jobs.leaseExpiresAt, now)),
          ),
        )
        .orderBy(asc(jobs.availableAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!candidate) return null;
      const updated = await transaction
        .update(jobs)
        .set({
          status: "RUNNING",
          attemptCount: candidate.attemptCount + 1,
          leaseExpiresAt: leaseUntil,
          startedAt: candidate.startedAt ?? now,
        })
        .where(
          and(eq(jobs.id, candidate.id), eq(jobs.status, candidate.status)),
        )
        .returning();
      void workerId;
      return (updated[0] as unknown as Job | undefined) ?? null;
    });
  }

  async complete(jobId: string, completedAt: Date): Promise<Job> {
    const updated = await this.database
      .update(jobs)
      .set({
        status: "COMPLETED",
        leaseExpiresAt: null,
        completedAt,
        lastError: null,
      })
      .where(eq(jobs.id, jobId))
      .returning();
    if (!updated[0]) throw new Error("JOB_NOT_FOUND");
    return updated[0] as unknown as Job;
  }

  async fail(
    jobId: string,
    error: Readonly<{ code: string; message: string }>,
    failedAt: Date,
  ): Promise<Job> {
    const current = await this.database.query.jobs.findFirst({
      where: eq(jobs.id, jobId),
    });
    if (!current) throw new Error("JOB_NOT_FOUND");
    const terminal: JobStatus =
      current.attemptCount >= current.maxAttempts ? "FAILED" : "PENDING";
    const updated = await this.database
      .update(jobs)
      .set({
        status: terminal,
        availableAt: failedAt,
        leaseExpiresAt: null,
        completedAt: terminal === "FAILED" ? failedAt : null,
        lastError: error,
      })
      .where(eq(jobs.id, jobId))
      .returning();
    return updated[0] as unknown as Job;
  }
}
