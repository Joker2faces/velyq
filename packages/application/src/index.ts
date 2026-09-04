import type {
  CustomerMatchDto,
  CustomerTodayDto,
  FixtureObservationBatch,
  Job,
  JobPayload,
  JobStatus,
  GeneratePredictionPayload,
  ProviderRun,
  LineupObservationBatch,
  OddsObservationBatch,
  QuarantinedProviderObservation,
  SyntheticScenarioRecord,
} from "@velyq/contracts";

export type Clock = Readonly<{ now(): string }>;

export interface CustomerReadRepository {
  getToday(): Promise<CustomerTodayDto> | CustomerTodayDto;
  getMatch(
    eventId: string,
  ): Promise<CustomerMatchDto | null> | CustomerMatchDto | null;
}

export type CustomerReadResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      code: "NOT_FOUND" | "UNAVAILABLE";
      messageKey: string;
    }>;

export interface CustomerReadModelPort<TRawToday, TRawMatch = TRawToday> {
  getToday(asOf: Date): Promise<TRawToday>;
  getMatch(eventId: string, asOf: Date): Promise<TRawMatch | null>;
}

export interface CustomerReadModelMapper<
  TRawToday,
  TDtoToday,
  TRawMatch = TRawToday,
  TDtoMatch = TDtoToday,
> {
  mapToday(raw: TRawToday): TDtoToday;
  mapMatch(raw: TRawMatch): TDtoMatch;
}

export class MappedCustomerQueryService<
  TRawToday,
  TDtoToday,
  TRawMatch = TRawToday,
  TDtoMatch = TDtoToday,
> {
  constructor(
    private readonly repository: CustomerReadModelPort<TRawToday, TRawMatch>,
    private readonly mapper: CustomerReadModelMapper<
      TRawToday,
      TDtoToday,
      TRawMatch,
      TDtoMatch
    >,
  ) {}

  async getToday(asOf: Date): Promise<CustomerReadResult<TDtoToday>> {
    try {
      return {
        ok: true,
        value: this.mapper.mapToday(await this.repository.getToday(asOf)),
      };
    } catch {
      return {
        ok: false,
        code: "UNAVAILABLE",
        messageKey: "customerUnavailable",
      };
    }
  }

  async getMatch(
    eventId: string,
    asOf: Date,
  ): Promise<CustomerReadResult<TDtoMatch>> {
    try {
      const raw = await this.repository.getMatch(eventId, asOf);
      return raw
        ? { ok: true, value: this.mapper.mapMatch(raw) }
        : { ok: false, code: "NOT_FOUND", messageKey: "matchNotFound" };
    } catch {
      return {
        ok: false,
        code: "UNAVAILABLE",
        messageKey: "customerUnavailable",
      };
    }
  }
}

export class CustomerQueryService {
  constructor(private readonly repository: CustomerReadRepository) {}

  getToday() {
    return this.repository.getToday();
  }

  getMatch(eventId: string) {
    return this.repository.getMatch(eventId);
  }
}

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
  complete(jobId: string, workerId: string): Job;
  fail(
    jobId: string,
    workerId: string,
    error: Readonly<{ code: string; message: string }>,
  ): Job;
  getByIdempotencyKey(key: string): Job | null;
}
export interface ProviderRunRepository {
  begin(
    input: Readonly<{
      providerCode: string;
      sequenceName: string;
      sourceFixtureHash: string;
      startedAt: string;
    }>,
  ): ProviderRun;
  complete(
    input: Readonly<{
      runId: string;
      normalizedOutputHash: string;
      receivedCount: number;
      acceptedCount: number;
      rejectedCount: number;
      completedAt: string;
    }>,
  ): ProviderRun;
  fail(
    runId: string,
    error: Readonly<{ code: string; message: string }>,
    completedAt: string,
  ): ProviderRun;
  getById(runId: string): ProviderRun | null;
}
let nextId = 1;
function newId() {
  return `job-${nextId++}`;
}
export class InMemoryJobRepository implements JobRepository {
  private readonly jobs = new Map<string, Job>();
  private readonly leaseOwners = new Map<string, string>();
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
  leaseNext(workerId: string, leaseDurationMs: number): JobLease | null {
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
    this.leaseOwners.set(candidate.id, workerId);
    return { job: leased, leaseExpiresAt };
  }
  complete(jobId: string, workerId: string): Job {
    this.assertLeaseOwner(jobId, workerId);
    this.leaseOwners.delete(jobId);
    return this.update(jobId, {
      status: "COMPLETED",
      leaseExpiresAt: null,
      completedAt: this.clock.now(),
    });
  }
  fail(
    jobId: string,
    workerId: string,
    error: Readonly<{ code: string; message: string }>,
  ): Job {
    this.assertLeaseOwner(jobId, workerId);
    this.leaseOwners.delete(jobId);
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
  private assertLeaseOwner(jobId: string, workerId: string) {
    const job = this.require(jobId);
    if (
      this.leaseOwners.get(jobId) !== workerId ||
      job.status !== "RUNNING" ||
      job.leaseExpiresAt === null ||
      Date.parse(job.leaseExpiresAt) <= Date.parse(this.clock.now())
    )
      throw new Error("JOB_LEASE_NOT_OWNED");
  }
  private update(jobId: string, patch: Partial<Job>) {
    const next = Object.freeze({ ...this.require(jobId), ...patch });
    this.jobs.set(jobId, next);
    return next;
  }
}

let nextRunId = 1;
export class InMemoryProviderRunRepository implements ProviderRunRepository {
  private readonly runs = new Map<string, ProviderRun>();
  begin(input: Parameters<ProviderRunRepository["begin"]>[0]) {
    const run = Object.freeze({
      id: `provider-run-${nextRunId++}`,
      providerCode: input.providerCode,
      sequenceName: input.sequenceName,
      status: "RUNNING" as const,
      sourceFixtureHash: input.sourceFixtureHash,
      normalizedOutputHash: null,
      receivedCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      startedAt: input.startedAt,
      completedAt: null,
      errorSummary: null,
    });
    this.runs.set(run.id, run);
    return run;
  }
  complete(input: Parameters<ProviderRunRepository["complete"]>[0]) {
    this.require(input.runId);
    return this.update(input.runId, {
      status: "COMPLETED",
      normalizedOutputHash: input.normalizedOutputHash,
      receivedCount: input.receivedCount,
      acceptedCount: input.acceptedCount,
      rejectedCount: input.rejectedCount,
      completedAt: input.completedAt,
    });
  }
  fail(
    runId: string,
    error: Readonly<{ code: string; message: string }>,
    completedAt: string,
  ) {
    this.require(runId);
    return this.update(runId, {
      status: "FAILED",
      completedAt,
      errorSummary: error,
    });
  }
  getById(runId: string) {
    return this.runs.get(runId) ?? null;
  }
  private require(runId: string) {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Unknown provider run ${runId}`);
    return run;
  }
  private update(runId: string, patch: Partial<ProviderRun>) {
    const next = Object.freeze({ ...this.require(runId), ...patch });
    this.runs.set(runId, next);
    return next;
  }
}

export type IngestionBatch = Readonly<{
  fixtures: FixtureObservationBatch;
  odds: OddsObservationBatch;
  lineups: LineupObservationBatch;
  quarantined: readonly QuarantinedProviderObservation[];
  scenarios?: readonly SyntheticScenarioRecord[];
  normalizedOutputHash?: string;
}>;
export interface IngestionSink {
  hasRun(sequenceName: string, fixedClock: string): boolean | Promise<boolean>;
  writeBatch(
    batch: IngestionBatch,
    runKey?: string,
  ): Readonly<{ accepted: number; rejected: number; duplicate: boolean }>;
}
export type IngestionJobInput = Readonly<{
  type: Job["type"];
  idempotencyKey: string;
  payload: JobPayload;
  correlationId: string;
  causationId: string;
}>;
/**
 * Durable adapters implement this method to commit accepted observations and
 * their downstream commands in one database transaction. The legacy methods
 * remain available for deterministic in-memory replay tests.
 */
export interface TransactionalIngestionSink extends IngestionSink {
  writeBatchAndEnqueue(
    batch: IngestionBatch,
    runKey: string,
    jobs: readonly IngestionJobInput[],
  ): Promise<
    Readonly<{
      accepted: number;
      rejected: number;
      duplicate: boolean;
      downstreamJobs: readonly Job[];
    }>
  >;
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
    jobs?: JobRepository;
    correlationId: string;
    causationId: string;
  }>,
): Promise<IngestionResult> {
  if (await input.sink.hasRun(input.sequenceName, input.fixedClock))
    return { accepted: 0, rejected: 0, duplicate: true, downstreamJobs: [] };
  const batch = await input.source.replay({
    sequenceName: input.sequenceName,
    fixedClock: input.fixedClock,
  });
  const oddsBySourceId = new Map(
    batch.odds.observations.map((observation) => [
      observation.provenance.sourceObservationId,
      observation,
    ]),
  );
  const lineupsByEventId = new Map(
    batch.lineups.observations.map((observation) => [
      observation.eventId,
      observation,
    ]),
  );
  const downstreamJobInputs = (batch.scenarios ?? []).map((scenario) => {
    const odds = scenario.sourceObservationIds
      .map((id) => oddsBySourceId.get(id))
      .find((observation) => observation !== undefined);
    const lineup = lineupsByEventId.get(scenario.eventId);
    const payload: GeneratePredictionPayload = {
      eventId: scenario.eventId,
      eventMarketOutcomeId: scenario.outcomeKey ?? scenario.id,
      modelProbability: "0.5" as GeneratePredictionPayload["modelProbability"],
      currentOdds:
        odds?.decimalOdds.value ??
        ("2" as GeneratePredictionPayload["currentOdds"]),
      quality: {
        policyVersion: "phase-1-quality.v1",
        asOf: input.fixedClock,
        receivedAt: batch.odds.receivedAt,
        priceCount: odds ? 1 : 0,
        bookmakerCount: odds ? 1 : 0,
        lineup: lineup?.status ?? "MISSING",
        mappingConfidence: scenario.outcomeKey ? "HIGH" : "LOW",
        edgeAvailable: odds !== undefined,
        edgePresent: scenario.state === "STRONG_EDGE",
      },
      featureCutoff: input.fixedClock,
      modelVersion: "phase-1-experimental.v1",
      calibrationVersion: "identity.v1",
      sourceObservationIds: scenario.sourceObservationIds,
    };
    return {
      type: "GENERATE_PREDICTION",
      idempotencyKey: `prediction:${input.sequenceName}:${scenario.id}`,
      payload,
      correlationId: input.correlationId,
      causationId: input.causationId,
    } satisfies IngestionJobInput;
  });
  const transactionalSink = input.sink as Partial<TransactionalIngestionSink>;
  if (transactionalSink.writeBatchAndEnqueue) {
    return transactionalSink.writeBatchAndEnqueue(
      batch,
      `${input.sequenceName}:${input.fixedClock}`,
      downstreamJobInputs,
    );
  }
  const written = input.sink.writeBatch(
    batch,
    `${input.sequenceName}:${input.fixedClock}`,
  );
  if (written.duplicate) return { ...written, downstreamJobs: [] };
  const downstreamJobs = downstreamJobInputs.map((job) =>
    input.jobs
      ? input.jobs.enqueue(job)
      : (() => {
          throw new Error("JOB_REPOSITORY_REQUIRED_FOR_NON_TRANSACTIONAL_SINK");
        })(),
  );
  return { ...written, downstreamJobs };
}
