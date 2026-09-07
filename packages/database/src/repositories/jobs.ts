import { and, asc, eq, gt, lte, or, isNull } from "drizzle-orm";

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

/**
 * Maps a queue row onto the `Job` contract.
 *
 * The five casts this replaces were unchecked, and they were hiding a real
 * defect rather than saving a few lines. Drizzle returns `timestamptz`
 * columns as `Date` objects; the contract's timestamps are ISO strings, and
 * `validateJob` checks them with `typeof value === "string"`. So every job
 * leased from the durable queue failed validation, and every handler that
 * begins by validating its job threw `INVALID_<TYPE>_JOB` before doing any
 * work. The whole durable pipeline was unrunnable, and no test caught it
 * because the worker tests construct their jobs by hand instead of leasing
 * them.
 *
 * The repository is the boundary between the row shape and the contract
 * shape, so the conversion belongs here — and doing it explicitly means the
 * next column added to either side is a type error rather than a silent
 * mismatch.
 */
function toJob(row: typeof jobs.$inferSelect): Job {
  return Object.freeze({
    id: row.id,
    type: row.type as Job["type"],
    contractVersion: row.contractVersion as Job["contractVersion"],
    idempotencyKey: row.idempotencyKey,
    payload: row.payload as JobPayload,
    status: row.status as JobStatus,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    availableAt: row.availableAt.toISOString(),
    leaseExpiresAt: row.leaseExpiresAt?.toISOString() ?? null,
    correlationId: row.correlationId,
    causationId: row.causationId,
    lastError:
      row.lastError === null
        ? null
        : (row.lastError as Readonly<{ code: string; message: string }>),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }) as Job;
}

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
    if (inserted[0]) return toJob(inserted[0]);
    const existing = await database.query.jobs.findFirst({
      where: eq(jobs.idempotencyKey, input.idempotencyKey),
    });
    if (!existing) throw new Error("JOB_IDEMPOTENCY_LOOKUP_FAILED");
    return toJob(existing);
  }

  async leaseNext(
    workerId: string,
    now: Date,
    leaseUntil: Date,
  ): Promise<Readonly<{ job: Job; leaseExpiresAt: string }> | null> {
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
          leaseOwner: workerId,
          startedAt: candidate.startedAt ?? now,
        })
        .where(
          and(eq(jobs.id, candidate.id), eq(jobs.status, candidate.status)),
        )
        .returning();
      const row = updated[0];
      return row
        ? { job: toJob(row), leaseExpiresAt: leaseUntil.toISOString() }
        : null;
    });
  }

  async complete(
    jobId: string,
    workerId: string,
    completedAt: Date,
  ): Promise<Job> {
    const updated = await this.database
      .update(jobs)
      .set({
        status: "COMPLETED",
        leaseExpiresAt: null,
        leaseOwner: null,
        completedAt,
        lastError: null,
      })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.status, "RUNNING"),
          eq(jobs.leaseOwner, workerId),
          gt(jobs.leaseExpiresAt, completedAt),
        ),
      )
      .returning();
    if (!updated[0]) throw new Error("JOB_LEASE_NOT_OWNED");
    return toJob(updated[0]);
  }

  async fail(
    jobId: string,
    workerId: string,
    error: Readonly<{ code: string; message: string }>,
    failedAt: Date,
  ): Promise<Job> {
    const current = await this.database.query.jobs.findFirst({
      where: and(
        eq(jobs.id, jobId),
        eq(jobs.leaseOwner, workerId),
        gt(jobs.leaseExpiresAt, failedAt),
      ),
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
        leaseOwner: null,
        completedAt: terminal === "FAILED" ? failedAt : null,
        lastError: error,
      })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.status, "RUNNING"),
          eq(jobs.leaseOwner, workerId),
          gt(jobs.leaseExpiresAt, failedAt),
        ),
      )
      .returning();
    if (!updated[0]) throw new Error("JOB_LEASE_NOT_OWNED");
    return toJob(updated[0]);
  }
}
