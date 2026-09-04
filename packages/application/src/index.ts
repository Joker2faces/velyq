import type {
  FixtureObservationBatch,
  Job,
  JobPayload,
  JobStatus,
  LineupObservationBatch,
  OddsObservationBatch,
  QuarantinedProviderObservation,
} from "@velyq/contracts";

export type Clock = Readonly<{ now(): string }>;
export type JobLease = Readonly<{ job: Job; leaseExpiresAt: string }>;
export interface JobRepository {
  enqueue(
    input: Readonly<{
      type: Job["type"];
      idempotencyKey: string;
      payload: JobPayload;
      correlationId: string;
      causationId: string;
      maxAttempts?: number;
      availableAt?: string;
    }>,
  ): Job;
  leaseNext(workerId: string, leaseDurationMs: number): JobLease | null;
  complete(jobId: string): Job;
  fail(jobId: string, error: Readonly<{ code: string; message: string }>): Job;
  getByIdempotencyKey(key: string): Job | null;
}
let nextId = 1;
function newId() {
  return `job-${nextId++}`;
}
export class InMemoryJobRepository implements JobRepository {
  private readonly jobs = new Map<string, Job>();
  constructor(
    private readonly clock: Clock = { now: () => new Date().toISOString() },
  ) {}
  enqueue(input: Parameters<JobRepository["enqueue"]>[0]): Job {
    const existing = this.getByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;
    const now = this.clock.now();
    const job = Object.freeze({
      id: newId(),
      type: input.type,
      contractVersion: `${input.type}.v1` as Job["contractVersion"],
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      status: "PENDING" as JobStatus,
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 3,
      availableAt: input.availableAt ?? now,
      leaseExpiresAt: null,
      correlationId: input.correlationId,
      causationId: input.causationId,
      lastError: null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
    });
    this.jobs.set(job.id, job);
    return job;
  }
  leaseNext(_workerId: string, leaseDurationMs: number): JobLease | null {
    const now = Date.parse(this.clock.now());
    const candidate = [...this.jobs.values()].find(
      (job) =>
        (job.status === "PENDING" && Date.parse(job.availableAt) <= now) ||
        (job.status === "RUNNING" &&
          job.leaseExpiresAt !== null &&
          Date.parse(job.leaseExpiresAt) <= now),
    );
    if (!candidate) return null;
    const leaseExpiresAt = new Date(now + leaseDurationMs).toISOString();
    const leased = Object.freeze({
      ...candidate,
      status: "RUNNING" as const,
      attemptCount: candidate.attemptCount + 1,
      leaseExpiresAt,
      startedAt: candidate.startedAt ?? this.clock.now(),
    });
    this.jobs.set(candidate.id, leased);
    return { job: leased, leaseExpiresAt };
  }
  complete(jobId: string): Job {
    return this.update(jobId, {
      status: "COMPLETED",
      leaseExpiresAt: null,
      completedAt: this.clock.now(),
    });
  }
  fail(jobId: string, error: Readonly<{ code: string; message: string }>): Job {
    const job = this.require(jobId);
    const status = job.attemptCount >= job.maxAttempts ? "FAILED" : "PENDING";
    return this.update(jobId, {
      status,
      leaseExpiresAt: null,
      availableAt: this.clock.now(),
      completedAt: status === "FAILED" ? this.clock.now() : null,
      lastError: error,
    });
  }
  getByIdempotencyKey(key: string) {
    return (
      [...this.jobs.values()].find((job) => job.idempotencyKey === key) ?? null
    );
  }
  private require(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown job ${jobId}`);
    return job;
  }
  private update(jobId: string, patch: Partial<Job>) {
    const next = Object.freeze({ ...this.require(jobId), ...patch });
    this.jobs.set(jobId, next);
    return next;
  }
}

export type IngestionBatch = Readonly<{
  fixtures: FixtureObservationBatch;
  odds: OddsObservationBatch;
  lineups: LineupObservationBatch;
  quarantined: readonly QuarantinedProviderObservation[];
}>;
export interface IngestionSink {
  hasRun(sequenceName: string, fixedClock: string): boolean;
  writeBatch(
    batch: IngestionBatch,
    runKey?: string,
  ): Readonly<{ accepted: number; rejected: number; duplicate: boolean }>;
}
export type IngestionResult = Readonly<{
  accepted: number;
  rejected: number;
  duplicate: boolean;
  downstreamJobs: readonly Job[];
}>;

export class InMemoryIngestionSink implements IngestionSink {
  private readonly runs = new Set<string>();
  private readonly observations = new Set<string>();
  hasRun(sequenceName: string, fixedClock: string) {
    return this.runs.has(`${sequenceName}:${fixedClock}`);
  }
  writeBatch(batch: IngestionBatch, requestedRunKey?: string) {
    const runKey =
      requestedRunKey ??
      `${batch.fixtures.observationWindow.from}:${batch.fixtures.observationWindow.to}`;
    if (this.runs.has(runKey))
      return {
        accepted: 0,
        rejected: batch.quarantined.length,
        duplicate: true,
      };
    this.runs.add(runKey);
    const records = [
      ...batch.fixtures.observations,
      ...batch.odds.observations,
      ...batch.lineups.observations,
    ];
    let accepted = 0;
    for (const record of records) {
      const key = record.provenance.sourceObservationId;
      if (!this.observations.has(key)) {
        this.observations.add(key);
        accepted += 1;
      }
    }
    return { accepted, rejected: batch.quarantined.length, duplicate: false };
  }
}

export async function ingestProviderSequence(
  input: Readonly<{
    sequenceName: string;
    fixedClock: string;
    source: Readonly<{
      replay(request: {
        sequenceName: string;
        fixedClock: string;
      }): Promise<IngestionBatch>;
    }>;
    sink: IngestionSink;
    jobs: JobRepository;
    correlationId: string;
    causationId: string;
  }>,
): Promise<IngestionResult> {
  if (input.sink.hasRun(input.sequenceName, input.fixedClock))
    return { accepted: 0, rejected: 0, duplicate: true, downstreamJobs: [] };
  const batch = await input.source.replay({
    sequenceName: input.sequenceName,
    fixedClock: input.fixedClock,
  });
  const written = input.sink.writeBatch(
    batch,
    `${input.sequenceName}:${input.fixedClock}`,
  );
  if (written.duplicate) return { ...written, downstreamJobs: [] };
  const downstreamJobs = [
    input.jobs.enqueue({
      type: "GENERATE_PREDICTION",
      idempotencyKey: `prediction:${input.sequenceName}:${input.fixedClock}`,
      payload: {
        sequenceName: input.sequenceName,
        fixedClock: input.fixedClock,
      },
      correlationId: input.correlationId,
      causationId: input.causationId,
    }),
  ];
  return { ...written, downstreamJobs };
}
