import { describe, expect, it } from "vitest";
import {
  InMemoryIngestionSink,
  InMemoryJobRepository,
  InMemoryProviderRunRepository,
  ingestProviderSequence,
} from "../src/index.js";
import { validateJob } from "@velyq/contracts";

const clock = { now: () => "2026-09-04T10:00:00.000Z" };
const input = {
  type: "INGEST_PROVIDER_SEQUENCE" as const,
  idempotencyKey: "sequence-01:10:00",
  payload: { sequenceName: "sequence-01-opening", fixedClock: clock.now() },
  correlationId: "corr-1",
  causationId: "cause-1",
};

describe("durable job contract", () => {
  it("preserves provider run lifecycle counts and provenance", () => {
    const runs = new InMemoryProviderRunRepository();
    const started = runs.begin({
      providerCode: "synthetic-provider",
      sequenceName: "sequence-01-opening",
      sourceFixtureHash: "sha256:fixture",
      startedAt: clock.now(),
    });
    const completed = runs.complete({
      runId: started.id,
      normalizedOutputHash: "sha256:normalized",
      receivedCount: 9,
      acceptedCount: 9,
      rejectedCount: 0,
      completedAt: clock.now(),
    });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.sourceFixtureHash).toBe("sha256:fixture");
    expect(completed.receivedCount).toBe(9);
    expect(runs.getById(started.id)).toEqual(completed);
  });
  it("rejects invalid version, status, and payload combinations", () => {
    const result = validateJob({
      ...input,
      id: "job-1",
      contractVersion: "CALCULATE_EDGE.v1",
      status: "BROKEN",
      payload: { sequenceName: "", fixedClock: "not-a-date" },
      attemptCount: 0,
      maxAttempts: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toEqual(
        expect.arrayContaining([
          "contractVersion does not match type",
          "status is invalid",
          "payload must contain a valid sequenceName and fixedClock",
        ]),
      );
  });
  it("deduplicates enqueue and preserves lineage ids", () => {
    const repo = new InMemoryJobRepository(clock);
    const first = repo.enqueue(input);
    const duplicate = repo.enqueue(input);
    expect(duplicate).toEqual(first);
    expect(first.contractVersion).toBe("INGEST_PROVIDER_SEQUENCE.v1");
    expect(first.correlationId).toBe("corr-1");
  });
  it("leases, retries, and eventually fails after max attempts", () => {
    const repo = new InMemoryJobRepository(clock);
    const job = repo.enqueue({ ...input, maxAttempts: 2 });
    const first = repo.leaseNext("worker-a", 30_000);
    expect(first?.job.status).toBe("RUNNING");
    expect(
      repo.fail(job.id, { code: "TEMPORARY", message: "retry" }).status,
    ).toBe("PENDING");
    const second = repo.leaseNext("worker-a", 30_000);
    expect(second?.job.attemptCount).toBe(2);
    expect(
      repo.fail(job.id, { code: "PERMANENT", message: "stop" }).status,
    ).toBe("FAILED");
  });
  it("ingests a sequence once and creates one downstream job", async () => {
    const repo = new InMemoryJobRepository(clock);
    const sink = new InMemoryIngestionSink();
    const batch = {
      fixtures: {
        observationWindow: { from: clock.now(), to: clock.now() },
        observations: [],
      },
      odds: {
        observationWindow: { from: clock.now(), to: clock.now() },
        observations: [],
      },
      lineups: {
        observationWindow: { from: clock.now(), to: clock.now() },
        observations: [],
      },
      quarantined: [],
    } as never;
    const source = { replay: async () => batch };
    const first = await ingestProviderSequence({
      sequenceName: "sequence-01-opening",
      fixedClock: clock.now(),
      source,
      sink,
      jobs: repo,
      correlationId: "corr-1",
      causationId: "cause-1",
    });
    const second = await ingestProviderSequence({
      sequenceName: "sequence-01-opening",
      fixedClock: clock.now(),
      source,
      sink,
      jobs: repo,
      correlationId: "corr-1",
      causationId: "cause-1",
    });
    expect(first.downstreamJobs).toHaveLength(1);
    expect(second.duplicate).toBe(true);
  });
  it("uses the orchestration run identity for sink idempotency", async () => {
    const repo = new InMemoryJobRepository(clock);
    const sink = new InMemoryIngestionSink();
    const batch = {
      fixtures: { observationWindow: { from: "a", to: "b" }, observations: [] },
      odds: { observationWindow: { from: "a", to: "b" }, observations: [] },
      lineups: { observationWindow: { from: "a", to: "b" }, observations: [] },
      quarantined: [],
    } as never;
    const source = { replay: async () => batch };
    await ingestProviderSequence({
      sequenceName: "sequence-a",
      fixedClock: clock.now(),
      source,
      sink,
      jobs: repo,
      correlationId: "corr-1",
      causationId: "cause-1",
    });
    expect(sink.hasRun("sequence-a", clock.now())).toBe(true);
    expect(sink.hasRun("sequence-b", clock.now())).toBe(false);
  });
});
